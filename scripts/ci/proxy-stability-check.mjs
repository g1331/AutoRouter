import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import net from "node:net";

const ROOT = process.cwd();
const LOCALHOST = "127.0.0.1";
const SMOKE_MODEL = "gpt-4.1-smoke";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, LOCALHOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to resolve an ephemeral port"));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
    server.on("error", reject);
  });
}

function runCommand(command, args, env) {
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", command, ...args], {
          cwd: ROOT,
          env,
          stdio: "inherit",
        })
      : spawnSync(command, args, {
          cwd: ROOT,
          env,
          stdio: "inherit",
        });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function normalizeContentType(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

async function readJsonResponse(response) {
  const contentType = normalizeContentType(response.headers.get("content-type"));
  const bodyText = await response.text();

  if (!bodyText) {
    return null;
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(bodyText);
  }

  throw new Error(`Expected JSON response but received "${contentType}" with body: ${bodyText}`);
}

async function fetchJson(url, init, expectedStatuses = [200]) {
  const response = await fetch(url, init);
  const bodyText = await response.text();
  const contentType = normalizeContentType(response.headers.get("content-type"));
  const parsedBody =
    bodyText && contentType.includes("application/json") ? JSON.parse(bodyText) : bodyText || null;

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `Unexpected response ${response.status} for ${init?.method ?? "GET"} ${url}: ${
        typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody)
      }`
    );
  }

  return {
    response,
    body: parsedBody,
  };
}

function createMockUpstreamServer() {
  const requests = {
    stable: [],
    fallback: [],
    fail: [],
    timeout: [],
  };

  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }

    const bodyText = Buffer.concat(chunks).toString("utf8");
    let payload = {};
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      payload = {};
    }

    const pathname = new URL(request.url ?? "/", `http://${LOCALHOST}`).pathname;
    const normalizedAuth = String(request.headers.authorization ?? "");
    const requestRecord = {
      method: request.method ?? "GET",
      pathname,
      authorization: normalizedAuth,
      body: payload,
    };

    const sendJson = (statusCode, body) => {
      response.writeHead(statusCode, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };

    const sendStream = async (label) => {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      response.write(
        `data: ${JSON.stringify({
          id: `chatcmpl-${label}-1`,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { role: "assistant" } }],
        })}\n\n`
      );
      await delay(40);
      response.write(
        `data: ${JSON.stringify({
          id: `chatcmpl-${label}-1`,
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta: { content: `${label} stream ok` } }],
        })}\n\n`
      );
      await delay(40);
      response.write(
        `data: ${JSON.stringify({
          usage: {
            prompt_tokens: 9,
            completion_tokens: 4,
            total_tokens: 13,
          },
        })}\n\n`
      );
      response.end("data: [DONE]\n\n");
    };

    if (pathname === "/stable/v1/chat/completions") {
      requests.stable.push(requestRecord);
      assert(normalizedAuth === "Bearer smoke-upstream-stable", "Stable upstream auth mismatch");

      if (payload.stream === true) {
        await sendStream("stable");
        return;
      }

      sendJson(200, {
        id: "chatcmpl-stable",
        object: "chat.completion",
        model: SMOKE_MODEL,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "stable completion ok" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 5,
          total_tokens: 13,
        },
      });
      return;
    }

    if (pathname === "/fallback/v1/chat/completions") {
      requests.fallback.push(requestRecord);
      assert(
        normalizedAuth === "Bearer smoke-upstream-fallback",
        "Fallback upstream auth mismatch"
      );

      sendJson(200, {
        id: "chatcmpl-fallback",
        object: "chat.completion",
        model: SMOKE_MODEL,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "fallback completion ok" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 7,
          completion_tokens: 6,
          total_tokens: 13,
        },
      });
      return;
    }

    if (pathname === "/fail/v1/chat/completions") {
      requests.fail.push(requestRecord);
      assert(normalizedAuth === "Bearer smoke-upstream-fail", "Fail upstream auth mismatch");
      sendJson(503, {
        error: {
          message: "simulated upstream failure",
        },
      });
      return;
    }

    if (pathname === "/timeout/v1/chat/completions") {
      requests.timeout.push(requestRecord);
      assert(normalizedAuth === "Bearer smoke-upstream-timeout", "Timeout upstream auth mismatch");
      await delay(1_500);
      sendJson(200, {
        id: "chatcmpl-timeout",
        object: "chat.completion",
        model: SMOKE_MODEL,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "timeout completion should not arrive" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      });
      return;
    }

    sendJson(404, {
      error: {
        message: `Unhandled mock path: ${pathname}`,
      },
    });
  });

  const start = async (port) => {
    await new Promise((resolve, reject) => {
      server.listen(port, LOCALHOST, resolve);
      server.on("error", reject);
    });
  };

  const stop = async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

  return { requests, start, stop };
}

async function waitForHealth(baseUrl, timeoutMs, onHeartbeat) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    if (onHeartbeat) {
      onHeartbeat();
    }
    await delay(1_000);
  }

  throw new Error(`Timed out waiting for AutoRouter health at ${baseUrl}/api/health`);
}

async function stopChildProcess(child, exitPromise) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    if (result.error) {
      throw result.error;
    }
    await exitPromise.catch(() => undefined);
    return;
  }

  child.kill("SIGTERM");
  const gracefulResult = await Promise.race([
    exitPromise.then(() => "exited"),
    delay(5_000).then(() => "timeout"),
  ]);

  if (gracefulResult === "timeout") {
    child.kill("SIGKILL");
    await exitPromise.catch(() => undefined);
  }
}

async function startLocalAutorouter(adminToken, port) {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "autorouter-proxy-smoke-"));
  const dbDir = path.join(tempRoot, "data");
  const dbPath = path.join(dbDir, "smoke.sqlite");
  mkdirSync(dbDir, { recursive: true });
  const postgresDatabaseUrl = process.env.AUTOROUTER_DATABASE_URL?.trim() || null;

  const env = postgresDatabaseUrl
    ? {
        ...process.env,
        PORT: String(port),
        DB_TYPE: "postgres",
        DATABASE_URL: postgresDatabaseUrl,
        ENCRYPTION_KEY: randomBytes(32).toString("base64"),
        ADMIN_TOKEN: adminToken,
        NEXT_TELEMETRY_DISABLED: "1",
      }
    : {
        ...process.env,
        PORT: String(port),
        DB_TYPE: "sqlite",
        SQLITE_DB_PATH: dbPath,
        ENCRYPTION_KEY: randomBytes(32).toString("base64"),
        ADMIN_TOKEN: adminToken,
        NEXT_TELEMETRY_DISABLED: "1",
      };

  if (postgresDatabaseUrl) {
    runCommand(pnpmCommand, ["db:migrate"], env);
  } else {
    runCommand(
      pnpmCommand,
      ["exec", "drizzle-kit", "push", "--config", "drizzle-sqlite.config.ts"],
      env
    );
  }
  runCommand(pnpmCommand, ["build"], env);

  const child = spawn("node", [".next/standalone/server.js"], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  const exitDeferred = createDeferred();

  child.on("exit", (code, signal) => {
    if (code === 0 || signal === "SIGTERM" || signal === "SIGKILL") {
      exitDeferred.resolve();
      return;
    }
    exitDeferred.reject(
      new Error(`AutoRouter application exited before smoke checks finished (code=${code})`)
    );
  });
  child.on("error", exitDeferred.reject);

  await waitForHealth(`http://${LOCALHOST}:${port}`, 180_000, () => {
    if (child.exitCode !== null) {
      throw new Error(`AutoRouter dev server exited with code ${child.exitCode}`);
    }
  });

  return {
    baseUrl: `http://${LOCALHOST}:${port}`,
    child,
    exitPromise: exitDeferred.promise,
    tempRoot,
  };
}

function createAdminClient(baseUrl, adminToken) {
  const authHeader = `Bearer ${adminToken}`;

  return {
    async createUpstream(payload) {
      const { body } = await fetchJson(
        `${baseUrl}/api/admin/upstreams`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: authHeader,
          },
          body: JSON.stringify(payload),
        },
        [201]
      );
      return body;
    },

    async createApiKey(payload) {
      const { body } = await fetchJson(
        `${baseUrl}/api/admin/keys`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: authHeader,
          },
          body: JSON.stringify(payload),
        },
        [201]
      );
      return body;
    },

    async deleteApiKey(id) {
      await fetchJson(
        `${baseUrl}/api/admin/keys/${id}`,
        {
          method: "DELETE",
          headers: {
            authorization: authHeader,
          },
        },
        [204]
      );
    },

    async deleteUpstream(id) {
      await fetchJson(
        `${baseUrl}/api/admin/upstreams/${id}`,
        {
          method: "DELETE",
          headers: {
            authorization: authHeader,
          },
        },
        [204]
      );
    },
  };
}

async function sendProxyChatCompletion(baseUrl, apiKey, payload) {
  return await fetch(`${baseUrl}/api/proxy/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

async function runSmokeChecks(baseUrl, mockPort, adminToken) {
  const prefix = `ci-smoke-${Date.now()}`;
  const admin = createAdminClient(baseUrl, adminToken);
  const resources = {
    apiKeyIds: [],
    upstreamIds: [],
  };

  const registerUpstream = (upstream) => {
    resources.upstreamIds.unshift(upstream.id);
    return upstream;
  };
  const registerApiKey = (apiKey) => {
    resources.apiKeyIds.unshift(apiKey.id);
    return apiKey;
  };

  try {
    const stableUpstream = registerUpstream(
      await admin.createUpstream({
        name: `${prefix}-stable`,
        base_url: `http://${LOCALHOST}:${mockPort}/stable/v1`,
        api_key: "smoke-upstream-stable",
        timeout: 2,
        weight: 1,
        priority: 0,
        route_capabilities: ["openai_chat_compatible"],
      })
    );

    const failUpstream = registerUpstream(
      await admin.createUpstream({
        name: `${prefix}-fail`,
        base_url: `http://${LOCALHOST}:${mockPort}/fail/v1`,
        api_key: "smoke-upstream-fail",
        timeout: 2,
        weight: 1,
        priority: 0,
        route_capabilities: ["openai_chat_compatible"],
      })
    );

    const fallbackUpstream = registerUpstream(
      await admin.createUpstream({
        name: `${prefix}-fallback`,
        base_url: `http://${LOCALHOST}:${mockPort}/fallback/v1`,
        api_key: "smoke-upstream-fallback",
        timeout: 2,
        weight: 1,
        priority: 1,
        route_capabilities: ["openai_chat_compatible"],
      })
    );

    const timeoutUpstream = registerUpstream(
      await admin.createUpstream({
        name: `${prefix}-timeout`,
        base_url: `http://${LOCALHOST}:${mockPort}/timeout/v1`,
        api_key: "smoke-upstream-timeout",
        timeout: 1,
        weight: 1,
        priority: 0,
        route_capabilities: ["openai_chat_compatible"],
      })
    );

    const stableKey = registerApiKey(
      await admin.createApiKey({
        name: `${prefix}-stable-key`,
        access_mode: "restricted",
        upstream_ids: [stableUpstream.id],
      })
    );

    const failoverKey = registerApiKey(
      await admin.createApiKey({
        name: `${prefix}-failover-key`,
        access_mode: "restricted",
        upstream_ids: [failUpstream.id, fallbackUpstream.id],
      })
    );

    const timeoutKey = registerApiKey(
      await admin.createApiKey({
        name: `${prefix}-timeout-key`,
        access_mode: "restricted",
        upstream_ids: [timeoutUpstream.id],
      })
    );

    const stableResponse = await sendProxyChatCompletion(baseUrl, stableKey.key_value, {
      model: SMOKE_MODEL,
      messages: [{ role: "user", content: "return stable completion" }],
    });
    assert(stableResponse.status === 200, `Stable proxy request returned ${stableResponse.status}`);
    const stableBody = await readJsonResponse(stableResponse);
    assert(
      stableBody?.choices?.[0]?.message?.content === "stable completion ok",
      "Stable proxy response body mismatch"
    );

    const streamResponse = await sendProxyChatCompletion(baseUrl, stableKey.key_value, {
      model: SMOKE_MODEL,
      stream: true,
      messages: [{ role: "user", content: "return stable stream" }],
    });
    assert(streamResponse.status === 200, `Stream proxy request returned ${streamResponse.status}`);
    assert(
      normalizeContentType(streamResponse.headers.get("content-type")).includes(
        "text/event-stream"
      ),
      "Stream proxy response did not expose SSE content type"
    );
    const streamText = await streamResponse.text();
    assert(streamText.includes("stable stream ok"), "Stream proxy response body mismatch");
    assert(streamText.includes("[DONE]"), "Stream proxy response did not contain [DONE]");

    const failoverResponse = await sendProxyChatCompletion(baseUrl, failoverKey.key_value, {
      model: SMOKE_MODEL,
      messages: [{ role: "user", content: "force failover" }],
    });
    assert(
      failoverResponse.status === 200,
      `Failover proxy request returned ${failoverResponse.status}`
    );
    const failoverBody = await readJsonResponse(failoverResponse);
    assert(
      failoverBody?.choices?.[0]?.message?.content === "fallback completion ok",
      "Failover proxy response did not use fallback upstream"
    );

    const concurrentResults = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        sendProxyChatCompletion(baseUrl, stableKey.key_value, {
          model: SMOKE_MODEL,
          messages: [{ role: "user", content: `repeat stable request ${index}` }],
        }).then(async (response) => ({
          status: response.status,
          body: await readJsonResponse(response),
        }))
      )
    );
    assert(
      concurrentResults.every((result) => result.status === 200),
      "At least one repeated stable proxy request failed"
    );
    assert(
      concurrentResults.every(
        (result) => result.body?.choices?.[0]?.message?.content === "stable completion ok"
      ),
      "Repeated stable proxy response body mismatch"
    );

    const timeoutResponse = await sendProxyChatCompletion(baseUrl, timeoutKey.key_value, {
      model: SMOKE_MODEL,
      messages: [{ role: "user", content: "force timeout" }],
    });
    assert(
      timeoutResponse.status === 503,
      `Timeout proxy request returned ${timeoutResponse.status}, expected 503`
    );
    const timeoutBody = await readJsonResponse(timeoutResponse);
    assert(
      timeoutBody?.error?.code === "ALL_UPSTREAMS_UNAVAILABLE",
      "Timeout proxy response did not return the expected unified error code"
    );
    assert(
      timeoutBody?.error?.did_send_upstream === true,
      "Timeout proxy response should record that an upstream request was attempted"
    );

    return resources;
  } catch (error) {
    error.resources = resources;
    throw error;
  }
}

async function cleanupSmokeResources(baseUrl, adminToken, resources) {
  const admin = createAdminClient(baseUrl, adminToken);

  for (const apiKeyId of resources.apiKeyIds) {
    try {
      await admin.deleteApiKey(apiKeyId);
    } catch {
      // Best effort cleanup only.
    }
  }

  for (const upstreamId of resources.upstreamIds) {
    try {
      await admin.deleteUpstream(upstreamId);
    } catch {
      // Best effort cleanup only.
    }
  }
}

async function main() {
  const baseUrlFromEnv = process.env.AUTOROUTER_BASE_URL?.trim() || null;
  const manageServer = !baseUrlFromEnv;
  const adminToken = process.env.AUTOROUTER_ADMIN_TOKEN?.trim() || "ci-admin-token";

  const mockPort = await getFreePort();
  const mockServer = createMockUpstreamServer();
  await mockServer.start(mockPort);

  let serverHandle = null;
  let baseUrl = baseUrlFromEnv;
  let resources = { apiKeyIds: [], upstreamIds: [] };

  try {
    if (manageServer) {
      const appPort = await getFreePort();
      serverHandle = await startLocalAutorouter(adminToken, appPort);
      baseUrl = serverHandle.baseUrl;
    }

    assert(baseUrl, "AutoRouter base URL is required");
    resources = await runSmokeChecks(baseUrl, mockPort, adminToken);

    const { requests } = mockServer;
    assert(requests.stable.length >= 7, "Stable upstream did not receive the expected requests");
    assert(
      requests.stable[0]?.authorization === "Bearer smoke-upstream-stable",
      "Stable upstream auth header was not rewritten to the upstream credential"
    );
    assert(
      requests.fail.length === 1,
      "Failover scenario did not hit the failing upstream exactly once"
    );
    assert(
      requests.fallback.length === 1,
      "Failover scenario did not reach the fallback upstream exactly once"
    );
    assert(requests.timeout.length === 1, "Timeout scenario did not hit the timeout upstream");

    console.log("Proxy stability smoke checks passed.");
  } finally {
    if (baseUrl) {
      await cleanupSmokeResources(baseUrl, adminToken, resources);
    }
    await mockServer.stop().catch(() => undefined);

    if (serverHandle) {
      await stopChildProcess(serverHandle.child, serverHandle.exitPromise).catch(() => undefined);
      rmSync(serverHandle.tempRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});

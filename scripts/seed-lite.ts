import { randomBytes, randomUUID } from "crypto";
import { db, apiKeys, apiKeyUpstreams, upstreamGroups, upstreams } from "../src/lib/db";
import { encrypt } from "../src/lib/utils/encryption";
import { generateApiKey } from "../src/lib/services/key-manager";
import { hashApiKey } from "../src/lib/utils/auth";

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    const encryptionKey = randomBytes(32).toString("base64");
    process.env.ENCRYPTION_KEY = encryptionKey;
    console.warn("[seed-lite] ENCRYPTION_KEY not set; generated one for this seed run.");
    console.warn(
      `[seed-lite] Export this to reuse the seeded data: ENCRYPTION_KEY=${encryptionKey}`
    );
  }

  const now = new Date();
  const groupId = randomUUID();
  const upstreamId = randomUUID();

  await db.insert(upstreamGroups).values({
    id: groupId,
    name: "local-openai",
    provider: "openai",
    strategy: "round_robin",
    healthCheckInterval: 30,
    healthCheckTimeout: 10,
    isActive: true,
    config: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(upstreams).values({
    id: upstreamId,
    name: "local-openai-1",
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKeyEncrypted: encrypt(process.env.UPSTREAM_API_KEY || "sk-mock"),
    isDefault: true,
    timeout: 60,
    isActive: true,
    config: null,
    groupId,
    weight: 1,
    providerType: "openai",
    allowedModels: null,
    modelRedirects: null,
    createdAt: now,
    updatedAt: now,
  });

  const apiKeyValue = generateApiKey();
  const keyHash = await hashApiKey(apiKeyValue);
  const apiKeyId = randomUUID();

  await db.insert(apiKeys).values({
    id: apiKeyId,
    keyHash,
    keyValueEncrypted: encrypt(apiKeyValue),
    keyPrefix: apiKeyValue.slice(0, 12),
    name: "local-dev-key",
    description: "Seeded key for local development",
    isActive: true,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(apiKeyUpstreams).values({
    id: randomUUID(),
    apiKeyId,
    upstreamId,
    createdAt: now,
  });

  console.log("[seed-lite] Seed complete.");
  console.log(`[seed-lite] API Key: ${apiKeyValue}`);
}

main().catch((error) => {
  console.error("[seed-lite] Failed to seed:", error);
  process.exit(1);
});

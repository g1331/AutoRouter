---
title: 通过 AutoRouter 调用模型
outline: deep
---

# 通过 AutoRouter 调用模型

AutoRouter 在 `/api/proxy/v1/*` 暴露与上游协议兼容的代理路径，调用方只需要把请求里原本指向 `https://api.openai.com/v1` 或 `https://api.anthropic.com` 之类的 base URL 换成 AutoRouter 的代理地址，再把 `Authorization` 中的密钥换成 AutoRouter 颁发的客户端 Key，其他部分不变。本页给出各类常见客户端的最小示例，并说明 SSE 流式与失败转移在调用方一侧的实际表现。

前置：已经按 [添加第一个上游](./first-upstream) 创建至少一条活跃上游、按 [创建客户端 API Key](./client-keys) 创建至少一把客户端 Key。

## 基础形态

```
POST http://<your-host>:3331/api/proxy/v1/chat/completions
Authorization: Bearer sk-auto-...
Content-Type: application/json

{
  "model": "gpt-4o-mini",
  "messages": [{"role": "user", "content": "hello"}]
}
```

`<your-host>` 与 `3331` 端口取自部署侧的实际值，默认见 [快速开始](../deployment/quickstart)。请求体中的 `model` 字段是路由决策的关键——AutoRouter 根据它筛选候选上游并选出最终命中的那一条。

## 鉴权 header 支持的三种形式

AutoRouter 按以下顺序尝试解析客户端 Key（`src/app/api/proxy/v1/[...path]/route.ts:2249`）：

```
Authorization: Bearer <key>
x-api-key: <key>
x-goog-api-key: <key>
```

任一形式都能通过。多个同时出现时按上述顺序使用第一个命中的。设计目的是让 OpenAI SDK、Anthropic SDK、Gemini SDK 等不修改默认 header 行为也能直接接入。

## 支持的请求路径

AutoRouter 把客户端请求路径解析为「路由能力」，再从声明了对应能力的上游中选路。当前支持的路径与能力对应关系（`src/lib/services/route-capability-matcher.ts`）：

| 客户端请求路径                                      | 路由能力                                       | 说明                                                                           |
| --------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `POST /v1/chat/completions`                         | `openai_chat_compatible`                       | 标准 OpenAI chat 接口                                                          |
| `GET /v1/models`                                    | `openai_chat_compatible`                       | 返回客户端 Key 可见的模型列表                                                  |
| `POST /v1/completions`                              | `openai_extended`                              | OpenAI 老版补全接口                                                            |
| `POST /v1/embeddings`                               | `openai_extended`                              | 向量嵌入                                                                       |
| `POST /v1/moderations`                              | `openai_extended`                              | 内容审核                                                                       |
| `POST /v1/images/generations`                       | `openai_extended`                              | 图像生成                                                                       |
| `POST /v1/images/edits`                             | `openai_extended`                              | 图像编辑                                                                       |
| `POST /v1/responses`                                | `openai_responses` 或 `codex_cli_responses`    | Responses API；Codex CLI 客户端的请求头 profile 会升级到 `codex_cli_responses` |
| `POST /v1/messages`                                 | `anthropic_messages` 或 `claude_code_messages` | Anthropic 标准；Claude Code CLI 请求头 profile 升级到 `claude_code_messages`   |
| `POST /v1beta/models/<model>:generateContent`       | `gemini_native_generate`                       | Gemini AI Studio 形态；模型从 URL 路径段提取                                   |
| `POST /v1beta/models/<model>:streamGenerateContent` | `gemini_native_generate`                       | 同上，流式                                                                     |

未列出的路径会返回 404 或路由层错误。

## 流式与非流式

OpenAI 协议下用请求体的 `stream` 字段切换（`src/app/api/proxy/v1/[...path]/route.ts:2409`）：

| `stream` 值     | 行为                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 未传 或 `false` | 一次性返回完整 JSON 响应体                                                                                               |
| `true`          | 返回 `Content-Type: text/event-stream` 的 SSE 流；每个 chunk 是一个 `data: ...\n\n` 事件，结束以 `data: [DONE]\n\n` 收尾 |

AutoRouter 在流式情况下使用 `wrapStreamWithConnectionTracking` 包装上游响应：维持流空闲超时（`streamIdleTimeout`）、追踪连接状态、客户端断开时自动释放上游侧并发槽位。对调用方来说接收 SSE 的方式与直接调用 OpenAI 完全一致。

Anthropic 协议下流式由请求体的 `stream` 字段控制；Gemini 协议下由 URL 末段 `:generateContent` vs `:streamGenerateContent` 区分。

## cURL 示例

非流式：

```bash
curl -X POST http://<your-host>:3331/api/proxy/v1/chat/completions \
  -H "Authorization: Bearer sk-auto-..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "用一句话介绍 AutoRouter"}]
  }'
```

流式：

```bash
curl -N -X POST http://<your-host>:3331/api/proxy/v1/chat/completions \
  -H "Authorization: Bearer sk-auto-..." \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [{"role": "user", "content": "用一句话介绍 AutoRouter"}]
  }'
```

`-N` 让 curl 不缓冲输出，方便实时看到 SSE chunk。

## OpenAI SDK（Python）

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-auto-...",
    base_url="http://<your-host>:3331/api/proxy/v1",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "hello"}],
)
print(response.choices[0].message.content)
```

流式：

```python
stream = client.chat.completions.create(
    model="gpt-4o-mini",
    stream=True,
    messages=[{"role": "user", "content": "hello"}],
)
for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)
```

唯一与官方文档不同的是 `base_url` 与 `api_key`，其他参数完全相同。

## OpenAI SDK（Node.js / TypeScript）

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-auto-...",
  baseURL: "http://<your-host>:3331/api/proxy/v1",
});

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hello" }],
});
console.log(response.choices[0].message.content);
```

流式：

```ts
const stream = await client.chat.completions.create({
  model: "gpt-4o-mini",
  stream: true,
  messages: [{ role: "user", content: "hello" }],
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

## Anthropic SDK（Python）

需要 AutoRouter 中至少一条声明了 `anthropic_messages` 能力的上游。

```python
from anthropic import Anthropic

client = Anthropic(
    api_key="sk-auto-...",
    base_url="http://<your-host>:3331/api/proxy/v1",
)

message = client.messages.create(
    model="claude-3-5-sonnet-latest",
    max_tokens=1024,
    messages=[{"role": "user", "content": "hello"}],
)
print(message.content[0].text)
```

Anthropic SDK 默认把密钥放在 `x-api-key` 请求头中，AutoRouter 同样接受该 header，无需额外配置。

## Gemini SDK（Python）

Gemini 客户端使用 `x-goog-api-key` header 与 `/v1beta/models/<model>:generateContent` 路径。

```python
from google import genai

client = genai.Client(
    api_key="sk-auto-...",
    http_options={"base_url": "http://<your-host>:3331/api/proxy/v1"},
)

response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents="hello",
)
print(response.text)
```

`base_url` 末尾的 `/v1` 是必需的：Gemini SDK 会在 base URL 之后再追加 `/v1beta/models/...`，因此最终拼接结果是 `/api/proxy/v1/v1beta/...`。AutoRouter 的代理处理器位于 `/api/proxy/v1/[...path]`，只有保留这段 `/v1` 才能命中代理；丢掉 `/v1` 后请求会落在 `/api/proxy/v1beta/...`，返回 404。

## 响应行为：透传 + 改写

正常 2xx 响应：AutoRouter 把上游响应体透传给调用方，响应 header 在 `src/app/api/proxy/v1/[...path]/route.ts:3192` 处由 `new Headers(result.headers)` 拷贝得到。这里的 `result.headers` 并不是上游响应的原始 header，已经经过 `src/lib/services/proxy-client.ts` 的两道处理：

1. `filterHeaders`（`proxy-client.ts:216`、调用点 `:995`）剔除 hop-by-hop header（`connection`、`keep-alive`、`transfer-encoding` 等不应跨连接传递的字段）。
2. 当 undici 已经自动解压响应体时，`proxy-client.ts:1157-1159` 会同时删除 `content-encoding` 与 `content-length`，避免响应体长度与声明值不一致。

也就是说调用方拿到的不是 1:1 的上游 header 副本。SSE 流式分支额外强制写入 `Content-Type: text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive` 三个标准头（`route.ts:3557-3559`）。代理层**不会**追加 `X-AutoRouter-Request-Id` / `X-AutoRouter-Upstream-Id` 之类的自定义头；本次请求的 ID 与命中上游 ID 通过管理后台的「请求日志」回查。响应体本身格式与上游完全一致，调用方不需要任何兼容层。

错误响应分两类，调用方需要分别识别：

**鉴权阶段**（`src/app/api/proxy/v1/[...path]/route.ts:2446-2473`）：发生在统一错误包装之前，响应体格式较朴素：

```json
{ "error": "Missing API key" }
{ "error": "Invalid API key" }
{ "error": "API key has expired" }
```

均为 HTTP 401。注意不带 `code` / `error_code` 字段，客户端识别失败原因需要解析 `error` 字符串本身。

**路由与转发阶段**：进入统一错误包装（`src/lib/services/unified-error.ts`），响应体形如 `{ error: { code, message, ... } }`。常见错误码：

| 状态            | 错误码                    | 含义                                       |
| --------------- | ------------------------- | ------------------------------------------ |
| 400             | 多种                      | 请求体格式错、`model` 缺失、模型名无法解析 |
| 403             | `NO_AUTHORIZED_UPSTREAMS` | 受限模式下绑定的上游均不能承接该路由能力   |
| 503             | `NO_UPSTREAMS_CONFIGURED` | 没有任何活跃上游声明对应路由能力           |
| 502 / 503 / 504 | 多种                      | 全部候选上游都已 failover 失败             |

状态码与错误码映射关系定义在 `src/lib/services/unified-error.ts`；以上仅列最常见者，完整枚举以源文件 `UnifiedErrorCode` 与 `STATUS_CODE_MAP` 为准。

failover 在调用方眼里是无感的：AutoRouter 会按 [`docs/circuit-breaker.md`](/circuit-breaker) 中的逻辑自动尝试下一条候选，仅当全部候选都失败时才返回最终错误。`/api/admin/logs` 中可以看到本次请求的 `failoverHistory` 字段，记录每次尝试的上游 ID、错误类型与时间戳。

## 模型字段的写法约束

AutoRouter 的模型选路依据是请求体（或 URL 路径）中的 `model` 字段原文。日常使用按下面几条约定：

- 使用上游实际支持的模型名，例如 `gpt-4o-mini`、`claude-3-5-sonnet-latest`、`gemini-2.0-flash`。
- 同名异源时（例如 `claude-3-5-sonnet-latest` 既在 Anthropic 官方上游、也在某个中转上游），AutoRouter 按权重 / 优先级 / 熔断状态在两者之间选择。
- 想强制把某个客户端模型名转写为上游侧的别名（例如客户端用 `gpt-4o` 但上游只接受 `gpt-4o-2024-11-20`），在「上游管理」中为该上游配置 `model_redirects` 或 `model_rules` 的 `alias` 类型，详见后续「模型路由规则」。

如果模型名既不在任何上游的 `model_rules` 中明示支持、也不在任何上游的模型目录中，AutoRouter 会按代码中的 fallback 行为处理（默认仍尝试转发，由上游侧自行决定是否支持）。

## 健康检查与版本

AutoRouter 自身的健康端点不在代理路径下：

```
GET http://<your-host>:3331/api/health
```

返回值见 [快速开始](../deployment/quickstart)，包含部署的版本号。该端点不需要鉴权，可直接挂给监控系统。

## 不在本页范围内

- 模型如何映射到具体上游的内部规则：见后续「模型路由规则」。
- 多上游同模型时的调度逻辑：见后续「负载均衡与权重」。
- 失败转移与熔断状态机：见 [`docs/circuit-breaker.md`](/circuit-breaker) 与后续「失败转移与熔断」。
- 各类客户端 SDK 在生产场景下的最佳实践（重试、超时、并发控制）：超出本页范围；请查看对应 SDK 官方文档。

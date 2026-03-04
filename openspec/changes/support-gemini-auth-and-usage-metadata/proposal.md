## Why

当前 Gemini 客户端请求已经命中网关路径能力，但在入站鉴权阶段被提前拒绝，导致请求无法转发到上游，后续 token 统计链路也无法生效。与此同时，现有 usage 解析尚未覆盖 Gemini `usageMetadata` 与 Anthropic `cache_creation` TTL 细分字段，造成日志与成本分析的观测盲区。并且，Gemini CLI 原生路径请求（`/v1beta/models/{model}:...`）的模型名来自 URL 路径而不是 body，现有实现只读取 `body.model`，导致请求日志与 billing snapshot 的 model 为空。路径能力路由链路也没有应用上游 `modelRedirects`，使 Gemini 请求在日志与计费中无法看到实际重定向后的模型名。

问题已经在真实请求中复现并影响可用性与可观测性，需要尽快以规范化方式补齐“可请求、可解析、可落库、可展示”的闭环。

## What Changes

- 扩展代理入站 API key 提取逻辑，支持从 `authorization`、`x-api-key`、`x-goog-api-key` 中按优先顺序解析，并保持现有 key 校验与过期语义不变。
- 为 Gemini 原生路径请求增加模型名回退提取：当 `body.model` 缺失时，从 `/v1beta/models/{model}:(generateContent|streamGenerateContent)` 路径中解析 model，并用于请求日志与 billing snapshot。
- 为 Gemini 路径能力路由增加 `modelRedirects` 解析：按最终实际发送的上游应用重定向，并把 `resolved_model` 与 `model_redirect_applied` 写入 routing decision、请求日志和 billing snapshot。
- 补齐代理 usage 解析对 Gemini `usageMetadata` 的映射，统一产出 `prompt/completion/total/cacheRead` 等内部字段，并定义缺失字段的回退策略。
- 补齐 Anthropic `usage.cache_creation` 子对象中 `ephemeral_5m_input_tokens` 与 `ephemeral_1h_input_tokens` 的解析与存储路径。
- 统一非流式与流式/回退分支的 usage 口径，避免 `proxy-client` 与 `request-logger` 出现字段解释分叉。
- 增加鉴权来源与头替换相关的可观测性字段，并确保敏感头脱敏策略覆盖新增鉴权头。
- 补齐单元测试与路由测试，覆盖 Gemini 入站鉴权、Gemini usageMetadata、Anthropic TTL 细分字段、以及回退路径一致性。

## Capabilities

### New Capabilities

- `proxy-auth-header-compatibility`: 定义代理入口支持多种 API key 头的鉴权行为、优先级、错误语义与安全约束。
- `provider-usage-normalization`: 定义跨 provider 的 usage 字段归一化、缓存细分字段映射、日志与计费一致性要求。

### Modified Capabilities

- 无

## Impact

- 代理入口与鉴权：`src/app/api/proxy/v1/[...path]/route.ts`、`src/lib/utils/auth.ts`、`src/lib/services/route-capability-matcher.ts`
- 转发与 usage 提取：`src/lib/services/proxy-client.ts`、`src/lib/services/request-logger.ts`
- 数据模型与类型：`src/lib/db/schema-*.ts`、`src/types/api.ts`、`src/lib/utils/api-transformers.ts`
- 日志展示：`src/components/admin/token-display.tsx`、`src/components/admin/logs-table.tsx`
- 测试：`tests/unit/api/proxy/route.test.ts`、`tests/unit/services/proxy-client.test.ts`、`tests/unit/services/request-logger.test.ts`、`tests/unit/utils/auth.test.ts`

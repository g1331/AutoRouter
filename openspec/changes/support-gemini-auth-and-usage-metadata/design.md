## Context

当前代理入口在 `src/app/api/proxy/v1/[...path]/route.ts` 仅从 `authorization` 读取 API key，导致使用 Google Gemini CLI（仅发送 `x-goog-api-key`）的请求在入口被判定为 `Missing API key` 并返回 401。  
同时，usage 解析存在两条实现路径：`proxy-client.extractUsage`（转发阶段）与 `request-logger.extractTokenUsage`（非流式回退阶段）。两者都尚未覆盖 Gemini `usageMetadata`，且 Anthropic `usage.cache_creation` 下的 TTL 细分字段未进入统一数据模型。

本次设计是跨模块变更，涉及鉴权入口、转发头替换、usage 归一化、数据库字段、API transformer、日志展示和测试矩阵，属于高耦合改动，需要先明确统一口径。

## Goals / Non-Goals

**Goals:**
- 让 Gemini 请求在网关入口可鉴权通过，并保留现有 key 校验和错误语义。
- 建立统一 usage 归一化规则，覆盖 OpenAI / Anthropic / Gemini，避免双实现漂移。
- 支持 Anthropic cache 写入 TTL 细分字段的解析、存储和对外输出。
- 强化鉴权与 header 观测，同时确保敏感头值持续脱敏。
- 在日志详情中提供可理解的缓存写入细分信息，不破坏现有 UI 结构与交互。

**Non-Goals:**
- 不改动路径能力匹配规则（`matchRouteCapability`）与 provider 路由策略。
- 不引入新的计费引擎或重定义现有费用计算公式，只在现有公式上接入新增字段。
- 不调整 admin 侧鉴权协议（`validateAdminAuth` 仍使用 `authorization`）。

## Decisions

### 决策 1：入站 API key 提取采用三段回退策略，并显式记录来源

- 方案：代理入口按顺序读取 `authorization` → `x-api-key` → `x-goog-api-key`，第一个可用值作为候选 key。
- 同时记录 `authSource`（`authorization` / `x-api-key` / `x-goog-api-key` / `none`）用于调试与日志归因。
- 保持后续 `getKeyPrefix + verifyApiKey + expiresAt` 流程不变，确保行为兼容。

备选方案与取舍：
- 只支持 `authorization`：已被真实 Gemini 流量证明不可行。
- 将三种头值合并为“任意一个通过即可且不记录来源”：排障能力弱，无法定位 SDK 行为差异。

### 决策 2：出站鉴权头替换改为“provider 优先 + 入站格式兼容”的双约束

- 方案：转发到上游前，先删除入站所有鉴权头（含 `authorization`、`x-api-key`、`x-goog-api-key`），再按上游 provider 注入目标头。
- 注入规则：
  - `openai/custom`：`Authorization: Bearer <upstreamKey>`
  - `anthropic`：`x-api-key: <upstreamKey>`（保留 `anthropic-version` 语义）
  - `google`：`x-goog-api-key: <upstreamKey>`
- `headerDiff.auth_replaced` 与 recorder 脱敏名单同步覆盖新增头名。

备选方案与取舍：
- 保留“沿用客户端头格式”的历史策略：在多 provider 情况下会出现语义漂移，并且对 `x-goog-api-key` 覆盖不完整。

### 决策 3：统一 usage 归一化为单一核心函数，双路径复用

- 方案：抽取统一解析核心（可放在 `proxy-client` 可复用模块），由 `extractUsage` 和 `extractTokenUsage` 共用同一归一化逻辑，避免两处维护。
- Gemini 映射规则：
  - `promptTokenCount -> promptTokens`
  - `candidatesTokenCount -> completionTokens`
  - `totalTokenCount -> totalTokens`（缺失时回退为前两者求和）
  - `cachedContentTokenCount -> cacheReadTokens`，并映射到 `cachedTokens` 兼容旧展示
- Anthropic TTL 映射规则：
  - `cache_creation.ephemeral_5m_input_tokens -> cacheCreation5mTokens`
  - `cache_creation.ephemeral_1h_input_tokens -> cacheCreation1hTokens`
  - `cacheCreationTokens = cacheCreation5mTokens + cacheCreation1hTokens`（若细分缺失则回退到 `cache_creation_input_tokens`）

备选方案与取舍：
- 继续维护两套解析实现：短期改动快，但口径漂移风险高，已在现有代码中出现结构性重复。

### 决策 4：新增 TTL 细分字段采用“向后兼容扩展”模型

- 方案：在 DB schema（PG/SQLite）、API 类型、transformer、日志响应中新增可空或默认 0 的细分字段，不移除既有 `cache_creation_tokens`。
- UI 只在字段 > 0 时显示细分行，默认保持当前布局与信息层级。

日志详情布局示意：

```text
+------------------------------------------------------+
| Token Details                                        |
| 输入 tokens: 46,178                                  |
|   缓存命中: 46,171                                   |
|   新输入: 7                                           |
| 输出 tokens: 128                                     |
| 缓存写入: 556                                        |
|   5m 写入: 456                                       |
|   1h 写入: 100                                       |
| 总计: 46,306                                         |
+------------------------------------------------------+
层级说明：
1) 总计与输入/输出是一级信息（主对比）
2) cache hit / cache write 是二级信息（成本关联）
3) TTL 细分是三级信息（排障和精细分析）
```

端到端流程图：

```text
Client
  | headers: authorization | x-api-key | x-goog-api-key
  v
Proxy Entry (extract inbound key + authSource)
  |
  v
Key Verify (prefix + bcrypt + expiry)
  |
  v
Forward Request (strip inbound auth headers, inject provider auth header)
  |
  v
Upstream Response
  |-- stream -> normalizeUsage
  |-- json fallback -> normalizeUsage
  v
Request Log / Billing Snapshot / API Transformer / Logs UI
```

## Risks / Trade-offs

- [风险] 头优先级调整可能引发边缘客户端兼容差异  
  → Mitigation：增加路由单测覆盖三类头组合与冲突场景，并保持错误码不变。

- [风险] 新增 DB 字段需要迁移，历史数据不存在细分值  
  → Mitigation：字段默认值为 0，查询与 UI 均按“可选细分”渲染，历史数据可平滑兼容。

- [风险] 统一解析可能影响既有计费口径  
  → Mitigation：在测试中固定 OpenAI/Anthropic 现有样例快照，确保旧 provider 结果不回归。

- [风险] recorder/header diff 泄露新增敏感头  
  → Mitigation：将 `x-goog-api-key` 纳入脱敏名单，并补充针对性安全测试。

## Migration Plan

1. 增加 schema 迁移：`request_logs` 新增 `cache_creation_5m_tokens`、`cache_creation_1h_tokens`（默认 0）。  
2. 扩展类型与 transformer，保证 API 输出字段可用且向后兼容。  
3. 实现入站鉴权与出站头替换增强，先补路由与 header 单测。  
4. 合并 usage 归一化逻辑并补全 provider 样例测试。  
5. 更新日志详情展示逻辑，保证旧字段场景 UI 不变。  
6. 执行门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`。

回滚策略：
- 如果迁移后发现口径异常，可先回滚应用逻辑到旧解析，同时保留新增列（兼容空列不影响旧逻辑）。
- 若必须数据库回滚，执行对应 down migration 并同步回退 transformer 字段映射。

## Open Questions

- Anthropic 非流式 `cache_creation_input_tokens` 与 `cache_creation.{ephemeral_*}` 同时出现且不相等时，优先级是否固定为细分求和？  
- `authSource` 是否需要直接透出到 admin logs API，还是仅保留在调试日志与 fixture 中？  
- 日志 UI 是否要默认展示 TTL 细分，还是仅在展开面板中显示以降低噪声？

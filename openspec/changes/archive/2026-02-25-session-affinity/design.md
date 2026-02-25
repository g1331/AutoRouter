## Context

AutoRouter 是一个 AI API 网关，通过加权随机算法将请求路由到多个上游。当前路由是完全无状态的，同一对话的后续请求可能被分配到不同上游，导致上游侧的 Prompt Cache 失效，产生额外费用。

主要下游客户端为 Claude Code CLI 和 Codex CLI，它们在请求中自然携带了会话标识符：
- Anthropic API：`body.metadata.user_id` 包含 `session_{uuid}`
- OpenAI Responses API：`headers.session_id`

当前上游选择入口为 `selectFromProviderType(providerType, excludeIds?, allowedUpstreamIds?)`，在 `forwardWithFailover()` 中被调用。请求体在上游选择前已被解析（用于提取 model），因此会话标识符在选择时可用。

### 当前问题

```
请求 1 (conversation turn 1)          请求 2 (conversation turn 2)
         |                                      |
         v                                      v
   +-----------+                          +-----------+
   | 加权随机   |                          | 加权随机   |
   | 选择上游   |                          | 选择上游   |
   +-----------+                          +-----------+
         |                                      |
         v                                      v
   +-----------+                          +-----------+
   | Upstream A |  <-- 命中缓存           | Upstream B |  <-- 缓存未命中!
   | (权重: 3)  |                         | (权重: 1)  |     重建上下文
   +-----------+                          +-----------+     产生额外费用
```

### 系统总览

```
+--------------------------------------------------------------+
|                    Session Affinity System                    |
|                                                              |
|  +--------------------+  +----------------------+  +-------+ |
|  | Session Extractor  |  | Affinity Store       |  |Migrat.| |
|  |                    |  | (Memory Map + TTL)   |  |Evaluat| |
|  | Anthropic:         |  |                      |  |       | |
|  |  metadata.user_id  |  | Key: fingerprint     |  | 目标  | |
|  |  -> session UUID   |  | Val: upstreamId,     |  | 上游  | |
|  |                    |  |      lastAccess,      |  | 配置: | |
|  | OpenAI:            |  |      contentLength    |  | enabl.| |
|  |  headers.session_id|  |                      |  | metric| |
|  |                    |  | TTL: 5min sliding    |  | thres.| |
|  | 其他: null         |  | Max TTL: 30min       |  |       | |
|  |  -> 正常路由       |  |                      |  |       | |
|  +--------------------+  +----------------------+  +-------+ |
+--------------------------------------------------------------+
```

### 选择流程

```
请求到达 -> 提取 sessionId
              |
              v
        查亲和性缓存
        +----+----+
      命中       未命中
        |         |
        v         v
   绑定上游可用?  正常加权选择 -> 写入缓存
    +---+---+
   是      否
    |       |
    v       v
  检查是否   重新选择 -> 更新缓存
  应该迁移
    |
    v
  有更高优先级
  上游恢复了?
  +---+---+
 否      是
  |       |
  v       v
 保持    对话还短吗?
 亲和    (content-length < 阈值)
         +---+---+
        是      否
         |       |
         v       v
      迁移到P0  保持亲和在P1
      更新缓存  (缓存重建代价太高)
```

### 数据流

```
handleProxy()
    |
    v
[1] extractRequestContext(request)     <-- 一次解析提取 model + sessionId
    |
    v
[2] routeByModel(model) -> providerType
    |
    v
[3] forwardWithFailover(request, providerType, ..., sessionId, contentLength)
    |
    v
[4] selectFromProviderType(providerType, ..., sessionId, contentLength)
    |
    +-- sessionId? --> affinityStore.get(fingerprint)
    |                    |
    |                    +-- 命中 --> 上游可用? --> 迁移评估 --> 返回
    |                    |
    |                    +-- 未命中 --> 正常加权选择 --> affinityStore.set()
    |
    +-- 无 sessionId --> 正常加权选择（现有逻辑不变）
    |
    v
[5] forwardRequest(request, upstream)
```

## Goals / Non-Goals

**Goals:**

- 同一会话的请求尽量路由到同一上游，最大化 Prompt Cache 命中率
- 当绑定的上游不可用时，自动重新选择并更新绑定
- 当更高优先级上游恢复时，允许短对话迁移回高优先级上游（由目标上游配置控制）
- 对无法识别会话的请求（直接 API 调用），保持现有行为完全不变
- 亲和性 TTL 与上游 Prompt Cache 生命周期对齐

**Non-Goals:**

- 不做分布式亲和性存储（当前单实例部署，内存 Map 足够）
- 不修改下游客户端行为
- 不实现基于精确 token 数或费用的迁移阈值（预留接口，后续计费系统完成后实现）

## Decisions

### D1: 会话标识符提取策略

**选择**：从请求体和 headers 中自动提取，按 providerType 分策略。

| providerType | 提取位置 | 提取方式 |
|-------------|---------|---------|
| anthropic | `body.metadata.user_id` | 正则提取 `session_` 后的 UUID |
| openai | `headers.session_id` | 直接使用 header 值 |
| google / custom | 无 | 返回 null，走正常路由 |

**理由**：这些标识符是客户端自然发送的，不需要任何下游改动。Anthropic 的 `user_id` 中包含 `_session_{uuid}` 后缀，每次新会话都会变化，是可靠的会话标识。

**备选方案**：基于 `messages[0]` 内容哈希推断会话 — 计算开销大且不可靠，放弃。

### D2: 亲和性缓存存储

**选择**：进程内 `Map<string, AffinityEntry>` + 滑动窗口 TTL。

```
AffinityEntry = {
  upstreamId: string,
  lastAccessedAt: number,
  contentLength: number,       // 最近一次请求的 content-length
  cumulativeTokens: number,    // 累计 input tokens（从响应 usage 中累加）
}

Key = hash(apiKeyId + providerType + sessionId)
```

**TTL 策略**：
- 默认 TTL：5 分钟（匹配 Anthropic ephemeral_5m 缓存）
- 每次命中刷新 lastAccessedAt（滑动窗口）
- 最大 TTL 上限：30 分钟

**理由**：
- 零额外延迟，零外部依赖
- 亲和性丢失的代价仅是一次缓存重建，不是灾难性的
- 进程重启不频繁，重启后自然重建绑定

**备选方案**：数据库存储 — 每次请求多一次 DB 查询，延迟增加，对于亲和性这种"尽力而为"的特性来说过重，放弃。

### D3: 与负载均衡器的集成方式

**选择**：在 `selectFromProviderType` 中新增可选参数 `sessionId`，在现有分层选择逻辑之前插入亲和性查询。

```
selectFromProviderType(providerType, excludeIds?, allowedUpstreamIds?, sessionId?)
    │
    ├── sessionId 存在 → 查亲和性缓存
    │   ├── 命中且上游可用 → 检查迁移 → 返回
    │   └── 未命中或上游不可用 → 走正常选择 → 写入/更新缓存
    │
    └── sessionId 不存在 → 走现有逻辑（完全不变）
```

**理由**：最小化改动，亲和性作为现有选择逻辑的"前置优化"，不影响核心路由算法。

### D4: 智能迁移机制

**选择**：由目标上游（高优先级）配置 `affinityMigration`，声明是否接受迁移及阈值。

```typescript
// upstream 表新增字段
affinityMigration: {
  enabled: boolean,
  metric: "tokens" | "length",  // 默认 tokens，优先使用 token 数评估
  threshold: number,            // 默认 50000（tokens）或字节数（length）
} | null
```

**metric 说明**：
- `"tokens"`（默认）：使用亲和性缓存中累计的 input tokens 进行评估。token 数据从每次响应的 usage 中累加。首次请求时无历史 token 数据，视为 0（允许迁移）。
- `"length"`：使用当前请求的 content-length 字节数进行评估。精度较低但无需历史数据。

**默认阈值**：50000（当 metric 为 tokens 时表示 50K tokens，当 metric 为 length 时表示约 50KB）。

**迁移触发条件**（全部满足才迁移）：
1. 当前会话绑定在低优先级上游
2. 存在更高优先级上游已恢复（熔断器 CLOSED）
3. 该高优先级上游配置了 `affinityMigration.enabled = true`
4. 当前请求的 content-length 低于该上游的 `threshold`

**理由**：配置在目标上游（接收方），因为迁移的动机是"高优先级上游恢复后想把流量拿回来"，阈值应由接收方定义。

### D5: 会话标识符传递路径

**选择**：在 `handleProxy` 中提取 sessionId，通过 `forwardWithFailover` 传递到 `selectFromProviderType`。

当前 body 已在 `extractModelFromRequest` 中被解析（clone + JSON.parse），为避免重复解析，将 sessionId 提取合并到同一次解析中。

具体方案：将 `extractModelFromRequest` 扩展为 `extractRequestContext`，一次解析同时提取 model 和 sessionId。

## Risks / Trade-offs

**[风险] 进程重启导致亲和性全部丢失** → 影响有限，仅导致一次 Prompt Cache 重建。重启后新请求自然建立新绑定。

**[风险] 内存占用增长** → 每个 AffinityEntry 约 100 字节，TTL 30 分钟自动清理。即使 10 万并发会话也仅占 ~10MB，可忽略。需要实现定期清理过期条目的机制。

**[风险] Anthropic `metadata.user_id` 格式变化** → 使用正则提取 session UUID，如果格式变化会 fallback 到正常路由（返回 null），不会导致错误。

**[权衡] 亲和性 vs 负载均衡** → 亲和性只影响后续请求，首次请求仍走加权选择，长期负载分布仍然均衡。但极端情况下（大量长会话集中在一个上游），可能导致负载不均。当前阶段可接受。

**[权衡] content-length 作为对话大小指标的精度** → content-length 包含 system prompt、tools 定义等固定开销，不完全等于对话历史大小。但作为粗略指标足够，后续可升级为 token 或 cost 指标。

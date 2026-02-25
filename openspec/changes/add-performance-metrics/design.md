## Context

AutoRouter 当前的请求日志系统记录了 `durationMs`（请求总耗时）、`routingDurationMs`（路由耗时）以及完整的 token 用量字段（prompt/completion/total/cached/reasoning/cacheCreation/cacheRead）。Dashboard 展示 3 张概览卡片（今日请求数、平均响应时间、Token 总量）、按上游分组的请求量时序图、以及排行榜。

现有的数据采集缺少两个关键时间点：上游首字输出时间（TTFT）和请求是否为流式响应（isStream）。这两个字段的缺失导致无法计算出用户最关心的"出字速度"和"生成速率"指标。而缓存命中率所需的数据（cacheReadTokens、promptTokens）已在数据库中，只是缺少聚合计算和前端展示。

## Goals / Non-Goals

**Goals:**
- 在代理层准确采集上游 TTFT（从 fetch 发出到第一个有效 SSE data event）
- 在日志中记录请求的流式/非流式类型
- 在 Dashboard 和日志页面展示 TTFT、TPS、Cache 命中率三个新指标
- 保持与现有 pg + sqlite 双 schema 架构的一致性

**Non-Goals:**
- 不做实时 TPS 流式推送（WebSocket 实时指标面板）
- 不新增独立的指标存储表或时序数据库
- 不追踪网关层面的 TTFT（含路由开销），只追踪纯上游 TTFT
- 不在本次变更中引入 P50/P95/P99 分位数统计

## Decisions

### Decision 1: TTFT 采集位置 — createSSETransformer 回调

**选择**: 在 `createSSETransformer` 中新增 `onFirstChunk` 回调，由 `forwardRequest` 传入起始时间戳并计算差值。

**替代方案**:
- 方案 B: 在 `forwardRequest` 的 fetch resolve 时记录（即 HTTP 首字节时间）。但 fetch Promise 在收到 HTTP 响应头时就 resolve，此时上游可能还没开始生成 token，尤其在思考型模型（如 o1/claude-3.5-sonnet extended thinking）场景下会严重低估 TTFT。
- 方案 C: 在 proxy route 层通过包装 ReadableStream 测量。但这样测到的是经过 SSE transformer 处理后的时间，且增加了 route 层的复杂度。

**理由**: SSE transformer 是第一个接触到上游 `data:` 事件内容的地方，在此处回调能精确捕获"第一个有效内容 chunk"的时刻。同时不影响现有的 usage 提取逻辑。

**实现细节**:

```
forwardRequest() 改动:

  const upstreamSendTime = Date.now();  ← 新增: fetch 发出前记录
  const upstreamResponse = await fetch(...);

  // 流式路径:
  let ttftMs: number | undefined;
  const transformedStream = upstreamResponse.body.pipeThrough(
    createSSETransformer(
      (u) => { usage = u; },
      () => { ttftMs = Date.now() - upstreamSendTime; }  ← 新增: 首 chunk 回调
    )
  );

  // 非流式路径:
  // ttftMs 不设置 (null), 因为非流式的"首字"就是整个响应
```

`createSSETransformer` 签名变更:

```
// 现有
createSSETransformer(onUsage: (usage: TokenUsage) => void)

// 变更为
createSSETransformer(callbacks: {
  onUsage: (usage: TokenUsage) => void;
  onFirstChunk?: () => void;
})
```

使用 options 对象而非多个位置参数，保持扩展性。在 transformer 的 `transform` 方法中，当第一个非空 `data:` 行（排除 `[DONE]` 和空字符串）被处理时，调用一次 `onFirstChunk`。

### Decision 2: TPS 纯计算不存储

**选择**: TPS 不新增数据库字段，在服务端聚合查询和前端展示时实时计算。

**公式**:
```
generationMs = durationMs - routingDurationMs - ttftMs
tps = completionTokens / (generationMs / 1000)
```

**保护条件**:
- `generationMs < 100` 时不计算（避免除法异常和无意义的极大值）
- `isStream = false` 时不计算（非流式请求的 TPS 没有实际意义）
- `completionTokens = 0` 时不计算

**替代方案**: 存储 `tps` 字段到数据库。但这是完全可从已有字段推导的派生值，存储会引入数据一致性风险（比如后续修改 TTFT 计算逻辑后历史 TPS 值不一致）。

### Decision 3: Cache 命中率统一公式

**选择**: `cacheReadTokens / promptTokens` 作为跨 provider 统一的命中率公式。

**各 provider 对照验证**:

| Provider | promptTokens 来源 | cacheReadTokens 来源 | 公式有效性 |
|----------|-------------------|---------------------|-----------|
| OpenAI Chat API | prompt_tokens | prompt_tokens_details.cached_tokens | cached/total，正确 |
| OpenAI Responses API | input_tokens | input_tokens_details.cached_tokens | cached/total，正确 |
| Anthropic | input_tokens (或 fallback 到 creation+read) | cache_read_input_tokens | read/total，正确 |

**聚合公式** (SQL):
```sql
SUM(cache_read_tokens)::float / NULLIF(SUM(prompt_tokens), 0) * 100
```

不需要新增任何数据库字段。

### Decision 4: Schema 新增字段

新增两个字段到 `request_logs` 表（pg + sqlite 同步）：

| 字段 | PG 类型 | SQLite 类型 | 默认值 | 说明 |
|------|---------|-------------|--------|------|
| `ttft_ms` | `integer` | `integer` | `NULL` | 上游首字耗时（毫秒），非流式请求为 NULL |
| `is_stream` | `boolean` | `integer (mode: boolean)` | `false` | 是否流式响应 |

### Decision 5: Dashboard 概览卡片布局 — 5 列自适应

**选择**: 从 3 张卡片扩展为 5 张，使用 `md:grid-cols-5` 布局。

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Today        │ │ Avg TTFT     │ │ Avg Response │ │ Total Tokens │ │ Cache Hit    │
│ Requests     │ │              │ │ Time         │ │              │ │ Rate         │
│   1,234      │ │   380ms      │ │   2.1s       │ │   2.4M       │ │   67.3%      │
│  requests    │ │ first token  │ │  latency     │ │  tokens      │ │ efficiency   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
     sm: 2列折行          md: 3列折行            lg: 5列一行
```

响应式策略: `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`

TTFT 放在 Avg Response Time 前面，因为 AI 服务场景下"多久出字"比"总共多久"更核心。

### Decision 6: 时序图表 Tab 切换

**选择**: 在现有 `UsageChart` 组件外层包一个 Tab 容器，提供三个视图。

```
  ┌──────────────┬──────────────┬──────────────┐
  │ 请求量 (默认)  │   Avg TTFT   │   Avg TPS    │
  └──────┬───────┴──────────────┴──────────────┘
         │
  ┌──────▼──────────────────────────────────────┐
  │                                             │
  │       按上游分组的面积图                      │
  │       (复用现有 AreaChart 组件和配色体系)      │
  │                                             │
  └─────────────────────────────────────────────┘
```

三个 Tab 共享相同的上游分组逻辑和配色，只是 Y 轴数据不同：
- 请求量: `request_count`（现有）
- Avg TTFT: `avg_ttft_ms`（新增，单位 ms）
- Avg TPS: `avg_tps`（新增，单位 tokens/s，仅统计流式请求）

后端 timeseries API 新增 `metric` 参数（默认 `requests`，可选 `ttft`、`tps`），而非一次返回所有指标。这样按需加载，避免不必要的数据传输。

### Decision 7: 日志表格 — TTFT 独立列，TPS 内嵌耗时

```
... | Status | TTFT     | Duration         |
... | 200    | 380ms    | 2.1s             |
... |        |          | 42.5 t/s         |  ← muted 色小字，仅流式
... | 200    | 1.2s     | 3.5s             |
... |        |          | 38.1 t/s         |
... | 200    |   -      | 0.5s             |  ← 非流式无 TTFT 和 TPS
```

- TTFT 列: `hidden md:table-cell`（移动端隐藏，展开行可查看）
- TPS: 渲染在 Duration 单元格内部，使用 `text-xs text-muted-foreground` 样式
- 展开行 Token 详情追加缓存百分比: `Cached: 800 (80%)`

### Decision 8: 上游排行榜扩展

上游排行新增两列 Avg TTFT 和 Avg TPS。API Key 和 Model 排行保持不变（这两个维度的 TTFT/TPS 参考意义不大）。

排行中的 Avg TPS 仅统计 `is_stream = true` 的请求，避免非流式请求稀释数据。

## Risks / Trade-offs

**[TTFT 在非 SSE 流式中不可用]** 部分上游可能使用非标准流式协议（如 chunked JSON），不经过 SSE transformer。
→ 缓解: 当前 AutoRouter 只支持 SSE 流式代理，非 SSE 返回走 non-stream 路径，TTFT 为 NULL，不影响计算。

**[5 列卡片在中等屏幕的空间压力]** `md:grid-cols-3` 折行时 5 张卡片会变成 3+2 排列，底部两张可能视觉不对称。
→ 缓解: 使用 `sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5` 使各断点都能均匀排列（2+2+1 / 3+2 / 5）。实际上 3+2 在数据类面板中很常见，可接受。

**[TPS 在 completionTokens 很少时失真]** 如果上游只输出了几个 token（比如 function call 场景），计算出的 TPS 会极不稳定。
→ 缓解: 在展示层增加 `completionTokens >= 10` 的最低阈值，低于此值不显示 TPS。

**[Cache 命中率在 Anthropic streaming 场景的 input_tokens=0 问题]** Anthropic 流式响应有时 `input_tokens` 报为 0，代码已有 fallback 到 `cacheCreation + cacheRead`。
→ 已缓解: 现有的 `extractFromUsageObject` 逻辑处理了这个 fallback，`promptTokens` 始终有有效值。

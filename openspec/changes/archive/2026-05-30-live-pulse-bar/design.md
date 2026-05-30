## Context

AutoRouter 已有一套进程内实时链路，本变更在其之上叠加一个面向「运行健康概览」的实时脉搏视图，而不是新造一套推送机制。现状如下：

```
请求收口 (request-logger.ts)
   └─ notifyRequestLogChange(logEntry)         // 完整请求行：statusCode/durationMs/totalTokens/upstreamId
        └─ publishRequestLogLiveUpdate(event)   // 进程内发布，当前仅转发 logId + statusCode
             └─ subscribeRequestLogLiveUpdates  // 订阅者
                  └─ /api/admin/logs/live (SSE) // 仅推送 request-log-changed，供日志页失效查询
                       └─ use-request-log-live  // 前端 SSE 客户端，三态 + 降级轮询
```

现有仪表盘 `StatsCards` 走 `/admin/stats/overview`，按「今日/昨日」DB 聚合，60 秒刷新，粒度粗、非实时。`Topbar` 组件当前仅渲染标题，右侧整片空白，且为 `hidden md:block`（移动端隐藏）。全部 11 个管理页各自渲染 `<Topbar>`，因此把状态条做进 `Topbar` 即可全局常驻。

网关健康信号的现成来源：`health-checker.ts` 的 `getAllHealthStatusWithCircuitBreaker()` 同时返回上游健康状态与熔断状态，可一次性拼出「健康上游数/总数」与「熔断打开数」。

## Goals / Non-Goals

**Goals:**

- 在所有管理页顶栏常驻一条秒级实时运行状态条，复用既有 pub/sub + SSE + 三态降级语义。
- 指标为网关增强版：滚动 60 秒窗口的 req/min、错误率、平均延迟、TPM，外加健康上游数/总数与熔断打开数。
- 服务端滚动窗口聚合，避免前端在页面加载后从零累积窗口；DB 负载尽量低。
- 移动端提供紧凑形态，桌面顶栏隐藏时仍可见核心状态。

**Non-Goals:**

- 不替换或改写既有 `StatsCards`「今日/昨日」汇总视图。
- 不改动 `/api/admin/logs/live` 既有事件契约与日志页行为。
- 不引入跨实例共享状态（Redis 等）；滚动窗口为进程内内存状态，沿用既有进程内实时链路的单实例语义。
- 不做历史回放或持久化；脉搏只反映「当下最近 60 秒」。

## Decisions

### 决策 1：服务端滚动窗口聚合，而非前端累积

新增 `live-pulse-aggregator.ts`，在内存中维护最近 60 秒的时间分桶计数（按秒分桶的环形结构）。每个桶累计：请求数、非 2xx 数、成功请求延迟之和与成功请求数、token 总量。读取快照时把窗口内各桶合并换算为 req/min、错误率、平均延迟、TPM。

为什么选服务端：前端累积方案在页面刚加载时窗口为空，req/min 需要 60 秒才能爬满，且只反映「连接后」的流量，失真明显。服务端聚合在任意时刻读到的都是真实最近 60 秒。

考虑过的替代方案：每隔 2~3 秒查一次 `requestLogs` 最近 60 秒（DB 聚合）。准确但每个在线管理员每数秒触发一次聚合查询，DB 负载随在线人数线性增长；内存环形桶则与查询人数无关，且与现有进程内 pub/sub 模型同构。故采用内存聚合。

### 决策 2：取样源接入请求收口发布点

聚合器订阅既有 `subscribeRequestLogLiveUpdates`，但当前事件只带 `logId + statusCode`，缺 `durationMs/totalTokens/upstreamId`。两种接法：

- 方案 A：扩展 `RequestLogLiveUpdate` 事件，附带 `durationMs/totalTokens` 等字段，聚合器从订阅回调取样。
- 方案 B：在 `request-logger.ts` 收口路径直接调用 `recordPulseSample(...)`，与 pub/sub 解耦。

采用方案 B。脉搏取样只需在「请求收口为终态」这一刻发生（`durationMs/totalTokens` 此时才确定），而 `notifyRequestLogChange` 还会在请求创建（进行中、无耗时/ token）时触发；复用同一事件会引入「进行中样本」噪声，需要额外过滤。直接在收口路径显式取样语义更清晰，也避免改动既有事件契约。`recordPulseSample` 仅接收收口终态样本。

### 决策 3：独立 SSE 端点 `/api/admin/stats/live`

新增 `/api/admin/stats/live`，鉴权与 `/api/admin/logs/live` 一致（`validateAdminAuth` + `ADMIN_TOKEN` Bearer）。连接建立后立即推送一帧快照，随后每约 2 秒推送一帧 `live-pulse` 事件；保留 15 秒心跳注释行。

为什么独立端点而非复用 logs/live：脉搏快照是「定时拼装的聚合帧」，与 logs/live 的「按请求变更触发」语义不同；混用会让日志页接收无关 `live-pulse` 帧、脉搏页接收无关 `request-log-changed` 帧。独立端点与现有「一个关注点一个端点」的目录结构一致（`/admin/logs/live`、`/admin/stats/*`）。

快照拼装时读取 `getAllHealthStatusWithCircuitBreaker()` 得到健康/熔断信号，与滚动窗口指标合并为一帧。

### 决策 4：前端复用三态与降级，新增 `use-live-pulse`

新增 `use-live-pulse.ts`，结构对齐 `use-request-log-live.ts`：连接 `/api/admin/stats/live`，解析 `live-pulse` 事件，维护快照状态与 `connecting/live/fallback` 三态。降级时改用对同一端点的快照拉取（或退化为定时请求一次性快照接口），保证指标持续更新。

状态条组件 `live-pulse-bar.tsx` 消费该 hook，纯展示。`Topbar` 扩展为可选承载状态条，所有页面经 `Topbar` 自动获得。

### 决策 5：放置与响应式布局

桌面端把状态条挂在 `Topbar` 右侧（`justify-between` 的右栏）。移动端 `Topbar` 为 `hidden md:block`，因此状态条在移动端走紧凑形态：仅呈现在线指示灯 + req/min + 错误率，挂在移动端可见的页头区域，不挤压标题与返回导航。

桌面顶栏布局示意：

```
┌────────────────────────────────────────────────────────────────────────┐
│ >> DASHBOARD            ● Live  128 req/min · 0.4% err · 842ms · 1.2M TPM │
│                                 ▣ 8/9 上游健康 · ⚡ 1 熔断打开            │
├────────────────────────────────────────────────────────────────────────┤
│  今日请求 │ 平均响应 │ Token │ 成本 ...        (StatsCards 区域不变)       │
└────────────────────────────────────────────────────────────────────────┘
```

移动端紧凑形态示意（顶部窄条）：

```
┌──────────────────────────────┐
│ ● Live   128 req/min  0.4% err│
└──────────────────────────────┘
```

指示灯与状态色映射：

| 连接态 | 指示灯 | 含义 |
|---|---|---|
| `live` | 绿色常亮/脉动 | SSE 在线，快照随推送更新 |
| `connecting` | 灰色 | 正在建立连接 |
| `fallback` | 琥珀色 | 已降级为定时拉取 |

错误率与健康信号的强调色：错误率超过阈值（例如 >5%）时以错误色强调；熔断打开数 >0 时以警示色强调，与既有日志页错误强调样式风格一致。

## Risks / Trade-offs

- [进程内内存状态，多实例下各自为政] → 沿用既有进程内 SSE 链路的现状约束；在 proposal/design 中显式声明按单实例部署语义工作，多实例场景不在本变更范围。
- [进程重启后窗口清空，req/min 短暂从低值爬升] → 可接受：脉搏本就只反映「最近 60 秒」，重启后 60 秒内自然恢复；状态条无流量时显示零值而非报错。
- [每个在线管理员各持一条 SSE 连接，约 2 秒一帧] → 帧体小（数百字节级），且快照在服务端按需拼装；健康信号读取走既有 `getAllHealthStatusWithCircuitBreaker`，必要时对快照拼装结果做短 TTL 缓存以避免高频读取放大。
- [取样点遗漏导致脉搏与日志数据不一致] → 取样统一接入请求收口路径这一唯一终态写入点，并以单元测试覆盖「过期样本移出窗口」「错误率只算非 2xx」「平均延迟只算成功请求」等场景，保证聚合口径与 spec 一致。
- [移动端空间紧张] → 紧凑形态仅保留在线指示与最关键的 req/min、错误率，避免与标题、返回导航争抢空间。

## Migration Plan

纯增量特性，无数据迁移。新增端点与组件，默认在所有管理页生效。回滚方式为移除 `Topbar` 中的状态条挂载点与新增端点/服务文件，不影响既有统计与日志链路。

## Open Questions

- 错误率/熔断的强调色阈值取值（如错误率 5%）需在实现时对照现有设计 token 与既有强调样式确定，默认采用与日志页错误强调一致的色板。
- 移动端紧凑形态的具体挂载位置（复用 `layout.tsx` 中既有移动端 `header`，还是独立窄条）在实现时按视觉协调度确定，spec 仅约束「核心状态可见且不挤压标题与导航」。

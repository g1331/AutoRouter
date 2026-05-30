## Why

当前仪表盘的 `StatsCards` 只展示「今日 vs 昨日」的粗粒度汇总，刷新间隔为 60 秒，管理员无法一眼看到网关此刻的运行状态。当上游突发抖动、错误率上升或熔断器打开时，需要切换到日志页或时序图才能察觉，缺少一个常驻、秒级、跨页面可见的运行健康概览。

AutoRouter 本身已经具备进程内实时发布订阅（`request-log-live-updates.ts`）、SSE 推送端点（`/api/admin/logs/live`）以及带降级轮询的前端实时客户端（`use-request-log-live.ts`）。在这套既有基础设施之上，可以低成本地提供一条始终可见的实时运行状态条，并结合 AutoRouter 作为多上游网关独有的健康信号（上游健康度、熔断器状态），形成区别于通用中转站的网关运行脉搏视图。

## What Changes

- 新增「实时脉搏状态条」(Live Pulse Bar)，常驻在所有管理页 `Topbar` 的右侧（移动端提供紧凑形态）。
- 新增服务端滚动窗口聚合器：以最近 60 秒为窗口，对已收口请求按时间分桶累计请求数、非 2xx 错误数、成功请求延迟、token 总量；从 `request-logger` 的请求收口发布点取样（携带 `durationMs`、`totalTokens`、`statusCode`、`upstreamId`）。
- 新增 SSE 推送通道，周期性向已认证管理员推送实时脉搏快照（滚动窗口的 req/min、错误率、平均延迟、TPM），并附带网关健康信号「健康上游数 / 上游总数」与「熔断打开数」。
- 新增前端实时脉搏客户端与状态条组件，复用现有 `connecting / live / fallback` 三态语义：SSE 不可用时自动降级为定时拉取，连接状态以指示灯形式呈现。
- 扩展 `Topbar` 组件，使其右侧可承载状态条；所有管理页因复用 `Topbar` 自动获得该状态条。
- 新增中英文文案（`messages/en.json`、`messages/zh.json`）。

无破坏性变更：不改动既有 `/api/admin/logs/live` 的事件契约，不改动既有统计接口的返回结构。

## Capabilities

### New Capabilities

- `live-pulse-bar`: 实时脉搏状态条能力。覆盖滚动窗口运行指标的服务端聚合与取样、实时快照的 SSE 推送与降级拉取、网关健康信号（上游健康度与熔断状态）的纳入，以及跨管理页常驻的状态条展示与连接状态指示。

### Modified Capabilities

无。本变更复用既有进程内实时发布订阅机制属于实现层面的复用，不改变 `request-log-live-status` 已定义的需求与场景，因此不产生 spec 层面的契约变更。

## Impact

- 服务层：新增滚动窗口聚合服务（取样源为 `src/lib/services/request-logger.ts` 的请求收口路径）；读取 `circuit-breaker.ts` 与 `health-checker.ts` 的上游健康与熔断状态用于快照拼装。
- API 层：新增管理端 SSE 端点用于推送实时脉搏快照（鉴权方式与现有 `/api/admin/logs/live` 一致，使用 `ADMIN_TOKEN` Bearer）。
- 前端：新增实时脉搏 hook 与状态条组件；扩展 `src/components/admin/topbar.tsx` 承载状态条；移动端 `Topbar` 隐藏时提供紧凑展示路径。
- 文案：新增 `messages/{en,zh}.json` 中实时脉搏相关键。
- 测试：新增滚动窗口聚合器单元测试与快照拼装单元测试。
- 部署假设：滚动窗口为进程内内存状态，与既有进程内 SSE 推送机制一致，按单实例部署（docker-compose 单容器）语义工作；多实例下各实例反映自身流量，此约束沿用既有实时链路的现状。

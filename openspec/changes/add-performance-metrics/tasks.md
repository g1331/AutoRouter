## 1. 数据库 Schema 扩展

- [x] 1.1 在 `src/lib/db/schema-pg.ts` 的 `request_logs` 表新增 `ttft_ms` (integer, nullable) 和 `is_stream` (boolean, default false) 字段
- [x] 1.2 在 `src/lib/db/schema-sqlite.ts` 的 `request_logs` 表新增 `ttft_ms` (integer, nullable) 和 `is_stream` (integer mode boolean, default false) 字段
- [x] 1.3 生成并应用数据库迁移（`pnpm db:generate && pnpm db:migrate`）

## 2. 代理层 TTFT 采集

- [x] 2.1 重构 `createSSETransformer` 签名为 options 对象形式，新增 `onFirstChunk` 回调，在第一个有效非空 `data:` 事件处理时触发
- [x] 2.2 在 `forwardRequest` 中记录 `upstreamSendTime`，通过 `onFirstChunk` 回调计算 TTFT，将 `ttftMs` 和 `isStream` 加入 `ProxyResult`
- [x] 2.3 为 `createSSETransformer` 的 `onFirstChunk` 行为编写单元测试（首 chunk 触发、多 chunk 只触发一次、空 data 不触发）
- [x] 2.4 为 `forwardRequest` 的 TTFT 计算编写单元测试（流式返回 ttftMs、非流式返回 undefined）

## 3. 日志记录层扩展

- [x] 3.1 在 `request-logger.ts` 的 `LogRequestInput`、`StartRequestLogInput`、`UpdateRequestLogInput`、`RequestLogResponse` 接口中新增 `ttftMs` 和 `isStream` 字段
- [x] 3.2 更新 `logRequest`、`logRequestStart`、`updateRequestLog`、`formatLogResponse` 函数以处理新字段
- [x] 3.3 在 `api-transformers.ts` 中更新日志转换逻辑，将 `ttftMs` 转为 `ttft_ms`，`isStream` 转为 `is_stream`
- [x] 3.4 在 `types/api.ts` 的 `RequestLogResponse` 接口中新增 `ttft_ms` 和 `is_stream` 字段

## 4. 代理路由层集成

- [x] 4.1 在 `src/app/api/proxy/v1/[...path]/route.ts` 中，将 `proxyResult.ttftMs` 和 `proxyResult.isStream` 传递到 `logRequest` 和 `updateRequestLog` 调用中
- [x] 4.2 验证流式和非流式请求路径都正确传递了新字段

## 5. 后端统计服务扩展

- [x] 5.1 在 `stats-service.ts` 的 `StatsOverview` 接口新增 `avgTtftMs` 和 `cacheHitRate` 字段，更新 `getOverviewStats` 查询逻辑
- [x] 5.2 在 `stats-service.ts` 中为 `getTimeseriesStats` 新增 `metric` 参数支持（`requests` | `ttft` | `tps`），实现对应的聚合查询
- [x] 5.3 在 `stats-service.ts` 的 `LeaderboardUpstreamItem` 接口新增 `avgTtftMs` 和 `avgTps` 字段，更新 `getLeaderboardStats` 上游查询
- [x] 5.4 为新增的聚合查询逻辑编写单元测试（overview 新字段、timeseries metric 参数、leaderboard 上游新指标）

## 6. Stats API 端点更新

- [x] 6.1 更新 `api-transformers.ts` 中的 `StatsOverviewApiResponse` 和 `transformStatsOverviewToApi`，新增 `avg_ttft_ms` 和 `cache_hit_rate`
- [x] 6.2 更新 timeseries API 端点，支持 `metric` query 参数并传递到 service 层
- [x] 6.3 更新 `api-transformers.ts` 中的 leaderboard 上游响应类型和转换逻辑，新增 `avg_ttft_ms` 和 `avg_tps`
- [x] 6.4 更新 `types/api.ts` 中的 `StatsOverviewResponse`、`TimeseriesDataPoint`、`LeaderboardUpstreamItem` 类型

## 7. 国际化

- [x] 7.1 修复 `src/messages/zh-CN.json` 中 dashboard 部分的未汉化文本（pageTitle、controlPanel、stats 卡片标签、排行榜标题、时间范围选择器等约 22 个 key）
- [x] 7.2 在 `src/messages/en.json` 和 `src/messages/zh-CN.json` 中新增 Dashboard 新指标卡片（Avg TTFT、Cache Hit Rate）、图表 Tab（请求量/TTFT/TPS）、日志表格（TTFT 列、TPS 标签）相关的翻译 key

## 8. Dashboard 前端 - 概览卡片

- [x] 8.1 更新 `StatsCards` 组件的 props 和布局，从 3 列扩展为 5 列（`sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5`），新增 Avg TTFT 和 Cache Hit Rate 卡片
- [x] 8.2 更新 `useStatsOverview` hook 的响应类型以匹配新的 API 字段
- [x] 8.3 更新 Dashboard 页面组件将新字段传入 `StatsCards`

## 9. Dashboard 前端 - 时序图表 Tab 切换

- [x] 9.1 创建图表 Tab 容器组件，支持在请求量、Avg TTFT、Avg TPS 三个维度间切换
- [x] 9.2 更新 `useStatsTimeseries` hook，支持传递 `metric` 参数
- [x] 9.3 更新 `UsageChart` 组件以接收 metric 类型并调整 Y 轴标签和 tooltip 格式

## 10. Dashboard 前端 - 排行榜扩展

- [x] 10.1 更新 `LeaderboardSection` 组件的上游排行表，新增 Avg TTFT 和 Avg TPS 列
- [x] 10.2 更新 `LeaderboardTable` 组件以支持可选的额外指标列

## 11. 日志页面前端

- [x] 11.1 在 `LogsTable` 组件中新增 TTFT 列（`hidden md:table-cell`），在耗时列下方内嵌 TPS 显示（仅流式请求，`text-xs text-muted-foreground`）
- [x] 11.2 在展开行的 Token 详情中追加缓存命中百分比显示（如 "Cached: 800 (80%)"）
- [x] 11.3 更新 `useRequestLogs` hook 的响应类型以包含 `ttft_ms` 和 `is_stream` 字段

## Why

AutoRouter 作为 AI API 网关，当前仅记录请求总耗时（durationMs）和 token 总量等基础指标。用户无法了解"等多久才开始出字"（TTFT）、"模型生成有多快"（TPS）、以及"prompt cache 策略是否有效"（缓存命中率）。这些是评估 AI 服务质量和优化上游选择的核心指标，缺失会导致用户在上游性能对比、成本优化和体验调优方面缺乏数据支撑。

## What Changes

- 新增 **TTFT（Time To First Token）** 指标：在代理层采集上游从接收请求到返回第一个有效 SSE chunk 的耗时，持久化到 request_logs 表
- 新增 **is_stream** 标记：记录请求是否为流式响应，用于区分 TPS 计算的适用场景
- 新增 **TPS（Tokens Per Second）** 指标：基于 completionTokens / (durationMs - routingDurationMs - ttftMs) 实时计算，不存储派生值
- 新增 **Cache 命中率** 指标：基于已有的 cacheReadTokens / promptTokens 进行聚合计算，不需要新增存储字段
- Dashboard 概览卡片从 3 张扩展为 5 张，新增 Avg TTFT 和 Cache Hit Rate
- Dashboard 时序图表新增 Tab 切换，支持查看 TTFT 趋势和 TPS 趋势
- 上游排行榜新增 Avg TTFT 和 Avg TPS 列
- 日志表格新增 TTFT 列，耗时列下方内嵌 TPS 显示（仅流式请求）
- 日志展开行的 Token 详情追加缓存命中百分比
- 修复 zh-CN.json 中 Dashboard 部分约 22 个未汉化的翻译 key（pageTitle、stats 卡片标签、排行榜标题、时间范围等）

## Capabilities

### New Capabilities
- `performance-metrics-collection`: 覆盖 TTFT 采集、is_stream 标记、数据库 schema 扩展、代理层数据采集流程
- `performance-metrics-display`: 覆盖 Dashboard 卡片扩展、时序图表 Tab 切换、排行榜扩展、日志表格新增指标展示

### Modified Capabilities
- `data-display-and-interaction-v2`: 图表区域从单一视图扩展为 Tab 切换模式，指标卡从 3 列扩展为 5 列

## Impact

- **数据库**: request_logs 表新增 `ttft_ms` (INTEGER, nullable) 和 `is_stream` (BOOLEAN, default false) 两个字段，需要生成并应用迁移（pg + sqlite 双 schema）
- **后端服务**: proxy-client.ts（TTFT 采集）、request-logger.ts（接口扩展）、stats-service.ts（聚合逻辑）、api-transformers.ts（字段转换）
- **API 路由**: proxy route（传递新字段）、stats overview/timeseries/leaderboard 端点（返回新指标）
- **前端组件**: stats-cards、usage-chart、leaderboard、logs-table 组件更新
- **类型定义**: types/api.ts 新增字段
- **国际化**: en.json 新增翻译 key；zh-CN.json 新增翻译 key 并修复现有 Dashboard 部分的未汉化文本
- **测试**: proxy-client TTFT 采集、stats-service 聚合逻辑、TPS 计算边界条件

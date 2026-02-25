## ADDED Requirements

### Requirement: Dashboard 概览必须展示 5 张指标卡片
系统 MUST 在 Dashboard 概览区展示 5 张统计卡片：今日请求数、平均 TTFT、平均响应时间、Token 总量、缓存命中率。

#### Scenario: 5 张卡片正常展示
- **WHEN** 用户访问 Dashboard 页面
- **THEN** 概览区 SHALL 展示 5 张指标卡片，从左到右依次为：今日请求数、平均 TTFT、平均响应时间、Token 总量、缓存命中率

#### Scenario: 响应式布局
- **WHEN** 用户在不同屏幕尺寸下查看 Dashboard
- **THEN** 卡片 SHALL 按以下规则排列：小屏 2 列折行、中屏 3 列折行、大屏 5 列一行

#### Scenario: 缓存命中率为零时的展示
- **WHEN** 时间范围内没有任何请求命中缓存（所有请求的 cacheReadTokens 均为 0）
- **THEN** 缓存命中率卡片 SHALL 显示 "0%"

### Requirement: 时序图表必须支持 Tab 切换多种指标维度
系统 MUST 在 Dashboard 的时序图表区域提供 Tab 切换，支持查看请求量、平均 TTFT、平均 TPS 三种维度的趋势图。

#### Scenario: 默认展示请求量趋势
- **WHEN** 用户访问 Dashboard 页面
- **THEN** 时序图表 SHALL 默认展示请求量（request count）维度的趋势图

#### Scenario: 切换到 TTFT 趋势
- **WHEN** 用户点击 "Avg TTFT" Tab
- **THEN** 图表 SHALL 展示按上游分组的平均 TTFT 趋势，Y 轴单位为毫秒

#### Scenario: 切换到 TPS 趋势
- **WHEN** 用户点击 "Avg TPS" Tab
- **THEN** 图表 SHALL 展示按上游分组的平均 TPS 趋势，Y 轴单位为 tokens/s，且仅统计流式请求

#### Scenario: Tab 切换保留时间范围选择
- **WHEN** 用户在某个时间范围下切换 Tab
- **THEN** 新 Tab 的图表 SHALL 使用相同的时间范围

### Requirement: 上游排行榜必须展示 TTFT 和 TPS 指标
系统 MUST 在上游排行榜中新增平均 TTFT 和平均 TPS 列，帮助用户对比不同上游的性能表现。

#### Scenario: 上游排行展示新指标
- **WHEN** 用户查看上游排行榜
- **THEN** 每个上游条目 SHALL 展示请求数、Token 总量、平均 TTFT、平均 TPS 四个指标

#### Scenario: 上游排行的 TPS 仅统计流式请求
- **WHEN** 计算排行榜中某上游的平均 TPS
- **THEN** 系统 SHALL 仅统计该上游的流式请求（is_stream=true），非流式请求不参与 TPS 计算

### Requirement: 日志表格必须展示 TTFT 列和内嵌 TPS
系统 MUST 在请求日志表格中新增 TTFT 列，并在耗时列下方以次要样式内嵌展示 TPS。

#### Scenario: 流式请求展示完整指标
- **WHEN** 日志表格中的某条记录为流式请求且有有效的 TTFT 和 TPS 数据
- **THEN** TTFT 列 SHALL 展示毫秒/秒格式的首字耗时，耗时列下方 SHALL 以小字展示 TPS（如 "42.5 t/s"）

#### Scenario: 非流式请求不展示 TTFT 和 TPS
- **WHEN** 日志表格中的某条记录为非流式请求
- **THEN** TTFT 列 SHALL 展示 "-"，耗时列下方 SHALL 不展示 TPS

#### Scenario: TTFT 列在移动端隐藏
- **WHEN** 用户在移动端查看日志表格
- **THEN** TTFT 列 SHALL 隐藏，用户可通过展开行查看 TTFT 值

### Requirement: 日志展开行必须展示缓存命中百分比
系统 MUST 在日志表格的展开行 Token 详情中追加缓存命中百分比。

#### Scenario: 有缓存数据时展示命中百分比
- **WHEN** 用户展开某条日志记录且该请求的 promptTokens > 0
- **THEN** Token 详情 SHALL 展示缓存命中百分比，格式为 "Cached: 800 (80%)"

#### Scenario: 无缓存数据时不展示百分比
- **WHEN** 用户展开某条日志记录且该请求的 cacheReadTokens 为 0
- **THEN** Token 详情 SHALL 展示 "Cached: 0"，不附加百分比

### Requirement: 后端 Stats API 必须返回新增指标数据
系统 MUST 在 stats overview、timeseries、leaderboard API 响应中包含新增的指标数据。

#### Scenario: Overview API 返回 TTFT 和缓存命中率
- **WHEN** 前端请求 GET /api/admin/stats/overview
- **THEN** 响应 SHALL 包含 avg_ttft_ms（今日平均 TTFT）和 cache_hit_rate（今日缓存命中率百分比）

#### Scenario: Timeseries API 支持 metric 参数
- **WHEN** 前端请求 GET /api/admin/stats/timeseries?metric=ttft
- **THEN** 响应 SHALL 返回按上游分组的平均 TTFT 时序数据

#### Scenario: Leaderboard API 返回上游性能指标
- **WHEN** 前端请求 GET /api/admin/stats/leaderboard
- **THEN** 上游排行数据 SHALL 包含 avg_ttft_ms 和 avg_tps 字段

### Requirement: Dashboard 中文翻译必须完整汉化
系统 MUST 确保 zh-CN.json 中 Dashboard 相关的所有翻译 key 使用中文文本，不得保留英文原文作为中文翻译值。

#### Scenario: 中文环境下 Dashboard 所有标签显示中文
- **WHEN** 用户在中文 locale 下访问 Dashboard 页面
- **THEN** 页面标题、控制面板标题、统计卡片标签及副标题、使用统计标题、排行榜标题、时间范围选择器 SHALL 全部显示中文文本

#### Scenario: 英文环境不受影响
- **WHEN** 用户在英文 locale 下访问 Dashboard 页面
- **THEN** 所有翻译 key SHALL 保持原有英文文本不变

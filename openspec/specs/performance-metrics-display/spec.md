# performance-metrics-display Specification

## Purpose
TBD - created by archiving change add-performance-metrics. Update Purpose after archive.
## Requirements
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

### Requirement: 日志表格必须展示阶段轨道与关键性能指标
系统 MUST 在请求日志主列表提供单行阶段轨道展示，以同一行呈现生命周期阶段与关键性能指标，默认无需展开即可完成核心诊断。

#### Scenario: 默认展示单行阶段轨道
- **WHEN** 用户查看日志列表中的任意请求
- **THEN** 系统 SHALL 在一行内展示按顺序排列的主阶段轨道及对应状态
- **AND** 非流式请求默认展示“决策、请求、响应、完成”，流式请求允许采用“决策、请求、首个输出、生成、完成”的等价阶段切分

#### Scenario: 流式请求展示首个输出与生成耗时
- **WHEN** 日志记录为流式请求且具备 `ttft_ms` 与阶段耗时数据
- **THEN** 系统 SHALL 在主轨道中将输出过程拆分为“首个输出”和“生成”阶段，并分别展示首 token 耗时与生成耗时
- **AND** 如某阶段仅承担顺序语义锚点而无独立耗时，系统 MAY 以 `0ms` 形式保留该阶段

#### Scenario: 失败请求展示阶段内失败摘要
- **WHEN** 请求处于完成失败状态
- **THEN** 失败所属阶段 SHALL 同行展示错误码、错误类型和错误摘要

#### Scenario: 移动端保持单步可读
- **WHEN** 用户在移动端查看日志列表
- **THEN** 系统 SHALL 保留主阶段状态与关键耗时，并以紧凑布局保持单步可读

#### Scenario: 展开详情使用累计加增量时间表达
- **WHEN** 用户展开某条具备阶段耗时的日志记录
- **THEN** 系统 SHALL 以“累计耗时（+ 本阶段新增）”展示决策、执行、首个输出与完成输出等关键阶段时间

#### Scenario: 移动端摘要保持单行可读
- **WHEN** 用户在移动端查看展开详情顶部的生命周期摘要
- **THEN** 系统 SHALL 使用紧凑摘要形式保留顺序关系与关键结果
- **AND** 不得因摘要换行导致主流程顺序难以辨认

### Requirement: 日志展开行必须展示缓存命中百分比
系统 MUST 在日志表格的展开行 Token 详情中追加缓存命中百分比。

#### Scenario: 有缓存数据时展示命中百分比
- **WHEN** 用户展开某条日志记录且该请求的 `promptTokens + cacheReadTokens > 0`
- **THEN** Token 详情 SHALL 展示缓存命中百分比，格式为 "Cached: 800 (80%)"，且百分比 SHALL 不超过 100%

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


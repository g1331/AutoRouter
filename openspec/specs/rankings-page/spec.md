# rankings-page Specification

## Purpose
TBD - created by archiving change add-rankings-page. Update Purpose after archive.
## Requirements
### Requirement: 排行榜页面提供四个维度的完整榜单

系统 MUST 在管理端主导航提供独立的排行榜页面，支持上游、模型、API Key、用户四个维度的 tab 切换，每次仅查询并展示当前维度的榜单，榜单条数上限为 50。

#### Scenario: 维度切换

- **WHEN** 管理员在排行榜页切换到「模型」tab
- **THEN** 页面 SHALL 仅请求模型维度的榜单数据并渲染模型排行表格

#### Scenario: 空数据

- **WHEN** 所选时间范围内当前维度没有任何请求记录
- **THEN** 页面 SHALL 显示空状态提示而非空白表格

### Requirement: 榜单支持七项指标排序

排行榜表格 MUST 支持按请求数、tokens、费用、TTFT、TPS、缓存命中率、错误率排序，点击列头切换排序指标与方向，默认按请求数降序。排序 MUST 由后端在聚合查询中完成。

#### Scenario: 按费用排序

- **WHEN** 管理员点击「费用」列头
- **THEN** 后端 SHALL 返回按累计费用降序的榜单，且行序与费用值一致

#### Scenario: 各维度指标齐全

- **WHEN** 管理员查看任一维度的榜单
- **THEN** 每行 SHALL 展示全部七项指标（请求数、tokens、费用、TTFT、TPS、缓存命中率、错误率）

### Requirement: leaderboard API 支持单维度查询与排序参数

`GET /api/admin/stats/leaderboard` MUST 接受可选参数 `dimension`（upstreams/models/api_keys/users）、`sort_by`（requests/tokens/cost/ttft/tps/cache_hit/error_rate）、`compare`（boolean）。不传 `dimension` 时 MUST 保持既有行为（返回四维度、按请求数降序），保证 dashboard 调用方向后兼容。

#### Scenario: 单维度查询

- **WHEN** 请求携带 `dimension=upstreams&sort_by=cost`
- **THEN** 响应 SHALL 仅包含上游维度数据且按费用降序

#### Scenario: 向后兼容

- **WHEN** 请求不携带 `dimension` 参数
- **THEN** 响应结构与排序 SHALL 与本变更之前完全一致

#### Scenario: 非法参数

- **WHEN** 请求携带无法识别的 `dimension` 或 `sort_by` 值
- **THEN** 接口 SHALL 返回 400 错误

### Requirement: 错误率聚合

系统 MUST 为每个榜单对象聚合错误率：非 2xx 已完成请求数除以已完成请求数；`status_code` 为空的进行中请求 MUST 不计入分子与分母。

#### Scenario: 错误率计算

- **WHEN** 某上游在所选窗口内有 8 条 2xx、2 条 5xx、1 条进行中（status_code 为空）的请求
- **THEN** 该上游错误率 SHALL 为 20%

### Requirement: 环比对比

当请求携带 `compare=true` 时，系统 MUST 对上一个等长时间窗口执行同维度主聚合，为每个对象返回对比期排名与请求数；页面 MUST 据此展示排名升降与请求量变化百分比，对比期未上榜的对象标记为新上榜。

#### Scenario: 排名上升

- **WHEN** 某模型本期排名第 2、上期排名第 5
- **THEN** 该行 SHALL 显示排名上升 3 位及请求量变化百分比

#### Scenario: 新上榜

- **WHEN** 某对象在对比期窗口内无排名（未进入 top 50 或无请求）
- **THEN** 该行 SHALL 显示新上榜标识而非变化数值

### Requirement: 行内比例条

表格每行 MUST 按当前排序指标渲染相对榜首的水平比例条，帮助直观对比量级差距。

#### Scenario: 比例条渲染

- **WHEN** 按请求数排序且榜首请求数为 1000、某行请求数为 250
- **THEN** 该行比例条宽度 SHALL 为榜首的 25%

### Requirement: 行展开构成明细与日志跳转

点击榜单行 MUST 展开该对象的构成明细（上游、API Key、用户维度展示模型构成；模型维度展示上游构成），展开区 MUST 提供「查看日志」链接，跳转 logs 页并携带该对象过滤条件与当前时间窗。

#### Scenario: 展开构成

- **WHEN** 管理员点击某上游行
- **THEN** 行下方 SHALL 展开该上游的模型构成列表（名称、请求数、占比）

#### Scenario: 跳转日志

- **WHEN** 管理员点击展开区的「查看日志」
- **THEN** 浏览器 SHALL 导航到 logs 页，且日志列表已按该对象与当前时间窗过滤

### Requirement: 视图状态 URL 化与返回恢复

排行榜页的维度、时间范围、排序指标与方向 MUST 同步到 URL query 参数；从 logs 页返回或直接打开带参数的 URL 时，页面 MUST 恢复对应视图状态。

#### Scenario: 返回恢复

- **WHEN** 管理员在「模型 + 30 天 + 按 TTFT 排序」视图跳转 logs 后点击浏览器返回
- **THEN** 排行榜页 SHALL 恢复为模型维度、30 天范围、按 TTFT 排序

#### Scenario: 直接访问带参 URL

- **WHEN** 管理员打开 `/rankings?dim=models&range=30d&sort=ttft`
- **THEN** 页面初始状态 SHALL 为模型维度、30 天范围、按 TTFT 排序

### Requirement: dashboard 提供完整排行入口

dashboard 现有 Top 5 排行板块 MUST 保留，并提供指向排行榜页面的「查看完整排行」入口链接。

#### Scenario: 入口跳转

- **WHEN** 管理员点击 dashboard 排行板块的「查看完整排行」
- **THEN** 浏览器 SHALL 导航到排行榜页面

### Requirement: 界面文案双语

排行榜页面全部界面文案 MUST 在 `en` 与 `zh-CN` 两个 locale 下均有翻译。

#### Scenario: 中文界面

- **WHEN** 用户以 zh-CN locale 访问排行榜页
- **THEN** 页面标题、tab、列头、空状态与交互文案 SHALL 全部显示中文


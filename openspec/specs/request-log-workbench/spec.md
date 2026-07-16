# request-log-workbench Specification

## Purpose
定义请求日志工作台（admin logs 页与 portal requests 页共用）的服务端契约与前端行为：列表筛选与排序参数、窗口级统计端点、快捷性能筛选的守卫口径，以及行内视觉增强的展示规则。目标是让日志页的筛选、排序与统计在 PostgreSQL/SQLite 双方言下口径一致，且 admin 与 portal 两端共享同一套语义。
## Requirements
### Requirement: 日志列表 API 必须支持扩展筛选参数

`GET /api/admin/logs` 与 `GET /api/user/logs` MUST 支持性能阈值筛选参数 `ttft_min_ms`（整数，TTFT 下限）、`duration_min_ms`（整数，总耗时下限）、`tps_max`（数值，TPS 上限），与既有筛选参数 AND 组合；非法取值 MUST 返回 400。

#### Scenario: 高 TTFT 筛选

- **WHEN** 请求 `GET /api/admin/logs?ttft_min_ms=5000`
- **THEN** 返回结果 SHALL 仅包含 `ttft_ms > 5000` 的日志

#### Scenario: 低 TPS 筛选带守卫条件

- **WHEN** 请求 `GET /api/admin/logs?tps_max=30`
- **THEN** 返回结果 SHALL 仅包含满足 `is_stream = true` 且 `completion_tokens ≥ 10` 且 `duration_ms > 100` 且 `completion_tokens × 1000 < 30 × duration_ms` 的日志（与行级 TPS 显示规则、窗口统计口径一致）
- **AND** 该表达式在 PostgreSQL 与 SQLite 上 SHALL 产生一致结果

#### Scenario: 非法参数拒绝

- **WHEN** 请求 `GET /api/admin/logs?tps_max=abc` 或 `ttft_min_ms=-1`
- **THEN** 接口 SHALL 返回 400

### Requirement: 日志列表 API 必须支持排序参数

`GET /api/admin/logs` 与 `GET /api/user/logs` MUST 支持 `sort`（`created_at` | `duration_ms` | `total_tokens` | `ttft_ms` | `cost`）与 `order`（`asc` | `desc`）参数；缺省行为 MUST 保持 `created_at desc`；非法取值 MUST 返回 400。排序 MUST 附加稳定平局键（`created_at desc, id desc`），可空列排序在两种数据库方言下 MUST 一致（NULL 视为最小值）。

#### Scenario: 按耗时降序

- **WHEN** 请求 `GET /api/admin/logs?sort=duration_ms&order=desc`
- **THEN** 返回条目 SHALL 按 `duration_ms` 降序排列，NULL 值排在最后

#### Scenario: 按费用排序（关联计费快照）

- **WHEN** 请求 `GET /api/admin/logs?sort=cost&order=desc`
- **THEN** 返回条目 SHALL 按计费快照的 `final_cost` 降序排列
- **AND** 无计费快照的条目 SHALL 排在最后
- **AND** 分页翻页时同值条目 SHALL 不重复、不丢失（平局键稳定）

#### Scenario: 缺省排序不变

- **WHEN** 请求不带 `sort` 参数
- **THEN** 返回条目 SHALL 按 `created_at desc` 排列（与既有行为一致）

### Requirement: 系统必须提供筛选窗口统计端点

系统 MUST 提供 `GET /api/admin/logs/stats`（管理员）与 `GET /api/user/logs/stats`（会员，强制 owner 作用域），接受与对应日志列表端点完全相同的筛选参数，返回窗口级聚合：`total`、`stream_count`、`slow_count`、`p50_ttft_ms`、`p90_ttft_ms`、`p50_tps`。百分位计算 MUST 在 PostgreSQL 与 SQLite 上均可执行。

#### Scenario: 统计与列表同筛选语义

- **WHEN** 以相同筛选参数分别请求 `/api/admin/logs` 与 `/api/admin/logs/stats`
- **THEN** stats 返回的 `total` SHALL 等于列表返回的 `total`

#### Scenario: 空窗口

- **WHEN** 筛选窗口内没有任何日志
- **THEN** 端点 SHALL 返回 `total=0`，各百分位字段为 null

#### Scenario: 会员作用域隔离

- **WHEN** 会员 JWT 请求 `GET /api/user/logs/stats`
- **THEN** 聚合范围 SHALL 仅限该会员自己的日志；ADMIN_TOKEN 身份访问该端点 SHALL 返回 403

### Requirement: 日志筛选栏必须暴露扩展筛选控件

日志列表筛选栏 MUST 提供：精确状态码输入、自定义日期范围选择；管理端 MUST 额外提供上游选择器与 API 密钥选择器，会员端 MUST NOT 渲染上游/密钥选择器且 MUST NOT 发出任何 `/api/admin/*` 请求。任何筛选变更 MUST 重置到第 1 页。

#### Scenario: 管理端按上游筛选

- **WHEN** 管理员在筛选栏选择某个上游
- **THEN** 列表 SHALL 仅显示该上游的日志，且页码重置为 1

#### Scenario: 精确状态码优先

- **WHEN** 用户输入精确状态码 429
- **THEN** 列表 SHALL 仅显示 `status_code=429` 的日志

#### Scenario: 自定义日期范围

- **WHEN** 用户在时间范围选择器中选择自定义起止日期
- **THEN** 列表 SHALL 仅显示该区间内的日志

#### Scenario: 会员端降级

- **WHEN** 会员访问 portal 请求页
- **THEN** 筛选栏 SHALL 不包含上游与密钥选择器，其余筛选控件 SHALL 可用

### Requirement: 快捷性能筛选必须作用于整个筛选窗口

“高TTFT / 低TPS / 慢请求”快捷筛选 MUST 转换为服务端筛选参数（`ttft_min_ms=5000` / `tps_max=30` / `duration_min_ms=20000`）作用于整个筛选窗口，而非仅当前页；UI 提示 MUST 反映窗口级语义。

#### Scenario: 慢请求全局筛选

- **WHEN** 用户点击“慢请求”快捷筛选
- **THEN** 列表 SHALL 展示整个时间窗口内 `duration_ms > 20000` 的日志（含分页）

### Requirement: 日志列表必须支持列排序交互

桌面端日志表格的时间、耗时、费用、Tokens 列 MUST 提供排序切换（降序 → 升序 → 默认循环），并以 `aria-sort` 标注当前排序状态；排序变更 MUST 重置到第 1 页。

#### Scenario: 点击耗时表头排序

- **WHEN** 用户点击“耗时”表头
- **THEN** 列表 SHALL 按耗时降序重新加载，表头 SHALL 标注 `aria-sort="descending"`；再次点击切换为升序，第三次恢复默认时间排序

### Requirement: 统计瓦片必须反映筛选窗口

日志页统计瓦片（P50 TTFT、P90 TTFT、P50 TPS、慢请求占比、流式占比）MUST 基于窗口统计端点的数据展示，MUST 标注当前统计窗口（时间范围及是否有筛选生效），并 MUST NOT 随翻页变化。

#### Scenario: 瓦片不随翻页抖动

- **WHEN** 用户从第 1 页翻到第 2 页
- **THEN** 统计瓦片数值 SHALL 保持不变

#### Scenario: 瓦片跟随筛选

- **WHEN** 用户选择某个上游筛选
- **THEN** 统计瓦片 SHALL 更新为该上游窗口内的聚合值，并提示“已过滤”

### Requirement: 日志行必须提供行内诊断指示

日志行 MUST 在不展开详情的情况下展示：failover 徽标（当 `failover_attempts > 0` 时显示重试次数及悬浮说明）、耗时热度配色（超阈值以警示色呈现）、费用热度配色；模型列 MUST 在 lg 及以上断点可见。

#### Scenario: failover 行内可见

- **WHEN** 某条日志 `failover_attempts = 2`
- **THEN** 该行状态区域 SHALL 显示带“2”的重试徽标，悬浮显示说明；`failover_attempts = 0` 时 SHALL 不显示徽标

#### Scenario: 模型列 lg 可见

- **WHEN** 视口宽度处于 lg 断点(≥1024px)
- **THEN** 模型列 SHALL 可见且表格 SHALL 不出现横向滚动

### Requirement: 日志页支持从 URL query 初始化过滤器

logs 页 MUST 支持从 URL query 参数初始化过滤器：`upstream_id`、`api_key_id`、`model`、`start_time`、`end_time`（沿用既有 `user_id` 参数的处理模式）。携带 `start_time`/`end_time` 时时间范围 MUST 初始化为对应的自定义区间。URL 参数仅作用于初始值，用户后续在筛选栏的交互行为不变。

#### Scenario: 携带上游过滤进入

- **WHEN** 用户打开 `logs?upstream_id=<id>&start_time=<iso>&end_time=<iso>`
- **THEN** 日志列表 SHALL 初始即按该上游与该时间区间过滤，且筛选栏控件显示对应选中状态

#### Scenario: 初始化后可自由修改

- **WHEN** 用户从带参 URL 进入后在筛选栏更换上游或时间范围
- **THEN** 列表 SHALL 按新选择刷新，不被 URL 初始值锁定


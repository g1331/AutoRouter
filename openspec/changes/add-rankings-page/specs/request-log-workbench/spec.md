# request-log-workbench

## ADDED Requirements

### Requirement: 日志页支持从 URL query 初始化过滤器

logs 页 MUST 支持从 URL query 参数初始化过滤器：`upstream_id`、`api_key_id`、`model`、`start_time`、`end_time`（沿用既有 `user_id` 参数的处理模式）。携带 `start_time`/`end_time` 时时间范围 MUST 初始化为对应的自定义区间。URL 参数仅作用于初始值，用户后续在筛选栏的交互行为不变。

#### Scenario: 携带上游过滤进入

- **WHEN** 用户打开 `logs?upstream_id=<id>&start_time=<iso>&end_time=<iso>`
- **THEN** 日志列表 SHALL 初始即按该上游与该时间区间过滤，且筛选栏控件显示对应选中状态

#### Scenario: 初始化后可自由修改

- **WHEN** 用户从带参 URL 进入后在筛选栏更换上游或时间范围
- **THEN** 列表 SHALL 按新选择刷新，不被 URL 初始值锁定

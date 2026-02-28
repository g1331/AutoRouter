## ADDED Requirements

### Requirement: 上游消费限额配置

系统 SHALL 允许管理员为每个上游配置消费限额，包括限额金额（USD）和周期类型（每天、每月、滚动 N 小时）。未配置限额的上游不受任何消费约束。

#### Scenario: 创建上游时配置每日限额

- **WHEN** 管理员创建上游并设置 `spending_limit = 50`、`spending_period_type = "daily"`
- **THEN** 系统持久化限额配置，该上游每日消费到达 $50 后被路由排除

#### Scenario: 创建上游时配置每月限额

- **WHEN** 管理员创建上游并设置 `spending_limit = 500`、`spending_period_type = "monthly"`
- **THEN** 系统持久化限额配置，该上游每月消费到达 $500 后被路由排除

#### Scenario: 创建上游时配置滚动窗口限额

- **WHEN** 管理员创建上游并设置 `spending_limit = 100`、`spending_period_type = "rolling"`、`spending_period_hours = 24`
- **THEN** 系统持久化限额配置，该上游在任意连续 24 小时内消费到达 $100 后被路由排除

#### Scenario: 不配置限额的上游

- **WHEN** 管理员创建或编辑上游时不设置 `spending_limit`（留空或 null）
- **THEN** 该上游不受消费限额约束，行为与限额功能不存在时完全一致

#### Scenario: 编辑上游修改限额

- **WHEN** 管理员编辑已有上游并修改 `spending_limit` 或 `spending_period_type`
- **THEN** 系统更新限额配置并立即生效，内存中的 QuotaTracker 状态在下次校准时刷新

#### Scenario: 编辑上游移除限额

- **WHEN** 管理员编辑上游并将 `spending_limit` 设为 null
- **THEN** 该上游的消费限额约束被立即移除

#### Scenario: 限额配置输入校验

- **WHEN** 管理员提交 `spending_period_type = "rolling"` 但未提供 `spending_period_hours`
- **THEN** 系统返回参数校验错误

#### Scenario: 限额金额校验

- **WHEN** 管理员提交 `spending_limit` 为负数或零
- **THEN** 系统返回参数校验错误

### Requirement: 路由选择时限额过滤

系统 SHALL 在上游选择流程中检查每个候选上游的消费限额状态，将已超额的上游从候选集中排除，请求静默降级到下一可用上游。

#### Scenario: 超额上游被排除

- **WHEN** 某上游当前周期消费已达到或超过限额
- **THEN** 该上游在路由选择中被排除，请求路由到同一 priority tier 内的其他可用上游

#### Scenario: 同 tier 全部超额时降级到下一 tier

- **WHEN** 某 priority tier 中所有上游均已超额（或同时被 circuit breaker 排除）
- **THEN** 请求降级到下一 priority tier 的可用上游

#### Scenario: 所有上游超额

- **WHEN** 所有可用上游均已超额
- **THEN** 系统抛出 NoHealthyUpstreamsError，请求失败

#### Scenario: 未配置限额的上游不受影响

- **WHEN** 某上游未配置 `spending_limit`
- **THEN** 该上游在路由选择中的限额检查始终通过

### Requirement: 消费实时追踪

系统 SHALL 维护内存级的消费追踪器（QuotaTracker），通过增量累加和定期 DB 校准两条路径确保消费数据的准确性。

#### Scenario: 请求计费后即时累加

- **WHEN** 一次代理请求完成计费并生成 billing snapshot（`finalCost` 已确定）
- **THEN** QuotaTracker 立即将 `finalCost` 累加到对应上游的当前周期消费中

#### Scenario: 定期从 DB 校准消费

- **WHEN** QuotaTracker 校准定时器触发
- **THEN** 系统从 `request_billing_snapshots` 表聚合每个有限额配置的上游在当前周期内的总消费，覆盖内存缓存值

#### Scenario: 进程启动时全量校准

- **WHEN** QuotaTracker 首次初始化（进程启动）
- **THEN** 系统从 DB 全量加载所有有限额配置的上游的当前周期消费

#### Scenario: 智能校准频率

- **WHEN** 某上游当前消费占限额的 80% 以上，或已处于超额状态
- **THEN** 该上游的校准间隔从 5 分钟缩短为 1 分钟

#### Scenario: unbilled 请求不计入限额

- **WHEN** 某次请求因模型价格缺失等原因被标记为 unbilled
- **THEN** 该请求不计入上游消费限额

### Requirement: 固定窗口周期重置

系统 SHALL 在固定窗口周期（daily/monthly）结束时自动重置上游的累计消费。

#### Scenario: 每日限额在 UTC 0 点重置

- **WHEN** UTC 时间跨过午夜（00:00）
- **THEN** 所有 daily 类型限额的上游累计消费在下次校准时重置为当日实际消费

#### Scenario: 每月限额在月初重置

- **WHEN** UTC 时间进入新月份的第 1 天
- **THEN** 所有 monthly 类型限额的上游累计消费在下次校准时重置为当月实际消费

### Requirement: 滚动窗口花费滑出

系统 SHALL 对滚动窗口类型的限额正确处理旧请求花费的「滑出」，使消费额随时间自然降低。

#### Scenario: 旧请求滑出窗口

- **WHEN** 一笔请求的 `billedAt` 时间超出滚动窗口范围（早于 `now - N hours`）
- **THEN** 该请求的花费不再计入当前周期的累计消费（通过 DB 校准实现）

#### Scenario: 超额上游在消费滑出后恢复

- **WHEN** 某上游因超额被排除，且随着时间推移旧消费滑出窗口导致累计消费降回限额以下
- **THEN** 该上游在下次 DB 校准后恢复为可路由状态

### Requirement: 限额状态查询 API

系统 SHALL 提供 Admin API 端点，返回所有配置了限额的上游的当前消费状况。

#### Scenario: 查询所有上游的限额状态

- **WHEN** 管理员调用 `GET /api/admin/upstreams/quota-status`
- **THEN** 系统返回每个有限额配置的上游的 `currentSpending`、`spendingLimit`、`percentUsed`、`isExceeded`、`resetsAt` 等信息

#### Scenario: 固定窗口返回重置时间

- **WHEN** 某上游配置为 daily 或 monthly 限额
- **THEN** 响应中的 `resetsAt` 字段为下一个周期起始时间（如明天 00:00 UTC 或下月 1 号 00:00 UTC）

#### Scenario: 滚动窗口返回预计恢复时间

- **WHEN** 某上游配置为 rolling 限额且当前已超额
- **THEN** 响应中的 `estimatedRecoveryAt` 字段为预计消费降回限额以下的时间点

### Requirement: Dashboard 限额展示

系统 SHALL 在上游管理界面展示每个上游的消费限额进度、超额状态和重置倒计时信息。

#### Scenario: 上游列表展示限额进度

- **WHEN** 管理员打开上游管理页面
- **THEN** 每个配置了限额的上游行内显示消费进度条（百分比）、已消费金额/限额金额、周期类型标识

#### Scenario: 超额上游高亮标识

- **WHEN** 某上游当前消费已达到或超过限额
- **THEN** 该上游行内显示明确的超额警告标识

#### Scenario: 显示重置/恢复倒计时

- **WHEN** 管理员查看上游列表中配置了限额的上游
- **THEN** 列表展示距下次重置（fixed）或预计恢复（rolling）的剩余时间

#### Scenario: 未配置限额的上游不显示限额信息

- **WHEN** 某上游未配置 `spending_limit`
- **THEN** 该上游行内不显示任何限额相关的 UI 元素

### Requirement: 上游表单限额配置区域

系统 SHALL 在上游创建/编辑表单中提供限额配置输入区域。

#### Scenario: 表单展示限额配置项

- **WHEN** 管理员打开上游创建或编辑对话框
- **THEN** 表单包含限额金额输入框、周期类型选择器、滚动窗口小时数输入框

#### Scenario: 周期类型联动

- **WHEN** 管理员选择 `spending_period_type` 为 `rolling`
- **THEN** 表单显示 `spending_period_hours` 输入框；选择其他类型时该输入框隐藏

#### Scenario: 编辑回显已有限额配置

- **WHEN** 管理员编辑已配置限额的上游
- **THEN** 表单正确回显 `spending_limit`、`spending_period_type`、`spending_period_hours` 的当前值

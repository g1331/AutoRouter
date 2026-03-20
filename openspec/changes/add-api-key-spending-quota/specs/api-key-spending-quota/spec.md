## ADDED Requirements

### Requirement: API Key 消费限额配置
系统 SHALL 允许管理员为每个 API Key 配置零条或多条消费限额规则，并将规则持久化到 `api_keys.spending_rules`。每条规则包含限额金额（USD）和周期类型（每天、每月、滚动 N 小时）。多条规则之间为 AND 语义：任一规则超额即视为该 API Key 超额。未配置任何规则的 API Key 不受消费限额约束。

#### Scenario: 创建密钥时配置单条每日限额规则
- **WHEN** 管理员创建 API Key 并设置 `spending_rules = [{ period_type: "daily", limit: 50 }]`
- **THEN** 系统持久化该规则
- **AND** 该密钥在当日已计费金额达到 $50 后进入临时超额状态

#### Scenario: 创建密钥时配置多条叠加规则
- **WHEN** 管理员创建 API Key 并设置 `spending_rules = [{ period_type: "daily", limit: 100 }, { period_type: "rolling", limit: 30, period_hours: 6 }]`
- **THEN** 系统持久化全部规则
- **AND** 该密钥在任一规则达到上限后进入临时超额状态

#### Scenario: 不配置限额规则
- **WHEN** 管理员创建或编辑 API Key 时不设置任何 `spending_rules`（空数组或 null）
- **THEN** 该 API Key 不受消费限额约束
- **AND** 行为与限额功能不存在时保持一致

#### Scenario: 编辑时调低限额立即生效
- **WHEN** 管理员将某个 API Key 的限额调整为低于当前已计费金额
- **THEN** 新规则在保存后立即生效
- **AND** 该 API Key 在后续请求中立即按超额状态处理

#### Scenario: 移除全部规则后恢复额度约束豁免
- **WHEN** 管理员编辑 API Key 并移除全部 `spending_rules`
- **THEN** 该 API Key 的消费限额约束立即解除
- **AND** 不需要管理员额外执行手动重置

#### Scenario: rolling 规则缺少 period_hours
- **WHEN** 管理员提交 `period_type = "rolling"` 且未提供 `period_hours`
- **THEN** 系统 MUST 返回参数校验错误

#### Scenario: 规则限额金额非法
- **WHEN** 管理员提交的某条规则 `limit` 小于或等于 0
- **THEN** 系统 MUST 返回参数校验错误

### Requirement: 代理入口消费限额硬拒绝
系统 SHALL 在 API Key 鉴权通过后、选择上游之前检查该密钥的消费限额状态。当任一规则在当前周期内的已计费金额达到或超过上限时，系统 MUST 立即拒绝后续请求，而不是继续进入上游路由或转发流程。

#### Scenario: 未超额的密钥允许继续请求
- **WHEN** API Key 已配置限额规则且所有规则当前已计费金额均低于上限
- **THEN** 系统允许请求继续进入后续路由与转发流程

#### Scenario: 任一规则超额时拒绝请求
- **WHEN** API Key 的任一消费限额规则已达到或超过当前周期上限
- **THEN** 系统 MUST 以拒绝响应终止请求
- **AND** 系统 MUST 不再为该请求选择或调用任何上游

#### Scenario: 超额状态是临时的
- **WHEN** API Key 因固定窗口或滚动窗口限额而超额
- **THEN** 该 API Key 仍保持 `is_active = true`
- **AND** 仅在额度恢复到限制以下后自动恢复可用

#### Scenario: 固定窗口恢复后重新可用
- **WHEN** daily 或 monthly 规则进入新的周期且当前周期实际已计费金额低于上限
- **THEN** 该 API Key 在下一次额度状态计算后恢复为可用

#### Scenario: 滚动窗口恢复后重新可用
- **WHEN** rolling 规则窗口外的旧消费滑出后，当前窗口内已计费金额重新低于上限
- **THEN** 该 API Key 在下一次额度状态计算后恢复为可用

### Requirement: 已计费金额追踪与校准
系统 SHALL 仅基于 `request_billing_snapshots` 中 `billingStatus = "billed"` 的记录追踪 API Key 的消费限额状态，并通过内存累加与数据库校准保证额度状态与已计费金额保持一致。

#### Scenario: billed 请求计入额度
- **WHEN** 某次代理请求完成计费并生成 `billingStatus = "billed"` 的快照
- **THEN** 系统 MUST 将该请求的 `finalCost` 累加到对应 API Key 的所有适用规则中

#### Scenario: unbilled 请求不计入额度
- **WHEN** 某次代理请求因价格缺失或其他原因生成 `billingStatus = "unbilled"` 的快照
- **THEN** 系统 MUST 不将该请求计入 API Key 消费限额
- **AND** 该请求本身仍允许执行

#### Scenario: 启动后全量校准额度
- **WHEN** API Key 额度追踪器首次初始化
- **THEN** 系统 MUST 从 `request_billing_snapshots` 聚合所有配置了限额规则的 API Key 当前周期已计费金额

#### Scenario: 定期数据库校准
- **WHEN** 额度追踪器的校准周期触发
- **THEN** 系统 MUST 用数据库聚合结果覆盖内存中的当前消费值
- **AND** rolling 窗口需要通过校准移除已滑出窗口的旧消费

#### Scenario: fixed window 使用 UTC 周期边界
- **WHEN** 系统计算 daily 或 monthly 规则的当前周期
- **THEN** 系统 MUST 使用 UTC 日期和 UTC 月初作为周期边界

### Requirement: 限额拒绝请求日志与统计口径
系统 SHALL 为因 API Key 消费限额被拒绝的请求保留请求日志，并将其计入密钥请求次数；但这类请求 MUST 不计入上游请求次数。

#### Scenario: 额度拒绝请求写入日志
- **WHEN** 某次请求因 API Key 消费限额超额而被拒绝
- **THEN** 系统 MUST 写入一条请求日志
- **AND** 该日志 MUST 关联对应 `api_key_id`
- **AND** 该日志 MUST 不关联任何 `upstream_id`
- **AND** 该日志 MUST 标识为额度拒绝错误

#### Scenario: 密钥请求统计包含额度拒绝
- **WHEN** 系统按 API Key 聚合请求次数
- **THEN** 因消费限额被拒绝的请求 MUST 计入对应密钥的请求次数

#### Scenario: 上游请求统计不包含额度拒绝
- **WHEN** 系统按上游聚合请求次数
- **THEN** 因消费限额被拒绝的请求 MUST 不计入任何上游的请求次数

### Requirement: 密钥管理页规则级额度状态展示
系统 SHALL 在密钥管理页展示每个 API Key 的每条消费限额规则状态，包括当前已用金额、限额金额、占比、是否超额，以及 fixed window 的重置时间或 rolling window 的预计恢复时间。

#### Scenario: 列表展示多条规则状态
- **WHEN** 某个 API Key 配置了多条 `spending_rules`
- **THEN** 密钥管理页 MUST 为每条规则分别展示一条状态信息
- **AND** 每条状态信息 MUST 包含周期类型、已用金额、限额金额和占比

#### Scenario: 固定窗口展示重置时间
- **WHEN** 某条规则的 `period_type` 为 `daily` 或 `monthly`
- **THEN** 密钥管理页 MUST 展示该规则的下一个周期重置时间

#### Scenario: rolling 规则展示预计恢复时间
- **WHEN** 某条规则的 `period_type` 为 `rolling`
- **THEN** 密钥管理页 MUST 展示该规则的预计恢复时间

#### Scenario: 超额规则高亮显示
- **WHEN** 某条规则当前已达到或超过限额
- **THEN** 密钥管理页 MUST 对该规则显示明确的超额状态提示

#### Scenario: 无规则密钥不展示额度状态块
- **WHEN** 某个 API Key 未配置 `spending_rules`
- **THEN** 密钥管理页 MUST 不渲染规则级额度状态信息

### Requirement: API Key 管理接口返回规则与状态
系统 SHALL 通过现有 API Key Admin API 返回限额规则配置与规则级额度状态，以支撑创建、编辑和密钥管理页展示。

#### Scenario: 创建接口接收 spending_rules
- **WHEN** 管理员调用创建 API Key 接口并提交 `spending_rules`
- **THEN** 系统 MUST 校验并持久化规则配置
- **AND** 创建响应 MUST 返回该密钥的规则配置

#### Scenario: 更新接口接收 spending_rules
- **WHEN** 管理员调用更新 API Key 接口并提交新的 `spending_rules`
- **THEN** 系统 MUST 校验并更新规则配置
- **AND** 更新响应 MUST 返回更新后的规则配置

#### Scenario: 列表接口返回规则级额度状态
- **WHEN** 管理员调用 API Key 列表接口
- **THEN** 系统 MUST 为每个密钥返回其 `spending_rules`
- **AND** 对于已配置规则的密钥，系统 MUST 返回每条规则的额度状态、超额标识和对应时间信息

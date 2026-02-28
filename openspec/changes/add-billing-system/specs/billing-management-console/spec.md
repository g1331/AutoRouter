## ADDED Requirements

### Requirement: Billing Overview Dashboard

系统 MUST 在 Billing 页面提供可快速理解的费用总览信息。

#### Scenario: Show key overview cards

- **WHEN** 管理员进入 `/system/billing`
- **THEN** 页面 SHALL 展示至少以下指标：今日费用、本月费用、未定价模型数量、最近同步状态

#### Scenario: Display empty state for no billing data

- **WHEN** 系统尚无可计费请求
- **THEN** 页面 SHALL 展示可理解的空状态说明
- **AND** 不显示误导性的零值趋势图

### Requirement: Upstream Multiplier Management UI

系统 MUST 提供 upstream 级倍率查看与编辑能力，且该能力 SHOULD 位于 `/upstreams` 上游管理页面，避免在 Billing 页面引入与“渠道启停”相关的语义干扰。

#### Scenario: Edit multiplier inline

- **WHEN** 管理员在 `/upstreams` 的上游编辑界面中修改某 upstream 的输入或输出倍率并保存
- **THEN** 系统 SHALL 持久化该倍率
- **AND** 页面 SHALL 反馈保存成功状态

#### Scenario: Validate multiplier input

- **WHEN** 管理员输入无效倍率（非数字、负数或超出允许范围）
- **THEN** 系统 SHALL 阻止保存并显示明确错误提示

### Requirement: Unresolved Model Repair Workflow

系统 MUST 提供“缺失价格修复”工作流，减少未计费请求积压。

#### Scenario: Resolve unresolved model in UI

- **WHEN** 管理员在未定价模型列表中为某模型提交手动价格
- **THEN** 系统 SHALL 保存覆盖价格
- **AND** 该模型 SHALL 从未定价列表移除或标记为已解决

#### Scenario: Trigger manual price sync

- **WHEN** 管理员点击“立即同步价格”
- **THEN** 系统 SHALL 触发一次价格同步任务
- **AND** 在页面展示同步结果摘要

### Requirement: Avoid Duplicate Recent Table

系统 SHOULD 避免在 Billing 页面重复展示“近期请求明细表”，以免与请求日志页面产生重复心智负担。

#### Scenario: Guide users to request logs

- **WHEN** 管理员在 Billing 页面希望查看最近请求的费用明细
- **THEN** 页面 SHALL 提供明确的入口引导用户前往 `/logs`

### Requirement: Request Logs Billing Visibility

系统 MUST 在请求日志页面直接展示计费状态与成本，避免用户在日志排查时跨页查询。

#### Scenario: Show billing summary in request logs table

- **WHEN** 管理员查看 `/logs` 请求日志表格
- **THEN** 表格 SHALL 展示每条请求的计费状态与最终成本
- **AND** 未计费请求 SHALL 同时展示未计费原因

#### Scenario: Show billing formula in expanded log details

- **WHEN** 管理员在 `/logs` 展开某条请求日志的详情
- **THEN** 展开详情 SHALL 在 token 明细下方展示计费明细
- **AND** 计费明细 SHALL 展示总费用
- **AND** 计费明细 SHALL 以可读的算术公式展示输入、输出与缓存读写的计费构成（包含单价与倍率）

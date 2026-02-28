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

系统 MUST 提供 upstream 级倍率查看与编辑能力。

#### Scenario: Edit multiplier inline

- **WHEN** 管理员在倍率表中修改某 upstream 的输入或输出倍率并保存
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

### Requirement: Recent Billing Details Table

系统 MUST 提供请求级费用明细表用于追溯计费来源。

#### Scenario: Show request billing breakdown

- **WHEN** 管理员查看近期明细
- **THEN** 表格 SHALL 展示时间、模型、上游、token 用量、基础单价、倍率、最终费用、价格来源、计费状态

#### Scenario: Highlight unbillable requests

- **WHEN** 某请求为未计费状态
- **THEN** 表格 SHALL 以明显状态标识该请求
- **AND** 提供未计费原因字段

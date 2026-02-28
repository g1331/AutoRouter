## ADDED Requirements

### Requirement: Request-Level Cost Calculation

系统 MUST 在请求完成时基于 token 使用量、模型单价与上游倍率计算最终费用。

#### Scenario: Calculate non-stream request cost

- **WHEN** 非流式请求完成并包含 prompt/completion token
- **THEN** 系统 SHALL 读取模型输入/输出单价
- **AND** 应用当前上游输入/输出倍率
- **AND** 计算并生成本次请求总费用

#### Scenario: Calculate stream request cost

- **WHEN** 流式请求结束并返回最终 usage 统计
- **THEN** 系统 SHALL 使用最终 usage 进行一次完整计费计算
- **AND** 结果 SHALL 与日志中的 token 字段一致

#### Scenario: Mark request as unbillable

- **WHEN** 请求缺少必要计费数据（例如模型名或价格未解析）
- **THEN** 系统 SHALL 将该请求标记为“未计费”
- **AND** 保存未计费原因用于 UI 展示

### Requirement: Immutable Billing Snapshot

系统 MUST 将每次请求的计费细节持久化为不可回算漂移的快照。

#### Scenario: Persist billing snapshot on request completion

- **WHEN** 请求完成并计费成功
- **THEN** 系统 SHALL 持久化以下字段：基础单价、倍率、token 明细、最终费用、价格来源、计费时间

#### Scenario: Keep historical cost stable after repricing

- **WHEN** 管理员后续修改倍率或模型价格
- **THEN** 历史请求的费用快照 SHALL 保持不变
- **AND** 仅新请求使用新配置计费

### Requirement: Upstream Multiplier Application

系统 MUST 支持按 upstream 应用独立的输入/输出倍率。

#### Scenario: Use default multiplier when not configured

- **WHEN** upstream 未配置自定义倍率
- **THEN** 系统 SHALL 使用默认倍率 `1.0`

#### Scenario: Apply custom multiplier

- **WHEN** upstream 设置了输入/输出倍率
- **THEN** 系统 SHALL 在费用计算中分别应用对应倍率
- **AND** 在快照中记录生效倍率值

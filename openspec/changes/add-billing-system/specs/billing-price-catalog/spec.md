## ADDED Requirements

### Requirement: Multi-Source Model Price Catalog

系统 MUST 提供模型价格目录，并支持从主源与兜底源同步标准化价格数据。

#### Scenario: Sync from primary source successfully

- **WHEN** 管理员触发价格同步且主源可用
- **THEN** 系统 SHALL 拉取并解析模型单价数据
- **AND** 将价格来源标记为 `openrouter`
- **AND** 记录同步时间与模型有效状态

#### Scenario: Fallback to secondary source when primary fails

- **WHEN** 管理员触发价格同步且主源请求失败或解析失败
- **THEN** 系统 SHALL 自动尝试兜底源
- **AND** 将成功数据来源标记为 `litellm`
- **AND** 返回同步结果摘要（成功数量、失败数量、失败原因）

#### Scenario: Preserve last valid prices on full sync failure

- **WHEN** 主源与兜底源均不可用
- **THEN** 系统 SHALL 保留已有有效价格数据不覆盖为 null
- **AND** 将本次同步状态记录为失败供 UI 展示

### Requirement: Manual Price Override

系统 MUST 支持管理员为指定模型手动录入单价，并在计费时优先生效。

#### Scenario: Create manual override for unresolved model

- **WHEN** 某模型没有可用自动价格且管理员提交手动价格
- **THEN** 系统 SHALL 保存手动价格记录
- **AND** 标记该模型价格状态为“已手动覆盖”

#### Scenario: Update manual override

- **WHEN** 管理员修改已存在的手动价格
- **THEN** 系统 SHALL 更新该覆盖记录并保留更新时间
- **AND** 后续新请求 SHALL 使用更新后的手动价格

#### Scenario: Resolve price priority

- **WHEN** 模型同时存在手动覆盖与自动同步价格
- **THEN** 系统 SHALL 在计费时优先使用手动覆盖价格

### Requirement: Unresolved Model Discovery

系统 MUST 对无法定价的模型提供可操作的“缺失价格列表”。

#### Scenario: List unresolved models

- **WHEN** 管理员请求未定价模型列表
- **THEN** 系统 SHALL 返回模型名、最近出现时间、出现次数、最近上游
- **AND** 返回该模型是否已有手动覆盖记录

#### Scenario: Hide resolved model from unresolved list

- **WHEN** 未定价模型已补充手动价格或后续同步拿到有效价格
- **THEN** 该模型 SHALL 不再出现在未定价列表中

# billing-price-catalog Specification

## Purpose
TBD - created by archiving change add-billing-system. Update Purpose after archive.
## Requirements
### Requirement: LiteLLM Model Price Catalog

系统 MUST 提供模型价格目录，并支持从 LiteLLM 同步标准化价格数据。

#### Scenario: Sync from LiteLLM source successfully

- **WHEN** 管理员触发价格同步且 LiteLLM 可用
- **THEN** 系统 SHALL 拉取并解析模型单价数据
- **AND** 将价格来源标记为 `litellm`
- **AND** 记录同步时间与模型有效状态

#### Scenario: Preserve last valid prices on sync failure

- **WHEN** LiteLLM 价格源不可用或解析失败
- **THEN** 系统 SHALL 保留已有有效价格数据不覆盖为 null
- **AND** 将本次同步状态记录为失败供 UI 展示

#### Scenario: Persist cache price fields when source provides them

- **WHEN** 上游价格源返回缓存读取或缓存写入单价字段
- **THEN** 系统 SHALL 解析并保存缓存单价到价格目录
- **AND** 价格目录接口与页面 SHALL 可查询并展示缓存读写单价

#### Scenario: Browse price catalog with pagination

- **WHEN** 管理员在 Billing 页面查看模型价格目录
- **THEN** 页面 SHALL 提供分页浏览能力（上一页/下一页）
- **AND** 页面 SHALL 展示当前页码与总页数
- **AND** 页面 SHOULD 支持选择每页条数以提升翻页体验
- **AND** 页面 SHOULD 对搜索输入进行防抖，并在请求期间保持列表稳定，避免频繁刷新导致页面跳动
- **AND** 页面 SHOULD 明确展示“手动覆盖优先生效”的结果，包含实际计费来源与被覆盖的同步价格对比

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

#### Scenario: Create manual override without unresolved record

- **WHEN** 管理员在手动录入区域直接提交任意模型价格（该模型不在未定价列表）
- **THEN** 系统 SHALL 成功创建或更新该模型的手动覆盖记录
- **AND** 后续请求 SHALL 按该覆盖价格参与计费

### Requirement: Reset Manual Override To Official Price

系统 MUST 提供将手动覆盖“一键重置为官方价格”的能力，用于在 LiteLLM 价格表已补全或管理员希望回到标准口径时快速回滚。

#### Scenario: Reset single model override to official price

- **GIVEN** 某模型同时存在手动覆盖与自动同步价格
- **WHEN** 管理员在模型价格目录中对该模型执行“重置为官方价格”
- **THEN** 系统 SHALL 删除该模型的手动覆盖记录
- **AND** 后续请求 SHALL 回退为使用自动同步价格参与计费

#### Scenario: Bulk reset manual overrides

- **WHEN** 管理员在模型价格目录中筛选出被手动覆盖的模型并多选批量重置
- **THEN** 系统 SHALL 批量删除所选模型的手动覆盖记录
- **AND** 页面 SHALL 在操作后同步刷新目录展示与覆盖列表

#### Scenario: Warn when resetting models without official price

- **GIVEN** 某模型仅存在手动覆盖，自动同步价格目录中无该模型有效价格
- **WHEN** 管理员执行“重置为官方价格/删除手动定价”
- **THEN** 系统 SHALL 允许删除手动覆盖记录
- **AND** 页面 SHOULD 明确提示删除后该模型将变为“无价格不可计费”，直至同步价格补全或管理员重新手动录入

### Requirement: Unresolved Model Discovery

系统 MUST 对无法定价的模型提供可操作的“缺失价格列表”。

#### Scenario: List unresolved models

- **WHEN** 管理员请求未定价模型列表
- **THEN** 系统 SHALL 返回模型名、最近出现时间、出现次数、最近上游
- **AND** 返回该模型是否已有手动覆盖记录

#### Scenario: Hide resolved model from unresolved list

- **WHEN** 未定价模型已补充手动价格或后续同步拿到有效价格
- **THEN** 该模型 SHALL 不再出现在未定价列表中

### Requirement: 价格目录必须支持后台自动同步

系统 MUST 支持通过后台同步任务自动刷新 LiteLLM 模型价格目录，并同时同步标准模型价格与分层计费规则。

#### Scenario: 后台自动同步价格目录

- **WHEN** `billing_price_catalog_sync` 后台任务到达计划执行时间且任务处于启用状态
- **THEN** 系统 MUST 拉取并解析 LiteLLM 模型价格目录
- **AND** 系统 MUST 更新 `billing_model_prices`
- **AND** 系统 MUST 更新 `billing_tier_rules`
- **AND** 系统 MUST 记录价格同步历史和后台任务执行历史

#### Scenario: 启动后延迟首次同步

- **WHEN** 应用启动且价格目录后台同步处于启用状态
- **THEN** 系统 MUST 按配置的启动延迟安排首次价格目录同步

#### Scenario: 后台同步失败时保留有效价格

- **WHEN** `billing_price_catalog_sync` 执行失败
- **THEN** 系统 MUST 保留最近一次有效的价格目录和分层计费规则
- **AND** 系统 MUST 记录失败状态和失败原因

#### Scenario: 手动同步继续可用

- **WHEN** 管理员调用现有价格目录手动同步接口
- **THEN** 系统 MUST 执行价格目录同步
- **AND** 本次同步结果 MUST 更新价格同步状态和后台任务状态中可复用的展示数据

#### Scenario: Billing 页面展示价格同步摘要

- **WHEN** 管理员打开 Billing 页面
- **THEN** 页面 MUST 展示价格目录最近同步状态
- **AND** 最近同步状态 MUST 与后台任务记录的价格目录同步状态保持一致


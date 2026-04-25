## ADDED Requirements

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

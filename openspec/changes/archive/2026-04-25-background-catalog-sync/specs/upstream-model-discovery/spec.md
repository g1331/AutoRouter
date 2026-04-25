## ADDED Requirements

### Requirement: 上游模型发现配置必须支持后台自动刷新开关

系统 MUST 为每个上游的模型发现配置提供后台自动刷新开关，使管理员可以显式决定该上游是否参与后台模型目录刷新。

#### Scenario: 保存后台自动刷新开关

- **WHEN** 管理员在上游模型发现配置中开启或关闭后台自动刷新
- **THEN** 系统 MUST 持久化该开关
- **AND** 后续读取上游配置时 MUST 完整回显该开关

#### Scenario: 历史上游默认关闭后台自动刷新

- **WHEN** 旧上游记录没有后台自动刷新开关
- **THEN** 系统 MUST 将该上游视为未开启后台自动刷新

#### Scenario: 管理端展示后台自动刷新状态

- **WHEN** 管理员查看或编辑上游模型发现配置
- **THEN** 页面 MUST 展示后台自动刷新开关的当前状态

### Requirement: 模型目录必须支持显式开启后的后台自动刷新

系统 MUST 支持通过后台同步任务自动刷新上游模型目录，但只处理显式开启后台自动刷新的 active 上游。

#### Scenario: 自动刷新已开启的 active 上游

- **WHEN** `upstream_model_catalog_sync` 后台任务到达计划执行时间
- **THEN** 系统 MUST 查询 `is_active=true` 且模型发现配置中后台自动刷新为开启的上游
- **AND** 系统 MUST 对这些上游逐个执行模型目录刷新

#### Scenario: 不自动刷新未开启的上游

- **WHEN** 某个上游未显式开启后台自动刷新
- **THEN** `upstream_model_catalog_sync` MUST 不刷新该上游的模型目录

#### Scenario: 不自动刷新停用上游

- **WHEN** 某个上游处于停用状态
- **THEN** `upstream_model_catalog_sync` MUST 不刷新该上游的模型目录

#### Scenario: 手动刷新不受自动刷新开关限制

- **WHEN** 管理员手动触发某个上游的模型目录刷新
- **THEN** 系统 MUST 执行该上游的模型目录刷新
- **AND** 系统 MUST 不要求该上游开启后台自动刷新

#### Scenario: 后台刷新成功

- **WHEN** 后台任务成功刷新某个上游模型目录
- **THEN** 系统 MUST 更新该上游的 `model_catalog`、`model_catalog_updated_at` 和最近状态为成功

#### Scenario: 后台刷新失败

- **WHEN** 后台任务刷新某个上游模型目录失败
- **THEN** 系统 MUST 保留该上游已有模型目录缓存
- **AND** 系统 MUST 记录最近状态为失败、最近错误和最近失败时间

#### Scenario: 部分上游刷新失败

- **WHEN** `upstream_model_catalog_sync` 刷新多个上游且部分上游失败
- **THEN** 后台任务整体状态 MUST 记录为 `partial`
- **AND** 系统 MUST 记录成功数量、失败数量和失败摘要

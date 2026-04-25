## MODIFIED Requirements

### Requirement: 补偿规则持久化存储
系统 SHALL 将补偿规则持久化存储在 `compensation_rules` 数据库表中，并在服务运行时维护内存缓存，缓存 TTL 为 60 秒。

#### Scenario: 服务启动时加载规则
- **WHEN** 服务启动
- **THEN** 系统从数据库加载所有 `enabled=true` 的规则至内存缓存

#### Scenario: 缓存过期后自动刷新
- **WHEN** 距上次加载超过 60 秒后有请求到达
- **THEN** 系统重新从数据库加载规则，更新内存缓存

#### Scenario: 内置规则 seed
- **WHEN** 数据库中不存在 `name="Session ID Recovery"` 的内置规则
- **THEN** 系统在迁移时自动插入该内置规则，`is_builtin=true`，`enabled=true`，`target_header="session_id"`，`mode="missing_only"`
- **AND** `capabilities` 包含 `openai_responses` 与 `codex_cli_responses`
- **AND** `sources` 按优先级为 `["headers.session_id", "headers.session-id", "headers.x-session-id", "body.prompt_cache_key", "body.metadata.session_id", "body.previous_response_id"]`

#### Scenario: 历史 Responses 补偿规则迁移
- **WHEN** 迁移任务扫描到某条补偿规则的 `capabilities` 中包含旧值 `codex_responses`
- **THEN** 系统移除旧值 `codex_responses`
- **AND** 将该规则改写为同时包含 `openai_responses` 与 `codex_cli_responses`

#### Scenario: 内置规则运行时兜底
- **WHEN** 服务在加载补偿规则前发现缺失 `name="Session ID Recovery"` 的内置规则
- **THEN** 系统 SHALL 幂等插入该内置规则；若插入失败，系统记录错误日志但不抛出异常（补偿视为跳过）

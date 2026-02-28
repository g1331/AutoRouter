## ADDED Requirements

### Requirement: 补偿规则数据模型
系统 SHALL 支持以下补偿规则数据结构：
- `id`：唯一标识符（UUID）
- `name`：规则显示名称
- `isBuiltin`：是否为内置规则，内置规则只能禁用，不能删除
- `enabled`：是否启用
- `capabilities`：适用的 RouteCapability 列表
- `targetHeader`：目标注入头部名称（如 `session_id`）
- `sources`：来源路径有序列表，格式为 `headers.<name>` 或 `body.<path>`，按优先级排列
- `mode`：补偿模式，当前仅支持 `missing_only`（仅在出站请求中该头部缺失时注入）

#### Scenario: 规则结构完整性校验
- **WHEN** 系统加载一条补偿规则
- **THEN** 规则必须包含所有必填字段，`sources` 中每个路径必须以 `headers.` 或 `body.` 开头，否则该规则被跳过并记录警告日志

---

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
- **THEN** 系统在迁移时自动插入该内置规则，`is_builtin=true`，`enabled=true`，`target_header="session_id"`，`mode="missing_only"`，`capabilities` 包含 `codex_responses`，`sources` 按优先级为 `["headers.session_id", "headers.session-id", "headers.x-session-id", "body.prompt_cache_key", "body.metadata.session_id", "body.previous_response_id"]`

#### Scenario: 内置规则运行时兜底
- **WHEN** 服务在加载补偿规则前发现缺失 `name="Session ID Recovery"` 的内置规则
- **THEN** 系统 SHALL 幂等插入该内置规则；若插入失败，系统记录错误日志但不抛出异常（补偿视为跳过）

---

### Requirement: 来源路径解析
系统 SHALL 按 `sources` 列表的顺序依次尝试解析值，返回第一个非空值。

- `headers.<name>`：从入站请求头部中读取对应字段
- `body.<path>`：从请求体 JSON 中按点分路径读取对应字段（支持嵌套，如 `body.metadata.session_id`）

#### Scenario: 头部来源解析成功
- **WHEN** `sources` 中某个 `headers.<name>` 路径对应的入站头部存在且非空
- **THEN** 系统返回该头部值及来源标识 `"header"`

#### Scenario: 请求体来源解析成功
- **WHEN** 头部来源均为空，`sources` 中某个 `body.<path>` 路径对应的请求体字段存在且非空
- **THEN** 系统返回该字段值及来源标识 `"body"`

#### Scenario: 所有来源均为空
- **WHEN** `sources` 列表中所有路径均无法解析到非空值
- **THEN** 系统不执行补偿，跳过该规则

---

### Requirement: 出站头部注入
系统 SHALL 在 `missing_only` 模式下，仅当出站请求中目标头部缺失时，将解析到的值注入到发往上游的请求头中。

#### Scenario: 目标头部缺失时注入
- **WHEN** 出站请求中不包含 `targetHeader` 指定的头部，且来源解析成功
- **THEN** 系统将解析到的值以 `targetHeader` 为键注入到出站请求头中

#### Scenario: 目标头部已存在时跳过
- **WHEN** 出站请求中已包含 `targetHeader` 指定的头部（非空）
- **THEN** 系统不执行注入，保留原有头部值

#### Scenario: 规则未启用时跳过
- **WHEN** 匹配当前 capability 的规则 `enabled=false`
- **THEN** 系统跳过该规则，不执行任何注入

---

### Requirement: cf-ew-via 头部过滤
系统 SHALL 将 `cf-ew-via` 加入基础设施头部过滤集合，确保该头部不被转发至上游服务。

#### Scenario: cf-ew-via 被过滤
- **WHEN** 入站请求包含 `cf-ew-via` 头部
- **THEN** 该头部不出现在发往上游的出站请求中

---

### Requirement: 头部差异计算
系统 SHALL 在每次代理请求完成后计算并返回头部差异结构 `HeaderDiff`，包含以下字段：
- `inbound_count`：入站头部总数
- `outbound_count`：出站头部总数
- `dropped`：被过滤的头部列表，每项包含 `header`（头部名称）与 `value`（头部值；敏感值脱敏）
- `auth_replaced`：被替换的认证头部信息（如 `authorization` 或 `x-api-key`），包含 `header`、`inbound_value`、`outbound_value`（敏感值脱敏），无则为 `null`
- `compensated`：已注入的补偿头部列表，每项包含 `header`（头部名称）、`source`（来源路径）与 `value`（头部值；敏感值脱敏）
- `unchanged`：未变化的头部列表（出站值与入站值相同且未被补偿/替换），每项包含 `header` 与 `value`（敏感值脱敏）

#### Scenario: 正常请求的头部差异
- **WHEN** 一次代理请求完成，存在被过滤的基础设施头部和被替换的认证头部
- **THEN** `HeaderDiff.dropped` 包含所有被过滤的头部名称与值，`HeaderDiff.auth_replaced` 包含被替换认证头部的替换前后值（敏感值脱敏）

#### Scenario: 执行了补偿的请求
- **WHEN** 补偿引擎成功注入了一个或多个头部
- **THEN** `HeaderDiff.compensated` 包含所有已注入头部的名称、来源路径与值（敏感值脱敏）

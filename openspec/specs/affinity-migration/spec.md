# affinity-migration Specification

## Purpose
TBD - created by archiving change session-affinity. Update Purpose after archive.
## Requirements
### Requirement: 上游亲和性迁移配置
系统 SHALL 允许每个上游配置亲和性迁移选项（`affinityMigration`），声明该上游是否愿意接受从低优先级上游迁移过来的会话。

配置结构：
- `enabled`: 是否启用迁移接收
- `metric`: 评估对话大小的指标，支持 `"tokens"`（默认，基于累计 input tokens）和 `"length"`（基于 content-length 字节数）
- `threshold`: 对话大小阈值，默认 50000。低于此值的会话可以被迁移过来

未配置 `affinityMigration` 的上游不参与迁移接收。

#### Scenario: 配置基于 token 的迁移接收
- **WHEN** 管理员为某上游设置 `affinityMigration` 为 `{ enabled: true, metric: "tokens", threshold: 50000 }`
- **THEN** 该上游声明愿意接收累计 input tokens 低于 50K 的迁移会话

#### Scenario: 配置基于 length 的迁移接收
- **WHEN** 管理员为某上游设置 `affinityMigration` 为 `{ enabled: true, metric: "length", threshold: 51200 }`
- **THEN** 该上游声明愿意接收 content-length 低于 50KB 的迁移会话

#### Scenario: 未配置迁移
- **WHEN** 某上游的 `affinityMigration` 为 null 或 `enabled` 为 false
- **THEN** 该上游不参与迁移接收，不会从低优先级上游抢夺会话

#### Scenario: 通过 API 读写迁移配置
- **WHEN** 管理员通过上游 CRUD API 创建或更新上游
- **THEN** 系统 SHALL 支持 `affinityMigration` 字段的读取和写入

### Requirement: 迁移决策逻辑
系统 SHALL 在亲和性路由命中时，评估是否应将会话迁移到更高优先级的上游。

迁移触发条件（全部满足）：
1. 当前会话绑定在某上游
2. 存在优先级更高（priority 数值更小）的上游处于可用状态
3. 该高优先级上游配置了 `affinityMigration.enabled = true`
4. 当前会话的对话大小（按 metric 评估）低于该上游的 `threshold`
   - metric 为 `"tokens"` 时：使用亲和性缓存中的累计 input tokens
   - metric 为 `"length"` 时：使用当前请求的 content-length

#### Scenario: 高优先级上游恢复且对话 token 数较少
- **WHEN** 会话绑定在 P1 上游，P0 上游恢复可用，P0 配置了 `affinityMigration` 且 metric 为 `"tokens"`、`threshold` 为 50000，当前会话累计 input tokens 为 8000
- **THEN** 系统将会话迁移到 P0 上游，更新亲和性缓存绑定

#### Scenario: 高优先级上游恢复但对话 token 数较多
- **WHEN** 会话绑定在 P1 上游，P0 上游恢复可用，P0 配置了 `affinityMigration` 且 metric 为 `"tokens"`、`threshold` 为 50000，当前会话累计 input tokens 为 80000
- **THEN** 系统保持会话在 P1 上游，不迁移

#### Scenario: 首次请求时无历史 token 数据
- **WHEN** 会话绑定在 P1 上游，P0 上游恢复可用，P0 配置了 metric 为 `"tokens"` 的迁移，但该会话在亲和性缓存中的累计 tokens 为 0（首次请求）
- **THEN** 系统视为对话足够短，允许迁移到 P0

#### Scenario: 高优先级上游恢复但未配置迁移
- **WHEN** 会话绑定在 P1 上游，P0 上游恢复可用，但 P0 未配置 `affinityMigration`
- **THEN** 系统保持会话在 P1 上游，不迁移

#### Scenario: 当前上游已是最高优先级
- **WHEN** 会话绑定的上游已经是可用上游中优先级最高的
- **THEN** 系统保持当前绑定，不触发迁移评估


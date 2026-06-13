# user-entity Specification

## Purpose
TBD - created by archiving change multi-user-system. Update Purpose after archive.
## Requirements
### Requirement: 用户实体持久化

系统 SHALL 提供 `users` 表持久化用户账号，每条记录包含唯一用户名、bcrypt 密码哈希、显示名、角色（`admin` 或 `member`）、账号激活状态以及创建和更新时间。用户名作为登录标识 MUST 非空且在全表唯一，显示名作为界面友好称呼可与用户名不同，角色在未显式指定时 MUST 默认为 `member`，激活状态在未显式指定时 MUST 默认为启用。系统 SHALL 在 PostgreSQL 与 SQLite 两套 schema 中同步定义该表。

#### Scenario: 创建用户记录

- **WHEN** 系统创建一条用户记录，提供用户名、密码哈希、显示名和角色
- **THEN** 该记录被持久化，并自动生成 uuid 主键和创建、更新时间戳

#### Scenario: 角色与激活状态默认值

- **WHEN** 创建用户时未指定角色和激活状态
- **THEN** 该用户的角色为 `member`，激活状态为启用

### Requirement: 用户名唯一性大小写不敏感

系统 MUST 将用户名在存储与唯一性比较时归一化为小写，使仅大小写不同的用户名被视为同一账号。创建用户、登录查询、用户名变更 MUST 一致地使用归一化后的用户名。

#### Scenario: 大小写不同的用户名视为重复

- **WHEN** 已存在用户名 `zhangsan`，尝试创建用户名 `ZhangSan` 的用户
- **THEN** 系统判定为用户名冲突并拒绝，不产生重复记录

#### Scenario: 登录不区分用户名大小写

- **WHEN** 用户以 `ZhangSan` 登录，而账号存储为 `zhangsan`
- **THEN** 系统按归一化后的用户名定位到同一账号

### Requirement: 密码最小强度

系统 MUST 在创建用户、管理员重置密码、用户自助修改密码三处统一校验密码最小长度不少于 8 个字符。不满足的密码 MUST 被拒绝，且 MUST NOT 被哈希存储。

#### Scenario: 过短密码被拒绝

- **WHEN** 在创建用户或修改密码时提交少于 8 个字符的密码
- **THEN** 系统拒绝该操作并返回密码强度错误，不写入任何哈希

### Requirement: API Key 用户归属关系

系统 SHALL 通过 `api_keys.user_id` 外键将 API Key 归属到具体用户，该字段引用 `users(id)` 并建立索引。`user_id` 为空表示该密钥无归属，属于合法状态，不影响代理流程。删除用户时，其名下密钥的 `user_id` MUST 被置空而非级联删除密钥，且置空与删除 MUST 在单个数据库事务内原子完成，避免与并发新建密钥形成竞态导致悬挂归属。SQLite 客户端当前不强制外键，归属置空 MUST 由服务层显式执行，不依赖数据库外键行为。

#### Scenario: 密钥归属到用户

- **WHEN** 管理员将某个 API Key 的 `user_id` 设置为某个存在的用户
- **THEN** 该密钥与该用户建立归属关系，可按用户维度查询到该密钥

#### Scenario: 删除用户时密钥归属置空

- **WHEN** 管理员删除一个名下仍有 API Key 的用户
- **THEN** 这些密钥的 `user_id` 在同一事务内被置空，密钥本身保持存在且原有功能不受影响

#### Scenario: 存量无归属密钥保持合法

- **WHEN** 系统中存在 `user_id` 为空的 API Key
- **THEN** 该密钥在代理请求和密钥管理中正常工作，不因缺少归属而被拒绝

### Requirement: 停用用户连带名下密钥在代理侧失效

系统 MUST 在代理入口校验 client API key 时回查密钥归属用户的激活状态。当密钥归属于一个已被停用的用户时，该密钥 MUST 在代理侧被拒绝，使停用用户成为连带其全部密钥即时失效的操作。无归属（`user_id` 为空）的密钥不受此约束，行为与现状一致。

#### Scenario: 停用用户后其密钥代理被拒

- **WHEN** 某 API Key 归属的用户被管理员停用，随后使用该密钥发起代理请求
- **THEN** 系统在代理侧拒绝该请求

#### Scenario: 无归属密钥不受用户状态影响

- **WHEN** 一个 `user_id` 为空的 API Key 发起代理请求
- **THEN** 系统按密钥自身状态正常处理，不因用户状态而拒绝

### Requirement: 用户可用上游集合

系统 SHALL 提供 `user_upstreams` 关联表，承载管理员为每个用户开放的、可被该用户自助密钥授权的上游集合。该集合是 `member` 自助创建密钥时上游授权范围的上界。系统 SHALL 在 PostgreSQL 与 SQLite 两套 schema 中同步定义该表。

#### Scenario: 管理员配置用户可用上游

- **WHEN** 管理员为某用户设置可用上游集合
- **THEN** 系统持久化该用户与这些上游的关联关系

#### Scenario: 可用上游集合约束自助授权

- **WHEN** 查询某用户自助密钥可授权的上游范围
- **THEN** 范围等于该用户在 `user_upstreams` 中关联的上游集合

### Requirement: 请求事实表冗余用户归属

系统 MUST 在 `request_logs` 与 `request_billing_snapshots` 各新增冗余 `user_id` 列并建立索引，在写入请求记录与账单快照时从该请求所用密钥的当前归属快照填入。个人用量聚合 MUST 基于该冗余列，使密钥被删除或用户被停用后，历史记录仍能按用户归属。存量记录的冗余列为空，属合法的历史无归属状态。

#### Scenario: 写入时快照用户归属

- **WHEN** 一个归属于某用户的密钥产生一次请求
- **THEN** 对应的请求日志与账单快照记录该用户的标识

#### Scenario: 密钥删除后历史归属不丢失

- **WHEN** 某用户删除了自己的一个密钥，其历史请求记录被按用户聚合查询
- **THEN** 这些历史记录仍归属到该用户，不因密钥消失而丢失


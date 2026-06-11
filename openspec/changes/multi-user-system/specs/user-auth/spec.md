## ADDED Requirements

### Requirement: 用户名密码登录

系统 SHALL 提供 `POST /api/auth/login` 端点，接收用户名与密码，校验通过后签发携带用户标识与角色的 JWT 并随用户基本信息一并返回。校验流程 MUST 依次确认用户存在、账号处于启用状态、密码经 bcrypt 比对一致。任一环节失败 MUST 返回认证失败错误，且 MUST NOT 泄露具体失败原因是用户名不存在还是密码错误。密码明文 MUST NOT 写入数据库或日志。JWT payload MUST 只包含 `userId` 与 `role`，MUST NOT 包含用户名等可避免暴露的信息。

#### Scenario: 凭据有效登录成功

- **WHEN** 用户提交存在且启用的账号用户名与正确密码
- **THEN** 系统返回 200，响应体包含 JWT 与用户的标识、用户名、显示名和角色

#### Scenario: 密码错误拒绝登录

- **WHEN** 用户提交存在的用户名但密码不正确
- **THEN** 系统返回 401 认证失败，不签发 JWT，错误信息不区分是用户名还是密码的问题

#### Scenario: 停用账号拒绝登录

- **WHEN** 用户提交的账号存在但处于停用状态
- **THEN** 系统返回 401 认证失败，不签发 JWT

#### Scenario: 不存在的用户名拒绝登录

- **WHEN** 用户提交的用户名在系统中不存在
- **THEN** 系统返回 401 认证失败，错误信息与密码错误时保持一致

### Requirement: 登录失败限流

系统 MUST 对 `POST /api/auth/login` 的失败尝试实施速率限制，按用户名与来源 IP 维度做失败计数与短时锁定，超过阈值后在锁定窗口内拒绝继续尝试。该限制 MUST 缓解在线撞库以及大量并发登录触发 bcrypt 计算放大的拒绝服务风险。

#### Scenario: 连续失败触发锁定

- **WHEN** 同一用户名或来源 IP 在短时间内连续多次登录失败并超过阈值
- **THEN** 系统在锁定窗口内拒绝该用户名或 IP 的后续登录尝试

#### Scenario: 锁定窗口过后恢复

- **WHEN** 锁定窗口结束
- **THEN** 该用户名或 IP 可重新尝试登录

### Requirement: 当前用户资料端点

系统 SHALL 提供 `GET /api/auth/me` 端点，按请求携带的有效凭据返回当前用户的标识、用户名、显示名和角色，供前端在不解析 JWT 敏感字段的前提下获取展示信息。未认证请求 MUST 返回 401。

#### Scenario: 返回当前用户资料

- **WHEN** 已认证用户调用 `GET /api/auth/me`
- **THEN** 系统返回该用户的标识、用户名、显示名和角色

### Requirement: 登出

系统 SHALL 提供登出能力，使客户端清除已存储的会话凭据，之后访问受保护资源 MUST 需要重新登录。

#### Scenario: 登出后需重新登录

- **WHEN** 用户登出
- **THEN** 客户端凭据被清除，再次访问受保护页面或接口时被要求重新登录

### Requirement: ADMIN_TOKEN 引导与紧急通道

系统 SHALL 永久保留 `ADMIN_TOKEN` 作为引导入口和紧急维护通道。携带 `ADMIN_TOKEN` 的请求 MUST 被识别为超级管理员身份，在所有需要管理员权限的场景中等价于角色为 `admin` 的用户。ADMIN_TOKEN 的比较 MUST 使用常量时间比较，避免时序侧信道。`ADMIN_TOKEN` 身份不对应任何用户记录，MUST NOT 触发用户状态查库。即使数据库中没有任何用户或全部用户被停用，`ADMIN_TOKEN` 仍 MUST 能够通过认证。

#### Scenario: ADMIN_TOKEN 通过认证

- **WHEN** 请求携带与配置一致的 `ADMIN_TOKEN`
- **THEN** 系统将其识别为超级管理员身份并放行管理员级别的操作，且不查询任何用户记录

#### Scenario: 无用户时 ADMIN_TOKEN 仍可用

- **WHEN** 系统中尚无任何用户记录，请求携带正确的 `ADMIN_TOKEN`
- **THEN** 认证通过，管理员可借此创建首个用户

### Requirement: 角色感知的统一鉴权

系统 SHALL 提供统一的鉴权工具，从请求中解析出认证主体并区分超级管理员、`admin` 用户、`member` 用户与未认证四种情形。JWT 验签 MUST 固定允许的签名算法，拒绝 `alg=none` 与算法降级。对 JWT 身份，鉴权 MUST 以查库得到的最新 `role` 为准，而非信任 JWT payload 中签发时的角色。需要管理员权限的端点 MUST 仅允许超级管理员和当前 `role=admin` 的用户通过，`member` 用户 MUST 被拒绝并返回 403，未认证请求 MUST 返回 401。全部现有 `/api/admin/*` 端点 MUST 迁移到该统一鉴权工具，且迁移后原本可凭 `ADMIN_TOKEN` 通过的行为保持不变。

#### Scenario: admin 用户访问管理 API

- **WHEN** 当前角色为 `admin` 的用户携带有效 JWT 访问 `/api/admin/*` 端点
- **THEN** 请求通过鉴权

#### Scenario: member 用户访问管理 API 被拒

- **WHEN** 角色为 `member` 的用户携带有效 JWT 访问 `/api/admin/*` 端点
- **THEN** 系统返回 403，拒绝访问

#### Scenario: 角色降级即时生效

- **WHEN** 某 `admin` 用户登录获得 JWT 后被降级为 `member`，随后携带原 JWT 访问管理 API
- **THEN** 系统以查库最新角色判定，返回 403，即使 JWT payload 仍写着 admin

#### Scenario: 未认证请求被拒

- **WHEN** 请求未携带任何有效凭据访问 `/api/admin/*` 端点
- **THEN** 系统返回 401

#### Scenario: 拒绝非法签名算法

- **WHEN** 请求携带 `alg=none` 或非约定算法签发的 token
- **THEN** 系统拒绝该 token，返回 401

#### Scenario: 迁移后 ADMIN_TOKEN 行为不变

- **WHEN** 迁移到统一鉴权后，请求携带正确的 `ADMIN_TOKEN` 访问任一 `/api/admin/*` 端点
- **THEN** 请求通过鉴权，与迁移前行为一致

### Requirement: JWT 即时吊销

系统在验证 JWT 签名通过后 MUST 额外查询用户当前状态，确认账号仍存在且处于启用状态，否则 MUST 拒绝该请求。停用或删除某个用户后，该用户此前签发但尚未过期的 JWT MUST 立即失效。该查库仅作用于 JWT 用户身份，`ADMIN_TOKEN` 身份不触发。

#### Scenario: 停用用户后已签发 token 立即失效

- **WHEN** 某用户登录获得有效 JWT 后被管理员停用，随后携带该 JWT 发起请求
- **THEN** 系统拒绝该请求，即使 JWT 本身尚未过期

#### Scenario: 删除用户后已签发 token 失效

- **WHEN** 某用户的 JWT 仍在有效期内，但该用户已被删除
- **THEN** 系统拒绝携带该 JWT 的请求

### Requirement: 仅支持本地账号，第三方登录延后

本能力 MUST 只提供本地用户名密码账号体系。第三方登录（OAuth / OIDC）不在本变更范围内，作为后续可扩展项，其引入 MUST NOT 与本阶段基础用户体系捆绑交付。

#### Scenario: 不提供第三方登录入口

- **WHEN** 用户访问登录界面
- **THEN** 仅提供本地用户名密码登录与管理员令牌登录，无第三方登录选项

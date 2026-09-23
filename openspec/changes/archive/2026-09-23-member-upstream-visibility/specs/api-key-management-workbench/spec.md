## ADDED Requirements

### Requirement: 全局密钥列表按归属分离

管理台全局密钥列表（`GET /api/admin/keys`）SHALL 支持归属范围参数：默认范围 MUST 只返回无归属密钥（`user_id` 为空）；管理员可显式切换到“全部”范围查看所有密钥。密钥列表响应 SHALL 携带归属信息（`user_id` 与 `user_name`），“全部”范围下 UI MUST 为有归属密钥展示归属标识。指定 `user_id` 查询参数时 SHALL 返回该用户名下的密钥列表。

#### Scenario: 默认只见无归属密钥

- **WHEN** 管理员打开密钥页（未切换范围）
- **THEN** 列表只包含无归属密钥，成员名下的密钥不出现

#### Scenario: 全部范围可见归属

- **WHEN** 管理员把范围切换为“全部”
- **THEN** 列表包含全部密钥，有归属的密钥展示其归属用户名

#### Scenario: 按用户过滤

- **WHEN** 管理员以 `user_id` 查询密钥列表
- **THEN** 返回该用户名下的全部密钥

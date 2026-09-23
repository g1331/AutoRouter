## MODIFIED Requirements

### Requirement: 用户自助 API Key 管理

系统 SHALL 允许 member 用户在自助门户中对归属于自己的 API Key 执行创建、更新、停用、启用、删除，以及配置该密钥自身的消费限额规则、RPM 和 TPM 限制。约束在服务端强制执行：

新建密钥的归属 MUST 由服务端强制设为当前用户，access_mode MUST 强制为 restricted（不允许 unrestricted）。用户 MUST NOT 修改密钥归属、MUST NOT 认领无归属或他人密钥、MUST NOT 操作不属于自己的密钥。密钥可授权的上游 MUST 是该用户 user_upstreams 集合的子集，超出部分 MUST 被拒绝。用户对 spending_rules、rpm_limit 与 tpm_limit 的修改 MUST 只能收紧不能放宽：MUST NOT 把已配置的消费限额或速率限制调高，也 MUST NOT 清空已配置的消费限额或速率限制。

#### Scenario: 用户创建归属自己的密钥

- **WHEN** 用户在门户中创建一个新 API Key
- **THEN** 系统创建该密钥，归属强制设为当前用户，access_mode 强制为 restricted，用户可在个人密钥列表看到它

#### Scenario: 用户授权越界上游被拒

- **WHEN** 用户尝试给自助密钥授权一个不在自己 user_upstreams 集合内的上游
- **THEN** 系统拒绝该操作并返回授权越界错误

#### Scenario: 用户放宽额度被拒

- **WHEN** 用户尝试把自助密钥的限额调高到超过管理员设定的上限，或清空已有限额
- **THEN** 系统拒绝该操作，限额保持在允许范围内

#### Scenario: 用户放宽速率限制被拒

- **WHEN** 用户尝试提高已配置的 rpm_limit 或 tpm_limit，或将任一已配置速率限制清空
- **THEN** 系统 MUST 拒绝该操作
- **AND** 原有的速率限制 MUST 保持不变

#### Scenario: 用户收紧速率限制

- **WHEN** 用户为原本不限速的密钥设置正整数 RPM 或 TPM，或将已有正整数限制调低
- **THEN** 系统 MUST 持久化该变更
- **AND** 后续代理请求 MUST 立即按新限制执行

#### Scenario: 用户更新与停用自己的密钥

- **WHEN** 用户修改自己某个密钥的名称、收紧额度、收紧速率限制或启停状态
- **THEN** 系统持久化变更，该密钥行为按新设置生效

#### Scenario: 用户删除自己的密钥

- **WHEN** 用户删除归属自己的密钥
- **THEN** 系统吊销该密钥，后续使用该密钥的请求被拒绝，其历史请求记录仍按冗余归属保留

#### Scenario: 用户无法操作他人密钥

- **WHEN** 用户尝试更新或删除一个不归属于自己的密钥
- **THEN** 系统拒绝该操作并返回未授权错误，目标密钥保持不变

#### Scenario: 用户无法转移密钥归属

- **WHEN** 用户尝试在更新密钥时修改其 user_id
- **THEN** 系统忽略该字段，密钥归属保持为当前用户

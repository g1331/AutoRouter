# user-portal Specification

## Purpose
规定成员自助门户的数据隔离、用量与请求记录、个人密钥和账户操作，使成员只能管理自己的资源，并在管理员授予的上游与额度范围内安全使用代理服务。

## Requirements

### Requirement: 用户侧数据隔离

系统 SHALL 提供 `/api/user/*` 用户侧端点，全部以 `requireUser` 取得当前登录用户标识，并在数据查询层强制注入当前用户的过滤条件。用户侧端点 MUST NOT 接受外部传入的目标用户标识作为查询参数。任一用户 MUST 只能访问归属于自己的数据，访问他人数据的尝试 MUST 在服务端被拒绝，与前端是否隐藏入口无关。

#### Scenario: 用户只能读取自己的数据

- **WHEN** 普通用户调用个人请求记录、个人用量或个人密钥列表端点
- **THEN** 系统仅返回归属于该用户的记录，不包含任何其他用户的数据

#### Scenario: 越权访问他人数据被拒绝

- **WHEN** 用户 A 尝试通过构造参数访问用户 B 的请求记录或密钥
- **THEN** 系统忽略外部传入的用户标识，仍以 A 自身身份过滤，A 无法读到 B 的任何数据

#### Scenario: 未认证访问用户侧端点被拒绝

- **WHEN** 请求未携带有效凭据访问 `/api/user/*` 端点
- **THEN** 系统返回 401

### Requirement: 个人用量与请求记录查询

系统 SHALL 为登录用户提供个人概览、个人用量统计和个人请求记录查询，数据来源 MUST 复用现有 `request_logs` 与 `request_billing_snapshots`，经由这两张表的冗余 `user_id` 列聚合，MUST NOT 引入与现有统计口径不一致的并行数据源。无名下密钥或无历史记录的用户查询时 MUST 返回空结果而非错误。

#### Scenario: 展示个人概览

- **WHEN** 用户打开个人概览页面
- **THEN** 系统展示该用户的请求次数、费用和活跃密钥数等汇总，数值仅基于归属该用户的记录

#### Scenario: 查询个人请求记录

- **WHEN** 用户查询个人请求记录
- **THEN** 系统返回归属该用户的请求日志，与管理员全局日志使用同一事实表

#### Scenario: 删除密钥后历史用量仍可见

- **WHEN** 用户删除了自己的某个密钥后查看个人用量
- **THEN** 该密钥产生的历史记录仍计入该用户的汇总，不因密钥被删而消失

#### Scenario: 无密钥用户查看概览

- **WHEN** 一个尚无任何归属密钥的用户打开个人概览
- **THEN** 系统返回零值汇总和空记录列表，不报错

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

### Requirement: 用户自助修改密码

系统 SHALL 允许登录用户在自助门户中修改自己的密码。修改 MUST 校验原密码正确，新密码 MUST 满足密码最小强度。原密码错误或新密码不达标时 MUST 拒绝。

#### Scenario: 凭正确原密码修改成功

- **WHEN** 用户提交正确的原密码与满足强度的新密码
- **THEN** 系统更新密码哈希，旧密码立即失效

#### Scenario: 原密码错误被拒

- **WHEN** 用户提交的原密码不正确
- **THEN** 系统拒绝修改，密码保持不变

### Requirement: 按角色分流落地页与门户路由

系统 SHALL 在登录后依据角色决定落地位置：`admin` 与 `ADMIN_TOKEN` 身份进入管理后台，`member` 进入自助门户。门户页面文案 MUST 在简体中文与英文两套国际化文件中提供。门户与管理后台 MUST 复用同一套抽取后的公共壳层组件。

#### Scenario: 管理员落地到管理后台

- **WHEN** `admin` 用户或 `ADMIN_TOKEN` 身份登录成功
- **THEN** 系统将其导向管理后台首页

#### Scenario: 普通用户落地到自助门户

- **WHEN** `member` 用户登录成功
- **THEN** 系统将其导向自助门户个人概览页

#### Scenario: 普通用户访问管理路由被前端重定向

- **WHEN** `member` 用户在客户端直接访问管理后台路由
- **THEN** 前端将其重定向到门户个人概览页

#### Scenario: 普通用户调用管理接口被服务端拒绝

- **WHEN** `member` 用户绕过界面直接请求管理类接口
- **THEN** 服务端返回 403，与前端是否重定向无关

### Requirement: 成员侧上游信息可见性

当某成员的上游可见性为隐藏（默认）时，该成员侧 API 与门户 UI MUST NOT 暴露任何上游身份信息：`GET /api/user/upstreams` MUST 返回 `upstreams_visible: false` 与空选项列表；成员密钥响应中的 `upstream_ids` MUST 为空数组；个人请求记录响应 MUST 抹除 `upstream_id`、`upstream_name`、`group_name`、`failover_history`、`routing_decision`、`upstream_error` 字段，以及会反推上游身份的路由与出站字段 `routing_type`、`priority_tier`、`lb_strategy`、`header_diff`（`header_diff` 含上游鉴权头名称与凭据指纹）；成员创建密钥的请求中即使携带 `upstream_ids` 也 MUST 被忽略，密钥由服务端绑定该用户授权全集；成员更新密钥时的 `upstream_ids` MUST 被忽略。门户密钥对话框 MUST 不显示上游选择区。

当某成员的上游可见性为可见时，上述端点与 UI MUST 保持既有行为（上游选项含名称、成员可在授权集内选择子集、请求记录含路由详情）。可见性判定 MUST 以该成员自身的设置为准，成员之间互不影响。

#### Scenario: 隐藏态成员看不到上游选项

- **WHEN** 隐藏态成员请求 `GET /api/user/upstreams`
- **THEN** 响应为 `upstreams_visible: false` 且 items 为空，门户密钥对话框不渲染上游选择区

#### Scenario: 隐藏态成员建键自动绑定授权集

- **WHEN** 隐藏态成员创建密钥（无论是否携带 `upstream_ids`）
- **THEN** 密钥绑定该用户当前授权全集，响应中的 `upstream_ids` 为空数组

#### Scenario: 隐藏态成员请求记录不含上游身份

- **WHEN** 隐藏态成员查询个人请求记录
- **THEN** 每条记录的上游身份字段均为空值，时延、token 与计费字段正常返回

#### Scenario: 可见态成员保持现状

- **WHEN** 管理员把某成员设为可见后该成员访问上游选项、密钥与请求记录
- **THEN** 行为与可见性引入前一致，且不影响其他仍为隐藏态的成员

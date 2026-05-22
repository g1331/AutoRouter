# cliproxy-instance-management Specification

## Purpose
TBD - created by archiving change cliproxy-instance-config. Update Purpose after archive.
## Requirements
### Requirement: CLIProxyAPI 实例数据模型

系统 SHALL 提供 `cliproxy_instances` 数据表用于登记 CLIProxyAPI 实例。每条记录 MUST 包含实例名称、运行模式、代理转发基础地址、管理 API 地址、加密后的客户端 API Key、加密后的管理 API 密钥、启用状态、可选备注以及创建与更新时间戳。运行模式 MUST 限定为受管 sidecar 与外部服务两种取值。系统 SHALL 在 PostgreSQL 与 SQLite 两套 schema 中以等价字段定义该表。

#### Scenario: 双 schema 字段一致

- **WHEN** 对比 PostgreSQL 与 SQLite 两套 schema 中的 `cliproxy_instances` 表定义
- **THEN** 两者的字段集合、字段语义与约束一致，仅主键与时间戳类型按各自方言表达

#### Scenario: 实例名称唯一

- **WHEN** 创建实例时提交的名称与某个已存在实例重复
- **THEN** 系统拒绝写入并返回名称冲突错误

#### Scenario: 运行模式取值受限

- **WHEN** 创建或更新实例时提交的运行模式不属于受管 sidecar 与外部服务两种取值
- **THEN** 系统返回参数校验错误并拒绝写入

### Requirement: 敏感凭据加密存储

系统 SHALL 对 CLIProxyAPI 实例的客户端 API Key 与管理 API 密钥使用 Fernet 加密后存储，明文 MUST NOT 写入数据库。系统 MUST 复用既有 Fernet 加密机制，不引入新的加密实现。Admin API 的查询响应 MUST NOT 返回任一密钥的明文。

#### Scenario: 密钥加密入库

- **WHEN** 创建实例时提交客户端 API Key 与管理 API 密钥明文
- **THEN** 系统将两者分别 Fernet 加密后写入对应字段，数据库中不存在明文

#### Scenario: 查询响应不含密钥明文

- **WHEN** 通过 Admin API 查询实例列表或实例详情
- **THEN** 响应中不包含任一密钥的明文，仅以布尔标记指示密钥是否已配置

#### Scenario: 更新时保留未变更密钥

- **WHEN** 更新实例时未提交新的密钥值
- **THEN** 系统保留原有加密密钥不变，不会清空或损坏已存储凭据

### Requirement: 实例管理 Admin API

系统 SHALL 提供 CLIProxyAPI 实例的查询、创建、更新、删除 Admin API。所有端点 MUST 复用既有 Admin 鉴权机制（`ADMIN_TOKEN` Bearer 认证），并对入参执行严格校验。

#### Scenario: 创建实例

- **WHEN** 管理员通过 Admin API 提交合法的实例配置
- **THEN** 系统持久化该实例并返回创建后的实例信息（不含密钥明文）

#### Scenario: 查询实例列表与详情

- **WHEN** 管理员请求实例列表或指定实例详情
- **THEN** 系统返回对应实例信息，密钥字段以布尔标记表示是否已配置

#### Scenario: 更新实例

- **WHEN** 管理员提交某个实例的字段更新
- **THEN** 系统更新对应记录并返回更新后的实例信息

#### Scenario: 删除实例

- **WHEN** 管理员请求删除某个实例
- **THEN** 系统移除该实例记录

#### Scenario: 缺少管理鉴权

- **WHEN** 请求未携带有效的 `ADMIN_TOKEN` Bearer 凭据
- **THEN** 系统拒绝请求并返回鉴权失败错误

#### Scenario: 操作不存在的实例

- **WHEN** 管理员对一个不存在的实例 ID 执行查询、更新或删除
- **THEN** 系统返回实例不存在错误

### Requirement: 实例地址校验策略

系统 SHALL 按实例运行模式对地址执行差异化校验。受管 sidecar 模式下系统 SHALL 仅校验地址为格式合法的 `http` 或 `https` URL，并允许私有与内网地址。外部服务模式下系统 MUST 在写入前对地址执行同步地址安全校验，当地址主机部分为字面 IP 时拦截私有 IP、回环地址、链路本地地址与云元数据端点。地址校验 SHALL 同时作用于代理转发基础地址与管理 API 地址。

针对域名经 DNS 解析后落入内网的 DNS 重绑定情形，属于请求发起时刻的防护范畴，由后续涉及请求转发与连通性检测的变更补充，与既有上游写入路径的防护粒度保持一致。

#### Scenario: 受管模式允许内网地址

- **WHEN** 以受管 sidecar 模式提交指向 docker compose 内网主机名的地址
- **THEN** 系统接受该地址并允许写入

#### Scenario: 外部模式拦截私有地址

- **WHEN** 以外部服务模式提交指向私有 IP 或云元数据端点的地址
- **THEN** 系统返回地址校验错误并拒绝写入

#### Scenario: 拒绝非法地址格式

- **WHEN** 提交的地址不是格式合法的 `http` 或 `https` URL
- **THEN** 系统返回地址校验错误并拒绝写入

### Requirement: 管理 API 连通性检测

系统 SHALL 提供 CLIProxyAPI 管理 API 连通性检测能力，调用目标实例管理 API 的只读端点验证地址可达且管理密钥有效。检测 MUST 区分连接成功、鉴权失败、地址不可达、服务异常四类结果，并返回可理解的说明信息。检测 SHALL 同时支持对已保存实例的检测与对未保存配置的创建前预检测。检测请求 MUST 设置超时上限，超时按地址不可达处理。

#### Scenario: 检测成功

- **WHEN** 对一个地址可达且管理密钥有效的实例执行连通性检测
- **THEN** 系统返回连接成功结果

#### Scenario: 管理密钥无效

- **WHEN** 对一个地址可达但管理密钥错误的实例执行连通性检测
- **THEN** 系统返回鉴权失败结果并说明管理密钥无效

#### Scenario: 地址不可达

- **WHEN** 对一个地址无法连接或检测请求超时的实例执行连通性检测
- **THEN** 系统返回地址不可达结果

#### Scenario: 创建前预检测

- **WHEN** 管理员在保存实例前提交一份待测配置请求预检测
- **THEN** 系统对该未保存配置执行连通性检测并返回检测结果


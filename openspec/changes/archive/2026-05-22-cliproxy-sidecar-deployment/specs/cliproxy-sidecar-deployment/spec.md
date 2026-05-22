## ADDED Requirements

### Requirement: CLIProxyAPI sidecar 的 Docker Compose 部署形态

系统 SHALL 以独立的可选 Docker Compose 叠加文件提供 CLIProxyAPI 受管 sidecar 部署形态。主 `docker-compose.yml` MUST 保持 `autorouter` 与 `db` 两个基础服务不变，不引入对 CLIProxyAPI sidecar 的强制依赖。叠加文件 SHALL 定义一个 `cliproxyapi` 服务，接入既有的 `autorouter-net` 网络，使 AutoRouter 容器能够以服务名访问 CPA。CPA 镜像引用 MUST 支持经环境变量固定到具体 tag 或 digest。

#### Scenario: 未启用 sidecar 时基础部署不变

- **WHEN** 管理员仅使用主 `docker-compose.yml` 启动
- **THEN** 系统只启动 `autorouter` 与 `db` 两个服务，部署行为与本变更前完全一致

#### Scenario: 启用 sidecar 叠加部署

- **WHEN** 管理员同时引入主文件与 `docker-compose.cliproxy.yml` 叠加文件启动
- **THEN** 系统额外启动 `cliproxyapi` 服务，且该服务与 AutoRouter 处于同一网络可互相访问

#### Scenario: 固定 CPA 镜像版本

- **WHEN** 管理员在环境变量中将 CPA 镜像引用设为具体 tag 或 digest
- **THEN** sidecar 使用该固定镜像启动，不随 latest 漂移

### Requirement: CPA 配置模板与凭据注入

系统 SHALL 以模板形式提供 CPA 的 `config.yaml`，敏感凭据 MUST NOT 以明文提交进仓库。CPA 容器启动时 SHALL 由 entrypoint 脚本读取 `CLIPROXY_*` 环境变量生成实际配置后再启动 CPA 进程。CPA 的客户端 API Key 与管理 API 密钥 MUST 来源于 `.env` 中的同一组环境变量，使其与管理员在 `cliproxy_instances` 中登记的凭据来源一致。CPA 的出站代理地址 SHALL 可经环境变量配置。

#### Scenario: 启动时由模板生成配置

- **WHEN** CPA 容器启动且 `CLIPROXY_*` 环境变量已设置
- **THEN** entrypoint 脚本据模板生成包含实际密钥的 `config.yaml`，CPA 进程读取该配置启动

#### Scenario: 仓库不含明文密钥

- **WHEN** 检视仓库中的配置模板文件
- **THEN** 模板中客户端 API Key 与管理密钥均为环境变量占位符，不含真实明文

#### Scenario: 配置出站代理

- **WHEN** 管理员在 `.env` 中设置 CPA 出站代理地址
- **THEN** 生成的 `config.yaml` 的 `proxy-url` 取该地址，CPA 经该代理访问上游 OAuth 与模型服务

### Requirement: CPA auth-dir 与配置持久化

系统 SHALL 以 named volume 持久化 CPA 的 OAuth token 目录与日志目录，使 OAuth 凭据跨容器重启与重建后保留。CPA 配置模板 SHALL 以只读方式挂入容器。OAuth token 明文 MUST 仅存在于 CPA 的 auth-dir，MUST NOT 进入 AutoRouter 数据库。

#### Scenario: OAuth 凭据跨重启保留

- **WHEN** CPA sidecar 容器重启或重建
- **THEN** auth-dir 中的 OAuth token 文件仍然存在，已登录账号无需重新授权

#### Scenario: 配置模板只读挂载

- **WHEN** CPA 容器运行
- **THEN** 配置模板以只读方式挂入，容器内进程无法改写仓库中的模板文件

### Requirement: CLIProxyAPI 部署文档

系统 SHALL 提供 CLIProxyAPI 部署文档，覆盖外部 CPA 与受管 sidecar 两种部署方式。文档 MUST 说明 CPA 凭据与 `cliproxy_instances` 记录的一致性要求，MUST 说明 named volume 的备份与迁移方式，MUST 说明不同网络环境下 CPA 出站代理的配置方式，并 MUST 区分「CLIProxyAPI 服务地址」与「OAuth 出站代理」两类配置。`.env.example` SHALL 补充 CLIProxyAPI sidecar 相关环境变量及说明。

#### Scenario: 文档覆盖两种部署方式

- **WHEN** 管理员查阅 CLIProxyAPI 部署文档
- **THEN** 文档分别说明使用外部 CPA 与启用受管 sidecar 的部署步骤

#### Scenario: 文档说明凭据一致性

- **WHEN** 管理员按文档创建 `cliproxy_instances` 记录
- **THEN** 文档明确要求实例记录的客户端 API Key 与管理密钥与 sidecar `.env` 中的同一组值保持一致

#### Scenario: 环境变量样例补充

- **WHEN** 管理员查阅 `.env.example`
- **THEN** 文件包含 CLIProxyAPI sidecar 相关环境变量及其用途说明

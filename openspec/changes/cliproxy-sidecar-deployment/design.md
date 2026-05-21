## Context

前三个 CLIProxyAPI 变更交付了实例数据模型、OAuth 账号管理与上游建模能力，但都明确不涉及 sidecar 部署文件。AutoRouter 当前的 `docker-compose.yml` 只定义 `autorouter` 与 `db` 两个服务，使用 named volume `autorouter-data` 与 `postgres-data`，环境变量经 `.env` 注入。CLIProxyAPI 实例表 `cliproxy_instances` 含 `mode` 字段，取值 `managed`（受管 sidecar）与 `external`（外部独立服务），并已保存 Fernet 加密的客户端 API Key 与管理 API 密钥。

CLIProxyAPI 官方提供 Docker 镜像 `eceasy/cli-proxy-api`，服务端口 `8317`，配置文件 `config.yaml` 的关键键包括：`auth-dir`（OAuth token 文件目录，需持久化）、`port`、`api-keys`（客户端 API Key 数组，所有请求含本机均需携带）、`remote-management.secret-key`（管理 API 密钥，明文在启动时自动哈希，留空则禁用管理 API）、`remote-management.allow-remote`、`proxy-url`（全局出站代理，支持 socks5、http、https）。

本变更补齐 issue #142 建议拆分第 7 项「部署支持」与验收条件第 10 条「部署文档」，是整个集成工作的收尾。

## Goals / Non-Goals

**Goals:**

提供 CLIProxyAPI 受管 sidecar 的 Docker Compose 部署形态，使管理员能够以一条命令把 CPA 与 AutoRouter 一起启动。持久化 CPA 的 OAuth token 目录与日志，保证 OAuth 凭据跨容器重启不丢失。让 CPA sidecar 的客户端 API Key 与管理密钥来源与 `cliproxy_instances` 记录的凭据来源一致。交付覆盖外部 CPA 与受管 CPA 两种部署方式的文档，说明不同网络环境下的出站代理配置。

**Non-Goals:**

不引入 AutoRouter 应用层 TypeScript 代码。CPA 实例的「本机子进程检测」复用既有管理 API 连通性检测，不新增进程启动与监管逻辑。不自动把 sidecar 凭据写入 `cliproxy_instances` 表，实例记录由管理员在管理端手工创建。不涉及数据库 schema、服务层、API 层与前端改动。不交付 Kubernetes 或集群部署形态。

## Decisions

### 决策一：「本机子进程检测」解释为连通性探测

issue #142 提到的「本机子进程检测」解释为对可达 CPA 实例的健康与存活探测，而非由 Next.js 进程启动并监管 CPA 的 Go 二进制。受管 sidecar 形态下 CPA 是独立容器，其生命周期交由 Docker Compose 的 `restart`、`healthcheck` 与服务依赖管理。AutoRouter 已有的管理 API 连通性检测即可探测 CPA 是否可达、密钥是否有效，无需新增检测代码。

备选方案是由 AutoRouter 派生 CPA 子进程并监管。该方案需要在 Next.js 运行时管理跨平台进程生命周期，复杂度高且与容器部署模型冲突，因此不采用。

### 决策二：本变更仅交付部署工件，不含应用代码

实例 CRUD、连通性检测、OAuth 账号管理、上游创建与转发层注入均已实现，当前缺口仅是把 CPA 作为 sidecar 部署出来。因此本变更只修改 Docker Compose、配置模板、环境变量样例与文档，不新增 TypeScript 代码，不需要新增单元测试。验证以 `docker compose config` 配置校验、文档审阅与手工启动说明为主。

若后续需要自动生成密钥或把 sidecar 配置同步进 `cliproxy_instances`，那属于应用代码变更，需要另立变更并补充测试。

### 决策三：CPA 配置经环境变量模板在容器启动时生成

CPA 的 `api-keys` 与 `remote-management.secret-key` 是运行期明文配置，而 `cliproxy_instances` 表保存的是同一组值的 Fernet 密文。直接提交静态 `config.yaml` 无法保存真实密钥，且容易误用示例值。

采用配置模板加 entrypoint 脚本的方式：仓库提供 `cliproxy/config.yaml.template`，其中 `api-keys`、`remote-management.secret-key`、`proxy-url` 等以占位符表示；`cliproxy/docker-entrypoint.sh` 在容器启动时读取 `CLIPROXY_*` 环境变量，用 `envsubst` 生成实际 `config.yaml`，再 `exec` 启动 CPA 进程。`.env` 中的 `CLIPROXY_CLIENT_API_KEY` 与 `CLIPROXY_MANAGEMENT_KEY` 同时作为 CPA 配置来源，也是管理员创建 `cliproxy_instances` 记录时录入的明文来源。该方式与 AutoRouter 既有的 `.env` 驱动部署习惯一致，且不把密钥提交进仓库。

备选方案是提交静态 `config.yaml` 由用户手工编辑。该方案凭据散落、易与数据库记录不一致，且无法纳入 `.env` 统一管理，因此不采用。

### 决策四：sidecar 以独立叠加文件提供

CPA 既可由 sidecar 提供，也可使用外部独立实例。把 `cliproxyapi` 服务直接并入主 `docker-compose.yml` 会强制外部 CPA 用户运行不需要的服务、端口与持久化卷。

因此新增独立的可选叠加文件 `docker-compose.cliproxy.yml`，主 `docker-compose.yml` 保持 `autorouter` 与 `db` 不变。启用受管 sidecar 时使用 `docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d`。叠加文件相比 compose profile 更能直观表达「生产部署文件差异」，且可单独版本管理。

### 决策五：auth-dir 与日志用 named volume 持久化

CPA 的 `auth-dir` 保存 OAuth token 文件，属于敏感且必须跨重启保留的数据。AutoRouter 既有 `autorouter-data` 与 `postgres-data` 均为 named volume，CPA 的 OAuth token 目录与日志目录沿用 named volume，与现有部署习惯一致，并避免 token 文件混入源码目录或被源码备份策略波及。

`config.yaml.template` 以只读 bind mount 挂入容器，entrypoint 脚本据此在容器内生成实际 `config.yaml`。文档需说明 named volume 的备份与迁移方式（`docker volume inspect` 配合 `docker cp`），并提供 auth-dir 改用 bind mount 的变体说明，供需要离线迁移或人工审计的管理员选用。

## Risks / Trade-offs

`.env` 中的密钥与 `cliproxy_instances` 记录可能人工不一致 → 部署文档明确要求两者使用同一组密钥，并提供管理端连通性检测作为创建实例后的验证手段。

`eceasy/cli-proxy-api` 镜像可能不内置 `envsubst` → entrypoint 脚本在生成配置前检测 `envsubst` 是否可用，缺失时回退到 `sed` 占位符替换，二者均为镜像基础环境可满足的方案；该回退细节在 tasks 阶段随脚本实现确定。

CPA 镜像 tag 漂移导致行为不一致 → 叠加文件中的 CPA 镜像引用支持经 `CLI_PROXY_IMAGE` 环境变量固定到具体 tag 或 digest，与 AutoRouter 既有 `AUTOROUTER_IMAGE` 固定方式一致。

CPA 管理 API 默认仅允许本机访问 → 受管 sidecar 与 AutoRouter 处于同一 compose 网络，属于跨容器访问。文档需说明 `CLIPROXY_ALLOW_REMOTE` 的取值与安全含义，并强调 `remote-management.secret-key` 必须设置。

## Migration Plan

本变更不含数据库迁移，纯部署工件新增。已有部署不受影响：未引入叠加文件的用户行为完全不变。启用受管 sidecar 的用户复制新版 `.env.example` 中的 `CLIPROXY_*` 变量到 `.env`，再以叠加文件启动。回滚方式为停止并移除 `cliproxyapi` 服务，AutoRouter 与数据库服务不受影响。

## Open Questions

无。部署架构的五项设计决策已确定，entrypoint 脚本的占位符替换实现细节在 tasks 阶段随脚本编写落实。

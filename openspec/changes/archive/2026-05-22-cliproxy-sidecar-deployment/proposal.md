## Why

前三个变更让 AutoRouter 在数据模型、OAuth 账号管理与上游建模层面完整支持 CLIProxyAPI，但管理员目前仍无法以一致的方式把 CLIProxyAPI 作为受管 sidecar 部署出来。GitHub issue #142 的建议拆分第 7 项与验收条件第 10 条要求补齐部署能力：提供 Docker Compose sidecar、CPA auth-dir 与配置的持久化，以及覆盖外部 CPA 与受管 CPA 两种形态的部署文档。本变更交付这一收尾能力，使 issue #142 的集成工作完整可用。

## What Changes

- 新增 CLIProxyAPI sidecar 的 Docker Compose 部署形态。采用独立的可选叠加文件 `docker-compose.cliproxy.yml`，主 `docker-compose.yml` 保持 `autorouter` 与 `db` 两个基础服务不变。使用外部 CPA 的用户无需引入该叠加文件，受管 sidecar 为显式启用。
- 新增 CPA 容器配置模板与启动脚本。`config.yaml` 以模板形式提供，容器启动时由 entrypoint 脚本读取 `CLIPROXY_*` 环境变量生成实际配置后再启动 CPA 进程，使 CPA 的 `api-keys` 与 `remote-management.secret-key` 与管理员在 `cliproxy_instances` 中登记的凭据来源保持一致。
- CPA 的 OAuth token 目录与日志目录使用 named volume 持久化，跨容器重启保留 OAuth 凭据；配置模板以只读 bind mount 挂入容器。
- `.env.example` 补充 CLIProxyAPI sidecar 相关环境变量及说明，区分「CLIProxyAPI 服务地址」与「OAuth 出站代理」两类配置。
- 新增 CLIProxyAPI 部署文档，覆盖外部 CPA 与受管 sidecar 两种部署方式、密钥一致性要求、named volume 备份与迁移方式，以及不同网络环境下的出站代理配置。

本变更仅交付部署工件与文档，不引入 AutoRouter 应用层 TypeScript 代码。CPA 实例的「本机子进程检测」复用既有的管理 API 连通性检测能力，不新增进程监管逻辑。

## Capabilities

### New Capabilities

- `cliproxy-sidecar-deployment`: 覆盖 CLIProxyAPI 受管 sidecar 的 Docker Compose 部署形态、CPA 配置模板与凭据注入、auth-dir 与配置持久化、环境变量约定，以及外部 CPA 与受管 CPA 两种部署方式的文档要求。

### Modified Capabilities

无。本变更仅交付部署工件，不修改任何既有 spec 的需求文本。

## Impact

部署层面新增可选叠加文件 `docker-compose.cliproxy.yml`，定义 `cliproxyapi` 服务，使用镜像 `eceasy/cli-proxy-api`，接入既有 `autorouter-net` 网络，新增 named volume 持久化 CPA auth-dir 与日志。

配置层面新增 CPA 配置模板与容器 entrypoint 脚本，置于仓库的 `cliproxy/` 目录。`.env.example` 补充 sidecar 相关环境变量。

文档层面新增 CLIProxyAPI 部署文档，置于 `docs/` 目录。

不涉及数据库 schema、服务层、API 层与前端的任何改动。CPA 实例与 `cliproxy_instances` 记录的凭据一致性由部署文档约定，由管理员在创建实例记录时手工保证，不引入自动同步逻辑。

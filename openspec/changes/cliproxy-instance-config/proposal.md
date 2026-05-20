## Why

AutoRouter 当前的上游仅支持普通 HTTP API Key 形式，无法接入 Codex、Claude Code、Gemini CLI 等基于 OAuth 账号的能力。GitHub issue #142 决定通过受管 CLIProxyAPI sidecar 引入 CLI OAuth 上游能力。在创建任何 CLI OAuth 上游之前，AutoRouter 必须先能够描述、保存并校验“一个 CLIProxyAPI 服务”这一基础资源。本变更交付这一基础资源模型，是 issue #142 全部后续工作的依赖底座。

## What Changes

- 新增 CLIProxyAPI 实例这一受管资源。系统支持登记多个 CLIProxyAPI 实例，每个实例描述一个独立的 CLIProxyAPI 服务，包含代理基础地址、管理 API 地址、运行模式（受管 sidecar 或外部服务）以及连接凭据。
- 实例的两类敏感凭据，即客户端 API Key 与管理 API 密钥，复用现有 Fernet 加密机制加密存储，明文不落数据库，读取时按需解密。
- 新增 Admin API，提供 CLIProxyAPI 实例的查询、创建、更新、删除能力，鉴权方式与现有 Admin API 一致（`ADMIN_TOKEN` Bearer 认证）。
- 新增 CLIProxyAPI 管理 API 连通性检测能力，调用目标实例的管理接口验证地址可达且密钥有效，并返回可理解的成功或失败信息。
- 数据模型在 PostgreSQL 与 SQLite 两套 schema 中同步落地，并生成对应迁移文件。

本变更不涉及 OAuth 账号管理、CLI OAuth 上游创建与请求转发，这些能力由 issue #142 的后续变更交付。

## Capabilities

### New Capabilities

- `cliproxy-instance-management`: 描述 CLIProxyAPI 实例这一受管资源，覆盖实例数据模型、敏感凭据加密存储、Admin API 增删改查、管理 API 连通性检测，以及多实例并存与删除约束。

### Modified Capabilities

无。本变更仅新增能力，不修改任何既有 spec 的需求。

## Impact

数据层面新增 `cliproxy_instances` 表，需要在 `src/lib/db/schema-pg.ts` 与 `src/lib/db/schema-sqlite.ts` 中同步定义，并通过 `pnpm db:generate` 生成迁移文件。

服务层面新增 CLIProxyAPI 实例的 CRUD 服务与连通性检测服务，参考既有 `upstream-crud.ts` 与 `upstream-connection-tester.ts` 的实现模式。

API 层面新增 `src/app/api/admin/cliproxy/instances` 路由族，复用 `validateAdminAuth`、`errorResponse`、Zod 校验等既有约定。

加密层面复用 `src/lib/utils/encryption.ts` 的 Fernet 加解密函数，不引入新的加密依赖。

需要关注的约束是 SSRF 校验。受管 sidecar 模式下，CLIProxyAPI 实例地址通常是 docker compose 内网主机名（例如 `http://cliproxyapi:8317`），属于私有地址范围。现有 `upstream-ssrf-validator.ts` 会拦截私有地址。本变更需要为 CLIProxyAPI 实例地址设计与普通上游不同的地址校验策略，具体方案在 design.md 中确定。

前端管理界面的实例配置页面不在本变更范围内，本变更仅交付后端能力与 API。

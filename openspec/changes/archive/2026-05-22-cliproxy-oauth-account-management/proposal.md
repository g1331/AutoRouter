## Why

`cliproxy-instance-config` 变更已让 AutoRouter 能够登记 CLIProxyAPI 实例并检测其管理 API 连通性。但管理员目前还无法看到某个 CLIProxyAPI 实例下挂载了哪些 OAuth 账号，也无法从 AutoRouter 管理端发起 Codex、Claude、Gemini 的 OAuth 登录。本变更补齐 issue #142 的 OAuth 账号管理与登录能力，是创建 CLI OAuth 上游之前的必要前置。

## What Changes

- 新增 CLIProxyAPI 管理 API 客户端，封装 auth-files 列表、模型列表、账号状态与字段更新、OAuth 授权地址获取、登录状态查询等管理接口调用，鉴权统一使用 `Authorization: Bearer` 形式。
- 新增 OAuth 账号元数据缓存表 `cliproxy_auth_accounts`，缓存 auth-files 的非敏感字段，包含账号文件名、服务商、邮箱、状态、前缀、模型数量、最近同步时间。OAuth token 明文不进入该表。
- 新增账号同步能力，从 CLIProxyAPI 拉取 auth-files 并写入缓存表，支持主动同步与按需刷新。
- 新增 OAuth 登录流程能力，管理端可发起 Codex、Claude、Gemini 的 OAuth 登录，展示授权地址并轮询登录状态，远程与受管部署默认携带 `is_webui=true`。
- 新增账号管理能力，支持启停某个 OAuth 账号，以及设置账号的前缀、出站代理、优先级、备注。
- 新增上述能力对应的 Admin API 路由族，鉴权与既有 Admin API 一致。
- 为 `cliproxy_instances` 删除路径补充引用校验，当实例下仍存在缓存的 OAuth 账号时拒绝删除。

本变更不涉及 CLI OAuth 上游的创建与请求转发，这些能力由后续变更 `cliproxy-oauth-pool-upstream` 交付。本变更不涉及前端管理界面，仅交付后端能力与 API。

## Capabilities

### New Capabilities

- `cliproxy-oauth-account-management`: 覆盖 CLIProxyAPI 管理 API 客户端、OAuth 账号元数据缓存、账号同步、OAuth 登录流程、账号启停与字段管理，以及对应的 Admin API。

### Modified Capabilities

无。实例删除在存在缓存 OAuth 账号时的保护行为，作为新能力 `cliproxy-oauth-account-management` 的一项需求引入，对应 `cliproxy-instance-config` 变更中预留的删除前引用校验扩展点，不改写既有 spec 的需求文本。

## Impact

数据层面新增 `cliproxy_auth_accounts` 表，外键引用 `cliproxy_instances`，需在 PostgreSQL 与 SQLite 两套 schema 中同步定义并生成迁移文件。

服务层面新增 CLIProxyAPI 管理 API 客户端、账号同步服务、OAuth 登录流程服务。`cliproxy-instance-crud.ts` 的 `deleteCliproxyInstance` 在已预留的引用校验扩展点补充实际校验逻辑。

API 层面在 `src/app/api/admin/cliproxy` 下新增 auth-accounts 与 oauth-login 相关路由。

安全层面，验收要求 OAuth token 明文不落 AutoRouter 数据库，缓存表仅保存非敏感元数据。CLIProxyAPI 管理 API 鉴权失败存在来源 IP 限流，登录状态轮询需设置合理的轮询间隔与超时上限。

CLIProxyAPI 管理 API 为 `v0` 前缀、接口未冻结，所有调用集中在管理 API 客户端单一模块，便于后续接口变动时收敛改动面。

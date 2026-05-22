## Why

前两个变更让 AutoRouter 能够登记 CLIProxyAPI 实例并管理其 OAuth 账号，但还无法把这些 OAuth 能力作为 AutoRouter 上游对外提供服务。本变更补齐 issue #142 的最后一类核心能力：将 CLIProxyAPI 的 CLI OAuth 能力建模为 AutoRouter 上游，使代理请求能够路由到 Codex、Claude、Gemini 的 OAuth 账号。

## What Changes

- `upstreams` 表新增三个可空字段，用于标记上游与 CLIProxyAPI 的关联：所属 CLIProxyAPI 实例、绑定的 OAuth 账号文件名、CLI 服务商。既有普通上游这三个字段保持为空。
- 新增“一键创建 OAuth 池上游”能力，按服务商一键创建 Codex、Claude、Gemini 的 OAuth 池上游。池上游的代理地址由实例代理地址拼接服务商专属路径得到，鉴权使用实例客户端 API Key，路由能力按服务商预设。
- 新增“单账号映射上游”能力，将某个 OAuth 账号固定映射为一个 AutoRouter 上游。该能力为目标账号在 CLIProxyAPI 设置账号前缀，并在上游模型规则中写入前缀别名规则，实现固定账号路由。
- 新增上述能力对应的 Admin API。
- `cliproxy_instances` 删除校验扩展为同时检查 `upstreams` 引用，存在关联上游时拒绝删除。

本变更复用既有上游的创建、路由、熔断、计费、请求日志机制，不重写这些能力。本变更不涉及前端界面与 sidecar 部署文件。

## Capabilities

### New Capabilities

- `cliproxy-oauth-pool-upstream`: 覆盖上游与 CLIProxyAPI 的关联建模、OAuth 池上游一键创建、单账号映射上游、账号前缀与模型规则联动，以及对应 Admin API。

### Modified Capabilities

无。`cliproxy_instances` 删除校验对 `upstreams` 引用的扩展，作为新能力的一项需求引入，对应既有删除逻辑中预留的扩展点，不改写既有 spec 的需求文本。

## Impact

数据层面为 `upstreams` 表新增三个可空字段，需在 PostgreSQL 与 SQLite 两套 schema 中同步定义并生成迁移文件。新增字段全部可空，既有上游数据不受影响。

服务层面新增 CLIProxyAPI 上游预设服务，复用既有 `upstream-crud.ts` 的 `createUpstream` 完成上游落库。`cliproxy-instance-crud.ts` 的删除校验扩展为同时检查 `upstreams` 引用。单账号映射会调用 `cliproxy-auth-account-service` 为账号设置前缀。

API 层面在 `src/app/api/admin/cliproxy` 下新增池上游与单账号映射上游的创建路由。

路由能力按服务商预设：Codex 对应 `codex_cli_responses` 与 `openai_responses`，Claude 对应 `claude_code_messages` 与 `anthropic_messages`，Gemini 对应 `gemini_native_generate`。这些能力标识均为 `route-capabilities.ts` 既有取值，不新增能力类型。

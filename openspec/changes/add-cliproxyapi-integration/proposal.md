## Why

AutoRouter 已经具备多上游路由、API Key 授权、请求日志、计费、模型规则和能力路由，但上游接入仍以普通 HTTP API Key 为主，缺少对 Codex、Claude Code、Gemini CLI OAuth 账号池的统一管理与转发能力。

CLIProxyAPI 已经覆盖 CLI OAuth 登录、token 持久化、自动刷新、多账号调度、账号冷却、模型状态和 management API，将它作为 sidecar 或外部服务接入，可以让 AutoRouter 获得 CLI OAuth 上游能力，同时避免在主应用内重写各家 CLI OAuth 协议与账号调度逻辑。

## What Changes

- 新增 CLIProxyAPI 连接配置，支持外部服务与受管 sidecar 两种运行模式，并保存 client API key、management URL、management secret、出站代理等配置。
- 新增 CLIProxyAPI 管理 API 封装，支持账号列表、模型列表、账号状态更新、账号字段更新、OAuth 登录 URL 获取、登录状态轮询和代理连通性测试。
- 新增 Codex OAuth、Claude OAuth、Gemini OAuth 上游预设，一键生成对应 base URL、route capabilities、模型发现配置和模型规则初始值。
- 支持将 CLIProxyAPI 内的账号池作为一个 AutoRouter 上游，也支持通过账号 prefix 与 AutoRouter 模型规则创建固定账号上游。
- 在管理端提供 CLI OAuth 管理入口，展示 CLIProxyAPI 服务状态、OAuth 账号状态、模型数量、登录流程状态、出站代理配置和错误提示。
- 扩展部署配置，说明外部 CLIProxyAPI 与托管 sidecar 两种模式，并覆盖 auth-dir、config 持久化与网络代理配置。
- 保持 OAuth token 明文只由 CLIProxyAPI auth-dir 持久化，AutoRouter 数据库仅保存加密后的 CLIProxyAPI client API key 和 management secret。

## Capabilities

### New Capabilities

- `cliproxyapi-oauth-upstreams`: 覆盖 AutoRouter 对 CLIProxyAPI 的连接配置、management API 调用、OAuth 账号管理、账号池上游、固定账号上游、出站代理和部署模式。

### Modified Capabilities

- `upstream-operations-workbench`: 上游管理界面需要提供 CLI OAuth 上游预设、CLIProxyAPI 服务状态、账号列表、登录入口和固定账号创建入口。
- `upstream-route-capabilities`: 上游能力配置需要明确 Codex、Claude Code、Gemini CLI OAuth 池上游与现有能力标签之间的映射，并在列表和表单中正确展示。
- `upstream-endpoint-experience`: 上游连接测试、地址预览和错误提示需要覆盖 CLIProxyAPI 代理地址、management 地址和 OAuth 出站代理地址的语义差异。

## Impact

- 受影响后端服务：`src/lib/services/upstream-crud.ts`、`src/lib/services/proxy-client.ts`、新增 CLIProxyAPI management API 服务模块、上游连接测试服务与相关类型模块。
- 受影响 API：`src/app/api/admin/upstreams/*` 需要接收和返回 CLIProxyAPI 相关配置；新增 `/api/admin/cliproxyapi/*` 管理接口；代理入口继续使用 `/api/proxy/v1/*` 与现有能力路由。
- 受影响数据契约：`src/types/api.ts` 需要新增 CLIProxyAPI 配置、账号、模型、登录状态、代理测试和上游预设类型；敏感字段必须按加密或掩码规则处理。
- 受影响前端：`src/components/admin/upstream-form-dialog.tsx`、`src/components/admin/upstreams-table.tsx`、`src/hooks/use-upstreams.ts`、管理端设置或新增 CLI OAuth 页面需要展示配置、预设和账号管理交互。
- 受影响部署：`docker-compose.yml`、`.env.example`、README 或部署说明需要覆盖外部 CLIProxyAPI、托管 sidecar、auth-dir 持久化、config 持久化和出站代理配置。
- 受影响测试：上游 CRUD、管理 API、CLIProxyAPI 服务封装、代理路由、连接测试、配置解析、加密处理、前端表单和 hooks 需要补齐回归测试。

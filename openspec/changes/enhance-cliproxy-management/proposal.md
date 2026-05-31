## Why

CLIProxyAPI 原生 WebUI（Management Center）提供了 8 个功能页面（仪表盘、配置管理、Provider 密钥、认证文件管理、OAuth 登录、配额管理、日志、系统信息），而 AutoRouter 当前仅覆盖了实例 CRUD、账号同步/启停/字段编辑和 3 个 Provider 的 OAuth 登录。管理员在日常运维中需要频繁切换到 CLIProxyAPI 原生面板完成认证文件管理、日志查看、模型列表查看等操作，体验割裂且效率低下。本次变更将 CLIProxyAPI 原生面板中最高价值的管理能力集成到 AutoRouter 管理端，使管理员在单一界面内完成绝大多数 CLIProxyAPI 运维操作。

## What Changes

### 前端增强（后端已有数据或接口，仅需前端入口）

- 账号表格增加**模型列表查看**操作，弹窗展示该账号可用的具体模型列表（后端 `getAuthFileModels` 已实现）
- 账号表格增加**详情查看**操作，弹窗展示 email、status、status_message、raw_metadata 快照、last_synced_at 等完整元数据
- CLIProxyAPI 页面增加**关联上游**面板，展示某实例下所有关联的池上游和单账号上游（upstreams 表已有 `cliproxyInstanceId` 字段）
- 实例表格行内增加**快捷启停切换**，无需打开编辑弹窗

### 新增后端路由与前端（管理 API 透传至 CLIProxyAPI）

- **认证文件删除**：透传 `DELETE /v0/management/auth-files` 到 CLIProxyAPI，同时移除本地缓存
- **认证文件上传**：透传 `POST /v0/management/auth-files` 到 CLIProxyAPI，上传 JSON 格式认证文件并触发同步
- **认证文件下载**：透传 `GET /v0/management/auth-files/download?name=...`，下载认证文件原始 JSON
- **OAuth 回调 URL 手动提交**：透传 `POST /v0/management/oauth-callback`，在自动回调不可达时允许管理员手动粘贴回调 URL 完成登录
- **CLIProxyAPI 实例日志查看**：透传 `GET /v0/management/logs`，在 AutoRouter 管理端按时间范围查看 CLIProxyAPI 运行日志

### OAuth Provider 扩展

- 将 OAuth 登录支持的 Provider 从 3 个（Codex、Anthropic、Gemini）扩展到 6 个，新增 xAI/Grok、Antigravity、Kimi

## Capabilities

### New Capabilities

- `cliproxy-auth-file-operations`: 认证文件的上传、下载、删除操作，涵盖管理 API 客户端扩展、Admin 路由、前端弹窗
- `cliproxy-instance-logs`: CLIProxyAPI 实例日志查看，涵盖管理 API 客户端扩展、Admin 路由、前端日志面板
- `cliproxy-oauth-callback`: OAuth 回调 URL 手动提交，涵盖管理 API 客户端扩展、Admin 路由、前端输入弹窗

### Modified Capabilities

- `cliproxy-admin-ui`: 实例表格增加行内启停切换、页面增加关联上游面板
- `cliproxy-oauth-account-management`: 账号表格增加模型列表查看和详情查看操作、OAuth Provider 列表从 3 个扩展到 6 个

## Impact

**后端**
- `cliproxy-management-client.ts`：新增 `deleteAuthFile`、`uploadAuthFile`、`downloadAuthFile`、`submitOAuthCallback`、`getLogs` 5 个上游调用方法；`CLIPROXY_OAUTH_PROVIDERS` 常量从 3 项扩展到 6 项，`AUTH_URL_ENDPOINT` 对应扩展
- `cliproxy-auth-account-service.ts`：新增 `deleteCliproxyAuthAccount` 方法（删除上游认证文件后移除本地缓存）
- 新增 Admin 路由：`instances/[id]/auth-files/upload`、`instances/[id]/auth-files/[name]/download`、`instances/[id]/auth-files/[name]/delete`、`instances/[id]/oauth-callback`、`instances/[id]/logs`
- `cliproxy-instance-crud.ts`：新增 `toggleCliproxyInstanceEnabled` 快捷方法
- 新增 Admin 路由：`instances/[id]/upstreams`（查询关联上游）

**前端**
- 新增组件：`cliproxy-account-models-dialog.tsx`、`cliproxy-account-detail-dialog.tsx`、`cliproxy-auth-file-upload-dialog.tsx`、`cliproxy-auth-file-download-button.tsx`、`cliproxy-oauth-callback-dialog.tsx`、`cliproxy-instance-logs-panel.tsx`、`cliproxy-linked-upstreams-panel.tsx`
- 修改组件：`cliproxy-instances-table.tsx`（行内启停）、`cliproxy-accounts-table.tsx`（新增模型/详情/删除操作）、`cliproxy-accounts-panel.tsx`（新增上传按钮）、`cliproxy-oauth-login-dialog.tsx`（6 个 Provider）
- `use-cliproxy.ts`：新增对应的 hooks
- `src/types/cliproxy.ts`：新增类型定义
- `src/messages/en.json` 和 `zh-CN.json`：新增国际化文案

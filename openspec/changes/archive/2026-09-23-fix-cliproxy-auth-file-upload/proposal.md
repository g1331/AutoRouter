## Why

生产环境上传认证文件时，AutoRouter 未向 CLIProxyAPI 的 JSON 上传接口传递必需的 `name` 查询参数，导致上游返回 `400 invalid name`，管理端显示 502。现有个人部署工作流还会把可选 sidecar 当作孤立容器删除，使部署后的上传再次不可用。

## What Changes

- 选择文件时传递原文件名；粘贴 JSON 或旧调用方未提供文件名时，由服务端生成唯一 `.json` 文件名。
- 在 Admin API 校验文件名，并以 URL 编码后的 `name` 参数调用上游，保持 JSON 请求体不变。
- 个人部署不再删除未包含在主 Compose 文件中的 sidecar。
- 补齐组件、hook、路由、服务、上游协议和部署回归测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cliproxy-auth-file-operations`：上传必须携带安全的 `.json` 文件名，并兼容无文件名的 JSON 调用。
- `cliproxy-sidecar-deployment`：升级主应用时保留已运行的可选 sidecar。

## Impact

影响认证文件上传组件、hook、Admin Route、账号服务、管理 API 客户端和个人部署工作流。不改数据库、凭据内容格式、下载或删除接口，不导入用户截图中的凭据。

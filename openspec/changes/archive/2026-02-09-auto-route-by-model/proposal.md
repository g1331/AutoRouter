## Why

当前 AutoRouter 的路由依赖于客户端发送 `X-Upstream-Name` 或 `X-Upstream-Group` Header，这要求用户修改客户端配置，增加了使用门槛。参考 ding113/claude-code-hub 等开源项目，现代 AI Gateway 应该能够根据请求内容（特别是 `model` 参数）自动选择合适的路由目标，实现零配置的智能路由。

## What Changes

- **BREAKING**: 移除基于 Header 的路由方式（`X-Upstream-Name`、`X-Upstream-Group`）
- **新增**: 从请求体自动解析 `model` 字段
- **新增**: 模型前缀到上游分组的自动映射（如 `claude-*` → CC分组，`gpt-*` → CX分组）
- **新增**: 上游配置增加 `providerType` 字段标识提供商类型（anthropic/openai/gemini）
- **新增**: 上游配置增加 `allowedModels` 字段声明支持的模型列表
- **修改**: 代理路由优先使用模型自动路由，Header 方式不再支持

## Capabilities

### New Capabilities

- `model-based-routing`: 根据请求中的 model 参数自动选择上游路由目标
- `provider-type`: 上游提供商类型标识与分类
- `model-mapping`: 模型名称到上游分组的映射规则

### Modified Capabilities

- `proxy-routing`: 路由方式从 Header 驱动改为 Model 驱动

## Impact

- **API 变更**: 移除 `X-Upstream-Name` 和 `X-Upstream-Group` Header 支持
- **数据库**: `upstreams` 表新增 `provider_type` 和 `allowed_models` 字段
- **代理路由**: `src/app/api/proxy/v1/[...path]/route.ts` 路由逻辑重写
- **上游管理**: Admin API 和 UI 需支持新的上游配置字段
- **日志**: 路由类型记录从 `direct`/`group`/`default` 改为 `auto`
- **向后兼容**: 现有 API Key 配置需要迁移，移除 upstream 关联

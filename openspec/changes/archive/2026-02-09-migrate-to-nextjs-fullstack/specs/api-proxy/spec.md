# Capability: API Proxy

AI API 代理服务，支持多上游路由和 SSE 流式传输。

## MODIFIED Requirements

### Requirement: Proxy Route Path

代理路由路径 SHALL 变更为符合 Next.js 约定。

#### Scenario: New Proxy Endpoint

- Given 用户配置 AI 工具使用 AutoRouter
- When 设置 Base URL
- Then Base URL 为 `http://host:3000/api/proxy`
- And 完整代理路径为 `/api/proxy/v1/{path}`
- And 保持与上游 API 路径兼容 (如 `/v1/chat/completions`)

### Requirement: SSE Streaming via Next.js

系统 MUST 使用 Next.js API Routes 实现 SSE 流式传输。

#### Scenario: Stream Chat Completion

- Given 用户发送流式请求到代理
- When 上游返回 SSE 流式响应
- Then 使用 Web Streams API 转发响应
- And 每个数据块立即发送给客户端
- And 不缓冲响应数据
- And Content-Type 为 `text/event-stream`

#### Scenario: Non-streaming Request

- Given 用户发送非流式请求
- When 上游返回完整响应
- Then 直接返回 JSON 响应
- And 记录 token 用量

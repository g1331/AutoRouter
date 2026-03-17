## Why

当前请求日志只能展示响应侧的 `reasoning_tokens` 等使用量信号，无法说明这次请求在上游调用时实际携带了什么 thinking 或 reasoning 配置。对于 OpenAI、Anthropic、Gemini 这类支持思考深度控制的协议，这会直接影响排障、对账和策略核对，尤其容易让用户误以为日志中显示的 token 消耗就等于请求时设置的等级。

现在需要把“请求侧配置”和“响应侧 usage”明确分开：从请求体提取各协议实际传入的思考等级或预算配置，写入请求日志，并在管理端日志页给出稳定、易懂的展示位置，避免继续从响应去反推等级。

## What Changes

- 在代理入口统一解析请求体中的 thinking 或 reasoning 配置，按不同协议提取显式指定的等级、预算和模式信息。
- 扩展请求日志数据库、服务层类型、管理端日志 API 和转换逻辑，持久化并返回请求侧思考配置字段。
- 为请求日志建立统一的 thinking 配置归一化结构，区分 provider、协议、等级字段、预算字段、是否显式指定等信息。
- 在管理端请求日志中设计并展示 reasoning 等级信息：列表在模型名后追加 badge，详情区域展示完整配置，并明确区分“请求配置”和“响应 usage”。
- 补充测试，覆盖 OpenAI Responses、OpenAI Chat、Anthropic、Gemini 的请求提取与日志展示场景。

## Capabilities

### New Capabilities
- `request-thinking-config-logging`: 从请求体提取并持久化不同协议的 thinking 或 reasoning 配置，作为请求日志的一部分返回。
- `request-thinking-config-display`: 在管理端请求日志中展示思考等级、预算和配置来源，并与响应 usage 信号区分显示。

### Modified Capabilities
- `provider-usage-normalization`: 在现有 provider 归一化能力旁补充“请求侧 thinking 配置”的归一化口径，避免只覆盖响应侧 usage。

## Impact

- 受影响代码：
  - `src/app/api/proxy/v1/[...path]/route.ts`
  - `src/lib/services/request-logger.ts`
  - `src/lib/services/proxy-client.ts`
  - `src/lib/db/schema-pg.ts`
  - `src/lib/db/schema-sqlite.ts`
  - `src/lib/utils/api-transformers.ts`
  - `src/types/api.ts`
  - `src/components/admin/logs-table.tsx`
  - 可能新增日志展示子组件或日志详情辅助组件
- 受影响接口：
  - `GET /api/admin/logs`
- 数据库影响：
  - `request_logs` 表需要新增 thinking 或 reasoning 配置相关字段，或新增可序列化配置字段
- 测试影响：
  - 需要补充代理路由、日志转换、日志展示组件和 provider 归一化相关测试

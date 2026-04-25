## Why

当前系统把 `POST /v1/responses` 直接判定为 `codex_responses`，把 `POST /v1/messages` 直接作为通用 `anthropic_messages` 处理，本质上把“协议能力”和“CLI 客户端画像”混成了同一层能力模型。随着上游隔离需求变成真实场景，这会导致通用 Responses 或 Messages 请求被错误路由到只接受 Codex CLI 或 Claude Code CLI 的上游。

现在需要把能力模型拆成“先识别协议族，再识别是否为 CLI 专属请求”，让路由、授权、会话亲和和补偿规则都建立在正确的最终能力上，避免继续扩大错误分流范围。

## What Changes

- **BREAKING**：重构 OpenAI Responses 与 Anthropic Messages 的能力判定语义，不再把 `/v1/responses` 直接等同于 Codex 专属能力。
- 在现有路径能力路由基础上，新增“路径协议族 + 请求头画像”的二阶段判定，将 OpenAI Responses 拆分为通用能力与 Codex CLI 专属能力，将 Anthropic Messages 拆分为通用能力与 Claude Code 专属能力。
- 更新代理入口的最终能力解析逻辑，使 `/v1/responses`、`/v1/messages` 在命中路径协议族后，继续根据请求头特征解析最终能力，再进入候选上游过滤。
- 更新上游能力配置、校验和管理端展示，允许管理员显式配置“通用协议上游”和“CLI 专属上游”，避免 generic 请求进入 client-only 上游。
- 更新会话亲和和头部补偿规则，使其按新的最终能力集合生效，并保持现有 session 提取与补偿来源优先级的兼容性。
- 增加历史能力配置与补偿规则的迁移策略，确保旧的 `codex_responses` 配置不会在升级后继续制造错误路由。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `path-based-routing`: 路径能力匹配从“纯路径直出最终能力”升级为“协议族匹配 + CLI 请求画像识别 + 最终能力解析”。
- `upstream-route-capabilities`: 上游能力配置需支持同一协议族下的通用能力与 CLI 专属能力拆分，并定义旧能力值的迁移语义。
- `session-affinity`: 会话标识提取、绑定范围与累计 token 统计需要覆盖新的 Responses 与 Messages CLI 专属能力。
- `session-header-compensation`: 补偿规则的适用能力集合与内置 `Session ID Recovery` 规则需要适配新的能力拆分结果。

## Impact

- 受影响后端：`src/lib/route-capabilities.ts`、`src/lib/services/route-capability-matcher.ts`、`src/app/api/proxy/v1/[...path]/route.ts`、`src/lib/services/session-affinity.ts`、`src/lib/services/compensation-service.ts`、`src/lib/services/route-capability-migration.ts`。
- 受影响管理端：上游创建/更新接口、能力多选组件、能力徽章展示、相关中英文文案与日志中的能力名称展示。
- 受影响数据：`upstreams.route_capabilities` 与 `compensation_rules.capabilities` 的历史值需要迁移或规范化，避免旧值在新语义下继续表示错误含义。
- 受影响测试：路径能力匹配、代理路由、会话亲和、补偿规则、上游 CRUD 与表单组件测试需要按新能力模型重写。

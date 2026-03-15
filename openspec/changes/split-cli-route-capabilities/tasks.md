## 1. 能力模型与迁移契约

- [x] 1.1 更新 `src/lib/route-capabilities.ts`、`src/types/api.ts` 与相关文案定义，引入 `openai_responses`、`codex_cli_responses`、`claude_code_messages`，并扩展 `route_match_source` 的类型与展示语义。
- [x] 1.2 更新 upstream 与 compensation rule 的能力值归一化逻辑，完成旧 `codex_responses` 到新能力集合的迁移映射与日志提示。
- [x] 1.3 调整管理端与 Admin API 的能力枚举校验，确保新能力集合可以被创建、更新、读取和回显。

## 2. 路由主链重构

- [x] 2.1 重构 `route-capability-matcher`，将 Responses / Messages 的判定拆为“协议族匹配 + header CLI 画像识别 + 最终能力解析”。
- [x] 2.2 更新 `src/app/api/proxy/v1/[...path]/route.ts`，实现 CLI 专属能力的精确候选优先与 generic capability fallback，并保持现有授权、可用性、故障转移链路可复用。
- [x] 2.3 更新路由日志、用户提示与相关观测输出，使其能够显示新的最终能力名称以及 `path_header_profile` 匹配来源。

## 3. 会话亲和与补偿规则适配

- [x] 3.1 调整 `session-affinity` 的会话提取与 affinity scope 逻辑，使 `openai_responses` / `codex_cli_responses` 与 `anthropic_messages` / `claude_code_messages` 按新能力模型工作。
- [x] 3.2 调整 `compensation-service` 的内置 `Session ID Recovery` 规则和历史规则迁移逻辑，使其覆盖新的 Responses 能力集合。
- [x] 3.3 校验 CLI 请求发生 generic fallback 时，session 绑定、补偿头注入与请求日志仍以最终 CLI 能力语义运行，不与通用能力混淆。

## 4. 管理端与辅助服务适配

- [x] 4.1 更新 upstream 管理相关组件，包括能力多选、徽章、列表、测试连接与文案展示，明确区分通用协议能力和 CLI 专属能力。
- [x] 4.2 更新 Header Compensation、日志详情和相关表格/时间线组件，确保新能力名称、匹配来源和回显行为一致。
- [x] 4.3 调整 `upstream-connection-tester`、API transformer 与其他依赖 `RouteCapability` 的辅助服务，使其与新枚举保持一致。

## 5. 测试与发布验证

- [x] 5.1 重写并补齐 route capability matcher、proxy route、session affinity、compensation service、upstream CRUD 与前端组件测试，覆盖 generic / CLI 专属 / fallback 三类路径。
- [x] 5.2 增加迁移测试，验证历史 `codex_responses` upstream 与 compensation rule 数据能被正确改写并给出预期提示。
- [x] 5.3 运行质量门禁与 OpenSpec 状态检查，确认 lint、测试、类型检查和 `openspec status --change split-cli-route-capabilities` 全部通过。

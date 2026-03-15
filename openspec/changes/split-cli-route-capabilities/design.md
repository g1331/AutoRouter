## Context

当前代理链路把路径命中的结果直接当成最终能力使用：

```text
POST /v1/responses  -> codex_responses
POST /v1/messages   -> anthropic_messages
```

这让系统无法区分两类本来就不同的对象：

1. 协议族本身是否匹配，例如 OpenAI Responses、Anthropic Messages。
2. 请求是否来自带专属头部画像的 CLI 客户端，例如 Codex CLI、Claude Code CLI。

在现有实现里，`matchRouteCapability()` 只接收 `method + path`，`route.ts` 再直接用这个 capability 过滤上游候选；`session-affinity` 与 `compensation-service` 也都沿着同一个能力值继续执行。结果就是一旦某个上游只能服务 CLI 请求，generic 请求仍然有机会被发过去。

相关约束：

- 现有系统的大部分下游逻辑都围绕单个 `RouteCapability` 运转，不适合把“协议能力”和“客户端画像”拆成两套并行主键。
- Codex CLI 与 Claude Code CLI 的识别必须以请求头为主，不能依赖请求体中的 system text 或其他不稳定内容。
- 历史配置已经存在，升级时无法自动推断某个旧上游到底是“通用协议上游”还是“CLI 专属上游”，迁移必须显式说明取舍。

目标流程：

```text
Client Request
   |
   v
Match protocol family by method + path
   |
   v
Inspect CLI headers for family-specific profile
   |
   v
Resolve final capability
   |
   v
Prefer exact capability candidates
   |
   v
Fallback to generic family candidates (CLI requests only)
   |
   v
Tiered selection + failover + affinity + compensation
```

管理端关键场景示意：

```text
+--------------------------------------------------------------+
| 上游能力配置                                                 |
|--------------------------------------------------------------|
| OpenAI                                                       |
| [ OpenAI Responses ] [ Codex CLI Responses ]                 |
|                                                              |
| Anthropic                                                    |
| [ Anthropic Messages ] [ Claude Code Messages ]              |
|                                                              |
| 提示：                                                       |
| - 通用能力用于协议级兼容                                     |
| - CLI 专属能力仅匹配命中特定头部画像的请求                   |
+--------------------------------------------------------------+
```

## Goals / Non-Goals

**Goals:**

- 将 `/v1/responses` 与 `/v1/messages` 的最终能力判定从“纯路径直出”升级为“协议族匹配 + CLI 头部画像识别”。
- 引入新的最终能力集合：`openai_responses`、`codex_cli_responses`、`anthropic_messages`、`claude_code_messages`。
- 保持路由主链仍以单个 `RouteCapability` 为核心，复用现有候选过滤、故障转移、会话亲和和日志结构。
- 让 CLI 专属请求优先命中 CLI 专属上游，但在缺少专属候选时仍可安全回退到同协议的通用上游。
- 让 generic 请求永远不会落到仅声明 CLI 专属能力的上游。
- 明确旧能力值、补偿规则和管理端配置的迁移语义。

**Non-Goals:**

- 不引入新的 provider 维度或重新恢复 `provider_type`。
- 不让请求体 system prompt、正文文案或录制样本内容参与 CLI 画像识别。
- 不改变现有优先级、权重、熔断、并发容量与故障转移算法本身。
- 不在本次变更中重做 Header Compensation 页面结构，只要求其正确识别新的能力值。

## Decisions

### Decision 1：将路径匹配拆成“协议族匹配”和“最终能力解析”两步

`route-capability-matcher` 不再把 `/v1/responses` 直接映射为最终能力，而是先得到协议族，再根据请求头解析最终能力。

建议的协议族到最终能力关系：

| 协议族 | generic 最终能力 | CLI 专属最终能力 |
| --- | --- | --- |
| Responses | `openai_responses` | `codex_cli_responses` |
| Messages | `anthropic_messages` | `claude_code_messages` |
| Chat / Extended / Gemini | 保持现状 | 无 |

这样可以保留“单一最终能力”这个运行时主键，同时把 CLI 画像识别收敛在 matcher 附近，而不是把 header 判断散落到候选过滤或 session 逻辑里。

备选方案：

- 继续让 `matchRouteCapability()` 直接返回最终能力。缺点是 path matcher 会混入大量 header 逻辑，后续做 generic fallback 时也不直观。
- 单独引入 `clientProfile` 并让下游同时依赖 `RouteCapability + ClientProfile`。缺点是改动面会显著扩大，现有服务与类型难以平滑复用。

### Decision 2：CLI 请求采用“专属优先，通用回退”

对命中 CLI 画像的请求，候选集构建采用两层顺序：

```text
final capability = codex_cli_responses
  -> 先尝试 codex_cli_responses 候选
  -> 若经过授权/可用性过滤后为空
     -> 回退到 openai_responses 候选

final capability = claude_code_messages
  -> 先尝试 claude_code_messages 候选
  -> 若经过授权/可用性过滤后为空
     -> 回退到 anthropic_messages 候选
```

对 generic 请求不允许反向命中 CLI 专属能力：

```text
openai_responses request -> 只能看 openai_responses
anthropic_messages request -> 只能看 anthropic_messages
```

这样可以同时满足两件事：

- CLI-only upstream 可以被严格隔离，generic 请求不会误入。
- 没有配置专属 upstream 的环境下，CLI 客户端仍能继续使用通用协议上游，不会因为拆分能力而整体不可用。

备选方案：

- CLI 请求只允许专属能力，不做回退。缺点是升级后会直接打断尚未补配专属 upstream 的环境。
- CLI 请求与 generic 请求都同时混入两层候选。缺点是专属 upstream 的隔离语义会被破坏。

### Decision 3：CLI 画像识别严格使用请求头信号

Codex CLI 识别信号：

- `originator=codex_cli_rs`
- `user-agent` 以 `codex_cli_rs/` 开头
- 存在任意 `x-codex-*` 头部

Claude Code 识别信号：

- `anthropic-beta` 中包含 `claude-code-`
- 或同时满足 `user-agent` 以 `claude-cli/` 开头且 `x-app=cli`

这里的设计原则是“强信号优先，组合信号兜底”，但全部限定在 header 内完成，不读取请求体中的 system text、`x-anthropic-billing-header` 文本片段或录制样本特征。

备选方案：

- 把 `session_id` 当作 Codex CLI 识别条件。缺点是它更像会话信号，不足以区分 generic Responses 客户端。
- 读取请求体中的 system prompt 或 billing text。缺点是稳定性差，也偏离了“必须依赖 header”的约束。

### Decision 4：路由日志记录最终能力，并扩展匹配来源语义

日志继续以 `matched_route_capability` 为主，但 `route_match_source` 需要从单值 `path` 扩展为至少两种语义：

- `path`：仅靠路径协议族即可确定最终能力
- `path_header_profile`：路径先命中协议族，再由 header 画像解析出 CLI 专属最终能力

这能保证后台排查时看得到“为什么同样是 `/v1/responses`，有的请求命中通用能力，有的命中 CLI 专属能力”。

备选方案：

- 保持 `route_match_source=path` 不变。缺点是观测上会丢失这次变更最关键的判定来源。
- 新增独立 `client_profile` 字段。缺点是改动更大，本次没有必要先引入第二个观测主轴。

### Decision 5：Session affinity 与补偿规则按“协议共享提取逻辑，能力保持独立 scope”

会话提取规则按协议族共享：

- `openai_responses` 与 `codex_cli_responses` 共用现有 OpenAI Responses 风格的 session 提取顺序
- `anthropic_messages` 与 `claude_code_messages` 共用现有 Anthropic `metadata.user_id` 提取逻辑

但 affinity scope 继续使用最终 capability，不因为 CLI 请求发生 generic fallback 而降级为通用能力。也就是说，Codex CLI 请求即使因为没有专属上游而回退到了 `openai_responses` 上游，它的亲和性 scope 仍然是 `codex_cli_responses`，不得和 generic Responses 请求共享绑定。

补偿规则方面，内置 `Session ID Recovery` 改为覆盖 `openai_responses` 与 `codex_cli_responses`，因为这两个能力共享同一套 Responses 协议级 session 字段，而不是只服务某一个客户端名称。

### Decision 6：迁移策略优先保证语义清晰，并对歧义配置发出明确提示

新的能力语义无法从旧数据中完全自动推断，因此迁移采用以下原则：

- 代码与类型层面移除旧的 `codex_responses` 枚举值，引入 `openai_responses` 与 `codex_cli_responses`
- 历史 upstream 中的 `codex_responses` 在迁移时写为 `openai_responses`
- 历史 `anthropic_messages` 保持不变，`claude_code_messages` 需要管理员显式启用
- 历史 compensation rule 中的 `codex_responses` 迁移为 `openai_responses` 与 `codex_cli_responses`
- 启动日志与迁移日志需要明确提示管理员：若某个 upstream 实际上只允许 Codex CLI 或 Claude Code CLI，请手动收窄为 CLI 专属能力，避免 generic 请求继续命中

这样做的原因是：旧的 `codex_responses` 记录并不能可靠推断管理员原本想表达“通用 Responses”还是“Codex-only”。默认迁到 generic 能最大限度保住现有协议可用性，再通过 CLI 专属优先匹配和运维提示逐步完成隔离收口。

## Risks / Trade-offs

- [旧配置语义存在歧义] → 迁移无法自动分辨某个旧 upstream 是否本来就是 CLI-only；通过启动告警、迁移日志和管理端复核来降低误配持续时间。
- [CLI 专属候选为空时的回退可能掩盖配置缺失] → 日志中必须记录本次是否发生了 CLI -> generic fallback，便于后续运维补配专属 upstream。
- [能力名称与 UI 文案变更范围大] → 统一从 `ROUTE_CAPABILITY_DEFINITIONS` 和 i18n 派生文案，避免出现后端已改名但前端仍展示旧名称。
- [RouteMatchSource 扩展会影响日志展示与类型] → 同步更新 `src/types/api.ts`、日志表格与路由决策时间线，保证旧数据仍可按兼容值显示。

## Migration Plan

1. 引入新的 route capability 枚举、provider map 与管理端展示定义。
2. 重构 matcher 与代理入口，先完成“协议族匹配 + header 画像 + 最终能力解析 + CLI generic fallback”。
3. 更新 session-affinity、compensation-service 和相关日志结构，使其识别新的最终能力。
4. 执行能力迁移：
   - `upstreams.route_capabilities`: `codex_responses` -> `openai_responses`
   - `compensation_rules.capabilities`: `codex_responses` -> `openai_responses` + `codex_cli_responses`
5. 发布后通过日志检查仍使用 generic upstream 承接 CLI 请求的情况，指导管理员把 client-only upstream 收窄到 CLI 专属能力。

回滚策略：

- 回滚到旧版本代码，并恢复旧的 capability 枚举与 matcher 行为。
- 若数据库中已完成新能力值迁移，回滚脚本需要把 `openai_responses` 和 `codex_cli_responses` 合并回 `codex_responses`。

## Open Questions

- 当前暂无阻塞实现的开放问题；如后续发现运维侧仅靠日志提示不足，再单独评估是否新增“能力迁移待确认”管理提示。

## Why

当前实现仍保留了 `provider_type` 兼容字段与模型兜底路由。对于本项目主场景（Codex CLI、Claude Code CLI、Gemini CLI 等），这会持续引入双路由逻辑和配置歧义：请求本质由路径能力决定，但系统仍允许通过模型/提供商分流。

在正式首个版本之前，需要把路由原理收敛到单一标准：**仅按请求路径能力路由**，并彻底移除 `provider_type` 兼容字段，避免后续再背兼容债务。

## What Changes

- 删除 `provider_type/providerType` 字段在数据模型、服务层、Admin API、前端表单中的配置入口与返回字段。
- 删除模型兜底链路：未命中路径能力时不再 `routeByModel`，而是直接返回“未匹配路径能力”错误。
- 路由选择统一为：路径能力命中 → 授权过滤 → 可用性过滤 → 分层加权与故障转移。
- 路径能力匹配增加标准化：同时兼容 `v1/...` 完整路径和代理内部子路径（例如 `responses`）。
- 负载均衡入口改为“按候选上游集合选择”，不再以 provider 作为选择主键。
- 会话亲和性和 token 累计完全基于 `routeCapability` 维度，移除 provider fallback 分支。
- 管理端移除“兼容提供商”配置区，仅保留路径能力配置与兼容模型规则（`allowed_models` / `model_redirects`）的独立语义。
- 路由日志中的 `route_match_source` 收敛为 `path`，不再记录 `model_fallback`。
- 路由失败早返回补齐结构化告警日志，便于区分“未命中能力 / 无候选 / 未授权 / 候选不可用”四类问题。
- 明确 `base_url` 与 `path` 采用直接拼接规则，若上游接口实际地址是 `/v1/...`，则 `base_url` 需要配置到 `/v1`。
- 迁移阶段仅做能力集合规范化与历史 `provider_type` 数据清理，不再依赖 provider 默认映射。

## Capabilities

### New Capabilities
- `path-based-routing`: 基于请求路径和方法的能力路由判定与候选集构建。
- `upstream-route-capabilities`: 上游多能力声明、校验、存储与管理。

### Modified Capabilities
- `session-affinity`: 会话亲和性仅按能力类型提取与绑定，不再接受 provider 类型输入。

## Impact

- 受影响后端：`src/app/api/proxy/v1/[...path]/route.ts`、`src/lib/services/load-balancer.ts`、`src/lib/services/session-affinity.ts`、`src/lib/services/upstream-crud.ts`。
- 受影响数据模型：`upstreams` 表移除 `provider_type` 字段。
- 受影响 API/类型：`src/types/api.ts` 与 admin upstream 接口请求/响应结构移除 `provider_type`。
- 受影响前端：上游管理页移除“兼容提供商”配置与展示列。
- 测试影响：代理路由、上游 CRUD、负载均衡、会话亲和、表单与列表组件测试需要按新契约重写。

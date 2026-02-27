## Context

AutoRouter 作为 AI API 网关，负责将客户端请求路由至多个上游 AI 服务。Codex CLI 在请求头中携带 `session_id` 以实现会话亲和性，但 Cloudflare 在传输过程中会剥离该头部。commit 7647573 已实现从请求体字段（如 `previous_response_id`）中回退提取 `session_id`，但提取到的值从未被重新注入到发往上游的出站请求头中，导致上游服务始终无法感知会话标识。

此外，`cf-ew-via`（Cloudflare Edge Worker 路由头）当前未被过滤，会随请求泄漏至上游服务，属于信息泄露问题。

本设计引入一套可配置的出站头部补偿机制，解决上述两个问题，并为未来扩展其他头部补偿场景提供通用框架。

## Goals / Non-Goals

**Goals:**

- 将从请求头或请求体中提取的 `session_id` 重新注入到发往上游的出站请求头中
- 提供可配置的补偿规则系统，支持内置规则与自定义规则
- 在请求日志中记录头部变更差异（仅记录头部名称，不记录值）
- 在管理界面提供补偿规则管理页面与日志头部差异可视化
- 修复 `cf-ew-via` 头部泄漏问题

**Non-Goals:**

- 不支持对响应头部进行补偿
- 不记录头部的具体值（安全考量）
- 不支持跨请求的头部状态传递
- 不修改现有的会话亲和性路由逻辑

## Decisions

### 决策 1：补偿规则存储于数据库，运行时内存缓存

**选择**：规则持久化存储在 `compensation_rules` 表，服务启动时加载至内存，并设置短 TTL（60 秒）自动刷新。

**理由**：规则变更频率极低，内存缓存可避免每次请求都查询数据库。相比纯内存配置，数据库存储支持运行时动态修改，无需重启服务。

**备选方案**：环境变量配置——不支持运行时修改，排除。

---

### 决策 2：`extractSessionId()` 返回值扩展为包含来源元数据

**选择**：返回 `{ sessionId: string | null; source: "header" | "body" | null }` 而非仅返回 `string | null`。

**理由**：补偿引擎需要知道 `session_id` 是从哪里提取的，以便在日志中记录 `header_diff.compensated[].source`，同时也为路由决策时间线提供展示数据。

**影响**：所有调用 `extractSessionId()` 的地方需同步更新，但调用点数量有限（主要在 `route.ts` 和 `session-affinity.ts` 内部）。

---

### 决策 3：`cf-` 前缀过滤 + `cf-aig-*` 豁免

**选择**：在 `INFRASTRUCTURE_REQUEST_HEADERS` 中明确列出 `cf-ew-via`，同时考虑对 `cf-` 前缀整体过滤但豁免 `cf-aig-*`（AutoRouter 自身使用的 Cloudflare AI Gateway 头部）。

**理由**：精确列举比前缀规则更安全，避免误过滤合法头部。`cf-aig-*` 是 AutoRouter 依赖的头部，必须豁免。

---

### 决策 4：`header_diff` 以 JSONB（PostgreSQL）/ TEXT JSON（SQLite）存储

**选择**：在 `request_logs` 表新增 `header_diff` 列，类型为 JSONB（PostgreSQL）或 TEXT（SQLite，存储 JSON 字符串）。

**结构**：
```
{
  inbound_count: number,
  outbound_count: number,
  dropped: string[],          // 被过滤的头部名称列表
  auth_replaced: string|null, // 被替换的认证头部名称
  compensated: [{ header: string, source: string }]
}
```

**理由**：JSONB 支持索引查询，TEXT 保持 SQLite 兼容性。仅存储头部名称不存储值，满足安全要求。

---

### 决策 5：内置规则可禁用但不可删除

**选择**：`isBuiltin: true` 的规则在 UI 中隐藏删除按钮，仅允许切换 `enabled` 状态。

**理由**：内置规则是系统核心功能的一部分，删除后可能导致会话亲和性完全失效。允许禁用是为了给用户提供紧急关闭能力。

---

### 决策 6：补偿模式仅支持 `missing_only`

**选择**：当前版本仅实现 `missing_only` 模式（仅在出站请求中该头部缺失时才注入）。

**理由**：`missing_only` 覆盖了 Cloudflare 剥离头部的核心场景，且不会覆盖上游已有的头部值，安全性更高。`always_override` 模式留待未来版本按需实现。

## 数据模型

### compensation_rules 表

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | 规则显示名称 |
| is_builtin | BOOLEAN | 是否为内置规则 |
| enabled | BOOLEAN | 是否启用 |
| capabilities | TEXT | JSON 数组，RouteCapability 列表 |
| target_header | TEXT | 目标注入头部名称 |
| sources | TEXT | JSON 数组，来源路径有序列表 |
| mode | TEXT | 补偿模式，当前仅 `missing_only` |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### request_logs 表新增字段

| 列名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| session_id_compensated | BOOLEAN | false | 本次请求是否执行了 session_id 补偿 |
| header_diff | JSONB/TEXT | null | 头部差异结构（仅存头部名称） |

## 系统流程

```
客户端请求
    │
    ▼
route.ts (入口)
    │
    ├─ extractSessionId() → { sessionId, source }
    │
    ├─ compensation-service.buildCompensations(capability, headers, body)
    │       │
    │       ├─ 从缓存/DB 加载匹配当前 capability 的规则
    │       └─ 按 sources 优先级解析值 → 返回 compensationHeaders[]
    │
    ├─ forwardWithFailover(request, { compensationHeaders })
    │       │
    │       └─ proxy-client.forwardRequest()
    │               │
    │               ├─ 过滤基础设施头部（含 cf-ew-via）
    │               ├─ 注入 compensationHeaders（missing_only 模式）
    │               └─ 返回 { response, headerDiff }
    │
    └─ request-logger.log({ sessionIdCompensated, headerDiff })
```

## 前端布局设计

### System > Header Compensation 页面

```
┌─────────────────────────────────────────────────────────┐
│ System / Header Compensation                            │
├─────────────────────────────────────────────────────────┤
│ 补偿规则列表                              [+ 新增规则]  │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [内置] Session ID Recovery          [启用 ●] [编辑] │ │
│ │ 目标头部: session_id                                │ │
│ │ 适用能力: codex_responses, openai_chat_compatible.. │ │
│ │ 来源优先级: headers.session_id > body.previous_... │ │
│ └─────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ [自定义] My Rule                [启用 ●] [编辑][删] │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ 能力矩阵                                                │
│ ┌──────────────────────┬──────────────┬──────────────┐  │
│ │ 能力                 │ 规则数       │ 状态         │  │
│ ├──────────────────────┼──────────────┼──────────────┤  │
│ │ codex_responses      │ 1            │ 活跃         │  │
│ │ openai_chat_compat.. │ 1            │ 活跃         │  │
│ │ openai_extended      │ 1            │ 活跃         │  │
│ └──────────────────────┴──────────────┴──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 日志详情 - 头部差异面板

```
┌─────────────────────────────────────────────────────────┐
│ 头部变更详情                                            │
├──────────────┬──────────────────────────────────────────┤
│ 入站头部数   │ 12                                       │
│ 出站头部数   │ 10                                       │
├──────────────┼──────────────────────────────────────────┤
│ 已过滤       │ cf-ew-via, x-forwarded-for               │
│ 认证替换     │ authorization                            │
│ 已补偿       │ session_id  (来源: body.previous_resp..) │
└──────────────┴──────────────────────────────────────────┘
```

### 路由决策时间线 - 补偿标记

```
Stage 2: 上游选择
  ┌─────────────────────────────────────────────────────┐
  │ upstream-prod-01  [会话亲和]  [⚡ 补偿 body]        │
  └─────────────────────────────────────────────────────┘
```

`⚡ 补偿` 徽章悬停时显示 tooltip：`session_id 已从 body.previous_response_id 补偿注入`

## Risks / Trade-offs

- **规则缓存一致性** → 缓存 TTL 60 秒，规则变更最多延迟 60 秒生效；管理 API 写入后主动失效缓存可将延迟降至 0，但增加实现复杂度，当前版本接受 60 秒延迟
- **来源路径解析安全性** → `sources` 中的路径仅允许 `headers.*` 和 `body.*` 两种前缀，解析时严格校验，防止路径遍历
- **SQLite JSONB 兼容性** → SQLite 不支持 JSONB，`header_diff` 在 SQLite 中存储为 TEXT，查询时需应用层解析；当前无 SQLite JSON 查询需求，可接受
- **`extractSessionId()` 返回值变更** → 属于内部 API 变更，需同步更新所有调用点；调用点数量有限，风险可控

## Migration Plan

1. 执行数据库迁移：`request_logs` 新增 2 列，新建 `compensation_rules` 表
2. 迁移脚本同时 seed 内置 "Session ID Recovery" 规则（`is_builtin=true, enabled=true`）
3. 部署新版本代码（向后兼容：新字段有默认值，旧日志记录不受影响）
4. 验证：发送含 `previous_response_id` 的请求，确认日志中 `session_id_compensated=true`

**回滚**：禁用内置规则（UI 操作）即可关闭补偿行为，无需回滚代码。

## Open Questions

- `cf-` 前缀整体过滤是否会影响某些合法的 Cloudflare 头部？需在测试环境验证完整的头部列表后确认豁免范围。

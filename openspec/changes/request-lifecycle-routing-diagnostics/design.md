## Context

当前实现已经具备部分诊断基础：代理入口会先写入 in-progress 日志，再在成功或失败路径更新 `request_logs`；失败路径也会记录 `did_send_upstream`、`failure_stage` 与 `failover_history`。  
但现状存在三个关键断点：

- 路由决策候选的 `circuit_state` 在构建日志时被固定为 `closed`，导致“熔断却显示正常”的误导。
- 管理端日志列表的主状态仍以 `status_code` 为中心，用户难以直接理解请求处于哪个阶段。
- 上游失败响应虽然在后端部分保留，但前端缺少统一可读展示，排障需要跨位置、跨步骤拼凑信息。

目标是先修正日志与语义层的正确性，再在最后统一做“单条横向步骤轨道”UI 收口，减少交互步骤。

## Goals / Non-Goals

**Goals:**

- 提供稳定、可复用的请求生命周期状态模型（决策中、请求中、已完成成功、已完成失败）。
- 修复候选上游熔断状态显示错误，确保路由详情与真实 circuit breaker 状态一致。
- 在日志数据中保留并输出可读的上游失败证据（状态码、错误消息、错误体摘要）。
- 以单行横向步骤轨道展示阶段与耗时，默认无需展开即可完成主要诊断。
- 任务顺序明确：后端正确性与证据能力优先，UI 任务最后执行。

**Non-Goals:**

- 不改变下游返回错误协议（不向调用方透传上游原始错误体）。
- 不引入新的外部依赖或可视化库。
- 不在本变更中重构全部日志页面布局与筛选系统，仅覆盖请求阶段与诊断链路相关区域。

## Decisions

### Decision 1: 生命周期状态采用“派生模型”，不新增独立状态列

**Choice:** 通过现有字段派生主状态，避免新增强耦合字段。

- `status_code == null && did_send_upstream == false` -> `decision`
- `status_code == null && did_send_upstream == true` -> `requesting`
- `status_code in 2xx` -> `completed_success`
- `status_code >= 400` -> `completed_failed`

**Why:** 现有数据链路已覆盖关键判定条件，新增状态列会带来一致性维护成本（写入路径多、回放复杂）。

**Alternative considered:** 增加数据库字段 `lifecycle_status`。  
**Rejected because:** 需要在多条更新路径保持强一致，且无法自然覆盖历史数据。

### Decision 2: 候选 `circuit_state` 来源统一为 load-balancer 真实状态

**Choice:** 在路径路由决策构建阶段引入真实 circuit breaker state，而不是默认值。

**Why:** 这是高优先级 correctness bug，必须以真实数据为唯一来源，避免运维误判。

**Alternative considered:** 在前端按 `excluded.reason` 推断状态。  
**Rejected because:** 推断不完整，无法覆盖 half-open 与可探测 open 的状态边界。

### Decision 3: 上游失败证据采用“保留 + 脱敏 + 截断”策略

**Choice:** 后端持久化可诊断字段并在管理端展示摘要；原始大体积内容仅保留有限长度且脱敏。

**Why:** 用户需要看到上游返回什么错误，但也必须防止敏感信息泄露与日志膨胀。

**Alternative considered:** 完全不展示上游响应体，只展示 `error_message`。  
**Rejected because:** 诊断价值不足，无法回答“上游到底返回了什么”。

### Decision 4: UI 采用“单行横向步骤轨道 + 段内子耗时”

**Choice:** 默认不展开，单行展示阶段与耗时；段内直接展示关键子耗时（例如 TTFT、生成耗时）。

**Why:** 符合“一步操作到结果”的目标，降低额外点击成本。

**Alternative considered:** 维持现有展开式时间线作为主交互。  
**Rejected because:** 主链路信息需要二次操作才能看全，不符合本次体验目标。

### Decision 5: 实施顺序固定为“后端先行，UI 收尾”

**Choice:** 先修日志正确性与证据链，再完成前端轨道化改造。

**Why:** UI 依赖语义稳定的输入，先改视图会放大返工风险。

## 可视化设计稿

### 1) 后端数据与状态派生流程

```text
┌──────────────────────────────────────────────────────────────┐
│ proxy request                                                │
└───────────────┬──────────────────────────────────────────────┘
                │ logRequestStart (status_code=null)
                ▼
        ┌───────────────┐
        │ request_logs   │
        │ in-progress    │
        └──────┬─────────┘
               │ success / failure updateRequestLog
               ▼
    ┌─────────────────────────────┐
    │ routing_decision + history  │
    │ did_send_upstream           │
    │ failure_stage               │
    │ upstream error evidence     │
    └───────────┬─────────────────┘
                ▼
      lifecycle status derived for UI
```

### 2) 日志单行横向步骤轨道（默认态，无展开）

```text
[决策 18ms]──[请求 42ms]──[响应 TTFT 320ms | 生成 740ms]──[完成 200]
                          └─ 失败时示例: 429 · rate_limit · message...
```

### 3) 视觉层级说明

| 层级 | 内容 | 说明 |
|---|---|---|
| L1 | 阶段主标签（决策/请求/响应/完成） | 首屏可读，固定顺序 |
| L2 | 段耗时/子耗时 | 同行展示，避免额外交互 |
| L3 | 失败摘要 | 仅在失败段显示（码+类型+摘要） |
| L4 | 原始详情入口 | 次级入口，用于查看完整错误体 |

## Risks / Trade-offs

- [风险] 历史日志缺少部分字段导致派生状态不完整 -> [缓解] 增加兜底映射规则并显式标记 `unknown`。
- [风险] 上游错误体包含敏感信息 -> [缓解] 服务端统一脱敏、字段白名单、长度截断。
- [风险] 单行轨道信息密度过高影响移动端可读性 -> [缓解] 移动端保留主阶段与关键耗时，次要信息折叠为短文本。
- [风险] 修复 `circuit_state` 后暴露更多“真实异常”，短期告警量上升 -> [缓解] 发布说明明确“展示修正而非新故障”。

## Migration Plan

1. 后端阶段  
先落地 `circuit_state` 正确来源、失败证据字段规范化、状态派生逻辑与测试。

2. API 与类型阶段  
扩展响应字段并保持向后兼容；旧字段继续可用，新字段可选读取。

3. UI 阶段（最后）  
替换日志主轨道展示为单行步骤条，接入阶段与子耗时；保留失败摘要直出。

4. 发布与回滚  
若 UI 出现可读性回归，可仅回滚前端轨道渲染；后端正确性修复保持不回退。

## Open Questions

- 上游错误体摘要的默认截断长度是否统一为 500 字符，还是按 provider 细分？
- 单行轨道在移动端是否采用 3 段压缩模式（将“完成”并入响应段）？
- 完整错误体查看入口是否需要权限细分（仅管理员 vs 所有后台登录用户）？

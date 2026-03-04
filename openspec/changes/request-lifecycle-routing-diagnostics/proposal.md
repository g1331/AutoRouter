## Why

当前请求日志在用户视角仍存在三类关键问题：请求阶段状态不清晰、路由决策中的熔断状态可能误报为正常、上游失败响应细节在管理端不可直接查看。结果是排障路径长、误判概率高、用户需要多次操作才能定位问题。

现在需要把请求生命周期与路由诊断做一次“清洁版”收敛：先修正后端与日志语义层面的正确性问题，再在最后阶段统一升级 UI 呈现，确保“单步可读、证据完整、可快速定位”。

## What Changes

- 统一请求生命周期语义，明确区分“决策中、请求中、已完成（成功/失败）”，并在日志数据模型中保留阶段判定所需信息。
- 修复路由决策候选中 `circuit_state` 显示错误的问题，确保熔断状态与真实 circuit breaker 状态一致。
- 增强上游失败诊断信息保留与管理端可见性，补全上游响应错误信息（状态码、错误消息、错误体摘要）在日志侧的可追溯链路。
- 将日志视图升级为单条横向步骤轨道，支持在一行内展示阶段与耗时（含首 token 与生成耗时等子类型），尽量避免额外展开操作。
- 调整任务顺序：先完成后端正确性与日志证据能力，再执行 UI 改造与交互收口。

## Capabilities

### New Capabilities

- `request-lifecycle-stage-observability`: 定义请求阶段状态模型、阶段耗时拆分口径、以及“单步可读”的日志展示契约。

### Modified Capabilities

- `routing-failover-observability`: 补充熔断状态准确性与上游失败响应细节可见性的要求，避免“熔断显示正常”与错误证据缺失。
- `performance-metrics-display`: 扩展日志侧性能展示要求，从单点指标扩展为阶段/子阶段耗时可视化（含 TTFT 与生成耗时语义）。

## Impact

- 代理与日志链路：`src/app/api/proxy/v1/[...path]/route.ts`、`src/lib/services/request-logger.ts`、`src/lib/services/load-balancer.ts`、`src/lib/services/circuit-breaker.ts`
- 类型与转换：`src/types/api.ts`、`src/lib/utils/api-transformers.ts`
- 管理端日志页面：`src/components/admin/logs-table.tsx`、`src/components/admin/routing-decision-timeline.tsx`、`src/app/[locale]/(dashboard)/logs/page.tsx`
- 文案与测试：`src/messages/en.json`、`src/messages/zh-CN.json`、`tests/components/admin/*`、`tests/unit/api/proxy/route.test.ts`
- API 兼容性：保持现有日志列表 API 兼容，在新增字段上采用向后兼容策略。

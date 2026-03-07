## Why

当前请求日志在用户视角有两个直接影响信任感的问题：第一，日志刷新不够及时，用户经常需要手动刷新或等待轮询才能看到最新状态；第二，请求在下游取消、网络中断或流式传输半途中断开后，日志有时仍停留在“进行中”或未能稳定收口，导致用户无法判断这次请求到底是完成、失败还是已取消。

这不仅让日志页面看起来“反应慢”，还会进一步污染统计口径，因为未及时收口的请求会混入进行中或异常状态，影响用户对系统健康度和请求结果的判断。现在需要把“日志是否及时”和“状态是否可信”一起收敛，先解决用户能否看懂、能否信任，再考虑具体实现手段。

## What Changes

- 新增请求日志“实时状态刷新”能力，使正在进行中的请求无需依赖手动刷新即可在短时间内看到状态变化。
- 统一下游取消、客户端断开、流式中断等场景的日志终态收口语义，确保请求不会长期停留在“进行中”。
- 为长时间未收口的进行中日志增加兜底收敛策略，避免日志页面和统计结果长期被脏状态污染。
- 在日志 UI 中继续以状态码作为主状态表达，请求进行中只保留加载指示，不再额外堆叠状态文字；同时把上游返回的错误信息用明确错误色突出。
- 保持现有日志列表 API 主体兼容，在新增实时刷新链路或状态字段时采用向后兼容策略。

## Capabilities

### New Capabilities

- `request-log-live-status`: 定义请求日志的近实时刷新体验、进行中请求的短延迟状态更新、以及日志列表对终态变化的可见性契约。

### Modified Capabilities

- `routing-failover-observability`: 补充下游取消、客户端断开、流式中断等场景在 request logs 中的终态收口、失败阶段和用户可见状态要求，避免“实际已断开但日志仍在进行中”。
- `performance-metrics-collection`: 补充进行中日志收口与统计口径的一致性要求，避免未完成或已取消请求长期占用进行中状态并污染后续指标聚合。

## Impact

- 代理与日志写入链路：`src/app/api/proxy/v1/[...path]/route.ts`、`src/lib/services/request-logger.ts`、`src/lib/services/proxy-client.ts`
- 日志 API 与类型转换：`src/app/api/admin/logs/route.ts`、`src/lib/utils/api-transformers.ts`、`src/types/api.ts`
- 管理端日志页面与数据拉取：`src/app/[locale]/(dashboard)/logs/page.tsx`、`src/hooks/use-request-logs.ts`、`src/components/admin/logs-table.tsx`
- 统计与聚合口径：`src/lib/services/stats-service.ts` 及依赖 `request_logs` 状态字段的相关统计逻辑
- 文案与测试：`src/messages/en.json`、`src/messages/zh-CN.json`、`tests/unit/api/proxy/route.test.ts`、`tests/unit/utils/api-transformers.test.ts`、日志页相关组件/Hook 测试

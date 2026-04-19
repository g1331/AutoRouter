## 1. 数据模型与接口契约

- [x] 1.1 在 `src/lib/db/schema-pg.ts`、`src/lib/db/schema-sqlite.ts` 与对应迁移中为 `upstreams` 新增 `queue_policy` 结构字段，并生成可通过一致性检查的 PostgreSQL 与 SQLite 迁移产物
- [x] 1.2 扩展 `src/types/api.ts`、`src/lib/utils/api-transformers.ts`、`src/lib/services/upstream-crud.ts` 与 Admin upstream API，使 `queue_policy` 能够被创建、更新、读取和回显
- [x] 1.3 在上游表单草稿归一化与提交校验中补齐 `enabled`、`timeout_ms`、`max_queue_length` 的默认值、空值和脏值比较语义

## 2. 队列准入运行时

- [x] 2.1 新建 `upstream-queue-admission` 运行时服务，统一管理活跃槽位、FIFO 等待队列、立即保留、入队等待、释放移交以及测试所需的快照与重置接口
- [x] 2.2 调整 `src/lib/services/load-balancer.ts` 的并发选择逻辑，保持同 tier 转移与跨 tier 降级优先，并且仅在所有即时候选都满载时输出可等待的目标上游
- [x] 2.3 在准入服务中实现“保留后移交”的唤醒顺序，并在等待项超时、客户端断开或已失效时继续检查下一项，保持 FIFO 语义稳定
- [x] 2.4 为被唤醒请求加入一次轻量复核与单次重选，确保上游在等待期间被停用、删除或显式不可用时能够释放保留槽位并回到现有候选流程

## 3. 代理入口与错误语义

- [x] 3.1 在 `src/app/api/proxy/v1/[...path]/route.ts` 接入等待分支，让请求在恢复执行、等待超时、队列已满或客户端断开前保持连接有效
- [x] 3.2 新增独立的等待超时与等待中断错误语义，明确区分 `concurrency_full`、等待超时、上游请求超时和上游故障，并保持健康检查与熔断计数不受影响
- [x] 3.3 收口普通响应、流式响应、异常失败与客户端断开的槽位释放路径，确保执行结束后总能触发准入服务的释放移交

## 4. 日志观测与管理端展示

- [x] 4.1 扩展 `RoutingDecisionLog`、请求日志写入与转换层，在 `routingDecision.queue` 下记录 `waiting`、`resumed`、`timed_out`、`aborted` 生命周期字段和等待耗时
- [x] 4.2 更新上游配置弹窗、hooks、API 客户端与中英文文案，提供 `queue_policy` 的编辑、回显和配置摘要展示
- [ ] 4.3 更新日志表格、紧凑视图与路由决策时间线，显示等待状态标识、等待终止链路和真实候选熔断状态

## 5. 测试与验收

- [ ] 5.1 为准入服务和并发选择逻辑补齐单元测试，覆盖即时成功、FIFO 恢复、队列上限、等待超时、客户端断开和保留移交顺序
- [ ] 5.2 为代理路由与管理端组件补齐测试，覆盖等待恢复执行、单次重选、流式释放、表单回显、紧凑视图标识和时间线展示
- [ ] 5.3 运行 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run` 与 `pnpm db:check:consistency`，确认本次变更达到可提交状态

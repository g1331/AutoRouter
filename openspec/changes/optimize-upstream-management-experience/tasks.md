## 0. 执行规范（线性工作流）

- 每完成一个任务，立即勾选对应任务。
- 阶段内允许累计改动，不进行任务级提交。
- 仅在当前阶段所有任务完成后，执行一次阶段质量门禁并进行一次阶段性提交。
- 每次阶段性提交前，必须通过质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`。

## 1. 阶段A：数据模型与契约基础（Schema/API）

- [ ] 1.1 新增 upstream 字段 `officialWebsiteUrl`、`maxConcurrency`（PG/SQLite）并生成 Drizzle 迁移
- [ ] 1.2 扩展 API 类型与 transformer：补齐 `official_website_url`、`max_concurrency`、`last_used_at`
- [ ] 1.3 扩展 admin upstream create/update 路由 schema 与 payload 映射，打通新字段读写
- [ ] 1.4 阶段A质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [ ] 1.5 提交阶段性 commit（包含阶段A全部改动与门禁修复）

## 2. 阶段B：运行态数据补齐（last_used 与并发占用）

- [ ] 2.1 在 upstream 列表查询链路增加 `last_used_at = MAX(request_logs.created_at)` 聚合，并处理“未使用”空值
- [ ] 2.2 在负载均衡层提供可读取的并发占用快照（`current_concurrency`）
- [ ] 2.3 将并发占用接入上游管理可读 API（与列表或状态接口保持一致）
- [ ] 2.4 阶段B质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [ ] 2.5 提交阶段性 commit（包含阶段B全部改动与门禁修复）

## 3. 阶段C：并发控制路由语义（满载转移且不熔断）

- [ ] 3.1 在候选筛选流程新增并发容量过滤（能力匹配后、加权选择前），实现 `concurrency_full` 排除
- [ ] 3.2 实现并发槽位占用与释放的完整生命周期（普通响应、流式响应、异常中断）
- [ ] 3.3 调整失败分类：并发满路径不调用 `markUnhealthy` 与 `recordFailure`
- [ ] 3.4 增加“所有候选并发满载”统一错误语义与用户提示文案
- [ ] 3.5 阶段C质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [ ] 3.6 提交阶段性 commit（包含阶段C全部改动与门禁修复）

## 4. 阶段D：可观测性增强（并发满转移日志闭环）

- [ ] 4.1 扩展类型枚举：`FailoverAttempt.error_type` 与 `RoutingExcluded.reason` 新增 `concurrency_full`
- [ ] 4.2 在 proxy 路由日志写入中记录并发满排除与转移证据（failover history + routing decision）
- [ ] 4.3 更新日志时间线数据映射，确保并发满原因在紧凑与详情视图均可识别
- [ ] 4.4 阶段D质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [ ] 4.5 提交阶段性 commit（包含阶段D全部改动与门禁修复）

## 5. 阶段E：Endpoint 配置体验升级（自动补全/预览/官网）

- [ ] 5.1 在 `upstream-form-dialog` 增加 `official_website_url` 与 `max_concurrency` 表单项及校验
- [ ] 5.2 实现能力感知 endpoint 自动补全与重复 `/v1` 告警规则
- [ ] 5.3 增加“最终请求地址预览框”，并保证与运行时转发地址语义一致
- [ ] 5.4 在上游列表/卡片增加官网跳转入口（无配置隐藏）
- [ ] 5.5 阶段E质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [ ] 5.6 提交阶段性 commit（包含阶段E全部改动与门禁修复）

## 6. 阶段F：上游页面视觉重构（工作台化）

- [ ] 6.1 重构 `upstreams/page.tsx` 页面骨架，加入运营控制条与状态筛选入口
- [ ] 6.2 将 `upstreams-table` 重构为 tier 分组卡片工作台（统一桌面/移动语义）
- [ ] 6.3 在运行态区聚合展示健康、熔断、配额、并发占用，并加入“并发已满”状态视觉
- [ ] 6.4 将列表默认时间指标从 `created_at` 替换为 `last_used_at`（未使用显示占位文案）
- [ ] 6.5 重构操作区主次分层，保留高频直达并收敛低频操作
- [ ] 6.6 阶段F质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [ ] 6.7 提交阶段性 commit（包含阶段F全部改动与门禁修复）

## 7. 阶段G：端到端回归与发布前收口

- [ ] 7.1 补齐并发控制、endpoint 体验、last_used、日志时间线的缺失单元/组件测试
- [ ] 7.2 执行全量回归与关键手工验证（并发满转移不熔断、预览一致、官网跳转、日志证据）
- [ ] 7.3 阶段G质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [ ] 7.4 提交阶段性 commit（阶段G收口与发布候选）

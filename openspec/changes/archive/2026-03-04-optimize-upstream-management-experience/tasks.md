## 0. 执行规范（线性工作流）

- 每完成一个任务，立即勾选对应任务。
- 阶段内允许累计改动，不进行任务级提交。
- 仅在当前阶段所有任务完成后，执行一次阶段质量门禁并进行一次阶段性提交。
- 每次阶段性提交前，必须通过质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`。

## 1. 阶段A：数据模型与契约基础（Schema/API）

- [x] 1.1 新增 upstream 字段 `officialWebsiteUrl`、`maxConcurrency`（PG/SQLite）并生成 Drizzle 迁移
- [x] 1.2 扩展 API 类型与 transformer：补齐 `official_website_url`、`max_concurrency`、`last_used_at`
- [x] 1.3 扩展 admin upstream create/update 路由 schema 与 payload 映射，打通新字段读写
- [x] 1.4 阶段A质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [x] 1.5 提交阶段性 commit（包含阶段A全部改动与门禁修复）

## 2. 阶段B：运行态数据补齐（last_used 与并发占用）

- [x] 2.1 在 upstream 列表查询链路增加 `last_used_at = MAX(request_logs.created_at)` 聚合，并处理“未使用”空值
- [x] 2.2 在负载均衡层提供可读取的并发占用快照（`current_concurrency`）
- [x] 2.3 将并发占用接入上游管理可读 API（与列表或状态接口保持一致）
- [x] 2.4 阶段B质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [x] 2.5 提交阶段性 commit（包含阶段B全部改动与门禁修复）

## 3. 阶段C：并发控制路由语义（满载转移且不熔断）

- [x] 3.1 在候选筛选流程新增并发容量过滤（能力匹配后、加权选择前），实现 `concurrency_full` 排除
- [x] 3.2 实现并发槽位占用与释放的完整生命周期（普通响应、流式响应、异常中断）
- [x] 3.3 调整失败分类：并发满路径不调用 `markUnhealthy` 与 `recordFailure`
- [x] 3.4 增加“所有候选并发满载”统一错误语义与用户提示文案
- [x] 3.5 阶段C质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [x] 3.6 提交阶段性 commit（包含阶段C全部改动与门禁修复）

## 4. 阶段D：可观测性增强（并发满转移日志闭环）

- [x] 4.1 扩展类型枚举：`FailoverAttempt.error_type` 与 `RoutingExcluded.reason` 新增 `concurrency_full`
- [x] 4.2 在 proxy 路由日志写入中记录并发满排除与转移证据（failover history + routing decision）
- [x] 4.3 更新日志时间线数据映射，确保并发满原因在紧凑与详情视图均可识别
- [x] 4.4 阶段D质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [x] 4.5 提交阶段性 commit（包含阶段D全部改动与门禁修复）

## 5. 阶段E：Endpoint 配置体验升级（自动补全/预览/官网）

- [x] 5.1 在 `upstream-form-dialog` 增加 `official_website_url` 与 `max_concurrency` 表单项及校验
- [x] 5.2 实现能力感知 endpoint 自动补全与重复 `/v1` 告警规则
- [x] 5.3 增加“最终请求地址预览框”，并保证与运行时转发地址语义一致
- [x] 5.4 在上游列表/卡片增加官网跳转入口（无配置隐藏）
- [x] 5.5 阶段E质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [x] 5.6 提交阶段性 commit（包含阶段E全部改动与门禁修复）

## 6. 阶段F：上游页面视觉重构（工作台化）

- [x] 6.1 重构 `upstreams/page.tsx` 页面骨架，加入运营控制条与状态筛选入口
- [x] 6.2 将 `upstreams-table` 重构为 tier 分组卡片工作台（统一桌面/移动语义）
- [x] 6.3 在运行态区聚合展示健康、熔断、配额、并发占用，并加入“并发已满”状态视觉
- [x] 6.4 将列表默认时间指标从 `created_at` 替换为 `last_used_at`（未使用显示占位文案）
- [x] 6.5 重构操作区主次分层，保留高频直达并收敛低频操作
- [x] 6.6 阶段F质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [x] 6.7 提交阶段性 commit（包含阶段F全部改动与门禁修复）

## 7. 阶段G：端到端回归与发布前收口

- [x] 7.1 补齐并发控制、endpoint 体验、last_used、日志时间线的缺失单元/组件测试
- [x] 7.2 执行全量回归与关键手工验证（并发满转移不熔断、预览一致、官网跳转、日志证据）
- [x] 7.3 阶段G质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`
- [x] 7.4 提交阶段性 commit（阶段G收口与发布候选）

## 8. 阶段H：配置可发现性补强（快速定位）

- [x] 8.1 在 `upstream-form-dialog` 增加“配置快速定位导航”，支持直接跳转到目标区块（基础信息与策略稳定性区块统一在同一滚动区域）
- [x] 8.2 补齐中英文导航文案并完成阶段H质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`

## 9. 阶段I：持续导航闭环（无需回顶部）

- [x] 9.1 在配置弹窗实现粘性导航与区块级“上一项/下一项/返回快速定位”操作
- [x] 9.2 增加悬浮“返回快速定位”入口并完成阶段I质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`

## 10. 阶段J：侧边目录导航（WPS风格）

- [x] 10.1 在桌面端实现“左侧目录 + 统一列表 + 图标 + 搜索”的配置导航，并支持点击跳转
- [x] 10.2 在移动端保留紧凑导航并保持同一跳转语义，完成阶段J质量门禁：`pnpm lint`、`pnpm exec tsc --noEmit`

## 11. 阶段K：编辑防丢失与焦点强化

- [x] 11.1 固定弹窗标题、目录区和底部操作栏，形成“中间滚动、上下固定”的长表单编辑结构
- [x] 11.2 新增未保存离开确认提示，拦截误触关闭导致的改动丢失
- [x] 11.3 导航跳转后为目标区块增加短时高亮提示并完成阶段K质量门禁：`pnpm test:run tests/components/upstream-form-dialog.test.tsx`、`pnpm lint`、`pnpm exec tsc --noEmit`

## 12. 阶段L：配置顺序重构与滚动修复

- [x] 12.1 修复右侧配置区滚动语义，确保固定头尾下仍可连续编辑长表单
- [x] 12.2 重构目录与配置组合顺序，将“描述”回归基础信息并按“基础信息 → 接入路由 → 策略成本 → 稳定性”组织
- [x] 12.3 同步调整组件测试并完成阶段L质量门禁：`pnpm test:run tests/components/upstream-form-dialog.test.tsx`、`pnpm lint`、`pnpm exec tsc --noEmit`

## 13. 阶段M：交互收敛与信息优先级修正

- [x] 13.1 上游卡片头部将启用/停用状态前置到名称前方，保持信息优先级一致
- [x] 13.2 上游卡片操作区移除“测试”按钮，仅保留启停开关、编辑和删除
- [x] 13.3 去除“高级配置”外层视觉容器，保持单一连续配置流
- [x] 13.4 将 `official_website_url` 输入项改为全宽展示，并同步组件测试断言

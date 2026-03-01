## 1. 数据库 Schema 与迁移

- [x] 1.1 在 `schema-pg.ts` 和 `schema-sqlite.ts` 的 `upstreams` 表中新增 `spendingLimit`（double/real, nullable）、`spendingPeriodType`（varchar, nullable）、`spendingPeriodHours`（integer, nullable）三个字段
- [x] 1.2 在 `schema.ts` 中导出新增字段的类型（确认 `Upstream` / `NewUpstream` 类型自动继承）
- [x] 1.3 执行 `pnpm db:generate` 生成 Drizzle 迁移文件，验证迁移 SQL 正确性
- [x] 1.4 执行 `pnpm db:push` 将 schema 变更应用到开发数据库

## 2. QuotaTracker 核心服务

- [x] 2.1 创建 `src/lib/services/upstream-quota-tracker.ts`，实现 QuotaTracker 单例类，包含内存缓存结构 `Map<upstreamId, { currentSpending, periodStart, lastSyncedAt }>`
- [x] 2.2 实现 `isWithinQuota(upstreamId): boolean` 方法，根据上游的限额配置和当前累计消费判断是否在限额内（无限额配置时始终返回 true）
- [x] 2.3 实现 `recordSpending(upstreamId, cost)` 方法，在内存中即时累加消费
- [x] 2.4 实现 `syncFromDb()` 方法，从 `request_billing_snapshots` 表按周期类型聚合每个有限额上游的消费，覆盖内存缓存
- [x] 2.5 实现 `getQuotaStatus(upstreamId)` 方法，返回 `{ currentSpending, limit, periodType, percentUsed, isExceeded, resetsAt, estimatedRecoveryAt }`
- [x] 2.6 实现智能校准定时器：常态 5 分钟，消费 >= 80% 限额或已超额时缩短为 1 分钟
- [x] 2.7 实现固定窗口周期边界计算（`toStartOfTodayUtc` / `toStartOfMonthUtc`）和滚动窗口时间范围计算
- [x] 2.8 为 QuotaTracker 编写单元测试，覆盖 daily/monthly/rolling 三种周期类型的限额判断、增量累加、DB 校准、周期重置等场景

## 3. Load Balancer 集成

- [x] 3.1 在 `load-balancer.ts` 中实现 `filterBySpendingQuota()` 函数，签名与 `filterByCircuitBreaker` 对齐，返回 `{ allowed, excludedCount }`
- [x] 3.2 在 `performTieredSelection()` 中插入 `filterBySpendingQuota` 调用，位置在 `filterByCircuitBreaker` 之后、`filterByExclusions` 之前
- [x] 3.3 在 `UpstreamSelectionResult` 中增加 `quotaExceededFiltered` 字段，记录因限额被排除的上游数量
- [x] 3.4 为 load balancer 的限额过滤编写单元测试，覆盖正常通过、超额排除、同 tier 全超额降级、无限额上游不受影响等场景

## 4. Billing 服务集成

- [x] 4.1 在 `billing-cost-service.ts` 的 `calculateAndPersistRequestBillingSnapshot` 函数中，成功计费后调用 `QuotaTracker.recordSpending(upstreamId, finalCost)`
- [x] 4.2 编写集成测试验证计费完成后 QuotaTracker 内存状态正确更新

## 5. 后端 API 扩展

- [x] 5.1 在 `upstream-crud.ts` 的 `UpstreamCreateInput` / `UpstreamUpdateInput` / `UpstreamResponse` 接口中新增限额字段（`spendingLimit`、`spendingPeriodType`、`spendingPeriodHours`）
- [x] 5.2 在 `upstream-crud.ts` 的 `createUpstream` / `updateUpstream` / `formatUpstreamResponse` 中处理限额字段的读写和转换
- [x] 5.3 在 `src/app/api/admin/upstreams/route.ts` 和 `[id]/route.ts` 的 Zod schema 中新增限额字段校验逻辑（rolling 类型必须提供 hours、limit 必须为正数等）
- [x] 5.4 新建 `src/app/api/admin/upstreams/quota-status/route.ts`，实现 `GET` 端点返回所有有限额上游的消费状态
- [x] 5.5 为上游 CRUD API 的限额字段和 quota-status 端点编写单元测试

## 6. 前端类型与 Hooks

- [x] 6.1 在 `src/types/api.ts` 的 `UpstreamCreate` / `UpstreamResponse` 中新增限额字段类型定义（`spending_limit`、`spending_period_type`、`spending_period_hours`）
- [x] 6.2 在 `src/types/api.ts` 中新增 `UpstreamQuotaStatus` 接口类型
- [x] 6.3 在 `src/hooks/use-upstreams.ts` 中新增 `useUpstreamQuotaStatus()` query hook，调用 quota-status API

## 7. 前端表单

- [x] 7.1 在 `upstream-form-dialog.tsx` 的 Zod schema 中新增限额字段校验（`spending_limit`、`spending_period_type`、`spending_period_hours`）
- [x] 7.2 在表单中新增限额配置区域：限额金额输入框、周期类型下拉选择、滚动窗口小时数输入框（周期类型为 rolling 时显示）
- [x] 7.3 在表单 `onSubmit` 和 `form.reset` 中处理限额字段的提交和回显
- [x] 7.4 为限额表单组件编写单元测试（校验逻辑、联动显隐）

## 8. 前端 Dashboard 展示

- [x] 8.1 在 `upstreams-table.tsx` 中集成限额进度展示：进度条（百分比）、已消费/限额金额、周期类型标识
- [x] 8.2 实现超额上游的视觉高亮标识
- [x] 8.3 实现重置/恢复倒计时展示（fixed 类型显示下次重置时间，rolling 类型显示预计恢复时间）
- [x] 8.4 确保未配置限额的上游不显示任何限额 UI 元素

## 9. 国际化

- [x] 9.1 在 `src/messages/en.json` 和 `src/messages/zh.json` 中新增限额相关翻译条目（表单标签、进度文案、超额提示、周期类型名称、倒计时文案等）

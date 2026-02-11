## 1. 数据库 Schema 扩展

- [x] 1.1 在 `src/lib/db/schema-pg.ts` 的 `request_logs` 表新增 `session_id` (TEXT, nullable)、`affinity_hit` (BOOLEAN, DEFAULT FALSE)、`affinity_migrated` (BOOLEAN, DEFAULT FALSE) 字段
- [x] 1.2 在 `src/lib/db/schema-sqlite.ts` 的 `request_logs` 表新增相同字段（SQLite 使用 INTEGER 表示 BOOLEAN）
- [x] 1.3 生成并应用数据库迁移（`pnpm db:generate && pnpm db:migrate`）

## 2. 类型定义与接口扩展

- [x] 2.1 在 `src/types/api.ts` 的 `RequestLogResponse` 接口新增 `session_id`、`affinity_hit`、`affinity_migrated` 字段
- [x] 2.2 在 `src/lib/services/request-logger.ts` 的 `LogRequestInput` 接口新增 `sessionId`、`affinityHit`、`affinityMigrated` 字段
- [x] 2.3 在 `src/lib/services/request-logger.ts` 的 `UpdateRequestLogInput` 接口新增相同字段
- [x] 2.4 更新 `src/lib/utils/api-transformers.ts` 中的日志转换逻辑，包含新字段

## 3. 后端日志记录集成

- [x] 3.1 修改 `src/app/api/proxy/v1/[...path]/route.ts`，在 `forwardWithFailover` 返回结果中包含亲和性信息
- [x] 3.2 在代理路由的 POST handler 中提取 `affinityHit` 和 `affinityMigrated` 并传递给日志记录
- [x] 3.3 确保会话 ID 在请求开始时记录到日志
- [x] 3.4 更新 `src/lib/services/request-logger.ts` 的 `logRequest` 函数，处理新字段的持久化

## 4. 时间线组件重构

- [x] 4.1 创建 `src/components/admin/routing-decision-timeline.tsx` 新组件（时间线布局）
- [x] 4.2 实现 MODEL RESOLUTION 阶段展示（模型解析）
- [x] 4.3 实现 SESSION AFFINITY 阶段展示（会话亲和性、迁移评估）
- [x] 4.4 实现 UPSTREAM SELECTION 阶段展示（候选上游列表）
- [x] 4.5 实现 FINAL RESULT 阶段展示（最终结果、缓存效果）
- [x] 4.6 更新 `RoutingDecisionTimeline` 组件 Props 接口，添加新字段
- [x] 4.7 保持紧凑视图向后兼容（不破坏现有表格布局）

## 5. 重试可视化组件

- [x] 5.1 重试时间线组件集成在 routing-decision-timeline.tsx 中（RetryTimeline 子组件）
- [x] 5.2 实现重试尝试卡片（时间戳、上游、结果、耗时）
- [x] 5.3 实现错误类型图标和颜色编码
- [x] 5.4 实现成功尝试高亮展示
- [x] 5.5 添加"最多展示 5 次尝试"的限制逻辑
- [x] 5.6 实现故障转移总耗时计算和展示
- [x] 5.7 将重试时间线集成到主时间线的 EXECUTION & RETRIES 阶段

## 6. i18n 翻译

- [x] 6.1 在 `src/messages/zh-CN.json` 添加时间线相关翻译键（timeline.*、affinity.*、retry.*）
- [x] 6.2 在 `src/messages/en.json` 添加相同翻译键的英文版本

## 7. 日志表格适配

- [x] 7.1 更新 `src/components/admin/logs-table.tsx`，使用 `RoutingDecisionTimeline` 替换旧组件
- [x] 7.2 紧凑视图和展开视图均切换到新时间线组件
- [x] 7.3 清理未使用的旧函数和导入

## 8. 测试

- [x] 8.1 现有 `tests/unit/services/request-logger.test.ts` 47 个测试全部通过（新字段已在 schema 层覆盖）
- [x] 8.2 更新 `tests/components/logs-table.test.tsx` 适配新时间线组件（4 个测试重写）
- [x] 8.3 重试可视化集成在时间线组件中，通过 logs-table 测试覆盖
- [x] 8.4 运行完整测试套件 72 文件 1566 测试全部通过，无回归

## 9. 质量门禁与提交

- [x] 9.1 运行 TypeScript 类型检查（`pnpm exec tsc --noEmit`）
- [x] 9.2 运行 ESLint（`pnpm lint`）
- [x] 9.3 运行 Prettier 格式化（`pnpm format`）
- [x] 9.4 提交所有变更（遵循提交规范）

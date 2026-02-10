## 1. 数据库 Schema 扩展

- [ ] 1.1 在 `src/lib/db/schema-pg.ts` 的 `request_logs` 表新增 `session_id` (TEXT, nullable)、`affinity_hit` (BOOLEAN, DEFAULT FALSE)、`affinity_migrated` (BOOLEAN, DEFAULT FALSE) 字段
- [ ] 1.2 在 `src/lib/db/schema-sqlite.ts` 的 `request_logs` 表新增相同字段（SQLite 使用 INTEGER 表示 BOOLEAN）
- [ ] 1.3 生成并应用数据库迁移（`pnpm db:generate && pnpm db:migrate`）

## 2. 类型定义与接口扩展

- [ ] 2.1 在 `src/types/api.ts` 的 `RequestLogResponse` 接口新增 `session_id`、`affinity_hit`、`affinity_migrated` 字段
- [ ] 2.2 在 `src/lib/services/request-logger.ts` 的 `LogRequestInput` 接口新增 `sessionId`、`affinityHit`、`affinityMigrated` 字段
- [ ] 2.3 在 `src/lib/services/request-logger.ts` 的 `UpdateRequestLogInput` 接口新增相同字段
- [ ] 2.4 更新 `src/lib/utils/api-transformers.ts` 中的日志转换逻辑，包含新字段

## 3. 后端日志记录集成

- [ ] 3.1 修改 `src/app/api/proxy/v1/[...path]/route.ts`，在 `forwardWithFailover` 返回结果中包含亲和性信息
- [ ] 3.2 在代理路由的 POST handler 中提取 `affinityHit` 和 `affinityMigrated` 并传递给日志记录
- [ ] 3.3 确保会话 ID 在请求开始时记录到日志
- [ ] 3.4 更新 `src/lib/services/request-logger.ts` 的 `logRequest` 函数，处理新字段的持久化

## 4. 时间线组件重构

- [ ] 4.1 创建 `src/components/admin/routing-decision-timeline.tsx` 新组件（时间线布局）
- [ ] 4.2 实现 ① MODEL RESOLUTION 阶段展示（模型解析）
- [ ] 4.3 实现 ② SESSION AFFINITY 阶段展示（会话亲和性、迁移评估）
- [ ] 4.4 实现 ③ UPSTREAM SELECTION 阶段展示（候选上游列表）
- [ ] 4.5 实现 ⑤ FINAL RESULT 阶段展示（最终结果、缓存效果）
- [ ] 4.6 更新 `RoutingDecisionDisplay` 组件 Props 接口，添加新字段
- [ ] 4.7 保持紧凑视图向后兼容（不破坏现有表格布局）

## 5. 重试可视化组件

- [ ] 5.1 创建 `src/components/admin/retry-timeline.tsx` 组件
- [ ] 5.2 实现重试尝试卡片（时间戳、上游、结果、耗时）
- [ ] 5.3 实现错误类型图标和颜色编码
- [ ] 5.4 实现成功尝试高亮展示
- [ ] 5.5 添加"最多展示 5 次尝试"的限制逻辑
- [ ] 5.6 实现故障转移总耗时计算和展示
- [ ] 5.7 将重试时间线集成到主时间线的 ④ EXECUTION & RETRIES 阶段

## 6. i18n 翻译

- [ ] 6.1 在 `src/messages/zh-CN.json` 添加时间线相关翻译键（timeline.*、affinity.*、retry.*、errorType.*）
- [ ] 6.2 在 `src/messages/en.json` 添加相同翻译键的英文版本

## 7. 日志表格适配

- [ ] 7.1 更新 `src/components/admin/logs-table.tsx`，传递新字段给 `RoutingDecisionDisplay`
- [ ] 7.2 确保展开/折叠行功能正常工作
- [ ] 7.3 验证移动端显示效果

## 8. 测试

- [ ] 8.1 编写 `tests/unit/services/request-logger.test.ts` 更新，验证新字段的日志记录
- [ ] 8.2 编写 `tests/components/routing-decision-timeline.test.tsx` 测试时间线组件渲染
- [ ] 8.3 编写 `tests/components/retry-timeline.test.tsx` 测试重试可视化组件
- [ ] 8.4 运行完整测试套件，确保无回归

## 9. 质量门禁与提交

- [ ] 9.1 运行 TypeScript 类型检查（`pnpm exec tsc --noEmit`）
- [ ] 9.2 运行 ESLint（`pnpm lint`）
- [ ] 9.3 运行 Prettier 格式化（`pnpm format`）
- [ ] 9.4 提交所有变更（遵循提交规范）

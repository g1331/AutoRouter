## 1. 共享 JSON 树形组件抽出

- [x] 1.1 新建 `src/components/admin/recording-json-block.tsx`，把 `RecordingJsonBlock`、`JsonTreeNode`、`JsonPrimitiveValue`、`collectExpandedJsonPaths`、`isJsonBranch`、`getJsonBranchEntries`、`getJsonBranchSummary` 从 `src/app/[locale]/(dashboard)/system/traffic-recording/page.tsx` 原样迁出，保持 props 与行为不变。
- [x] 1.2 把录制页改为引用共享组件，删除原文件内的函数定义，确保 import 顺序与 lint 通过。
- [x] 1.3 为共享组件编写单元测试 `tests/components/recording-json-block.test.tsx`，覆盖空值、原始类型、对象、数组、展开/折叠、复制按钮等关键行为。
- [x] 1.4 运行 `pnpm exec tsc --noEmit --pretty false`、`pnpm lint`、`pnpm test:run -- tests/components/recording-json-block.test.tsx tests/components/traffic-recording-page.test.tsx`，确认抽出后原录制页行为等价。
- [x] 1.5 提交 phase 1 代码，提交信息体现「抽出共享 JSON 树组件」。

## 2. 录制列表 API 支持按 `request_log_id` 过滤

- [x] 2.1 在 `src/lib/services/traffic-recording-service.ts` 的 `TrafficRecordingListFilters` 中增加 `requestLogId?: string`，在 `listTrafficRecordings` 中追加 `eq(trafficRecordings.requestLogId, ...)` 条件。
- [x] 2.2 在 `src/app/api/admin/traffic-recordings/route.ts` 中解析 `request_log_id` query 参数并传入服务层；空值视为未提供。
- [x] 2.3 扩充 `tests/unit/services/traffic-recording-service.test.ts`，新增按 `requestLogId` 过滤命中、未命中两个用例。
- [x] 2.4 扩充 `tests/unit/api/admin/traffic-recording-routes.test.ts`，新增 `request_log_id` 参数生效与未授权两个用例。
- [x] 2.5 运行 `pnpm exec tsc --noEmit --pretty false`、`pnpm lint`、`pnpm test:run -- tests/unit/services/traffic-recording-service.test.ts tests/unit/api/admin/traffic-recording-routes.test.ts`。
- [x] 2.6 提交 phase 2 代码。

## 3. 日志列表 API 支持按 `id` 精确查询

- [x] 3.1 在 `src/lib/services/request-logger.ts` 的 `ListRequestLogsFilter` 中增加 `id?: string`，在 `listRequestLogs` 中追加 `eq(requestLogs.id, ...)` 条件。
- [x] 3.2 在 `src/app/api/admin/logs/route.ts` 中解析 `id` query 参数并传入服务层；空值视为未提供。
- [x] 3.3 扩充 `tests/unit/services/request-logger.test.ts`（若不存在则新建），新增按 `id` 过滤命中、未命中两个用例。
- [x] 3.4 扩充 `tests/unit/api/admin/logs-route.test.ts`（若不存在则新建），覆盖 `id` 参数生效与未授权两个用例。
- [x] 3.5 运行 `pnpm exec tsc --noEmit --pretty false`、`pnpm lint`、对应测试。
- [x] 3.6 提交 phase 3 代码。

## 4. 日志展开行内嵌录制分区

- [x] 4.1 在 `src/hooks/use-traffic-recording.ts` 中新增 `useTrafficRecordingByLogId(logId, enabled)`：先用 `request_log_id` filter 调用列表接口（`page_size=1`），命中后再调用详情接口；返回包含 status、recording、detail、error 的复合状态。
- [x] 4.2 新建 `src/components/admin/log-recording-section.tsx`，承载日志展开行内的录制分区，覆盖加载中、未录制、已录制、文件缺失四种 UI 状态；复用 `RecordingJsonBlock` 渲染 fixture。
- [x] 4.3 在 `src/components/admin/logs-table.tsx` 的 `renderExpandedDetails` 末尾插入 `LogRecordingSection`，传入当前日志 ID 与 `expandedRows.has(log.id)` 作为 `enabled` 标志。
- [x] 4.4 补齐 `src/messages/en.json`、`src/messages/zh-CN.json` 的录制分区翻译键：标题、加载中、未录制、已录制元信息标签、文件缺失、跳转按钮文案。
- [x] 4.5 新增 `tests/components/log-recording-section.test.tsx`，覆盖四种状态。
- [x] 4.6 扩充 `tests/components/logs-table.test.tsx`（若不存在则新建），验证展开行能挂载录制分区组件。
- [x] 4.7 运行 `pnpm exec tsc --noEmit --pretty false`、`pnpm lint`、`pnpm format:check`、相关测试。
- [ ] 4.8 提交 phase 4 代码。

## 5. 录制行回跳到日志页

- [ ] 5.1 在 `src/app/[locale]/(dashboard)/system/traffic-recording/page.tsx` 表格的「操作」列追加「打开原始日志」按钮，条件渲染 `request_log_id` 非空时显示，链接到 `/logs?focus=<id>`。
- [ ] 5.2 补齐 `src/messages/en.json`、`src/messages/zh-CN.json` 中按钮文案翻译键。
- [ ] 5.3 扩充 `tests/components/traffic-recording-page.test.tsx`，覆盖按钮在 `request_log_id` 非空与为空两种情况下的渲染差异。
- [ ] 5.4 运行 `pnpm exec tsc --noEmit --pretty false`、`pnpm lint`、`pnpm test:run -- tests/components/traffic-recording-page.test.tsx`。
- [ ] 5.5 提交 phase 5 代码。

## 6. 日志页支持 `focus` query 参数

- [ ] 6.1 在 `src/app/[locale]/(dashboard)/logs/page.tsx` 中读取 `focus` query 参数，通过 `useRequestLogs(1, 1, { id: focus })` 加载单条日志。
- [ ] 6.2 把 focus 命中的日志 ID 注入 `LogsTable` 的初始 `expandedRows` 集合（需要把 `expandedRows` 提升到页面层或新增 `initialExpandedIds` prop）。
- [ ] 6.3 在页面顶部新增聚焦提示条：展示当前聚焦 ID 与「清除聚焦」按钮；命中失败时显示「找不到该日志」状态。
- [ ] 6.4 补齐 `src/messages/en.json`、`src/messages/zh-CN.json` 的聚焦提示与「清除聚焦」翻译键。
- [ ] 6.5 扩充 `tests/components/logs-page.test.tsx`（若不存在则新建），覆盖 focus 命中、focus 未命中、清除聚焦三种行为。
- [ ] 6.6 运行 `pnpm exec tsc --noEmit --pretty false`、`pnpm lint`、`pnpm format:check`、相关测试。
- [ ] 6.7 提交 phase 6 代码。

## 7. 集成校验与交接

- [ ] 7.1 全量运行 `pnpm test:run`，修复直接相关的失败。
- [ ] 7.2 运行 `pnpm exec tsc --noEmit --pretty false`、`pnpm format:check`、`pnpm lint`、`git diff --check`，整理剩余限制。
- [ ] 7.3 启动 `pnpm dev`，按以下场景手动验证并记录截图位置（仅截图，不入库）：
  - 已录制日志展开 → 显示录制分区与 JSON 树。
  - 未录制日志展开 → 显示未录制提示。
  - 录制行点击「打开原始日志」 → 跳转到 `/logs?focus=<id>` 且自动展开。
  - 在聚焦模式下点击「清除聚焦」 → 回到普通列表。
- [ ] 7.4 提交 phase 7 代码。

## Why

请求录制页与请求日志页目前完全独立：日志详情里看不到对应录制，录制列表也无法跳回原始日志，管理员想看「这条日志对应的完整请求/响应正文」必须跨页用时间或模型模糊搜索后人工核对。Issue #160 评审中提出该体验缺口，需要在不重做任意一侧详情的前提下打通两个页面。

## What Changes

- 抽出 `RecordingJsonBlock`、`JsonTreeNode`、`JsonPrimitiveValue`、`collectExpandedJsonPaths`、`isJsonBranch`、`getJsonBranchEntries`、`getJsonBranchSummary` 为共享组件 `src/components/admin/recording-json-block.tsx`，原录制管理页改为引用。
- 录制列表 API 增加 `request_log_id` 过滤参数，可按日志 ID 精确反查录制记录。
- 日志列表 API 增加 `id` 过滤参数，命中时只返回该条记录，用于支持聚焦定位。
- 日志表展开行新增「请求录制」分区：按需用 `useQuery({ enabled: isExpanded })` 探测并加载录制详情，覆盖未录制、加载中、已录制、文件缺失四种状态；分区内复用共享的 JSON 树组件渲染 fixture，并提供「在录制页打开」入口。
- 录制管理页表格行新增「打开原始日志」入口，仅在 `request_log_id` 非空时显示，链接到 `/logs?focus=<id>`。
- 日志页读取 `focus` query 参数，将其作为列表过滤条件并将该行默认放入 `expandedRows`，进入页面即展开录制分区。
- 补齐两个方向跳转入口、加载状态与空状态的中英文翻译。

## Capabilities

### New Capabilities
- `request-log-record-integration`: 在请求日志与请求录制之间提供双向定位能力，包括日志展开行的录制嵌入展示、日志列表按 ID 聚焦查询、录制行回跳日志页等需求。

### Modified Capabilities
- `traffic-recording-runtime-control`: 录制列表查询新增按 `request_log_id` 过滤的能力，扩展现有「按条件筛选录制记录」Scenario。

## Impact

- 后端：`src/lib/services/traffic-recording-service.ts` 的 `TrafficRecordingListFilters` 与 `listTrafficRecordings`，`src/lib/services/request-logger.ts` 的 `ListRequestLogsFilter` 与 `listRequestLogs`，对应 route `src/app/api/admin/traffic-recordings/route.ts`、`src/app/api/admin/logs/route.ts`。
- 前端：
  - 新增 `src/components/admin/recording-json-block.tsx` 共享组件。
  - 修改 `src/app/[locale]/(dashboard)/system/traffic-recording/page.tsx` 改为引用共享组件并新增回跳按钮。
  - 修改 `src/components/admin/logs-table.tsx` 在 `renderExpandedDetails` 内嵌录制分区。
  - 修改 `src/app/[locale]/(dashboard)/logs/page.tsx` 处理 `focus` query 参数。
  - 新增 hook `useTrafficRecordingByLogId`（或扩展现有 `useTrafficRecordings` 的调用方式）。
- 国际化：`src/messages/en.json`、`src/messages/zh-CN.json` 补充录制分区、回跳按钮、聚焦提示的翻译键。
- 类型：`src/types/api.ts` 中 `TrafficRecordingFilters`、`RequestLogFilters` 增加新字段。
- 数据库：无 schema 变更，不需要迁移。
- 测试：服务层 filter 测试、route 参数测试、共享组件等价行为测试、日志表录制分区组件测试、回跳与 focus 组件测试。

## Context

请求录制功能已落在 `traffic-recording-runtime-control` change 上：录制 fixture 文件存盘、`traffic_recordings` 数据库索引承载列表查询、`/system/traffic-recording` 页面承载录制管理。索引表中已经有 `request_log_id` 外键到 `request_logs.id`，但当前列表过滤器没有暴露这个字段，前端两个页面之间也没有任何跳转。

请求日志页面 `/logs` 由 `src/components/admin/logs-table.tsx` 实现，行规模 3697 行，已经有 `expandedRows` 状态与 `renderExpandedDetails` 钩子，每行可以展开 failover 详情。日志 API `/api/admin/logs` 当前只支持分页 + apiKeyId/upstreamId/statusCode/start_time/end_time 五个过滤参数，没有按 ID 查询单条的入口。

JSON 树形渲染组件（`RecordingJsonBlock`、`JsonTreeNode`、`JsonPrimitiveValue`、`collectExpandedJsonPaths`、`isJsonBranch`、`getJsonBranchEntries`、`getJsonBranchSummary`）目前是 `traffic-recording/page.tsx` 的私有函数，需要抽出到 `src/components/admin/recording-json-block.tsx` 才能在日志展开行里复用。

## Goals / Non-Goals

**Goals:**

- 管理员在日志展开行内可以直接看到对应录制的元信息与完整 fixture，无需跳页搜索。
- 管理员在录制管理页表格行可以一键回跳到对应的原始日志，并自动展开该行。
- 日志列表 API 支持按 ID 精确查询，录制列表 API 支持按 `request_log_id` 精确反查。
- JSON 树形渲染组件抽出后可被两个页面共享，行为完全等价。

**Non-Goals:**

- 不重做日志详情，不改变现有 failover 展开区的视觉或字段。
- 不把录制管理功能（设置、清理、删除）合并进日志页面。
- 不实现「按 ID 分页定位」回跳，聚焦查询只返回该单条记录。
- 不引入新的数据库表或迁移。

## Decisions

### 1. 共享 JSON 树形组件抽出到 `src/components/admin/recording-json-block.tsx`

把 7 个相关函数与组件原样迁出，保持 props 签名不变。新文件导出 `RecordingJsonBlock`（默认 export 或具名 export 二选一，倾向具名），同时把内部辅助函数（`collectExpandedJsonPaths` 等）一并导出，便于日志表内嵌时复用展开/折叠默认行为。

录制页改为 `import { RecordingJsonBlock } from "@/components/admin/recording-json-block"`，删除原文件内的函数定义。

选择理由：组件已经在录制页用熟，行为可控；日志表的展开行需要相同的 JSON 树体验。直接抽出比新写一个简化版本更经济。

替代方案：在日志表里用 `<pre>{JSON.stringify(...)}</pre>` 简单渲染。问题是 fixture 可能很大、嵌套很深，没有树形折叠会让展开行高度爆炸。

### 2. 录制嵌入分区的加载策略：展开即按需，两段式拉取

日志表的某一行被展开时（`expandedRows.has(log.id)` 为 `true`），通过 `useTrafficRecordingByLogId(logId)` 探测：

1. 先 `GET /admin/traffic-recordings?request_log_id=<id>&page_size=1`，得到 `items[0]` 或空。
2. 命中后再 `GET /admin/traffic-recordings/<recording_id>` 拉详情。

四种 UI 状态：

| 状态 | 触发条件 | 展示 |
| --- | --- | --- |
| 加载中 | 探测或详情请求处于 `isLoading` | `Loader2` + 文案 |
| 未录制 | 探测成功，`items` 为空 | 灰色提示「该请求未被录制」+ 「打开录制管理」次要链接 |
| 已录制 | 详情成功 | 元信息条（状态码、模型、大小、脱敏标记、创建时间）+ `RecordingJsonBlock` + 「在录制页打开」按钮 |
| 文件缺失 | 详情请求 4xx/5xx | 错误文案 + 「删除录制索引」操作（链接到录制页） |

未展开时不发请求，避免列表展开率低的场景下产生大量无谓查询。

选择理由：fixture 体积可能上 MiB，所有行预拉会浪费带宽与渲染算力；列表接口扩字段为 `has_recording` 又会改 schema、影响快照测试。两段式探测把成本严格控制在「用户主动展开」上。

替代方案：让 `/api/admin/logs` 直接 join `traffic_recordings` 返回 `has_recording` 标志。该方案能省一次探测请求，但侵入日志接口、扩大返回 payload，性价比不高。

### 3. 录制行回跳：链接到 `/logs?focus=<id>`

录制表格行的「操作」列追加一个按钮（条件渲染），仅在 `request_log_id` 非空时显示。点击后导航到 `/logs?focus=<request_log_id>`。

日志页面解析 `focus` query 参数后：

- 调用 `useRequestLogs(1, 1, { id: focusId })`，列表 API 命中则只返回单条。
- 进入页面时把该条记录的 `id` 放入 `expandedRows` 初始集合。
- 在列表顶部增加一个面包屑式的「聚焦提示」条：显示「正在查看日志 `<id>`，[清除聚焦]」。点击清除后回到普通列表视图。

选择理由：日志页已支持每行展开，最小改动就是在挂载时塞入 `expandedRows`。`focus` 用单条查询而非「按 ID 算所在页号」，避免在分页接口里加复杂逻辑。

替代方案：在录制页内嵌一个简化的日志详情浮层。问题是日志展开行有 failover 决策细节、思考信息等复杂渲染，复用一遍代价大于直接跳转。

### 4. API filter 命名与解析

- 录制列表：`GET /admin/traffic-recordings?request_log_id=<uuid>`，服务端将其解析为 `TrafficRecordingListFilters.requestLogId`，加入到 `listTrafficRecordings` 的 `eq(trafficRecordings.requestLogId, ...)` 条件。
- 日志列表：`GET /admin/logs?id=<uuid>`，服务端将其解析为 `ListRequestLogsFilter.id`，加入到 `listRequestLogs` 的 `eq(requestLogs.id, ...)` 条件。空字符串视为未提供（与现有 `apiKeyId` 解析一致）。

选择理由：命名沿用现有 snake_case 风格，与 `api_key_id`、`upstream_id` 保持一致；服务层用 camelCase 字段。

### 5. UI 布局草图

日志展开行新增分区（位于现有 failover 详情之后）：

```text
[原有展开内容：路由决策 / failover 历史 / 思考信息 / ...]

┌─────────────────────────────────────────────────────────────────┐
│ ▾ 请求录制                                  [在录制页打开 ⇗]     │
├─────────────────────────────────────────────────────────────────┤
│ 状态码 200 · 模型 gpt-4o · 大小 12.4 KiB · 已脱敏 · 12:34:56   │
├─────────────────────────────────────────────────────────────────┤
│ {                                          [展开] [折叠] [复制] │
│   meta: { ... },                                                │
│   inbound: { ... },                                             │
│   outbound: { ... }                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

未录制状态：

```text
┌─────────────────────────────────────────────────────────────────┐
│ 请求录制                                                        │
├─────────────────────────────────────────────────────────────────┤
│ 该请求未被录制。当前录制配置：失败模式，已脱敏。                │
│ [打开录制管理 ⇗]                                                │
└─────────────────────────────────────────────────────────────────┘
```

录制页表格行新增按钮（条件渲染）：

```text
| 时间 | 状态 | 模型 | 接口 | 大小 | 脱敏 | 操作                              |
| ...  | 200  | ...  | ...  | ...  | 是   | [查看详情] [打开原始日志 ⇗] [删除] |
```

日志页 `focus` 模式顶部提示条：

```text
┌─────────────────────────────────────────────────────────────────┐
│ 正在查看单条日志 a1b2c3d4...                  [× 清除聚焦]      │
└─────────────────────────────────────────────────────────────────┘
[展开的单条日志行]
```

视觉层级：录制分区沿用现有展开区的紧凑表格风格（深色面板、细边框、单一琥珀色强调），不引入新视觉单元。元信息条与状态码、模型等已有标签的颜色一致。「打开」类按钮一律次要样式（`variant="outline"` 或 `variant="ghost"`），避免抢夺主操作权重。

## Risks / Trade-offs

- 日志表已经 3697 行，再加一段录制分区会让组件继续膨胀 → 录制分区单独写一个 `LogRecordingSection` 子组件，文件不变长太多。
- 共享组件抽出过程中可能不慎改变原录制页行为 → phase 1 完成后必须运行原录制页的组件测试（`tests/components/traffic-recording-page.test.tsx`）验证等价；新文件不写新功能，只搬迁。
- 两段式拉取在日志列表大量展开时会产生 2N 次请求 → 通常一次只展开一行；多行同时展开是非典型操作；TanStack Query 自带请求去重和缓存，相同 logId 第二次展开不会重新请求。
- 日志 API 接受 `id` 参数后，分页统计仍按全表计算可能造成「total=1, page=1, total_pages=1」与实际情况不符 → 这是聚焦模式的预期行为，不算缺陷。
- `focus` 参数命中失败（日志已被清理）→ 日志页显示空列表 + 顶部「找不到该日志，可能已被清理」提示，并提供「清除聚焦」按钮。
- 录制详情接口对超大 fixture 没有大小保护，内嵌在日志展开行后影响更明显 → 本 change 不解决该问题，由后续单独 change 处理。

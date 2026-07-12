# 任务清单：enhance-logs-page

> 每个阶段独立可提交（conventional commit，通过 pre-commit 质量门禁）；涉及代码改动的任务均含测试。

## 1. 后端：排序 + 性能筛选参数

- [x] 1.1 `request-logger.ts`：`ListRequestLogsFilter` 增加 `ttftMinMs` / `durationMinMs` / `tpsMax`；实现 TPS 整数算式筛选与守卫条件（常量迁至服务层导出）
- [x] 1.2 `request-logger.ts`：新增 `RequestLogSortField` / `SortOrder` 类型，`listRequestLogs` 支持 `sort` 参数；普通列排序（coalesce 消 NULL 差异 + 平局键）与 cost 两步 ID 查询（inArray 回查 + JS 重排 + 空列表短路）
- [x] 1.3 抽出共享筛选解析 `src/lib/utils/request-log-filters.ts`；`api/admin/logs` 与 `api/user/logs` 两路由接入新参数（非法值 400）；`user-data-service.ts` 透传 sort
- [x] 1.4 单测：排序映射/平局键/cost 两步路径与顺序、TPS 条件形状、路由参数转发与 400 校验（含补充最小 user-logs 路由测试）；`tsc --noEmit` + lint 通过后提交

## 2. 前端：补齐筛选器 + 列排序 + 快捷筛选服务端化

- [x] 2.1 `logs-table.tsx`：`LogsServerFilters` 扩展（upstreamId / apiKeyId / statusCode / customRange ISO / perfPreset / sortField / sortOrder）；筛选栏加上游与密钥 Select（可选 props 门控）、精确状态码防抖输入、TimeRangeSelector 开放自定义范围
- [x] 2.2 `logs-table.tsx`：快捷筛选 chips 改 emit perfPreset patch，删除客户端页内过滤，提示改为窗口级；focus 视图隐藏 chips；Time/Duration/Cost/Tokens 表头排序按钮（desc→asc→默认，aria-sort，仅桌面）
- [x] 2.3 admin `logs/page.tsx` 与 portal `requests/page.tsx`：preset→阈值参数映射、customRange→start/end、statusCode 解析；admin 传 `useAllUpstreams()` / `useAPIKeys(1,100)` 选项；两 hook 补参数序列化；i18n 双语言新键
- [x] 2.4 组件/hook 测试：选项 props 门控（portal 无 admin 请求）、chip 与表头 patch、preset 映射与页码重置、参数序列化与 key 稳定；质量门禁通过后提交

## 3. 统计区：窗口级指标 + StatCard 化

- [x] 3.1 服务层 `getRequestLogWindowStats(filters)`：条件聚合计数 + offset 百分位（双方言）；新路由 `api/admin/logs/stats` + `api/user/logs/stats`（复用共享筛选解析，鉴权对齐列表端点）；`RequestLogStatsResponse` 入 `types/api.ts`
- [x] 3.2 新 hook `use-request-log-stats.ts`（`["request-log-stats", …]` key 隔离、30s interval、admin/portal 端点开关）；`logs-table.tsx` 瓦片替换为 StatCard（`windowStats` prop，窗口标注在表格内从 serverFilters 推导），删除客户端 `performanceSummary` 计算；i18n 键
- [x] 3.3 测试：stats 服务函数（n=0/1 边界与 offset 计算）、路由鉴权与筛选转发、hook 序列化与 key 隔离、瓦片渲染与加载态；质量门禁通过后提交
- [ ] 3.4 （可裁剪）stats 端点加 series + StatCard footer 迷你面积图

## 4. 行内视觉 + 管理卡片脉冲条

- [x] 4.1 `logs-table.tsx`：failover 徽标（状态单元格 + 移动卡片 meta，`failover_attempts > 0`）；`getDurationPerformanceClass` 耗时热度、费用文字热度（仅文字色，费用阈值 $0.10）；i18n 键
- [x] 4.2 模型列 xl→lg：表头/单元格类名、宽度计算断点、`DESKTOP_MODEL_COLUMN_MIN_WIDTH` 136→112；同步 `logs/page.tsx` 骨架屏
- [x] 4.3 `logs/page.tsx` 管理卡片接入 compact LivePulseBar（保留日志流连接徽章）
- [x] 4.4 测试：徽标出现/不出现、热度文字色、脉冲条渲染（mock context）；质量门禁通过后提交

## 5. 验证与收尾

- [x] 5.1 dev server 浏览器实查：admin logs 页与 portal requests 页、双主题、lg/xl 视口；portal 无 admin 选择器且无 `/admin/*` 请求（test/test1234）
- [x] 5.2 本地 `pnpm e2e --workers=2` 通过（新增筛选选项端点 stub 修复 401 登出）；重新生成 `tests/visual/pages.spec.ts-snapshots/logs-visual-win32.png`；最终提交

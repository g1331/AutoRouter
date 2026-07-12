# 提案：请求日志页美化与实用性增强

## Why

请求日志页的展开详情（journey 时间线）已足够丰富，但列表层能力明显滞后：后端早已支持按上游、API 密钥、精确状态码、自定义时间段筛选，前端却未暴露；列表无排序；“高TTFT/低TPS/慢请求”快捷筛选与 5 个统计瓦片只作用于当前页 ≤20 条，容易被误读为全局数据；行上看不出是否发生过 failover，模型列仅在 xl 断点可见。这些缺口直接影响日常排障效率与数据可信度。

## What Changes

- 日志筛选栏补齐：上游选择器、API 密钥选择器、精确状态码输入、自定义日期范围（管理端全量；会员端按其 API 权限降级，不含上游/密钥选择器之外的管理端专属项）。
- 列表排序：时间 / 耗时 / 费用 / tokens / TTFT 列支持升降序，`/api/admin/logs` 与 `/api/user/logs` 新增 `sort` / `order` 参数；费用排序经计费快照 join 实现。
- 慢请求筛选服务端化：快捷筛选（高TTFT / 低TPS / 慢请求）从仅过滤当前页改为服务端全窗口筛选，API 新增 `ttft_min_ms` / `duration_min_ms` / `tps_max` 参数。
- 统计区升级：5 个统计瓦片（P50/P90 TTFT、P50 TPS、慢请求占比、流式占比）从“当前页计算”改为“筛选窗口全量计算”，新增 `GET /api/admin/logs/stats` 与 `GET /api/user/logs/stats` 端点，样式对齐 `StatCard`。
- 行内视觉增强：failover 徽标直接显示在行上、耗时/费用热度配色、模型列从 xl 断点放宽到 lg 断点。
- logs 管理卡片内补充 compact 版 LivePulseBar（保留现有日志流连接徽章，两者语义不同）。

不做：日志导出/分享、详情改侧边抽屉、拆分 `logs-table.tsx`。

## Capabilities

### New Capabilities

- `request-log-workbench`: 请求日志列表的查询与洞察能力——服务端筛选（上游/密钥/精确状态码/自定义时间段/性能阈值）、列排序、窗口级统计指标端点与展示、行内诊断指示（failover 徽标、性能热度配色、模型列可见性）。

### Modified Capabilities

（无——现有 specs 未对日志列表筛选/统计/排序提出需求，本次全部为新增行为；`performance-metrics-display` 中日志相关需求仅涉及阶段轨道展示，不受影响。）

## Impact

- 后端：`src/lib/services/request-logger.ts`（排序、性能筛选、窗口统计）、`src/app/api/admin/logs/route.ts`、`src/app/api/user/logs/route.ts`、新增 `src/app/api/admin/logs/stats/route.ts`、`src/app/api/user/logs/stats/route.ts`、`src/lib/services/user-data-service.ts`、新增共享筛选解析 `src/lib/utils/request-log-filters.ts`。
- 前端：`src/components/admin/logs-table.tsx`、`src/app/[locale]/(dashboard)/logs/page.tsx`、`src/app/[locale]/(portal)/portal/requests/page.tsx`、`src/hooks/use-request-logs.ts`、`src/hooks/use-portal-logs.ts`、新增 `src/hooks/use-request-log-stats.ts`、`src/types/api.ts`。
- i18n：`src/messages/en.json` / `zh-CN.json` 的 `logs` 命名空间新增若干键。
- 测试：单测（服务层排序/筛选/统计、路由参数校验）、组件测试（筛选栏、排序、瓦片、徽标）、hook 测试；视觉快照 `logs-visual-win32.png` 需重新生成。
- 兼容性：所有 API 参数为可选新增，默认行为不变（`created_at desc`）；SQL 表达式兼容 PostgreSQL 与 SQLite 双方言。

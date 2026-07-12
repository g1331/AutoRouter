# 设计：请求日志页美化与实用性增强

## Context

- 列表数据由 `listRequestLogs`（`src/lib/services/request-logger.ts` L763–914）提供：Drizzle 关系查询 `db.query.requestLogs.findMany` + `with: { apiKey, upstream, billingSnapshot }`，`orderBy` 硬编码为 `desc(created_at)`（L823）。费用 `final_cost` 只存在于一对一 join 的 `request_billing_snapshots` 上，关系查询 API 无法按关联表列排序。
- `/api/user/logs` 经 `listUserRequestLogs`（user-data-service.ts）强注 `userId` 后复用同一服务函数，后端参数加一次两端生效。
- 前端 `LogsServerFilters` 目前只有 statusClass / model / timeRange；快捷筛选 preset 与统计瓦片均为客户端对当前页 ≤20 条计算（`performanceSummary`，logs-table.tsx L653）。
- query key 稳定性模式：相对时间档在 queryFn 内经 `resolveTimeRangeStart` 解析为 `start_time`，filters 对象本身保持稳定（use-request-logs.ts L73–78）；SSE 以前缀 `["request-logs"]` 失效缓存。
- `TimeRangeSelector` 已支持自定义日历范围（emit `onChange("custom", {start, end}）`），logs 目前传 `hideCustom` 屏蔽。
- `LivePulseBar` 已由 `Topbar` 全局挂载于所有 dashboard 页（md+，topbar.tsx L26–41）。
- 双方言约束：SQLite 无 `percentile_cont`；pg 与 sqlite 对 NULL 的排序方向不同。

## Goals / Non-Goals

**Goals：**

1. 筛选栏补齐上游 / API 密钥 / 精确状态码 / 自定义日期范围。
2. 时间、耗时、费用、tokens、TTFT 列排序（两端 API 加 `sort`/`order`）。
3. 快捷性能筛选服务端化（`ttft_min_ms` / `duration_min_ms` / `tps_max`）。
4. 统计瓦片窗口化（新 stats 端点）+ `StatCard` 风格统一。
5. 行内 failover 徽标、耗时/费用热度配色、模型列 lg 断点可见。
6. logs 管理卡片内 compact LivePulseBar。

**Non-Goals：** 日志导出/分享；详情侧边抽屉；拆分 `logs-table.tsx`；`>100` 个 API 密钥的选择器完整枚举（v1 截断可接受）。

## Decisions

### D1. 费用排序：两步 ID 查询，不重写关系查询

`sort=cost` 时：

1. `select({id}) from request_logs leftJoin request_billing_snapshots orderBy(coalesce(final_cost,-1) dir, created_at desc, id desc) limit/offset` 取本页 ID；
2. 原 `findMany` 改用 `inArray(id, ids)`（去掉 limit/offset），JS 按第 1 步 ID 顺序重排；空 ID 列表短路返回空。

其余排序字段（created_at / duration_ms / total_tokens / ttft_ms）直接进 `orderBy`；可空列包 `coalesce(col, -1)` 消除双方言 NULL 排序差异；所有排序统一追加 `desc(created_at), desc(id)` 平局键，保证分页稳定。

备选（否决）：把关系查询重写为手工 join——需重建 3 个关联 + 30 余字段映射，回归风险远大于两步查询的一次额外往返。

### D2. 低 TPS 筛选：整数算式精确实现

`tps < X` 改写为 `completion_tokens * 1000.0 < X * duration_ms`，配守卫 `duration_ms >= 100`、`completion_tokens >= 10`（与现有客户端常量一致，常量迁至服务层导出）。纯算术表达式，双方言等价，无需近似。`ttft_min_ms` / `duration_min_ms` 为普通 `gt` 条件。

### D3. 窗口统计：新增与列表同筛选语义的 stats 端点

否决复用 `/api/admin/stats/timeseries`：它不接受 model/upstream/key 筛选，一旦用户设置筛选，瓦片数字将与列表矛盾（说谎的仪表盘比没有仪表盘更糟）。

采用：`GET /api/admin/logs/stats` + `GET /api/user/logs/stats`，与列表路由共享同一筛选解析函数 `parseRequestLogListFilters`（新文件 `src/lib/utils/request-log-filters.ts`），返回：

```json
{ "total": 0, "stream_count": 0, "slow_count": 0,
  "p50_ttft_ms": null, "p90_ttft_ms": null, "p50_tps": null }
```

- 计数：单条 select + 条件聚合（`sum(case when …)`），仿 `buildTimeseriesSelectFields` 模式。
- 百分位：`ORDER BY <expr> LIMIT 1 OFFSET floor(n*q)`（双方言通用，替代 pg 专属 `percentile_cont`）。
- 前端 query key 用 `["request-log-stats", …]`，**刻意不落在 `["request-logs"]` 前缀下**——SSE 每条日志事件都会失效列表缓存，百分位查询不能被同样打爆；以 30s interval 刷新。
- 迷你趋势图（series + recharts 小面积图）为可裁剪的最后子步骤，先交付数字。

### D4. Portal 降级：以可选 props 门控管理端专属筛选

`LogsTable` 新增可选 props `upstreamFilterOptions` / `apiKeyFilterOptions`，未提供则不渲染对应 Select（沿用 `hideRecordingSection` 的门控哲学，组件保持“笨”）。管理端页面传 `useAllUpstreams()` / `useAPIKeys(1,100)`；portal 页不传，且不得发出任何 `/admin/*` 请求。精确状态码、自定义日期范围、排序、性能筛选两端均开放（`/api/user/logs` 已支持对应参数）。

### D5. query key 稳定性

自定义范围在 filters 中存 ISO 字符串（不存 Date 对象）；快捷筛选 preset 原样进 `LogsServerFilters`，阈值到 API 参数的映射在页面层完成；沿用 `resolveTimeRangeStart` 的“queryFn 内解析”模式。

### D6. LivePulseBar

Topbar 已全局挂载，本项缩为在 logs 管理卡片头部并列渲染 `<LivePulseBar variant="compact" />`（guard 照抄 topbar.tsx），**保留**现有连接徽章——徽章反映日志流 SSE 状态，脉冲条反映网关整体脉搏，语义不同不合并。

## UI 布局示意

### 筛选栏（桌面，管理端）

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚙ 筛选  [状态类别 ▾] [状态码___] [模型_______] [上游 ▾] [密钥 ▾] [时间范围 ▾]│
│         快捷: (全部) (高TTFT) (低TPS) (慢请求)   ← 现在筛选整个窗口          │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌StatCard─┐ ┌StatCard─┐ ┌StatCard─┐ ┌StatCard─┐ ┌StatCard─┐                │
│ │P50 TTFT │ │P90 TTFT │ │P50 TPS  │ │慢请求占比│ │流式占比 │  hint: 近30天·已过滤│
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
├─────────────────────────────────────────────────────────────────────────────┤
│ ˅ 时间⇅ │ 密钥 │ 路由 │ 方法 │ 接口 │ 模型(lg+) │ Tokens⇅ │ 费用⇅ │ 状态 │ 耗时⇅ │
│   …行：状态列内出现 [↻2] failover 徽标；耗时/费用按阈值热度着色…              │
└─────────────────────────────────────────────────────────────────────────────┘
   ⇅ = 可排序表头（desc → asc → 默认 循环，aria-sort）
```

Portal 视图：同一组件，无 [上游 ▾] [密钥 ▾]（props 未传即不渲染），其余一致。

### 管理卡片头部

```
┌ 请求日志管理 ────────────────────────────────────────────────┐
│ 说明文字…            [● 实时] [LivePulseBar compact] [刷新间隔 ▾]│
└──────────────────────────────────────────────────────────────┘
   [● 实时] = 现有日志流连接徽章（保留）
```

## Risks / Trade-offs

- [3237 行的 `logs-table.tsx` 脆弱] → 每阶段只做局部编辑（筛选栏 ~L2538–2644、瓦片 ~L2646–2730、行单元格 ~L3090–3205），不顺手重构，每阶段跑组件测试后再继续。
- [新筛选破坏 query key 稳定 → SSE 抖动] → D5 模式；stats key 与列表 key 前缀隔离。
- [分页语义] → 所有新筛选/排序均走现有 `handleTableFiltersChange`（自动重置页码）；状态码输入沿用模型输入的防抖 + no-op 跳过。
- [双方言漂移] → coalesce 消 NULL 排序差、offset 百分位替代 percentile_cont；每个新 SQL 表达式至少一条断言条件形状的单测。
- [模型列 lg 可见导致 1024px 横向滚动] → 固定列已占 ~940px，将 `DESKTOP_MODEL_COLUMN_MIN_WIDTH` 由 136 降至 ~112 或收窄 key/time 列；同步更新页面骨架屏。
- [密钥选择器 >100 截断] → v1 接受，选择器缺失的密钥仍可经由行内跳转/focus 定位。
- [视觉快照失效] → Phase 2–4 完成后统一重生成 `logs-visual-win32.png` 一次；提交前按惯例双主题浏览器实查。

## Migration Plan

无数据迁移。所有 API 参数为可选新增，默认行为不变（`created_at desc`、无性能筛选），旧客户端零影响；stats 端点为全新只读端点。回滚 = revert 提交。

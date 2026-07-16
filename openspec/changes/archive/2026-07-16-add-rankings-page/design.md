# Design: add-rankings-page

## Context

排行榜数据由 `getLeaderboardStats`（`src/lib/services/stats-service.ts:605`）提供：一次查询 4 个维度（API Key / 上游 / 模型 / 用户），每维度固定按请求数 DESC、取 top N，另发二次查询补费用与分布。唯一消费方是 dashboard 的 `LeaderboardSection`（limit=5）。指标覆盖不均：上游有 6 项指标，模型缺费用/缓存命中，API Key 与用户缺 TTFT/TPS/缓存命中。

logs 页（`src/app/[locale]/(dashboard)/logs/page.tsx`）已支持后端全量过滤参数，但 URL 初始化只认 `focus` 与 `user_id`，其余过滤器只存组件 state。

## Goals / Non-Goals

**Goals:**

- 独立排行榜页 `/rankings`：单维度查询、7 项指标排序、环比、构成明细展开、跳转日志、URL 状态可恢复。
- leaderboard API 向后兼容演进，dashboard 现有调用行为不变。
- 各维度指标拉齐到 7 项全量（请求数 / tokens / 费用 / TTFT / TPS / 缓存命中率 / 错误率）。

**Non-Goals:**

- member portal 个人排行、数据导出、分页（沿用 limit 上限 50）。
- dashboard `LeaderboardSection` 的布局改造（只加入口链接）。

## Decisions

### D1 API 演进：现有端点加可选参数，服务层按维度拆分

`GET /api/admin/stats/leaderboard` 新增可选参数：

- `dimension`: `upstreams | models | api_keys | users` — 只查该维度并返回单维度结构；
- `sort_by`: `requests | tokens | cost | ttft | tps | cache_hit | error_rate`（默认 `requests`）；
- `compare`: `true` 时附带上一等长周期的对比数据。

不传 `dimension` 时行为与现状完全一致（4 维度、按请求数排），dashboard 与现有测试零改动。

服务层将 `getLeaderboardStats` 的 4 段重复逻辑重构为按维度的查询函数（统一的聚合列构造 + 维度差异化的分组键/详情补齐），`getLeaderboardStats` 组合它们保持旧签名；新增 `getRankings(dimension, sortBy, ...)` 走单维度路径。理由：现函数约 400 行且高度重复，直接塞参数会继续膨胀；拆分同时消除「维度指标不齐」的历史不一致。

替代方案（新开 `/api/admin/stats/rankings` 端点）被否：聚合语义与 leaderboard 完全同源，两个端点会产生两份漂移的实现。

### D2 排序在 SQL 层完成，费用聚合并入主查询

`sort_by` 映射为主查询的 `ORDER BY` 聚合表达式。费用目前是二次查询，无法参与排序，因此主查询 `LEFT JOIN request_billing_snapshots`（与 request_logs 为 1:1，join 不产生行膨胀；实现时以唯一约束/现有写入路径确认）并聚合 `finalCost`，同时删除原费用二次查询。TTFT/TPS/缓存命中/错误率均为已有或同模式的聚合表达式，直接可排序。

### D3 错误率定义

`error_rate = 非 2xx 已完成请求数 / 已完成请求数`。「已完成」指 `status_code` 非空——进行中（in-progress）日志 `status_code` 为空，既不计分子也不计分母，避免把未完成请求误报为错误。复用现有 `successfulRequestCondition`（`stats-service.ts:131`）的口径取反。

### D4 环比：只对主聚合跑对比期查询

`compare=true` 时对窗口 `[start - (end - start), start)` 重跑同一维度的主聚合（不带 limit 截断的排名需要全量？——否：对比期同样取 top 50，超出 50 名视为「新上榜」），返回每个对象的 `prev_rank` 与 `prev_request_count`；分布与明细不查对比期。前端据此渲染排名升降与请求量变化百分比。custom 范围以 `end_date` 为界前移等长窗口；非 custom 范围以当前时刻为 end。

### D5 排行榜视图状态 URL 化

页面状态 `dim / range / sort / order`（custom 时另有 `start / end`）全部写入 query string，变更用 `router.replace` 同步（不产生历史记录堆积），初始化从 `useSearchParams` 读取。跳转 logs 后浏览器返回即可恢复视图。不引入 URL 状态库，沿用 logs 页 `user_id` 的手写模式。

### D6 展开明细复用现有分布数据

行展开区直接渲染 API 已返回的 distribution 列表（上游/Key/用户 → 模型构成；模型 → 上游构成），含条数占比；展开区内「查看日志」链接拼 logs URL（对象 id + 当前时间窗的 `start_time/end_time`）。不为展开明细新增后端查询。

### D7 logs 页 URL 过滤初始化

`logs/page.tsx` 将 `upstream_id`、`api_key_id`、`model`、`start_time`、`end_time` 从 `useSearchParams` 读入 `tableFilters` 初始值（照 `user_id` 现有模式；时间对携带 start/end 时初始化为 custom 范围）。仅影响初始值，后续交互仍走组件 state。

### D8 行内比例条

当前排序指标每行相对榜首的百分比，用纯 CSS 宽度渲染（表格单元格内背景条），不引入图表库。

## Risks / Trade-offs

- [dashboard 回归] leaderboard 服务层重构可能改变现有响应 → 保持旧签名与响应结构，现有 stats-service / route / transformer 单测全部保留并必须通过。
- [费用 join 行膨胀] billing snapshot 若非严格 1:1 会放大 count → 实现时先确认 `request_log_id` 唯一性；若不唯一改用子查询聚合再 join。
- [SQLite 兼容] 新聚合表达式避免 PG 专有语法，保持 `sql` 模板可双方言运行（现有聚合均满足）。
- [mock E2E 打挂] 新页面与新参数需在 `tests/e2e` 的 admin-page-mocks 中 stub，否则现有 E2E 会超时/401（历史教训）。
- [环比成本] compare 使查询数近似翻倍 → 仅主聚合参与对比期查询，且只有 rankings 页传 `compare=true`，dashboard 不受影响。

## Open Questions

无——范围与交互已与用户逐项确认。

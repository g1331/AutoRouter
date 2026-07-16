# Proposal: add-rankings-page

## Why

当前排行榜数据只存在于 dashboard 页的一个 Top 5 摘要板块：排序固定按请求数、只显示 5 条、没有质量维度（错误率）、没有周期对比，运营时无法回答「谁花钱最多」「哪个上游最慢」「相比上周谁涨了」这类问题。需要一个独立的排行榜页面承载完整榜单与多指标排序。

## What Changes

- 新增主导航独立页面「排行榜」（`/rankings`），含 4 个维度 tab：上游 / 模型 / API Key / 用户。
- 表格列头可切换排序指标：请求数、tokens、费用、TTFT、TPS、缓存命中率、错误率（新增聚合）。
- 新增环比对比：对上一个等长周期跑同样聚合，每行显示排名升降与请求量变化百分比（custom 范围同样生效，窗口前移等长）。
- 当前排序指标在每行渲染相对第一名的水平比例条。
- 行点击展开构成明细（上游 / API Key / 用户 → 模型构成；模型 → 上游构成），展开区提供「查看日志」跳转 logs 页并携带对象 + 时间窗过滤。
- 排行榜视图状态（维度、时间范围、排序）URL 化，跳转 logs 后浏览器返回可完整恢复视图。
- logs 页扩展：支持从 URL query 初始化 `upstream_id`、`api_key_id`、`model`、时间窗过滤（沿用 `user_id` 现有模式）。
- 后端 `GET /api/admin/stats/leaderboard` 演进：新增 `dimension`（单维度查询）、`sort_by`、错误率聚合、对比期查询参数；保持对现有 dashboard 调用方的向后兼容。
- dashboard 现有 Top 5 排行板块保留，新增「查看完整排行」入口链接。
- 榜单上限沿用 API 现有 50 条，不做分页；member portal 个人排行与数据导出不在本期范围。

## Capabilities

### New Capabilities

- `rankings-page`: 独立排行榜页面——维度 tab、多指标排序、环比对比、行内比例条、构成明细展开、跳转日志、URL 状态恢复，以及支撑它的 leaderboard API 单维度/排序/错误率/对比期能力。

### Modified Capabilities

- `request-log-workbench`: 日志页新增从 URL query 初始化过滤器的要求（`upstream_id`、`api_key_id`、`model`、时间窗），作为排行榜下钻的落点。

## Impact

- 后端：`src/lib/services/stats-service.ts`（`getLeaderboardStats` 演进 + 错误率/对比期聚合）、`src/app/api/admin/stats/leaderboard/route.ts`、`src/lib/utils/api-transformers.ts`、`src/types/api.ts`。
- 前端：新增 `src/app/[locale]/(dashboard)/rankings/` 页面与组件、`src/hooks/` 新查询 hook、sidebar 导航项、`src/messages/en.json` 与 `zh-CN.json` 双语文案。
- logs 页：`src/app/[locale]/(dashboard)/logs/page.tsx` 过滤器 URL 初始化。
- dashboard：`LeaderboardSection` 加入口链接（不改现有布局与数据流）。
- 测试：stats-service 单测、leaderboard route 单测、新页面组件测试、logs URL 过滤测试；e2e 需在 admin-page-mocks 中 stub 新接口形态，避免打挂现有 mock E2E。

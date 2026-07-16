# Tasks: add-rankings-page

## 1. 后端：服务层重构与新聚合

- [x] 1.1 重构 `getLeaderboardStats`：将四个维度的聚合拆为按维度的查询函数，旧签名与响应结构不变，现有单测保持通过
- [x] 1.2 各维度指标拉齐到 7 项：费用聚合并入主查询（LEFT JOIN request_billing_snapshots，确认 1:1 后移除二次费用查询），为缺失维度补 TTFT/TPS/缓存命中聚合
- [x] 1.3 新增错误率聚合（非 2xx 已完成 / 已完成，排除 status_code 为空的进行中日志）
- [x] 1.4 实现单维度查询入口：`dimension` + `sort_by`（SQL 层 ORDER BY），非法值报错
- [x] 1.5 实现 `compare` 环比：上一等长窗口主聚合，返回 prev_rank / prev_request_count；custom 范围窗口前移等长
- [x] 1.6 stats-service 单测：错误率口径、排序正确性、环比窗口计算、向后兼容（不传 dimension 时结构不变）

## 2. 后端：API 路由与类型

- [x] 2.1 leaderboard route 解析并校验 `dimension` / `sort_by` / `compare` 参数，非法值 400
- [x] 2.2 api-transformers 与 `src/types/api.ts` 增补单维度响应、错误率、环比字段
- [x] 2.3 route 单测：参数校验、单维度响应形态、向后兼容路径

## 3. 前端：排行榜页面

- [x] 3.1 新增 `use-rankings` 查询 hook（dimension/range/sort/compare 参数化）
- [x] 3.2 新增 `/rankings` 页面骨架：维度 tab、TimeRangeSelector 复用、视图状态 URL 化（router.replace 同步，useSearchParams 初始化）
- [x] 3.3 排行表格组件：7 项指标列、列头排序交互、行内比例条（纯 CSS）、错误率与环比（↑↓/新上榜）渲染、空状态
- [x] 3.4 行展开构成明细 + 「查看日志」链接（拼对象过滤与当前时间窗）
- [x] 3.5 sidebar 主导航加「排行榜」入口；dashboard `LeaderboardSection` 加「查看完整排行」链接
- [x] 3.6 `en.json` / `zh-CN.json` 双语文案
- [x] 3.7 组件测试：表格渲染与排序交互、比例条、展开明细、URL 状态初始化与恢复

## 4. logs 页 URL 过滤初始化

- [ ] 4.1 `logs/page.tsx` 从 URL 初始化 `upstream_id` / `api_key_id` / `model` / `start_time` / `end_time`（照 `user_id` 模式；时间对初始化为 custom 范围）
- [ ] 4.2 测试：带参进入初始过滤生效、初始化后交互不被锁定

## 5. E2E 与收尾

- [ ] 5.1 admin-page-mocks stub 新接口形态（单维度 leaderboard 请求），新增 rankings 页 e2e spec（维度切换、排序、展开、跳转 logs 并返回）
- [ ] 5.2 全量校验：`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run`、本地 `pnpm e2e`（--workers=2）
- [ ] 5.3 浏览器双主题实查页面视觉效果

## 1. 令牌层全量替换 + 死代码清除（提交 `feat(design-tokens)`）

- [x] 1.1 `globals.css`：暗/亮两块 `--vr-*` 按 design.md D2 表全量替换；新增 `--vr-accent-dim/-line/-ink`、`--vr-glow`、`--vr-atmo`；`--vr-grid-dot-rgb` 改完整颜色令牌 `--vr-grid-dot`；半径收紧 xs4/sm8/md12/lg16（移动端 sm10/md14）
- [x] 1.2 accent 10 档梯度按 D2 定值重建（暗 500=`#f2a950`/400=hot，亮 500=`#9a6410`/600=hot）；`--vr-status-*-muted` 改 `color-mix` 派生
- [x] 1.3 死代码删除（每项删除前精确字面 grep 复核）：`ui/tag-input.tsx`、`ui/key-value-input.tsx`、`ui/alert.tsx`；52 个死 `--cf-*` + 死 `--radius` + 死 `--status-*`；12 个死工具类；tailwind.config 的 shimmer/scanline、未用 cf-* 令牌、冗余色板；`badgeVariants`/`cardVariants` 取消命名导出
- [x] 1.4 `--cf-*` 塌缩：tailwind.config 中 `rounded-cf-*`/`animate-log-*` 等类映射直指 `--vr-*`（类名不变）；globals 内部 `vr-log-*` 关键帧、glow 系列的 rgb 字面量改 `color-mix` 派生；`vr-cap-select` 裸 emerald 改 status-success
- [x] 1.5 `--md-sys-color-*` 各角色数值按新调色板重派生（值换层不删，13 个弹窗不掉队）
- [x] 1.6 body 氛围层：顶部 `--vr-atmo` 径向光晕（`background-attachment: fixed`）+ 26px `--vr-grid-dot` 点阵；新增 `vr-rise` keyframe + `.animate-rise`
- [x] 1.7 视觉守卫修复（`src/lib/utils.ts`）：正则补 `(?:\/\d{1,3})?` alpha 后缀与 `text-(blue|indigo|violet|purple)-\d{3}`
- [x] 1.8 新增 `tests/unit/visual-style-guard.test.ts` 与 `tests/unit/design-tokens-contrast.test.ts`（D3 表 ✅ 行断言 ≥4.5:1）并通过
- [x] 1.9 验收：`tsc --noEmit` + lint + 两个新单测绿；暗/亮双主题浏览器 spot check（dashboard/keys），对照 demo 校准 surface-4 与 accent 外推档；提交

## 2. Saira display 字体（提交 `feat(fonts)`）

- [x] 2.1 拷入 `saira-latin-wght-normal.woff2` 至 `src/app/fonts/`（附 OFL 1.1 许可说明）；`layout.tsx` 新增第三个 localFont（weight "100 900"，variable `--font-display`，fallback Bahnschrift + CJK 栈）
- [x] 2.2 `--vr-font-display` 接 `--font-display`；`.type-label` 字距提至 0.08–0.1em；实测 Saira tnum——支持则 body 加 `font-variant-numeric: tabular-nums`，不支持则数据数字维持 JetBrains Mono 并在 design.md Open Questions 记录结论
- [x] 2.3 验收：`tsc` + lint 绿；浏览器确认标题/大数值走 Saira、正文不受影响；提交

## 3. ui primitives + 框架 chrome（提交 `refactor(ui)`）

- [x] 3.1 `ui/button.tsx`：primary=amber 实心 + `--vr-accent-ink` 文字、hover glow 仅暗色（cva class only，API 不动）；`ui/badge.tsx` 删冗余 `dark:`
- [x] 3.2 新增 `ui/status-led.tsx`（三态 LED，暗色 glow+呼吸，reduced-motion 常亮）+ `ui/state-chip.tsx`（CLOSED/HALF/OPEN 芯片），含组件测试
- [x] 3.3 `ui/sonner.tsx` 修 `theme="dark"` 固定值 → 读 next-themes `resolvedTheme`；`ui/dialog.tsx` 仅样式类（morph props/结构一行不动）
- [x] 3.4 `admin/sidebar.tsx`/`topbar.tsx`/`app-shell.tsx` 令牌类对齐（不动结构与移动端 bottom tabs）；topbar 保留 `>>` 前缀并接 StatusLed；app-shell 接 `.animate-rise` stagger
- [x] 3.5 验收：`tsc` + lint + 相关组件测试绿；morph 冒烟（keys/upstreams/portal-keys 各一）；本地 `pnpm e2e --workers=2` 绿；提交

## 4. dashboard 图表与指标卡（提交 `feat(dashboard)`）

- [x] 4.1 `chart-theme.ts` 全量重配色（primary、grid/tooltip 走令牌、8 色上游序列），保留 `chartTheme` 向后兼容导出，同步更新其单测
- [x] 4.2 `usage-chart.tsx` AreaChart → ComposedChart（total=柱+面积线，by-upstream=堆叠柱），修 `rgba(245,158,11,…)` 硬编码（:461、:482）
- [x] 4.3 `stats-cards.tsx`：uppercase 微标签 + display 数值 + requests/tokens/cost 三卡 sparkline（`useStatsTimeseries("today", metric)` + 纯 SVG polyline；`TimeRange` 无 `"24h"` 档，用当日小时粒度）+ 告警红框变体（复用 `getTtftPerformanceClass` 阈值）
- [x] 4.4 同步补 dashboard mock E2E 的 timeseries stub（auth-role-routing 单 route 覆盖三个 metric 请求）；leaderboard-section 饼图改随主题取色/time-range-selector 令牌对齐（dashboard-loading 复核已达标）
- [x] 4.5 验收：chart-theme 单测 + `tsc` + lint 绿；本地 `pnpm e2e --workers=2` 绿；双主题 spot check；提交

## 5. 路由拓扑面板（提交 `feat(dashboard)`）

- [x] 5.1 新增 `src/components/dashboard/routing-topology.tsx`：SVG viewBox 720×280，数据契约与节点状态规则按 design.md D8（`useUpstreams(1,50)` + `useUpstreamHealth(true)` + `useLivePulse()`，前 6–8 节点 + 「+N」溢出；实际取前 8 个）
- [x] 5.2 流量包 SMIL `<animateMotion><mpath/>`；reduced-motion 用 JS matchMedia 判定不渲染动画子树（`useSyncExternalStore`，与 theme-toggle 同模式）；a11y：`role="img"` + `<title>/<desc>` + visually-hidden 摘要
- [x] 5.3 i18n：`dashboard.topology.*` 同落 `en.json`/`zh-CN.json`；面板落位 StatsCards 与 usage 区块之间
- [x] 5.4 新增 `tests/components/dashboard/routing-topology.test.tsx`（真实 next-intl 消息 + mock 三 hooks，8 场景）；auth-role-routing.spec.ts 补 upstreams/health/live-pulse 三个 stub（进 /dashboard 的 mock spec 仅此一个）
- [x] 5.5 验收：新组件测试 8/8 + `tsc` + lint 绿；本地 `pnpm e2e --workers=2` 11/11 绿；双主题 spot check（真实 dev 数据：ok/bad/inactive 三态 + 溢出「+1」）；提交

## 6. 硬编码清理（提交 `refactor(admin)`）

- [x] 6.1 状态三连 class 收敛：新增 `src/lib/status-tone.ts`（soft/faint 两档静态映射表，附单测）并替换 8 文件（status-led/login/settings/header-compensation/lifecycle-track/logs-table/upstream-form-dialog/upstreams-table；Phase 1–5 已消掉部分实例，实测收敛 28 处）
- [x] 6.2 硬编码色值清理：`logs-table.tsx`（emerald:1136；10 处 inline style 均为 animationDelay 动态值，保留）、`routing-decision-timeline.tsx`（emerald 选中态 + 裸 red/orange 共 9 处）、`cliproxy-connection-result`（emerald/amber 双连）、`cliproxy-oauth-login-dialog`、`cliproxy-instance-logs-panel`（WARN/INFO 级别色一并令牌化）、`lifecycle-track.tsx`（蓝紫→info/中性；红绿 rgba 渐变→color-mix 令牌）、`billing/page.tsx` text-green-600 ×5、`upstream-form-dialog.tsx` sky rgba ring→color-mix（stats-cards:223 为 Phase 4 新定告警形态，保留）
- [x] 6.3 裸 `rounded-*` 清零（规划时 64 处，前序阶段已顺手消化，收尾剩 7 处：login/billing×3/edit-key-dialog/leaderboard-section/skeleton，按 xl→cf-md、md/lg→cf-sm 就近映射）；四个 key/test dialog 的“inline 样式”实为 `[rgb(var(--md-sys-color-*))]` 任意值类，归并至任务 7 用统一映射表迁移
- [x] 6.4 验收：`tsc` + lint 0 错误；status-tone 单测 9/9 + tests/components 全量 882/882 绿；本地 `pnpm e2e --workers=2` 11/11 绿；logs/upstreams 页双主题 spot check；提交

## 7. md-sys 迁移与删层（提交 `refactor(ui)`）

- [ ] 7.1 按 design.md D4 映射表机械替换 14 文件 179 处 `--md-sys-color-*` 引用 → `--vr-*`/既有类；逐文件浏览器 spot check（重点：create/edit/show-key-dialog、test-upstream-dialog、calendar）
- [ ] 7.2 精确字面 grep 复核 `--md-sys-color-` 零命中后删除 globals.css 两个 md-sys 块与 `--shape-corner-*`（若同为零引用）
- [ ] 7.3 验收：`tsc` + lint 绿；morph 弹窗冒烟；本地 `pnpm e2e --workers=2` 绿；提交

## 8. portal + login + landing 对齐（提交 `refactor(portal)`）

- [ ] 8.1 portal 四页随令牌自动更新核验 + PortalUsageChart 接新 chart-theme；login 终端 boot 布局不动只换令牌
- [ ] 8.2 landing 色相对齐（`capability-animations.tsx` emerald 字面量→status-success），浏览器验证（CSR，curl 无效）
- [ ] 8.3 验收：`tsc` + lint 绿；本地 `pnpm e2e --workers=2` 绿；portal/login/landing 双主题 spot check；提交

## 9. 测试接线 + 全量验证 + 交接（提交 `test(visual)` 等）

- [ ] 9.1 新增 `playwright.visual.config.ts`（复用 e2e 的 SQLite + dev server bootstrap，visual + a11y 两 project）+ package.json `test:visual`/`test:a11y` 脚本；清理 `tests/visual/archive`（删前核实引用）
- [ ] 9.2 视觉基线一次性重生成（`--update-snapshots`，login/dashboard/keys/upstreams 四张 fullPage，注记生成平台 Windows）；axe AA 全量复跑（text-dim/bronze 命中正文则按 D3 兜底档提亮）
- [ ] 9.3 全量验证：`pnpm test:run --coverage`、`pnpm e2e`、`pnpm lint`、`pnpm format:check`、`pnpm exec tsc --noEmit`、`pnpm build`（DB_TYPE=postgres）
- [ ] 9.4 push 分支 + 建 PR（附四页前后截图与双主题对照，模板齐全）；CI 绿后停在交接边界（合并由用户决定）

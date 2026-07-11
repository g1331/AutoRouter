# restyle-ops-console-2 设计文档

## Context

前端样式体系现状（已经代码勘察核实）：

- Tailwind v4 CSS-first（`@import "tailwindcss"; @config "../../tailwind.config.ts";`），`src/app/globals.css` 是唯一手写 CSS。
- 令牌三层结构：`--vr-*`（真源）→ shadcn 语义变量（`--background`/`--primary`…）→ `--cf-*` 别名层 + `--md-sys-color-*` Material 层。`tailwind.config.ts` 把 `amber-*`/`surface-*`/`status-*`/`black-*`/`divider`/`overlay` 等类名重映射到令牌。
- **`--cf-*` 别名层在 tsx 零引用**，唯一消费者是 tailwind config 与 globals 内部 → 可塌缩进 `--vr-*`，类名不变、组件零改动。
- **`--md-sys-color-*` 是活代码**：14 个文件 179 处引用（集中在 create/edit/show-key-dialog、test-upstream-dialog、calendar 等），不能直接删。
- 死代码清单（精确字面 grep 复核）：`ui/tag-input.tsx`、`ui/key-value-input.tsx`、`ui/alert.tsx` 零引用；52 个死 `--cf-*`；死 `--radius`、死 `--status-*`；12 个死工具类（`.type-data`/`.type-code`/`.text-amber-muted`/`.text-success|warning|error|info`/`.glow-*`/`.bg-surface-500|600`）；tailwind 死配置（shimmer/scanline keyframes、未用 `cf-*` 令牌、black 色板大部、surface-600、amber-50）。
- View Transitions 容器变形弹窗（`useContainerMorph`，13 个具名过渡、约 27 个调用点）是既有招牌交互，必须原样保留。
- `tests/visual/` 与 `tests/a11y/` 是孤儿测试：未接入任何 Playwright 配置、package.json 或 CI。
- next-themes class 模式、暗色默认（`:root,.dark` 共用暗色块，`.light` 覆盖），storageKey `autorouter-theme`。

设计参考稿为用户批准的 Ops Console 2.0 demo（会话 scratchpad `style-demo2.html`），本文件把其中的令牌定值与模块设计固化为实施契约。

## Goals / Non-Goals

**Goals:**

- 令牌真源全量换为 Ops Console 2.0 调色：暗色主人格（近黑蓝灰底 + amber `#f2a950`）、亮色中性冷灰（禁暖黄底，青铜 `#9a6410` 体系）。
- 死样式代码完全清除；`--cf-*` 别名层塌缩、`--md-sys-color-*` 层迁移后删除，最终只剩 `--vr-*` 真源 + shadcn 语义变量两层。
- 引入 DIN 系 display 字体（Saira，本地 woff2），建立 “display 标题 / sans 正文 / mono 数据” 三字体秩序。
- 新增路由拓扑签名面板（零后端改动）；KPI 卡加 sparkline 与告警变体；usage 图表改柱+面积线组合。
- 全部关键色彩配对满足 WCAG 2.1 AA，并用单测锁定防回归。
- 视觉/无障碍测试重新接线为可运行的 CI 外本地门禁。

**Non-Goals:**

- 不改任何后端 API、数据库、代理逻辑。
- 不动 View Transitions morph 弹窗的结构与 props（只允许样式类调整）。
- 不重构大文件的组件结构（`logs-table.tsx` 3742L、`upstream-form-dialog.tsx` 4053L 仅做类/令牌替换）。
- landing 页只对齐色相不动布局；VitePress docs 站不在范围。
- 不新增运行时 npm 依赖。

## Decisions

### D1 — 令牌架构：塌缩为两层，类名不变

**决策**：删除 `--cf-*` 别名层与 `--md-sys-color-*` 层，tailwind 类名（`amber-*`/`surface-*`/`rounded-cf-*`/`animate-log-*` 等）直接映射到 `--vr-*`。

**理由**：别名层零外部引用，纯粹是历史包袱；保持类名不变使 200+ 组件调用点零改动。md-sys 层有 179 处活引用，采用 “先重派生值（Phase 1，13 个弹窗不掉队）→ 机械迁移（Phase 6b）→ 删层” 两步，避免一次性大爆炸。

**备选**：a) 保留别名层只换值——维护成本不降，弃；b) md-sys 直接删——会打挂 14 个文件，弃。

### D2 — 新令牌定值（用户已批准，实施契约）

#### 暗色（主人格，`:root, .dark`）

| 令牌 | 旧值 | 新值 | 语义 |
|---|---|---|---|
| `--vr-surface-0` | `#111315` | `#0a0b0e` | 页面底 |
| `--vr-surface-1` | `#161a1d` | `#101216` | 面板底 |
| `--vr-surface-2` | `#1d2227` | `#15181d` | 卡片底 |
| `--vr-surface-3` | `#242a31` | `#1a1e24` | 悬浮/嵌套底 |
| `--vr-surface-4` | `#2d343c` | `#20242b`（由 surface-3 外推，Phase 1 末对照校准） | 最高容器 |
| `--vr-border` | `#3a424c` | `#21262e` | 主边线 |
| `--vr-border-subtle` | `#2b3139` | `#2b323c`（demo `--line2`，作强边线；弱边线取主边线） | 强调边线 |
| `--vr-text` | `#edf1f4` | `#e8e4da` | 主文字（暖白） |
| `--vr-text-muted` | `#b8c0c8` | `#9aa2ae` | 次文字 |
| `--vr-text-dim` | `#8d97a1` | `#626b78`（3.48:1，仅装饰/大字号；axe 命中正文则提亮 `#7d8794`=5.15:1） | 弱文字 |
| `--vr-status-success` | `#48a476` | `#46d68c` | ok |
| `--vr-status-warning` | `#c38d4c` | `#ff9f43` | warn |
| `--vr-status-error` | `#cc6156` | `#ff6b5e` | bad |
| `--vr-status-info` | `#6694b8` | `#7aa5c8`（微调适配新底，日志动画/timeline 在用） | info |
| `--vr-status-*-muted` | rgb/0.2 | `color-mix(in srgb, var(--vr-status-*) 12%, transparent)` | 状态底 |
| `--vr-accent-dim`（新增） | — | `rgba(242,169,80,.13)` | accent 弱底 |
| `--vr-accent-line`（新增） | — | `rgba(242,169,80,.38)` | accent 边线 |
| `--vr-accent-ink`（新增） | — | `#1c1204` | amber 实心钮文字 |
| `--vr-glow`（新增） | — | `0 0 14px rgba(242,169,80,.22)` | 辉光 |
| `--vr-atmo`（新增） | — | `rgba(242,169,80,.13)` | 顶部氛围光晕 |
| `--vr-grid-dot`（改名自 `-rgb`） | `101 108 117` | `rgba(101,108,117,.10)`（完整颜色令牌） | 背景点阵 |

暗色 accent 10 档（500=amber、400=hot，其余按 HSL 梯度外推，Phase 1 末对照 demo 截图校准一次）：

| 档 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| 值 | `#fef7ec` | `#fdeacf` | `#fbdbab` | `#ffd28f` | `#ffc46e` | `#f2a950` | `#cf8b3c` | `#a86f2f` | `#825523` | `#5c3c18` |

#### 亮色（中性冷灰，`.light`）

| 令牌 | 旧值 | 新值 | 语义 |
|---|---|---|---|
| `--vr-surface-0` | `#f2f5f8` | `#eef0f2` | 页面底 |
| `--vr-surface-1` | `#ffffff` | `#f8f9fa` | 面板底 |
| `--vr-surface-2` | `#f6f8fb` | `#fdfdfe` | 卡片底 |
| `--vr-surface-3` | `#edf1f6` | `#eaedf0` | 悬浮/嵌套底 |
| `--vr-surface-4` | `#e2e8f0` | `#e2e6ea`（外推，同上校准） | 最高容器 |
| `--vr-border` | `#c7d0da` | `#dcdfe4` | 主边线 |
| `--vr-border-subtle` | `#d8dfe8` | `#c6cbd2`（强边线） | 强调边线 |
| `--vr-text` | `#1f2933` | `#212327` | 主文字 |
| `--vr-text-muted` | `#5f6b79` | `#5f6570` | 次文字 |
| `--vr-text-dim` | `#768293` | `#8f96a0`（2.61:1，仅装饰） | 弱文字 |
| `--vr-status-success` | `#2c7d58` | `#106b3f`（axe 兜底加深，原 `#17804d` 在 muted 底上 3.8–4.3:1） | ok |
| `--vr-status-warning` | `#9c6b36` | `#7d490a`（整档采用深档，7.04:1 on surface-0） | warn |
| `--vr-status-error` | `#b24a43` | `#a53228`（axe 兜底加深，原 `#bb3f34`） | bad |
| `--vr-status-info` | `#3f6f95` | `#325a7d`（axe 兜底加深，原值在 muted 底上 4.49:1 卡线） | info |
| `--vr-accent-dim` | — | `rgba(154,100,16,.09)` | accent 弱底 |
| `--vr-accent-line` | — | `rgba(154,100,16,.32)` | accent 边线 |
| `--vr-accent-ink` | — | `#ffffff`（4.99:1 on `#9a6410`） | 实心钮文字 |
| `--vr-glow` | — | `none`（亮色无辉光） | 辉光 |
| `--vr-atmo` | — | `rgba(90,110,140,.07)`（冷灰蓝，禁 amber 光晕） | 氛围 |
| `--vr-grid-dot` | `143 154 167` | `rgba(70,80,100,.07)` | 点阵 |

亮色 accent 10 档（500=bronze、600=hot 深档，文字级 accent 一律走 600）：

| 档 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|
| 值 | `#f7f1e6` | `#eee0c8` | `#e0c99e` | `#cca66a` | `#b3853a` | `#9a6410` | `#7a4e0a` | `#634007` | `#4c3105` | `#382404` |

#### 非颜色令牌

- 半径收紧：`--vr-radius-xs/sm/md/lg` = 4/8/12/16px（移动端媒体查询 sm=10/md=14）。
- 动效：保留 fast/normal/slow + 两条 easing；新增 `vr-rise` keyframe（进场瀑布）+ `.animate-rise`。
- 阴影：`glow-*` 系列的 rgb 字面量全部改 `color-mix(in srgb, var(--vr-…) N%, transparent)` 派生。
- 氛围层：`body` 双层 background = 顶部 `--vr-atmo` 径向光晕（`background-attachment: fixed`）+ 26px `--vr-grid-dot` 点阵。

### D3 — 对比度实测表（WCAG 相对亮度计算，实施与单测契约）

| 配对 | 比值 | 判定 |
|---|---|---|
| 暗 text/surface-1（`#e8e4da`/`#101216`） | 14.77:1 | ✅ AAA |
| 暗 text-muted/surface-1 | 7.28:1 | ✅ AAA |
| 暗 text-dim/surface-1（`#626b78`） | 3.48:1 | ⚠️ 仅装饰/大字号 |
| 暗 text-dim 提亮档（`#7d8794`） | 5.15:1 | ✅ AA（axe 兜底档） |
| 暗 amber/surface-1 | 9.43:1 | ✅ AAA |
| 暗 amber-hot/surface-1 | 11.94:1 | ✅ AAA |
| 暗 ink/amber（实心钮） | 9.29:1 | ✅ AAA |
| 暗 ok / warn / bad on surface-1 | 10.05 / 9.19 / 6.71 | ✅ AA+ |
| 亮 text/surface-0（`#212327`/`#eef0f2`） | 13.78:1 | ✅ AAA |
| 亮 text-muted/surface-0 | 5.13:1 | ✅ AA |
| 亮 text-dim/surface-0（`#8f96a0`） | 2.61:1 | ⚠️ 仅装饰 |
| 亮 bronze `#9a6410` /surface-0 | 4.37:1 | ⚠️ 大字号/边框/填充 only |
| 亮 bronze-hot `#7a4e0a` /surface-0 | 6.29:1 | ✅ AA（文字级 accent） |
| 亮 白字/bronze 实心钮 | 4.99:1 | ✅ AA |
| 亮 ok / bad on surface-1 | 4.71 / 5.14 | ✅ AA（Phase 8 axe 兜底后进一步加深，见下） |
| 亮 warn `#a5610d` on surface-1 | 4.62:1 | ⚠️ 边缘达标 → Phase 8 起整档采用深档 `#7d490a`（7.04:1） |
| 亮 ok/warn/bad/info 叠 12% muted over surface-3（最坏合成底） | 4.73 / 4.67+ / 4.83 / 5.2+ | ✅ AA（Phase 8 axe 实测兜底：`#106b3f`/`#7d490a`/`#a53228`/`#325a7d`） |

**规则**：亮色文字级 accent 一律 `accent-600`（hot 深档）；`#9a6410` 留给大字号、边框、图形填充。`tests/unit/design-tokens-contrast.test.ts` 对上表 ✅ 行断言 ≥4.5（AA），锁死回归。

### D4 — md-sys → vr 角色映射表（Phase 6b 机械迁移契约）

md-sys 当前以 RGB 三元组消费（`rgb(var(--md-sys-color-…))` / Tailwind 任意值）。迁移时按下表逐一替换为 `--vr-*` 令牌或既有 tailwind 类：

| md-sys 角色 | 迁移目标 |
|---|---|
| `primary` | `var(--vr-accent-500)` / `text-amber-500` 等既有类 |
| `on-primary` | `var(--vr-accent-ink)` |
| `primary-container` | `var(--vr-accent-dim)` |
| `on-primary-container` | 暗 `var(--vr-accent-100)` / 亮 `var(--vr-accent-800)` |
| `tertiary-container` | `var(--vr-status-info-muted)` |
| `on-tertiary-container` | `var(--vr-status-info)`（文字级按主题就近取深/浅档） |
| `success` | `var(--vr-status-success)` |
| `success-container` / `on-success-container` | `var(--vr-status-success-muted)` / `var(--vr-status-success)` |
| `warning-container` / `on-warning-container` | `var(--vr-status-warning-muted)` / warn 文字档（亮=deep） |
| `error` / `error-container` / `on-error-container` | `var(--vr-status-error)` / `var(--vr-status-error-muted)` / error 文字档 |
| `surface-container-low` | `var(--vr-surface-1)` |
| `surface-container-highest` | `var(--vr-surface-4)` |
| `inverse-surface` | `var(--vr-text)`（反色场景个案核对） |
| `on-surface` | `var(--vr-text)` |
| `on-surface-variant` | `var(--vr-text-muted)` |
| `outline` | `var(--vr-border)` |
| `outline-variant` | `var(--vr-border-subtle)` |

Phase 1 只把 md-sys 各角色的**数值**按新调色板重派生（弹窗不掉队）；Phase 6b 按表机械替换 14 文件 179 处 → 逐文件浏览器 spot check → 删除整个 md-sys 块（删前字面 grep 复核零引用）。

### D5 — 字体：Saira（display）+ 现有 Manrope/JetBrains Mono

**决策**：取 `@fontsource-variable/saira` 的 `saira-latin-wght-normal.woff2` 拷入 `src/app/fonts/`（与现有 manrope/jetbrains-mono 同源产线，附 OFL 1.1 许可说明），`layout.tsx` 第三个 `localFont`（weight `"100 900"`，variable `--font-display`），fallback 首位 Windows 自带的 Bahnschrift，再接 CJK 栈。`--vr-font-display` 改接新变量，`.type-*` 系列自动全站生效；`.type-label` 字距提至 0.08–0.1em；body 加 `font-variant-numeric: tabular-nums`（Phase 2 实测 Saira tnum 支持，无则数据数字继续走 JetBrains Mono）。

**理由**：demo 的 DIN 语感来自 Bahnschrift，但它是 Windows 专有字体不能分发；Saira 是 OFL 的 DIN 系可变字体，最接近且可入仓。备选 Archivo/Barlow 语感偏几何 grotesque，弃。

### D6 — 视觉语言要素（组件契约）

- **微标签**：uppercase + 0.08em 字距 + text-dim，用于卡片眉、表头、区块标题。
- **`>>` 页标题前缀**：topbar 保留现有实现，接 display 字体。
- **LED 状态灯**：新增 `ui/status-led.tsx`——三态（ok/warn/bad），暗色带 `--vr-glow` 辉光 + 呼吸动画，reduced-motion 常亮；亮色无辉光。
- **状态芯片**：新增 `ui/state-chip.tsx`——CLOSED/HALF/OPEN 熔断芯片（LED + mono 大写文字 + 状态色边线），熔断页/拓扑/logs 复用。
- **STATUS_TONE 工具**：把 10 个文件里 44 次重复的状态三连 class（text/bg/border 组合）收敛为一个小工具函数。
- **动效仅四处**：进场瀑布（`.animate-rise` stagger）、拓扑流量包（SMIL）、LIVE 呼吸灯、日志新行闪烁；全部受 `prefers-reduced-motion` 约束。
- **图表**：`chart-theme.ts` 全量重配（primary=amber/bronze、grid/tooltip 走令牌、8 色上游序列重配，保留 `chartTheme` 向后兼容导出）；usage-chart 改 ComposedChart（total=柱+面积线，by-upstream=堆叠柱）。
- **视觉守卫**：`src/lib/utils.ts` 的 `warnIfForbiddenVisualStyle` 正则补 alpha 后缀 `(?:\/\d{1,3})?` 与 `text-(blue|indigo|violet|purple)-\d{3}`，新增 `tests/unit/visual-style-guard.test.ts`。

### D7 — Dashboard 布局与 KPI 卡（布局示意）

```
┌─ Topbar ─ ">> DASHBOARD"  ······  [LED●LIVE] [theme] [user] ─┐
├──────────────────────────────────────────────────────────────┤
│ ┌KPI──────┐ ┌KPI──────┐ ┌KPI──────┐ ┌KPI──────┐ ┌KPI──────┐ │
│ │REQUESTS │ │TOKENS   │ │COST     │ │AVG TTFT │ │ERROR %  │ │
│ │ 12,480  │ │ 8.4M    │ │ $12.40  │ │ 420ms   │ │ 0.8%    │ │
│ │ ╱╲_╱╲_╱ │ │ _╱╲╱╲_  │ │ ╱╲╱╲__  │ │ (无spark)│ │(告警红框)│ │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
│ ┌─ ROUTING TOPOLOGY ──────────────────────────── [+2 more] ┐ │
│ │            ┌────────┐    ●──── upstream-a  [CLOSED] ──── │ │
│ │  client ══▶│ ROUTER │───●──── upstream-b  [HALF]  ─ ─ ─ │ │
│ │            └────────┘    ●┄┄┄┄ upstream-c  [OPEN]  ✕    │ │
│ │  (SMIL 流量包沿 ok 边流动；open/unhealthy 红虚线无包)      │ │
│ └───────────────────────────────────────────────────────────┘ │
│ ┌─ USAGE (ComposedChart: 柱+面积线) ──┐ ┌─ LEADERBOARD ────┐ │
│ │ ▂▄▆█▅▃▂ + 折线叠加                  │ │ 1. upstream-a ▓▓▓│ │
│ └─────────────────────────────────────┘ └──────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

KPI 卡视觉层级：微标签（uppercase dim）→ display 大数值（tabular-nums）→ mini sparkline（纯 SVG polyline，`useStatsTimeseries("24h", metric)`，v1 仅 requests/tokens/cost 三卡）→ 副标题。告警变体：`getTtftPerformanceClass` 阈值命中时红框 + bad 色数值。

### D8 — 路由拓扑面板：数据契约与状态规则

**落位**：`src/components/dashboard/routing-topology.tsx`，StatsCards 与 usage 区块之间，全宽 Card。**零后端改动**，全部复用现成 hooks：

| 数据源 | 字段 | 用途 | 刷新 |
|---|---|---|---|
| `useUpstreams(1, 50)` | `id`,`name`,`priority`,`weight`,`is_active`,`circuit_breaker.state` | 节点列表（按 priority/weight 取前 6–8 个，溢出「+N」）、熔断态 | TanStack Query 缓存 |
| `useUpstreamHealth(true)` | 每上游 `healthy` | 节点健康 | 30s 轮询 |
| `useLivePulse()` | `rpm`,`errorRatePct`,`openCircuitBreakers` | rpm→流量包密度；errorRatePct→核心节点 warn 描边；openCircuitBreakers→副标题 | SSE 2s |

**节点状态规则**（唯一裁决表，组件测试按此断言）：

| 条件（按序判定） | 视觉 |
|---|---|
| `!is_active` | 灰化节点，无边线动效 |
| `state === "open" \|\| !healthy` | bad 红色**虚线**边，节点离线样式，无流量包 |
| `state === "half_open"` | warn 边线，低频流量包 |
| `state === "closed" && healthy` | ok 实线边，正常流量包 |

**实现**：SVG `viewBox 720×280`；流量包 = SMIL `<animateMotion><mpath/>`；**reduced-motion 必须 JS 处理**（`matchMedia("(prefers-reduced-motion: reduce)")` 为真时不渲染 animateMotion 子树——SMIL 不受 CSS media query 控制）。

**a11y**：`role="img"` + `<title>/<desc>` + visually-hidden 文字摘要（N 个上游、各状态计数）。**i18n**：`dashboard.topology.*` 同落 `en.json`/`zh-CN.json`（namespace 顶层写、点号键放 `t()` 内）。

### D9 — 测试接线

新增 `playwright.visual.config.ts`（复用 e2e 的 SQLite + dev server bootstrap，`visual` + `a11y` 两个 project），package.json 添 `test:visual`/`test:a11y` 脚本；清理 `tests/visual/archive`（删前核实引用）。视觉基线**只在 Phase 8 一次性重生成**（login/dashboard/keys/upstreams 四张 fullPage，注记基线生成平台为本地 Windows）。E2E 有 5 个 spec 使用路由 mock：dashboard 新增挂载期请求（拓扑 + 3 个 sparkline timeseries）**必须同阶段补 stub**（历史教训：布局层全局请求曾打挂 mock E2E）。

## Risks / Trade-offs

- [亮色 bronze/warn 小字号不达 AA（4.37/4.62:1）] → 文字级统一走深档（6.29/7.04:1）；对比度单测锁定；Phase 8 axe 兜底。
- [morph 弹窗回归] → `ui/dialog.tsx` 结构与 props 冻结，只动样式类；13 个 morph 名单不动；每渲染阶段冒烟 keys/upstreams/portal-keys 各一。
- [chart-theme 爆炸半径] → 保留 `chartTheme` 向后兼容导出；ComposedChart 只重写配置段；单测同阶段更新。
- [新挂载请求打挂 mock E2E] → 拓扑 + sparkline 新增请求同阶段补 stub（auth-role-routing.spec.ts 等 5 个 spec）。
- [快照 churn] → 基线只在 Phase 8 重生成一次；PR 附前后截图。
- [md-sys 迁移量大（179 处）] → D4 机械映射表 + 逐文件 spot check + 删前 grep 复核。
- [Saira tnum 未实测] → Phase 2 实测；不支持则数据数字继续 JetBrains Mono。
- [accent 梯度外推档偏差] → 50–300/700–900 档为外推值，Phase 1 末对照 demo 截图校准一次。
- [SMIL 在部分浏览器/降级环境不可用] → 拓扑面板静态渲染仍完整表达状态（边线颜色/虚线/LED），动效纯增强。

## Migration Plan

阶段 = 提交边界（Conventional Commits 简体中文），每阶段跑 `tsc --noEmit` + lint + 最窄对应测试；渲染契约阶段（3–7）推送前本地 `pnpm e2e --workers=2`；暗/亮双主题浏览器 spot check + morph 冒烟：

| 阶段 | 内容 | 提交 |
|---|---|---|
| 1 | 令牌层全量替换 + 死代码清除 + cf 塌缩 + md-sys 重派生 + 守卫修复 + 对比度/守卫单测 | `feat(design-tokens)` |
| 2 | Saira display 字体 | `feat(fonts)` |
| 3 | ui primitives + chrome（status-led/state-chip 新增、sonner 修复、dialog 冻结改样式） | `refactor(ui)` |
| 4 | chart-theme 重写 + ComposedChart + KPI sparkline/告警 + e2e stub | `feat(dashboard)` |
| 5 | 路由拓扑面板 + i18n + 组件测试 + e2e stub | `feat(dashboard)` |
| 6a | 硬编码色值/圆角全仓清理 + STATUS_TONE 收敛 | `refactor(admin)` |
| 6b | md-sys 179 处迁移 + 删层 | `refactor(ui)` |
| 7 | portal + login + landing 色相对齐 | `refactor(portal)` |
| 8 | 测试接线 + 基线一次性重生成 + axe AA + 全量验证（test:run/e2e/lint/format/tsc/build）+ push + PR | `test(visual)` 等 |

回滚策略：单分支单 PR，任一阶段回滚即 revert 对应提交；令牌层替换保持名字与消费方式不变，回滚不产生连锁改动。

## Open Questions

- ~~Saira 的 `tnum`（tabular figures）支持度待 Phase 2 实测~~ **已实测（Chrome，2026-07-10）：支持**——开启 `tabular-nums` 后 `1111` 与 `8888` 同宽（158.73px vs 未开启 96.3/174.9px），body 已全局启用 `font-variant-numeric: tabular-nums`。
- `--vr-surface-4` 与 accent 外推档的最终值在 Phase 1 末对照 demo 截图校准（允许 ±1 档微调，不改契约结构）。

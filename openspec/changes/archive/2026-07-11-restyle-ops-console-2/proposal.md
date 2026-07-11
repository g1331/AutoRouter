# restyle-ops-console-2 提案

## Why

现有前端视觉层在多轮迭代后积累了大量死代码：52 个零引用的 `--cf-*` 别名令牌、12 个死工具类、3 个零引用 UI 组件、tailwind 死配置，以及并存的 `--md-sys-color-*` Material 层与散落全仓的硬编码色值/圆角（60+ 处），维护成本高且视觉表达漂移。用户已批准全新的 “Ops Console 2.0” 设计方向（暗色主人格 + 中性冷灰亮色，修复旧亮色偏黄问题），需要一次完整的令牌换血、死代码清除与新风格落地。

## What Changes

- **令牌层全量替换**：`src/app/globals.css` 的 `--vr-*` 真源换为 Ops Console 2.0 调色（暗色 amber `#f2a950` 体系、亮色青铜 `#9a6410` 体系 + 中性冷灰底），新增 `--vr-accent-dim/-line`、`--vr-glow`、`--vr-atmo` 语义令牌；关键配对通过 WCAG AA 对比度单测锁定
- **死代码清除**（**BREAKING**，仅限仓库内部 API）：删除 `ui/tag-input.tsx`、`ui/key-value-input.tsx`、`ui/alert.tsx` 三个零引用组件；删除 52 个死 `--cf-*` 变量、死 `--radius`/`--status-*`、12 个死工具类；tailwind.config 删除 shimmer/scanline 与未用令牌映射；`badgeVariants`/`cardVariants` 取消命名导出
- **`--cf-*` 别名层塌缩**：tailwind 类名（`rounded-cf-*` 等）直接指向 `--vr-*`，类名不变、组件零改动
- **`--md-sys-color-*` Material 层移除**（两步：先按新调色板重派生值，再把 14 文件 179 处引用迁移到 `--vr-*` 后删层）
- **引入 Saira display 字体**（OFL 1.1，本地 woff2，DIN 系，fallback Bahnschrift），接入 `--vr-font-display` 与 `.type-*` 系列
- **ui primitives 与框架 chrome 对齐**：button/badge/dialog/sonner（修 theme 固定值）等 23 个组件类调整；新增 `ui/status-led.tsx` 与 `ui/state-chip.tsx`；View Transitions morph 弹窗结构冻结不动
- **dashboard 模块改版**：chart-theme 全量重配色、usage-chart 改 ComposedChart（柱+面积线）、KPI 卡加 sparkline 与告警红框变体
- **新增路由拓扑签名面板**：dashboard 新面板，SVG 拓扑图展示上游节点健康/熔断状态与实时流量包动效（复用现成 hooks，零后端改动）
- **全仓硬编码色值/圆角清理**：logs-table、lifecycle-track（违禁蓝紫）、billing、cliproxy 系列、64 处裸 `rounded-*` 等；状态三连 class 收敛为 `STATUS_TONE` 工具
- **portal / login / landing 色相对齐**（landing 不动布局）
- **视觉/无障碍测试重新接线**：孤儿目录 `tests/visual/`、`tests/a11y/` 接入新 `playwright.visual.config.ts`，基线一次性重生成；新增视觉守卫与对比度单测

## Capabilities

### New Capabilities

- `routing-topology-panel`: Dashboard 路由拓扑面板——以 SVG 拓扑图实时展示网关到各上游的路由状态（健康、熔断 CLOSED/HALF/OPEN、流量动效），含可访问性降级（reduced-motion、文字摘要）与双语文案

### Modified Capabilities

- `frontend-visual-foundation-v2`: 令牌体系从 “不再新增 cf-* 引用” 升级为 “cf-* 别名层与 md-sys Material 层完全移除”；主题基线换为 Ops Console 2.0 定值（暗色主人格 + 中性冷灰亮色）并新增对比度达标要求；动效收敛为四处签名动效（进场瀑布、拓扑流量包、LIVE 呼吸灯、日志闪烁）且全部受 reduced-motion 约束；新增 “禁止组件层硬编码色值” 要求
- `data-display-and-interaction-v2`: 图表语义从单一面积图升级为柱+面积线组合图；指标卡新增 sparkline 与告警变体的统一契约；新增 LED 状态灯 + 状态芯片（CLOSED/HALF/OPEN）复用契约

## Impact

- **代码**：`src/app/globals.css`、`tailwind.config.ts`、`src/app/layout.tsx`（字体）、`src/lib/utils.ts`（视觉守卫正则）、`src/components/ui/*`（23 个组件 + 新增 2 个 + 删除 3 个）、`src/components/admin/*`（sidebar/topbar/app-shell/表格/弹窗）、`src/components/dashboard/*`（图表、KPI 卡、新拓扑面板）、`src/lib/chart-theme.ts`、portal/login/landing 页面、`src/messages/{en,zh-CN}.json`
- **测试**：新增 `tests/unit/visual-style-guard.test.ts`、`tests/unit/design-tokens-contrast.test.ts`、`tests/components/routing-topology.test.tsx`；更新 chart-theme 单测与 5 个使用路由 mock 的 E2E spec（dashboard 新增挂载期请求必须补 stub）；新增 `playwright.visual.config.ts` 与 `test:visual`/`test:a11y` 脚本；视觉基线一次性重生成
- **依赖**：新增本地字体文件 Saira（`@fontsource-variable/saira` 产物拷贝，OFL 1.1），无新增运行时 npm 依赖
- **后端/API**：零改动（拓扑面板复用 `useUpstreams`/`useUpstreamHealth`/`useLivePulse` 现成数据源）
- **不在范围**：VitePress docs 站、后端服务、数据库

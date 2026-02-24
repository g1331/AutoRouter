## Why

当前前端视觉体系以 `Cassette Futurism` 为核心，已在全局样式、基础组件、页面布局与动效中形成深度耦合，导致整体风格过于单一且难以继续演进。现在需要一次完整的视觉重构，彻底舍弃现有效果，建立新的视觉语言和一致的交互基线，以提升可读性、现代感和长期可维护性。

## What Changes

- **BREAKING**：废弃现有 `Cassette Futurism` 视觉语言，不再使用现有琥珀色终端风、扫描线、CRT 闪烁、噪点、发光描边等核心表现方式。
- **BREAKING**：重建全局设计令牌体系（颜色、字体、圆角、阴影、间距、动效节奏），替换 `globals.css` 与 `tailwind.config.ts` 中的现有语义映射。
- **BREAKING**：重做主导航壳层（桌面侧边栏、移动端底部导航、顶部栏）与关键页面（Dashboard、Keys、Upstreams、Logs、Settings）的视觉结构。
- **BREAKING**：重塑基础 UI 组件视觉外观（Button、Card、Table、Input、Select、Badge、Dialog 等）与状态规范（默认、悬停、激活、禁用、错误、加载、空态）。
- 统一图表与数据展示区的视觉规范，替换现有图表配色和数据卡片特效，保证桌面与移动端一致体验。
- 明确建立配色约束：不使用大面积蓝紫纯色与炫目渐变，整体保持精致、克制并契合管理台功能场景。
- 在保留现有业务行为与接口契约的前提下，仅变更前端视觉与交互呈现，不引入后端语义变更。

## Capabilities

### New Capabilities

- `frontend-visual-foundation-v2`: 定义新的全局视觉基座，包括设计令牌、主题策略、字体体系、动效约束与可访问性基线。
- `admin-console-layout-v2`: 定义管理后台壳层与页面骨架的全新视觉结构，覆盖桌面与移动端导航及页面层次关系。
- `data-display-and-interaction-v2`: 定义数据密集界面与交互组件的新视觉规范，覆盖表格、图表、卡片、表单与反馈状态。

### Modified Capabilities

- 无（当前仓库不存在 `openspec/specs/` 既有主规格目录，本次以新增能力规格方式落地）。

## Impact

- 主要影响代码：
  - `src/app/globals.css`
  - `tailwind.config.ts`
  - `src/app/layout.tsx`
  - `src/app/[locale]/layout.tsx`
  - `src/app/[locale]/(dashboard)/layout.tsx`
  - `src/app/[locale]/(dashboard)/dashboard/page.tsx`
  - `src/app/[locale]/(dashboard)/keys/page.tsx`
  - `src/app/[locale]/(dashboard)/upstreams/page.tsx`
  - `src/app/[locale]/(dashboard)/logs/page.tsx`
  - `src/app/[locale]/(dashboard)/settings/page.tsx`
  - `src/components/admin/sidebar.tsx`
  - `src/components/admin/topbar.tsx`
  - `src/components/dashboard/*`
  - `src/components/ui/*`
- 影响范围：前端视觉表现与交互反馈层，不涉及 API 路由、数据库与代理链路逻辑改动。
- 潜在风险：一次性替换范围大，需通过分阶段任务与可视化验收准则避免视觉回归和响应式断层。

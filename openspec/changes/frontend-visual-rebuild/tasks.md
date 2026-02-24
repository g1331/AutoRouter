## 1. 新视觉基座重建

- [x] 1.1 重写 `src/app/globals.css`，建立全新视觉令牌命名空间与基础层样式，并移除旧 `Cassette Futurism` 核心特效定义。
- [x] 1.2 更新 `tailwind.config.ts` 的主题扩展映射，使颜色、字体、圆角、阴影、动效全部指向新令牌体系。
- [x] 1.3 定义“中性基底 + 弱强调色”配色规范，明确禁止大面积蓝紫纯色与炫目蓝紫渐变，并落到全局 token 注释与命名中。
- [x] 1.4 调整 `src/app/layout.tsx` 与 `src/providers/theme-provider.tsx` 的主题与字体接入方式，确保新视觉基线在全局生效。
- [x] 1.5 执行 `pnpm lint` 与 `pnpm exec tsc --noEmit` 并提交本组改动，禁止与后续任务堆积提交。

## 2. 基础 UI 组件契约重构

- [x] 2.1 重构 `src/components/ui/button.tsx`、`src/components/ui/card.tsx`、`src/components/ui/table.tsx`，统一默认态与交互态视觉规范。
- [x] 2.2 重构 `src/components/ui/input.tsx`、`src/components/ui/select.tsx`、`src/components/ui/badge.tsx`、`src/components/ui/dialog.tsx`，统一表单与反馈状态视觉。
- [x] 2.3 重构 `src/components/ui/theme-toggle.tsx` 与相关下拉交互组件样式，确保主题切换反馈与新系统一致。
- [x] 2.4 为基础组件补充“禁用大面积蓝紫纯色/渐变”的视觉检查清单与示例用法，避免后续回归。
- [x] 2.5 执行 `pnpm lint` 与 `pnpm exec tsc --noEmit` 并提交本组改动，禁止与后续任务堆积提交。

## 3. 管理台壳层重构

- [x] 3.1 重构 `src/components/admin/sidebar.tsx`，完成桌面侧边导航与移动底部导航的新视觉与当前态反馈。
- [x] 3.2 重构 `src/components/admin/topbar.tsx` 与 `src/app/[locale]/(dashboard)/layout.tsx`，统一页面壳层结构和响应式间距。
- [x] 3.3 校准 `src/app/[locale]/layout.tsx` 的壳层包裹顺序与主题容器行为，保证跨页面视觉一致。
- [x] 3.4 执行 `pnpm lint` 与 `pnpm exec tsc --noEmit` 并提交本组改动，禁止与后续任务堆积提交。

## 4. 核心页面与数据展示迁移

- [x] 4.1 重构 `src/app/[locale]/(dashboard)/dashboard/page.tsx` 与 `src/components/dashboard/*`（`stats-cards`、`usage-chart`、`leaderboard-section`、`time-range-selector`、`chart-theme`）以匹配新视觉语义。
- [x] 4.2 为 Dashboard 图表实现明暗双套配色方案，并验证两套方案都不使用炫目蓝紫主导背景。
- [x] 4.3 重构 `src/app/[locale]/(dashboard)/keys/page.tsx` 与 `src/components/admin/keys-table.tsx`，提升高密度信息可读性与操作反馈清晰度。
- [x] 4.4 重构 `src/app/[locale]/(dashboard)/upstreams/page.tsx` 与 `src/components/admin/upstreams-table.tsx`，统一表格与移动卡片化展示风格。
- [x] 4.5 重构 `src/app/[locale]/(dashboard)/logs/page.tsx` 与 `src/components/admin/logs-table.tsx`，保持日志流视图在不同屏幕下的可读与可操作。
- [x] 4.6 重构 `src/app/[locale]/(dashboard)/settings/page.tsx` 与相关设置项组件，统一页面骨架与状态样式。
- [ ] 4.7 执行 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run` 并提交本组改动，禁止与后续任务堆积提交。

## 5. 旧视觉残留清理与验收

- [ ] 5.1 清理 `src/` 中旧 `cf-*` 视觉类与无效动效引用，删除不再使用的样式定义与工具类。
- [ ] 5.2 逐页回归 Dashboard、Keys、Upstreams、Logs、Settings 的桌面与移动端视觉层级、导航反馈、加载与错误态表现。
- [ ] 5.3 增加专项视觉验收：确认不存在大面积蓝紫纯色与炫目蓝紫渐变，确认整体风格精致且契合管理台功能语境。
- [ ] 5.4 执行 `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:run` 并提交最终清理改动，形成可直接进入 `/opsx:apply` 的实现清单。

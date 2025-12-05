# Tasks: Cassette Futurism UI

## 1. 基础设施

- [ ] 1.1 配置字体
  - 在 `apps/web/src/app/layout.tsx` 中引入 Google Fonts (JetBrains Mono, VT323, Inter)
  - 配置 next/font 本地字体优化
  - 设置 font-display: swap 和 subsets

- [ ] 1.2 重写 CSS 变量系统
  - 创建 `apps/web/src/app/globals.css` 的磁带未来主义版本
  - 定义颜色变量 (--cf-amber-*, --cf-black-*, --cf-surface-*, --cf-status-*)
  - 定义功能性 token (disabled, divider, overlay, focus)
  - 定义字体变量 (--cf-font-mono, --cf-font-display, --cf-font-sans)
  - 定义边框和效果变量

- [ ] 1.3 更新 Tailwind 配置
  - 修改 `apps/web/tailwind.config.ts` 添加自定义颜色
  - 配置字体 family (mono, display, sans)
  - 添加自定义 utilities (glow, scanlines)

- [ ] 1.4 添加无障碍媒体查询
  - 实现 prefers-reduced-motion 支持
  - 实现 prefers-contrast 支持
  - 添加最小效果模式切换（可选）

## 2. 基础组件改造

- [ ] 2.1 Button 组件
  - 修改 `apps/web/src/components/ui/button.tsx`
  - 实现 Primary/Secondary/Danger/Ghost 变体
  - 添加发光 hover 效果
  - 实现 disabled 状态样式
  - 确保焦点环可见性

- [ ] 2.2 Input 组件
  - 修改 `apps/web/src/components/ui/input.tsx`
  - 实现底部边框样式
  - 添加 focus 发光效果
  - 实现 disabled/error 状态

- [ ] 2.3 Table 组件
  - 修改 `apps/web/src/components/ui/table.tsx`
  - 实现终端风格表头 (uppercase, mono)
  - 虚线分隔符
  - 行悬停效果

- [ ] 2.4 Card/Dialog 组件
  - 修改 `apps/web/src/components/ui/card.tsx`
  - 修改 `apps/web/src/components/ui/dialog.tsx`
  - 实现面板样式 (边框发光)
  - 添加 overlay 背景

- [ ] 2.5 Badge 组件
  - 修改 `apps/web/src/components/ui/badge.tsx`
  - 状态色变体 (success/warning/error/info)
  - 非颜色状态标识（图标/边框）

- [ ] 2.6 Select/Checkbox/Radio 组件
  - 修改 `apps/web/src/components/ui/select.tsx`
  - 修改 `apps/web/src/components/ui/checkbox.tsx`
  - 新增或修改 radio 组件
  - 适配磁带未来主义风格
  - 确保焦点状态可见

- [ ] 2.7 Skeleton 组件
  - 修改 `apps/web/src/components/ui/skeleton.tsx`
  - 实现扫描线加载效果（respects reduced-motion）

- [ ] 2.8 Toast/Sonner 组件
  - 修改 toast 相关组件
  - 适配新配色和边框

- [ ] 2.9 Tabs 组件
  - 新增或修改 `apps/web/src/components/ui/tabs.tsx`
  - 终端风格选项卡
  - 下划线/边框指示器

- [ ] 2.10 Dropdown Menu/Command 组件
  - 修改 `apps/web/src/components/ui/dropdown-menu.tsx`
  - 修改或新增 command palette 组件
  - 黑底琥珀文字样式

- [ ] 2.11 Tooltip/Popover 组件
  - 修改 `apps/web/src/components/ui/tooltip.tsx`
  - 修改 `apps/web/src/components/ui/popover.tsx`
  - 边框发光样式

- [ ] 2.12 Pagination 组件
  - 新增或修改 `apps/web/src/components/ui/pagination.tsx`
  - 终端风格页码

- [ ] 2.13 Breadcrumb 组件
  - 新增或修改 `apps/web/src/components/ui/breadcrumb.tsx`
  - 路径分隔符样式

- [ ] 2.14 Alert/Notice 组件
  - 新增或修改 `apps/web/src/components/ui/alert.tsx`
  - 状态色边框 + 图标

- [ ] 2.15 Scrollbar 样式
  - 全局滚动条主题化
  - 琥珀色 track/thumb

## 3. 布局组件改造

- [ ] 3.1 Sidebar 侧边栏
  - 修改 `apps/web/src/components/admin/sidebar.tsx`
  - 深黑背景 + 琥珀色文字
  - 左侧选中指示条
  - ASCII Art Logo（可选）

- [ ] 3.2 Topbar 顶部栏
  - 修改 `apps/web/src/components/admin/topbar.tsx`
  - 适配新配色
  - 添加扫描线效果（仅 topbar）

- [ ] 3.3 根布局
  - 修改 `apps/web/src/app/(dashboard)/layout.tsx`
  - 添加全局背景噪点效果
  - 确保 reduced-motion 时禁用

## 4. 页面改造

- [ ] 4.1 Login 页面
  - 修改 `apps/web/src/app/(auth)/login/page.tsx`
  - 终端登录界面风格
  - 闪烁光标效果（respects reduced-motion）
  - 扫描线背景

- [ ] 4.2 Dashboard 页面
  - 修改 `apps/web/src/app/(dashboard)/dashboard/page.tsx`
  - 系统状态监控面板风格
  - 统计数字使用像素字体 (VT323)
  - 发光数字效果

- [ ] 4.3 API Keys 页面
  - 修改 `apps/web/src/app/(dashboard)/keys/page.tsx`
  - 终端列表风格
  - 创建 Key 对话框适配

- [ ] 4.4 Upstreams 页面
  - 修改 `apps/web/src/app/(dashboard)/upstreams/page.tsx`
  - 系统配置界面风格
  - 表单对话框适配

## 5. 细节优化

- [ ] 5.1 空状态设计
  - 修改 `apps/web/src/components/admin/empty-state.tsx`
  - ASCII Art 空状态图标
  - 琥珀色文字提示

- [ ] 5.2 加载状态
  - 统一加载动画为扫描线/闪烁效果
  - respects reduced-motion

- [ ] 5.3 错误状态
  - 红色发光边框
  - 错误图标 + 文字（非颜色标识）

- [ ] 5.4 图标系统
  - 检查 lucide-react 图标样式
  - 确保图标有足够的描边粗细
  - 考虑添加 glow 效果（仅关键图标）

- [ ] 5.5 焦点可见性
  - 所有可交互元素添加清晰的焦点环
  - 确保键盘导航完全可用
  - 测试 Tab 顺序

## 6. 自动化测试

- [ ] 6.1 无障碍测试 (a11y)
  - 集成 axe-core 或 Pa11y
  - 添加到 CI pipeline
  - 测试所有页面的 WCAG 2.1 AA 合规性

- [ ] 6.2 视觉回归测试
  - 集成 Playwright 或 Loki
  - 为关键页面创建 baseline 截图
  - Dashboard, Keys, Upstreams, Login

- [ ] 6.3 性能预算测试
  - 集成 Lighthouse CI
  - 设置性能预算：
    - Desktop: Performance >= 90, LCP < 2.5s, CLS < 0.1, INP < 200ms
    - Mobile: Performance >= 80, LCP < 4s, CLS < 0.25, INP < 300ms
  - 每个路由单独测试

- [ ] 6.4 组件测试
  - 为核心 UI 组件添加单元测试
  - 测试 disabled/error/focus 状态渲染

## 7. 手动验证

- [ ] 7.1 视觉一致性验证
  - 所有页面截图对比
  - 确认配色一致性
  - 检查 token 使用正确性

- [ ] 7.2 可访问性手动测试
  - 使用屏幕阅读器测试（NVDA/VoiceOver）
  - 键盘导航完整性测试
  - 高对比度模式测试

- [ ] 7.3 性能手动验证
  - CRT 效果性能影响评估
  - 移动端滚动流畅度

- [ ] 7.4 浏览器兼容性
  - Chrome/Firefox/Safari/Edge 测试
  - 移动端 Safari/Chrome 测试

## 8. 文档和设计系统

- [ ] 8.1 Token 文档
  - 创建颜色 token 使用指南
  - 创建字体 token 使用指南
  - 创建效果 token 使用指南

- [ ] 8.2 组件文档/Storybook（可选）
  - 为每个组件创建示例
  - 展示各种状态变体
  - 记录使用注意事项

- [ ] 8.3 更新 add-admin-console 的 design.md
  - 标注设计风格已更换为 Cassette Futurism

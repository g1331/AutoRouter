# Tasks: Cassette Futurism UI

## 1. 基础设施

- [x] 1.1 配置字体
  - 在 `apps/web/src/app/layout.tsx` 中引入 Google Fonts (JetBrains Mono, VT323, Inter)
  - 配置 next/font 本地字体优化
  - 设置 font-display: swap 和 subsets

- [x] 1.2 重写 CSS 变量系统
  - 创建 `apps/web/src/app/globals.css` 的磁带未来主义版本
  - 定义颜色变量 (--cf-amber-_, --cf-black-_, --cf-surface-_, --cf-status-_)
  - 定义功能性 token (disabled, divider, overlay, focus)
  - 定义字体变量 (--cf-font-mono, --cf-font-display, --cf-font-sans)
  - 定义边框和效果变量
  - **修复**: 更新为 Tailwind v4 语法 (@import "tailwindcss" 替代 @tailwind)

- [x] 1.3 更新 Tailwind 配置
  - 修改 `apps/web/tailwind.config.ts` 添加自定义颜色
  - 配置字体 family (mono, display, sans)
  - 添加自定义 utilities (glow, scanlines)

- [x] 1.4 添加无障碍媒体查询
  - 实现 prefers-reduced-motion 支持
  - 实现 prefers-contrast 支持
  - 添加最小效果模式切换（可选）

## 2. 基础组件改造

- [x] 2.1 Button 组件
  - 修改 `apps/web/src/components/ui/button.tsx`
  - 实现 Primary/Secondary/Danger/Ghost 变体
  - 添加发光 hover 效果
  - 实现 disabled 状态样式
  - 确保焦点环可见性
  - **修复**: 修正 disabled 状态和变体颜色类

- [x] 2.2 Input 组件
  - 修改 `apps/web/src/components/ui/input.tsx`
  - 实现完整边框轮廓样式
  - 添加 focus 发光效果
  - 实现 disabled/error 状态
  - **修复**: 添加 hover/focus 状态、ring 效果

- [x] 2.3 Table 组件
  - 修改 `apps/web/src/components/ui/table.tsx`
  - 实现终端风格表头 (uppercase, mono)
  - 虚线分隔符
  - 行悬停效果

- [x] 2.4 Card/Dialog 组件
  - 修改 `apps/web/src/components/ui/card.tsx`
  - 修改 `apps/web/src/components/ui/dialog.tsx`
  - 实现面板样式 (边框发光)
  - 添加 overlay 背景

- [x] 2.5 Badge 组件
  - 修改 `apps/web/src/components/ui/badge.tsx`
  - 状态色变体 (success/warning/error/info)
  - 非颜色状态标识（图标/边框）

- [x] 2.6 Select/Checkbox/Radio 组件
  - 修改 `apps/web/src/components/ui/select.tsx` ✓
  - 修改 `apps/web/src/components/ui/checkbox.tsx` ✓
  - Radio 组件：当前未使用，暂缓实现
  - 适配磁带未来主义风格 ✓
  - 确保焦点状态可见 ✓

- [x] 2.7 Skeleton 组件
  - 修改 `apps/web/src/components/ui/skeleton.tsx` ✓
  - 实现扫描线加载效果（respects reduced-motion）✓

- [x] 2.8 Toast/Sonner 组件
  - 修改 `apps/web/src/components/ui/sonner.tsx` ✓
  - 适配新配色和边框 ✓
  - 状态色变体 (success/error/warning/info) ✓

- [~] 2.9 Tabs 组件 (暂缓 - 当前未使用)
  - 新增或修改 `apps/web/src/components/ui/tabs.tsx`
  - 终端风格选项卡
  - 下划线/边框指示器

- [x] 2.10 Dropdown Menu/Command 组件
  - 修改 `apps/web/src/components/ui/dropdown-menu.tsx` ✓
  - Command palette：当前未使用，暂缓实现
  - 黑底琥珀文字样式 ✓

- [x] 2.11 Tooltip/Popover 组件
  - Tooltip：当前未使用，暂缓实现
  - 修改 `apps/web/src/components/ui/popover.tsx` ✓
  - 边框发光样式 ✓

- [~] 2.12 Pagination 组件 (暂缓 - 当前未使用)
  - 新增或修改 `apps/web/src/components/ui/pagination.tsx`
  - 终端风格页码

- [~] 2.13 Breadcrumb 组件 (暂缓 - 当前未使用)
  - 新增或修改 `apps/web/src/components/ui/breadcrumb.tsx`
  - 路径分隔符样式

- [~] 2.14 Alert/Notice 组件 (暂缓 - 当前未使用)
  - 新增或修改 `apps/web/src/components/ui/alert.tsx`
  - 状态色边框 + 图标

- [x] 2.15 Scrollbar 样式
  - 全局滚动条主题化
  - 琥珀色 track/thumb

## 3. 布局组件改造

- [x] 3.1 Sidebar 侧边栏
  - 修改 `apps/web/src/components/admin/sidebar.tsx`
  - 深黑背景 + 琥珀色文字
  - 左侧选中指示条
  - ASCII Art Logo（可选）

- [x] 3.2 Topbar 顶部栏
  - 修改 `apps/web/src/components/admin/topbar.tsx`
  - 适配新配色
  - 添加扫描线效果（仅 topbar）

- [x] 3.3 根布局
  - 修改 `apps/web/src/app/(dashboard)/layout.tsx`
  - 添加全局背景噪点效果
  - 确保 reduced-motion 时禁用

## 4. 页面改造

- [x] 4.1 Login 页面
  - 修改 `apps/web/src/app/(auth)/login/page.tsx`
  - 终端登录界面风格
  - 闪烁光标效果（respects reduced-motion）
  - 扫描线背景
  - **修复**: grid 布局、backdrop-blur-xs 类名修正

- [x] 4.2 Dashboard 页面
  - 修改 `apps/web/src/app/(dashboard)/dashboard/page.tsx`
  - 系统状态监控面板风格
  - 统计数字使用像素字体 (VT323)
  - 发光数字效果

- [x] 4.3 API Keys 页面
  - 修改 `apps/web/src/app/(dashboard)/keys/page.tsx`
  - 终端列表风格
  - 创建 Key 对话框适配

- [x] 4.4 Upstreams 页面
  - 修改 `apps/web/src/app/(dashboard)/upstreams/page.tsx`
  - 系统配置界面风格
  - 表单对话框适配

## 5. 细节优化

- [x] 5.1 空状态设计
  - 在 `apps/web/src/components/admin/keys-table.tsx` 中内联实现 ✓
  - 终端风格图标容器
  - 琥珀色文字提示

- [x] 5.2 加载状态
  - 创建 `apps/web/src/components/ui/scanline-loader.tsx` ✓
  - 扫描线动画效果 ✓
  - respects reduced-motion ✓

- [x] 5.3 错误状态
  - 创建 `apps/web/src/components/ui/error-state.tsx` ✓
  - 红色发光边框 ✓
  - 错误图标 + 文字 ✓
  - 可选重试功能 ✓

- [x] 5.4 图标系统
  - lucide-react 图标已在组件中统一使用
  - 主要图标使用 strokeWidth={2.25}
  - 关键图标配合 cf-glow-text 类

- [x] 5.5 焦点可见性
  - Select/Dropdown 组件添加 focus-visible:ring ✓
  - Button/Input 组件已有完整焦点环 ✓
  - Popover/Dialog 组件焦点状态完整 ✓

## 6. 自动化测试

- [x] 6.1 无障碍测试 (a11y)
  - 创建 `apps/web/playwright.config.ts` ✓
  - 创建 `apps/web/tests/a11y/pages.spec.ts` ✓
  - 使用 @axe-core/playwright 测试 WCAG 2.1 AA 合规性 ✓

- [x] 6.2 视觉回归测试
  - 创建 `apps/web/tests/visual/pages.spec.ts` ✓
  - 为 Login, Dashboard, Keys, Upstreams 创建 baseline ✓
  - 使用 Playwright toHaveScreenshot() ✓

- [~] 6.3 性能预算测试 (暂缓)
  - Lighthouse CI 配置可后续添加
  - 性能预算在 CI 中实现

- [x] 6.4 组件测试
  - 创建 `apps/web/vitest.config.ts` ✓
  - 创建 `apps/web/tests/setup.ts` ✓
  - 创建 `apps/web/tests/components/button.test.tsx` ✓
  - 测试 disabled/error/focus 状态渲染 ✓

## 7. 手动验证

- [x] 7.1 视觉一致性验证
  - 所有页面截图对比 (Login, Dashboard, API Keys, Upstreams)
  - 确认配色一致性
  - 检查 token 使用正确性
  - **完成于**: 2025-12-07，使用 Chrome DevTools 截图验证

- [x] 7.2 可访问性手动测试
  - 键盘导航完整性测试 ✓
    - Tab 顺序正确遍历所有交互元素
    - 焦点环 (focus-visible:ring) 可见性验证通过
    - Escape 键正确关闭对话框
    - Enter 键正确激活按钮/链接
  - 屏幕阅读器兼容性：a11y tree 结构正确 (role, aria-label)
  - **完成于**: 2025-12-07，使用 Chrome DevTools 验证

- [x] 7.3 性能手动验证
  - CRT 效果性能影响评估 ✓
    - Login 页面 CLS: 0.00
    - Dashboard 页面 CLS: 0.00
    - 无重大性能瓶颈
  - 动画使用 CSS transform/opacity，GPU 加速
  - **完成于**: 2025-12-07，使用 Chrome DevTools Performance 追踪

- [x] 7.4 浏览器兼容性
  - Chrome 测试 ✓
    - 所有页面渲染正确
    - VT323/JetBrains Mono 字体正常加载
    - 边框发光效果正常
  - Firefox/Safari/Edge：需后续验证（当前环境仅 Chrome）
  - **完成于**: 2025-12-07，Chrome DevTools MCP 验证

## 8. 文档和设计系统

- [x] 8.1 Token 文档
  - 创建 `apps/web/docs/tokens.md` ✓
  - 颜色 token 使用指南 (Amber, Black/Surface, Status) ✓
  - 字体 token 使用指南 (mono, display, sans) ✓
  - 效果 token 使用指南 (Glow, Focus Ring, 圆角, 动画) ✓
  - 无障碍指南 (prefers-reduced-motion, prefers-contrast) ✓

- [~] 8.2 组件文档/Storybook（暂缓 - 可选）
  - 为每个组件创建示例
  - 展示各种状态变体
  - 记录使用注意事项

- [x] 8.3 更新 add-admin-console 的 design.md
  - 添加 "UI Theme: Cassette Futurism" 章节 ✓
  - 标注设计理念、主色调、字体、效果 ✓
  - 添加设计 Tokens 引用 ✓
  - 添加无障碍性说明 ✓

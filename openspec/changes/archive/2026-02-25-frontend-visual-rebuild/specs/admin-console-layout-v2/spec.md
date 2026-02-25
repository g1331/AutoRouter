## ADDED Requirements

### Requirement: 管理台壳层必须提供统一的响应式布局结构
系统 MUST 为桌面端与移动端提供统一语义的壳层结构，包含导航区、页面主区域与安全间距处理。桌面端 MUST 使用固定侧边导航，移动端 MUST 使用底部导航并保留安全区。

#### Scenario: 桌面端显示壳层结构
- **WHEN** 视口宽度达到桌面断点
- **THEN** 页面 SHALL 显示固定侧边导航与可滚动主内容区

### Requirement: 导航系统必须提供明确的层级与当前态反馈
系统 MUST 在导航项中提供清晰的激活态、悬停态和可用态视觉差异，并保证同一导航语义在桌面与移动端表现一致。

#### Scenario: 用户访问当前页面对应导航项
- **WHEN** 路由命中某导航目标
- **THEN** 该导航项 SHALL 显示明确的当前态视觉反馈且可被快速识别

### Requirement: 页面结构必须遵循统一区块模板
系统 MUST 为五个核心页面提供统一结构模板，包括标题区、主操作区、主要内容区与状态反馈区，且允许在不破坏骨架的前提下做页面级扩展。

#### Scenario: 核心页面保持一致骨架
- **WHEN** 用户在 Dashboard、Keys、Upstreams、Logs、Settings 之间切换
- **THEN** 页面 SHALL 维持一致的区块顺序与视觉层级

### Requirement: 壳层不得残留旧视觉语言样式
系统 MUST 清除壳层相关组件中旧视觉语言的表现性类与特效，避免新旧风格混杂。

#### Scenario: 壳层组件视觉检查
- **WHEN** 检查 Sidebar、Topbar、Dashboard Layout
- **THEN** 壳层组件 SHALL 不再出现旧视觉语言特征

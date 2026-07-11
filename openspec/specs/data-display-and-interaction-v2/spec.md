# data-display-and-interaction-v2 Specification

## Purpose
TBD - created by archiving change frontend-visual-rebuild. Update Purpose after archive.
## Requirements
### Requirement: 数据密集组件必须遵循统一视觉契约
系统 MUST 为 Button、Card、Table、Input、Select、Badge、Dialog 等基础组件定义统一视觉契约，并覆盖默认、悬停、激活、禁用、错误、加载、空态等状态。

#### Scenario: 不同页面复用同一组件状态规则
- **WHEN** 组件在不同页面和场景中被复用
- **THEN** 组件 SHALL 呈现一致的状态语义与交互反馈

### Requirement: 表格与日志视图必须以可读性优先
系统 MUST 为表格和日志流视图提供高可读布局，包括清晰列层级、稳定行高、有效状态标识与移动端可降级展示策略。

#### Scenario: 移动端浏览数据表
- **WHEN** 用户在移动端访问高密度数据页面
- **THEN** 视图 SHALL 以卡片化或折叠化策略保持核心信息可读且可操作

### Requirement: 图表与指标区必须使用统一视觉语义
系统 MUST 为图表、指标卡、排行模块定义统一的配色、网格、注释与交互反馈规则，避免页面间统计可视化风格割裂，全部图表配色 MUST 来自集中式图表主题（chart-theme）并由设计令牌驱动。用量时序图表 MUST 采用柱 + 面积线组合视图（总量 = 柱状 + 面积折线叠加，按上游分组 = 堆叠柱状）；Tab 切换不同指标维度时 MUST 复用相同的组合图组件、上游配色方案、tooltip 与 legend 组件。指标卡从 3 列扩展为 5 列时 MUST 保持一致的卡片样式、动画延迟递增和 icon 语义；核心用量指标卡（请求数、Token、费用）MUST 内嵌迷你趋势 sparkline，性能指标卡 MUST 支持阈值告警变体（错误色边框与数值强调）。

#### Scenario: 不同统计模块并列显示
- **WHEN** 用户在 Dashboard 同时查看指标卡、趋势图和排行榜
- **THEN** 模块 SHALL 保持一致的视觉语义并可快速建立信息关联

#### Scenario: 5 列指标卡视觉一致性
- **WHEN** Dashboard 概览区展示 5 张指标卡片
- **THEN** 新增的卡片 SHALL 与现有卡片使用相同的 StatCard 组件、相同的动画延迟递增规律、相同的 icon + 标题 + 数值 + 副标题层级结构

#### Scenario: Tab 切换图表视觉一致性
- **WHEN** 用户在时序图表区域切换不同指标维度的 Tab
- **THEN** 各 Tab 下的图表 SHALL 使用相同的上游配色方案、相同的柱 + 面积线组合样式、相同的 tooltip 和 legend 组件

#### Scenario: 指标卡趋势与告警
- **WHEN** Dashboard 展示请求数、Token、费用指标卡且性能指标超出阈值
- **THEN** 用量三卡 SHALL 渲染迷你 sparkline，超阈值的性能卡 SHALL 呈现错误色告警边框变体

### Requirement: 数据场景视觉必须精致且契合功能语境
系统 MUST 在数据密集场景使用克制、专业、低干扰的视觉表达，通过排版、间距、边界和微交互体现精致感，而非依赖高饱和大面积配色与炫目渐变。

#### Scenario: 高频操作界面视觉验收
- **WHEN** 用户连续执行筛选、翻页、编辑、测试、刷新等高频操作
- **THEN** 界面 SHALL 持续保持清晰、稳定、无炫目干扰，并支持快速识别关键信息

### Requirement: 用户操作反馈必须清晰且不过度装饰
系统 MUST 提供明确的成功、警告、错误、处理中反馈，并限制无信息价值的视觉装饰，保证高频操作场景的认知效率。

#### Scenario: 用户执行关键操作
- **WHEN** 用户执行创建、编辑、删除、测试、刷新等关键操作
- **THEN** 系统 SHALL 在合理时延内给出可识别的状态反馈且不干扰后续操作

### Requirement: 状态指示必须复用统一的 LED 状态灯与状态芯片
系统 MUST 提供可复用的 LED 状态灯组件（ok/warn/bad 三态，暗色主题带辉光与呼吸动效，reduced-motion 时常亮）与熔断状态芯片组件（CLOSED/HALF/OPEN，LED + 等宽大写文字 + 状态色边线）。熔断管理、路由拓扑、日志等状态展示场景 MUST 复用这两个组件而非各自实现状态视觉。

#### Scenario: 多场景状态一致性
- **WHEN** 用户分别在熔断管理页、拓扑面板与日志视图查看同一上游的熔断状态
- **THEN** 三处 SHALL 使用相同的状态芯片组件呈现一致的颜色、文字与形态

#### Scenario: 减少动态效果下的状态灯
- **WHEN** 设备启用 reduced motion
- **THEN** LED 状态灯 SHALL 停止呼吸动效并保持常亮，状态颜色语义不变


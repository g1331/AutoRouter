# data-display-and-interaction-v2 增量规格

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 状态指示必须复用统一的 LED 状态灯与状态芯片
系统 MUST 提供可复用的 LED 状态灯组件（ok/warn/bad 三态，暗色主题带辉光与呼吸动效，reduced-motion 时常亮）与熔断状态芯片组件（CLOSED/HALF/OPEN，LED + 等宽大写文字 + 状态色边线）。熔断管理、路由拓扑、日志等状态展示场景 MUST 复用这两个组件而非各自实现状态视觉。

#### Scenario: 多场景状态一致性
- **WHEN** 用户分别在熔断管理页、拓扑面板与日志视图查看同一上游的熔断状态
- **THEN** 三处 SHALL 使用相同的状态芯片组件呈现一致的颜色、文字与形态

#### Scenario: 减少动态效果下的状态灯
- **WHEN** 设备启用 reduced motion
- **THEN** LED 状态灯 SHALL 停止呼吸动效并保持常亮，状态颜色语义不变

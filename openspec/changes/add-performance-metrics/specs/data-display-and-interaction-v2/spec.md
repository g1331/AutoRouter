## MODIFIED Requirements

### Requirement: 图表与指标区必须使用统一视觉语义
系统 MUST 为图表、指标卡、排行模块定义统一的配色、网格、注释与交互反馈规则，避免页面间统计可视化风格割裂。指标卡从 3 列扩展为 5 列时 MUST 保持一致的卡片样式、动画延迟递增和 icon 语义。时序图表区域从单一视图扩展为 Tab 切换模式时 MUST 复用现有的面积图组件、配色体系和上游分组逻辑。

#### Scenario: 不同统计模块并列显示
- **WHEN** 用户在 Dashboard 同时查看指标卡、趋势图和排行榜
- **THEN** 模块 SHALL 保持一致的视觉语义并可快速建立信息关联

#### Scenario: 5 列指标卡视觉一致性
- **WHEN** Dashboard 概览区展示 5 张指标卡片
- **THEN** 新增的卡片 SHALL 与现有卡片使用相同的 StatCard 组件、相同的动画延迟递增规律、相同的 icon + 标题 + 数值 + 副标题层级结构

#### Scenario: Tab 切换图表视觉一致性
- **WHEN** 用户在时序图表区域切换不同指标维度的 Tab
- **THEN** 各 Tab 下的图表 SHALL 使用相同的上游配色方案、相同的面积图样式、相同的 tooltip 和 legend 组件

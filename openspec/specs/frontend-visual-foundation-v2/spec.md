# frontend-visual-foundation-v2 Specification

## Purpose
TBD - created by archiving change frontend-visual-rebuild. Update Purpose after archive.
## Requirements
### Requirement: 新视觉令牌体系必须替代旧视觉令牌
系统 MUST 提供独立的新视觉令牌体系，用于定义颜色、字体、间距、圆角、阴影、边框与层级语义，并在全局样式与 Tailwind 配置中完成映射。系统 MUST 不再新增对旧 `cf-*` 令牌的引用。

#### Scenario: 全局样式使用新令牌
- **WHEN** 前端渲染任意后台页面
- **THEN** 页面核心视觉属性 SHALL 来自新令牌命名空间而非旧 `cf-*` 令牌

### Requirement: 主题与排版基线必须可统一复用
系统 MUST 定义统一的主题策略（至少覆盖明暗主题）与排版层级（标题、正文、数据文本、辅助文本），并要求页面与组件通过语义化 token 使用该基线。

#### Scenario: 页面切换主题时保持语义一致
- **WHEN** 用户切换明暗主题
- **THEN** 各页面组件 SHALL 保持一致的语义层级与可读对比关系

### Requirement: 配色策略必须遵循中性基底与克制表达
系统 MUST 采用中性基底配色，并将强调色限制在关键操作与状态反馈区域。系统 MUST 禁止在大面积背景使用蓝紫纯色或高饱和蓝紫渐变。

#### Scenario: 页面背景与大容器配色检查
- **WHEN** 检查主布局、卡片区、表格区和图表容器
- **THEN** 这些大面积区域 SHALL 不出现蓝紫纯色铺底或炫目蓝紫渐变

### Requirement: 动效系统必须可降级且可访问
系统 MUST 仅保留有信息价值的关键动效，并提供统一的时长与缓动规范。系统 MUST 支持 `prefers-reduced-motion`，在该模式下降级非必要动画。

#### Scenario: 用户开启减少动态效果
- **WHEN** 设备或浏览器启用 reduced motion
- **THEN** 非必要动效 SHALL 被禁用或显著弱化，且不影响交互可用性

### Requirement: 旧视觉特效必须被移除
系统 MUST 移除并停止使用旧视觉特效（包括扫描线、CRT 闪烁、噪点覆盖、强发光边框等），确保新视觉语言纯净一致。

#### Scenario: 页面检查不再出现旧特效
- **WHEN** 访问 Dashboard、Keys、Upstreams、Logs、Settings 页面
- **THEN** 页面 SHALL 不再出现旧特效类对应的视觉表现


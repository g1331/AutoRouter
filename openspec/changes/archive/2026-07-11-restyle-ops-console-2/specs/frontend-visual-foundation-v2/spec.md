# frontend-visual-foundation-v2 增量规格

## MODIFIED Requirements

### Requirement: 新视觉令牌体系必须替代旧视觉令牌
系统 MUST 以 `--vr-*` 命名空间作为唯一视觉令牌真源，定义颜色、字体、间距、圆角、阴影、边框与层级语义，并在全局样式与 Tailwind 配置中完成映射。系统 MUST 完全移除旧 `cf-*` 别名变量层与 `--md-sys-color-*` Material 兼容层：Tailwind 工具类 MUST 直接映射到 `--vr-*` 令牌，组件代码 MUST 不再引用任何 `--cf-*` 或 `--md-sys-color-*` 变量。零引用的样式代码（组件、变量、工具类、Tailwind 配置项）MUST 被删除，且删除前 MUST 以精确字面模式复核全仓引用。

#### Scenario: 全局样式使用新令牌
- **WHEN** 前端渲染任意后台页面
- **THEN** 页面核心视觉属性 SHALL 来自 `--vr-*` 令牌命名空间，全局样式中 SHALL 不存在 `--cf-*` 与 `--md-sys-color-*` 变量定义

#### Scenario: 组件代码引用检查
- **WHEN** 在源码中检索 `--cf-` 与 `--md-sys-color-` 字面量
- **THEN** 检索结果 SHALL 为零命中

### Requirement: 主题与排版基线必须可统一复用
系统 MUST 定义统一的明暗双主题策略与排版层级（标题、正文、数据文本、辅助文本），并要求页面与组件通过语义化 token 使用该基线。暗色为默认主人格（近黑冷灰基底 + amber 强调色）；亮色 MUST 采用中性冷灰基底与青铜强调色，MUST 禁止暖黄色调背景与亮色态辉光。排版 MUST 采用三字体秩序：display 字体（DIN 系）用于标题与大数值、sans 用于正文、mono 用于数据文本。所有正文级文字与强调色配对 MUST 满足 WCAG 2.1 AA（≥4.5:1），并由单元测试对关键令牌配对断言锁定。

#### Scenario: 页面切换主题时保持语义一致
- **WHEN** 用户切换明暗主题
- **THEN** 各页面组件 SHALL 保持一致的语义层级与可读对比关系，亮色态 SHALL 无辉光且背景无暖黄色调

#### Scenario: 关键令牌对比度回归
- **WHEN** 运行设计令牌对比度单元测试
- **THEN** 全部正文级配对 SHALL 断言通过 ≥4.5:1

### Requirement: 动效系统必须可降级且可访问
系统 MUST 仅保留四处签名动效：页面进场瀑布、拓扑流量包、LIVE 呼吸灯、日志新行闪烁，并提供统一的时长与缓动令牌。系统 MUST 支持 `prefers-reduced-motion`：CSS 动效通过 media query 降级；SMIL 动效 MUST 通过 JS 判定不渲染动画子树。

#### Scenario: 用户开启减少动态效果
- **WHEN** 设备或浏览器启用 reduced motion
- **THEN** 四处签名动效 SHALL 全部被禁用或降级为静态呈现，且不影响交互可用性与状态语义

## ADDED Requirements

### Requirement: 组件层禁止硬编码视觉值
组件代码 MUST 不出现硬编码颜色字面量（hex、rgb/rgba、hsl）与裸 Tailwind 调色板色名（如 `emerald-*`、`green-*`、蓝紫系），状态色 MUST 通过状态令牌或状态工具（STATUS_TONE）表达；圆角 MUST 使用令牌化圆角类而非裸 `rounded-{sm|md|lg|xl}`。开发期视觉守卫 MUST 覆盖蓝紫系类名的 alpha 后缀变体与 text 前缀变体，并由单元测试覆盖守卫正则。

#### Scenario: 组件引入违禁色
- **WHEN** 开发期组件类名包含蓝紫系调色板类（含 alpha 后缀变体）
- **THEN** 视觉守卫 SHALL 在控制台发出警告

#### Scenario: 状态色表达
- **WHEN** 组件需要渲染成功/警告/错误状态
- **THEN** 实现 SHALL 使用状态令牌或 STATUS_TONE 工具而非硬编码色值

### Requirement: 全局氛围层必须令牌化
页面背景氛围（顶部径向光晕与点阵网格）MUST 由 `--vr-atmo` 与 `--vr-grid-dot` 令牌驱动，随主题切换：暗色为 amber 光晕，亮色为冷灰蓝光晕。氛围层 MUST 不影响前景内容对比度达标。

#### Scenario: 主题切换氛围随动
- **WHEN** 用户在明暗主题间切换
- **THEN** 氛围光晕与点阵 SHALL 随主题令牌变化，且前景文字对比度 SHALL 仍满足 AA

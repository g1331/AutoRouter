## ADDED Requirements

### Requirement: 数据数字排印必须遵循三档语境契约
系统 MUST 按语境将数据数字排印收敛为三档统一契约，MUST NOT 让同类指标数字在不同页面走互不一致的字族。三档定义为：**Tier 1**（英雄/KPI 数字：dashboard KPI 卡、portal/users 概览卡、topbar live-pulse 主指标）MUST 使用 display 字体（Saira）+ `tabular-nums`，字族 MUST 统一为 Saira；**Tier 2**（表格/密集行内/标识符数字：日志表、计费表、延迟/token 列、请求 ID）MUST 使用等宽 mono + `tabular-nums`；**Tier 3**（次级小数字：hint、「共 N 条」、副标签）MUST 使用 sans + `tabular-nums`，MUST NOT 使用 display 或 mono。铁律：任何指标值 MUST NOT 使用无 `tabular-nums` 的普通正文渲染。

#### Scenario: KPI 与 live-pulse 主指标同族
- **WHEN** 用户查看 dashboard KPI 卡与 topbar live-pulse 主指标
- **THEN** 两处指标数字 SHALL 统一使用 Saira display 字族并启用 `tabular-nums`

#### Scenario: 表格数字等宽对齐
- **WHEN** 用户查看日志表、计费表的延迟、token、费用等数值列
- **THEN** 数值 SHALL 使用 mono 等宽字体并启用 `tabular-nums`，保证跨行数字对齐

#### Scenario: 次级小数字不越档
- **WHEN** 界面渲染「共 N 条」、hint、副标签等次级小数字
- **THEN** 该数字 SHALL 使用 sans + `tabular-nums`，SHALL NOT 使用 Saira 或 mono

### Requirement: 指标卡必须复用统一 StatCard 原语
系统 MUST 提供统一的指标卡原语（`StatCard`），承载 Tier-1 英雄/KPI 数字。dashboard、portal 概览、用户详情等场景的指标卡 MUST 复用该原语，MUST NOT 各自维护逐字重复的指标卡实现。

#### Scenario: 多场景指标卡一致
- **WHEN** 用户分别在 dashboard、portal 概览与用户详情页查看指标卡
- **THEN** 各处指标卡 SHALL 使用同一 `StatCard` 原语，呈现一致的图标 + 标题 + Tier-1 数值 + 副标题层级，且不再出现重复实现导致的排版退化 bug

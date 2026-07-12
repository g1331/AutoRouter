## MODIFIED Requirements

### Requirement: 主题与排版基线必须可统一复用
系统 MUST 定义统一的明暗双主题策略与排版层级（标题、正文、数据文本、辅助文本），并要求页面与组件通过语义化 token 使用该基线。暗色为默认主人格（近黑冷灰基底 + amber 强调色）；亮色 MUST 采用中性冷灰基底与青铜强调色，MUST 禁止暖黄色调背景与亮色态辉光。排版 MUST 采用三字体秩序：display 字体（DIN 系）用于标题与大数值、sans 用于正文、mono 用于数据文本。所有被组件引用的 `type-*` 排版工具类 MUST 存在对应定义，MUST 不得存在被调用却未定义、导致命中元素静默退化为无样式的排版类。所有正文级文字与强调色配对 MUST 满足 WCAG 2.1 AA（≥4.5:1），并由单元测试对关键令牌配对断言锁定。

#### Scenario: 页面切换主题时保持语义一致
- **WHEN** 用户切换明暗主题
- **THEN** 各页面组件 SHALL 保持一致的语义层级与可读对比关系，亮色态 SHALL 无辉光且背景无暖黄色调

#### Scenario: 关键令牌对比度回归
- **WHEN** 运行设计令牌对比度单元测试
- **THEN** 全部正文级配对 SHALL 断言通过 ≥4.5:1

#### Scenario: 排版类不得静默退化
- **WHEN** 组件引用任一 `type-*` 排版工具类
- **THEN** 该类 SHALL 有对应样式定义，命中元素 SHALL 呈现预期排版层级而非退化为无样式默认文本

## ADDED Requirements

### Requirement: 半径词汇必须收敛为受控令牌白名单
系统 MUST 将圆角词汇收敛为唯一四类受控值：`rounded-cf-sm`（微元素）、`rounded-cf-md`（容器）、`rounded-full`、`rounded-none`。组件层 MUST NOT 使用裸 `rounded` 单独类、`rounded-[<任意值>]` 任意值类，或 `rounded-(sm|md|lg|xl)` 别名类。迁移完成后 `tailwind.config.ts` MUST 删除裸 `sm`/`md`/`lg` 半径别名（保留底层半径令牌本体）。该白名单 MUST 由守护单元测试常驻断言。

#### Scenario: 半径守护单测拦截越界写法
- **WHEN** 运行半径守护单元测试
- **THEN** 测试 SHALL 在源码出现裸 `rounded`、`rounded-[` 任意值或 `rounded-(sm|md|lg|xl)` 别名时失败，且 SHALL NOT 误伤 `rounded-cf-*`、`rounded-full`、`rounded-none` 及方向性半径类

#### Scenario: 圆角呈现收敛为四类
- **WHEN** 用户浏览任意管理台或门户页面
- **THEN** 所有圆角元素 SHALL 仅呈现四类受控半径之一，视觉上不再出现多套并行圆角尺度

### Requirement: 图标方块必须复用统一原语
系统 MUST 提供统一的图标方块原语（`IconBox`，支持尺寸与色调变体），页面与卡片头部的强调色图标容器 MUST 复用该原语而非各自手写图标方块样式。

#### Scenario: 多页图标方块一致
- **WHEN** 用户在多个管理台页面查看标题区图标容器
- **THEN** 各处图标方块 SHALL 使用同一 `IconBox` 原语，呈现一致的尺寸、圆角、色调与内边距

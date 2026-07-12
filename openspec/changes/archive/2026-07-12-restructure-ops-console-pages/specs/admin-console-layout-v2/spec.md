## MODIFIED Requirements

### Requirement: 页面结构必须遵循统一区块模板
系统 MUST 为核心页面提供统一结构模板，包括标题区、主操作区、主要内容区与状态反馈区，且允许在不破坏骨架的前提下做页面级扩展。标题区 MUST 复用统一的页面头部原语（`PageHeader`：图标 + 标题 + 描述 + 操作槽），页面外层容器 MUST 复用统一的页面骨架原语（`PageShell`：受控最大宽度与内边距），MUST NOT 让各页各自手写等价的头卡与外层骨架，非标骨架页（如 header-compensation）MUST 归一到共享原语。

#### Scenario: 核心页面保持一致骨架
- **WHEN** 用户在 Dashboard、Keys、Upstreams、Logs、Settings 之间切换
- **THEN** 页面 SHALL 维持一致的区块顺序与视觉层级

#### Scenario: 页面头部与骨架复用共享原语
- **WHEN** 任意管理台页面渲染标题区与外层容器
- **THEN** 该页 SHALL 复用 `PageHeader` 与 `PageShell` 原语，SHALL NOT 出现手写的等价头卡或 `mx-auto max-w-* space-y-* px-* py-*` 非标骨架

## ADDED Requirements

### Requirement: 设置页必须提供完整的系统管理入口
系统设置页 MUST 提供指向全部系统级管理子页面的入口。当管理后台存在用户管理与 CLIProxy 管理子页面时，设置页 MUST 包含二者的入口，MUST NOT 遗漏任何已实现的系统管理子页面入口。

#### Scenario: 设置页覆盖用户管理与 CLIProxy 入口
- **WHEN** 管理员进入系统设置页
- **THEN** 页面 SHALL 展示用户管理与 CLIProxy 管理的入口，管理员 SHALL 可从设置页直接进入这两个子页面

# admin-console-layout-v2 Specification

## Purpose
TBD - created by archiving change frontend-visual-rebuild. Update Purpose after archive.
## Requirements
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
系统 MUST 为核心页面提供统一结构模板，包括标题区、主操作区、主要内容区与状态反馈区，且允许在不破坏骨架的前提下做页面级扩展。标题区 MUST 复用统一的页面头部原语（`PageHeader`：图标 + 标题 + 描述 + 操作槽），页面外层容器 MUST 复用统一的页面骨架原语（`PageShell`：受控最大宽度与内边距），MUST NOT 让各页各自手写等价的头卡与外层骨架，非标骨架页（如 header-compensation）MUST 归一到共享原语。

#### Scenario: 核心页面保持一致骨架
- **WHEN** 用户在 Dashboard、Keys、Upstreams、Logs、Settings 之间切换
- **THEN** 页面 SHALL 维持一致的区块顺序与视觉层级

#### Scenario: 页面头部与骨架复用共享原语
- **WHEN** 任意管理台页面渲染标题区与外层容器
- **THEN** 该页 SHALL 复用 `PageHeader` 与 `PageShell` 原语，SHALL NOT 出现手写的等价头卡或 `mx-auto max-w-* space-y-* px-* py-*` 非标骨架

### Requirement: 壳层不得残留旧视觉语言样式
系统 MUST 清除壳层相关组件中旧视觉语言的表现性类与特效，避免新旧风格混杂。

#### Scenario: 壳层组件视觉检查
- **WHEN** 检查 Sidebar、Topbar、Dashboard Layout
- **THEN** 壳层组件 SHALL 不再出现旧视觉语言特征

### Requirement: 导航项必须按当前身份角色过滤

系统 MUST 根据当前登录身份的角色决定导航项的可见性。仅超级管理员（`ADMIN_TOKEN` 身份）与角色为 `admin` 的用户可见管理类导航项，包括用户管理入口。角色为 `member` 的用户 MUST NOT 看到管理类导航项。导航的角色过滤仅作用于界面展示，对应路由与接口的实际权限校验 MUST 由服务端独立完成，前端过滤 MUST NOT 作为安全边界。

#### Scenario: 管理员可见用户管理入口

- **WHEN** 超级管理员或角色为 `admin` 的用户进入管理后台
- **THEN** 侧边导航的系统分组中显示用户管理入口

#### Scenario: 普通用户不可见管理类导航

- **WHEN** 角色为 `member` 的用户进入界面
- **THEN** 侧边导航不显示用户管理等管理类入口

#### Scenario: 前端过滤不替代服务端校验

- **WHEN** `member` 用户绕过界面直接请求管理类接口
- **THEN** 服务端仍依据角色返回 403，不因前端是否隐藏入口而改变校验结果

### Requirement: 壳层必须按角色渲染管理后台与自助门户两套导航

系统 MUST 复用同一套壳层布局组件，按当前身份角色渲染不同的导航集合。`admin` 与 `ADMIN_TOKEN` 身份渲染管理后台导航（仪表盘、API 密钥、上游、日志、系统分组）。`member` 身份渲染自助门户导航（个人概览、我的请求、我的密钥）。两套导航 MUST 保持一致的视觉层级与当前态反馈。

#### Scenario: 管理员渲染管理后台导航

- **WHEN** `admin` 或 `ADMIN_TOKEN` 身份进入界面
- **THEN** 侧边导航显示管理后台的完整导航集合

#### Scenario: 普通用户渲染门户导航

- **WHEN** `member` 身份进入界面
- **THEN** 侧边导航仅显示自助门户的个人概览、我的请求、我的密钥三项

#### Scenario: 两套导航共享壳层结构

- **WHEN** 在管理后台或自助门户之间按角色切换渲染
- **THEN** 壳层保持一致的布局骨架、激活态与响应式行为

### Requirement: 设置页必须提供完整的系统管理入口
系统设置页 MUST 提供指向全部系统级管理子页面的入口。当管理后台存在用户管理与 CLIProxy 管理子页面时，设置页 MUST 包含二者的入口，MUST NOT 遗漏任何已实现的系统管理子页面入口。

#### Scenario: 设置页覆盖用户管理与 CLIProxy 入口
- **WHEN** 管理员进入系统设置页
- **THEN** 页面 SHALL 展示用户管理与 CLIProxy 管理的入口，管理员 SHALL 可从设置页直接进入这两个子页面


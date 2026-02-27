## ADDED Requirements

### Requirement: 请求日志记录头部差异
系统 SHALL 在每条请求日志中持久化存储头部差异信息，包含 `session_id_compensated`（布尔值，默认 false）和 `header_diff`（JSON 结构，可为 null）两个字段。`header_diff` 仅存储头部名称，不存储头部值。

#### Scenario: 执行了补偿的请求日志
- **WHEN** 一次代理请求完成，补偿引擎成功注入了 `session_id` 头部
- **THEN** 日志记录中 `session_id_compensated=true`，`header_diff.compensated` 包含注入的头部名称和来源路径

#### Scenario: 未执行补偿的请求日志
- **WHEN** 一次代理请求完成，未触发任何补偿规则
- **THEN** 日志记录中 `session_id_compensated=false`，`header_diff` 仍记录 `dropped` 和 `auth_replaced` 信息（如有）

#### Scenario: header_diff 不记录头部值
- **WHEN** 系统构建 `header_diff` 结构
- **THEN** 结构中所有字段仅包含头部名称字符串，不包含任何头部的实际值

---

### Requirement: 日志详情头部差异面板
系统 SHALL 在日志详情展开行中提供独立的头部差异面板组件，以结构化方式展示 `header_diff` 数据，面板横跨全宽。

面板展示内容：
- 入站头部数量与出站头部数量
- 被过滤的头部名称列表（`dropped`）
- 被替换的认证头部名称（`auth_replaced`）
- 已补偿注入的头部列表，每项显示头部名称和来源路径（`compensated`）

#### Scenario: 有补偿数据时展示面板
- **WHEN** 管理员展开一条 `session_id_compensated=true` 的日志记录
- **THEN** 详情区域显示头部差异面板，`compensated` 区域列出 `session_id` 及其来源路径

#### Scenario: header_diff 为 null 时隐藏面板
- **WHEN** 管理员展开一条 `header_diff=null` 的旧日志记录
- **THEN** 详情区域不显示头部差异面板

---

### Requirement: 路由决策时间线补偿标记
系统 SHALL 在路由决策时间线的上游选择阶段（Stage 2），当 `session_id_compensated=true` 时显示补偿来源徽章。

徽章样式：`⚡ 补偿`，悬停时显示 tooltip，内容为补偿的头部名称及来源路径（如：`session_id 已从 body.previous_response_id 补偿注入`）。

#### Scenario: 显示补偿徽章
- **WHEN** 日志的 `session_id_compensated=true` 且 `header_diff.compensated` 非空
- **THEN** 路由决策时间线 Stage 2 的上游选择项旁显示 `⚡ 补偿` 徽章

#### Scenario: 未补偿时不显示徽章
- **WHEN** 日志的 `session_id_compensated=false`
- **THEN** 路由决策时间线 Stage 2 不显示补偿徽章

#### Scenario: 徽章 tooltip 内容
- **WHEN** 管理员将鼠标悬停在 `⚡ 补偿` 徽章上
- **THEN** tooltip 显示具体的补偿头部名称和来源路径信息

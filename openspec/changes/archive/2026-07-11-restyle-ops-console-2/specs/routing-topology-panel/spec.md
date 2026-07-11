# routing-topology-panel 增量规格

## ADDED Requirements

### Requirement: Dashboard 必须提供路由拓扑面板
系统 MUST 在 Dashboard 概览页（指标卡与用量图表之间）提供一个路由拓扑面板，以 SVG 图形展示网关核心到各上游节点的路由关系。面板 MUST 复用现有数据源（上游列表、健康轮询、实时脉冲），不得新增后端接口。上游数量超出展示上限（6–8 个，按 priority/weight 排序）时 MUST 以「+N」形式提示溢出数量。

#### Scenario: 管理员查看拓扑面板
- **WHEN** 管理员访问 Dashboard 概览页
- **THEN** 页面 SHALL 渲染路由拓扑面板，展示核心节点与按优先级排序的上游节点，且不触发任何新增后端请求路径

#### Scenario: 上游数量超出展示上限
- **WHEN** 已配置上游数量超过面板展示上限
- **THEN** 面板 SHALL 展示排序靠前的上游并以「+N」标识未展示数量

### Requirement: 拓扑节点必须按健康与熔断状态呈现统一视觉语义
面板 MUST 按以下裁决顺序渲染每个上游节点：未启用（`is_active` 为假）→ 灰化且无动效；熔断打开或健康检查不健康 → 错误色虚线边、离线样式、无流量动效；熔断半开 → 警告色边线、低频流量动效；熔断关闭且健康 → 成功色实线边、正常流量动效。节点 MUST 同时展示熔断状态芯片（CLOSED/HALF/OPEN）。

#### Scenario: 上游熔断打开
- **WHEN** 某上游熔断器状态为 open 或健康检查为不健康
- **THEN** 该节点 SHALL 以错误色虚线边与离线样式渲染，且其连线上 SHALL 不出现流量动效

#### Scenario: 上游正常服务
- **WHEN** 某上游熔断器状态为 closed 且健康检查为健康
- **THEN** 该节点 SHALL 以成功色实线边渲染，连线上 SHALL 出现流量动效

### Requirement: 拓扑面板必须满足可访问性与动效降级
面板动效 MUST 在 `prefers-reduced-motion` 启用时通过 JS 判定完全不渲染 SMIL 动画子树（SMIL 不受 CSS media query 控制）。面板 MUST 提供 `role="img"`、`<title>/<desc>` 与视觉隐藏的文字摘要（上游总数与各状态计数），且降级/无动效时状态语义（颜色、虚实线、芯片）MUST 完整保留。

#### Scenario: 用户开启减少动态效果
- **WHEN** 系统或浏览器启用 reduced motion
- **THEN** 面板 SHALL 不渲染任何流量包动画节点，且节点状态语义 SHALL 完整可读

#### Scenario: 辅助技术读取面板
- **WHEN** 屏幕阅读器聚焦拓扑面板
- **THEN** 面板 SHALL 暴露标题、描述与状态计数文字摘要

### Requirement: 拓扑面板文案必须双语覆盖
面板全部用户可见文案 MUST 通过 next-intl 提供，并同时落地 `en.json` 与 `zh-CN.json`。

#### Scenario: 切换语言
- **WHEN** 用户在 en 与 zh-CN 之间切换
- **THEN** 面板标题、状态标签、溢出提示与文字摘要 SHALL 以对应语言完整展示

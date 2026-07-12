## MODIFIED Requirements

### Requirement: 上游管理页必须提供运营工作台式信息结构
系统 SHALL 将上游管理页构建为按优先级分组的运营工作台，并以按 tier 分组的紧凑行表展示配置、运行态与操作入口。列表 MUST 以紧凑行呈现单条上游（LED 状态灯 + 名称与 base_url + 熔断状态芯片 + 关键运行指标 + 行操作），MUST NOT 使用信息全量平铺的大卡片网格。密集行内数字 MUST 遵循数据数字排印契约的 Tier-2/Tier-3 档。行 MUST 支持展开以呈现原卡片的密集信息（capabilities、计费倍率、并发/队列进度、quota 明细）。compact/comfortable 密度切换 MUST 保留。

#### Scenario: 按优先级分组展示上游
- **WHEN** 管理员进入上游管理页
- **THEN** 页面 MUST 先展示 tier 分组摘要，再展示该组内上游条目

#### Scenario: 单条上游行聚合关键信息
- **WHEN** 管理员查看任意上游行
- **THEN** 该行 MUST 同时提供身份信息（LED + 名称 + base_url）、熔断状态芯片、关键运行指标与行操作入口

#### Scenario: 展开行呈现密集详情
- **WHEN** 管理员点击展开某条上游行
- **THEN** 系统 MUST 在展开区呈现该上游的 capabilities、计费倍率、并发/队列进度与 quota 明细

### Requirement: 上游卡片头部与操作区应聚焦高频动作
系统 SHALL 在上游行中前置关键状态并收敛操作按钮，降低误触与视觉噪声。

#### Scenario: 状态标记在名称前展示
- **WHEN** 管理员查看上游行头部
- **THEN** 系统 MUST 将启用/停用状态 LED 展示在上游名称前方，再展示名称与能力信息

#### Scenario: 操作区提供启停、连接测试、编辑、删除
- **WHEN** 管理员在行操作区执行常见维护动作
- **THEN** 系统 MUST 提供启停开关、连接测试动作、编辑入口、删除入口
- **AND** 连接测试动作 MUST 可达并真正触发上游连接测试（不得声明却从未调用）
- **AND** 编辑入口 MUST 跳转到该上游的详情页而非打开内联编辑弹窗

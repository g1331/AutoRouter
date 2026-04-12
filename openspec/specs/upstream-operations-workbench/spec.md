# upstream-operations-workbench Specification

## Purpose
TBD - created by archiving change optimize-upstream-management-experience. Update Purpose after archive.
## Requirements
### Requirement: 上游管理页必须提供运营工作台式信息结构
系统 SHALL 将上游管理页构建为按优先级分组的运营工作台，并以统一卡片语义展示配置、运行态与操作入口。

#### Scenario: 按优先级分组展示上游
- **WHEN** 管理员进入上游管理页
- **THEN** 页面 MUST 先展示 tier 分组摘要，再展示该组内上游条目

#### Scenario: 单条上游卡片聚合关键信息
- **WHEN** 管理员查看任意上游条目
- **THEN** 该条目 MUST 同时提供身份信息、endpoint 信息、运行态信息与操作入口

### Requirement: 上游卡片头部与操作区应聚焦高频动作
系统 SHALL 在上游卡片中前置关键状态并收敛操作按钮，降低误触与视觉噪声。

#### Scenario: 状态标记在名称前展示
- **WHEN** 管理员查看上游卡片头部
- **THEN** 系统 MUST 将启用/停用状态标记展示在上游名称前方，再展示名称与能力信息

#### Scenario: 操作区仅保留启停、编辑、删除
- **WHEN** 管理员在卡片操作区执行常见维护动作
- **THEN** 系统 MUST 提供启停开关、编辑图标按钮、删除图标按钮
- **AND** 测试按钮 MUST 默认不展示

### Requirement: 上游列表时间信息以最近使用时间为主
系统 SHALL 在上游列表中展示最近一次使用时间（last used），替代创建时间作为默认运营时间指标。

#### Scenario: 已使用上游显示最近活跃时间
- **WHEN** 某上游存在历史请求记录
- **THEN** 上游列表 MUST 展示该上游最近一次请求时间的相对时间文本

#### Scenario: 从未使用上游显示未使用状态
- **WHEN** 某上游尚无任何请求记录
- **THEN** 上游列表 MUST 显示“未使用”状态文案

### Requirement: 桌面与移动端必须保持同语义信息层级
系统 SHALL 在桌面与移动端保持一致的信息语义与状态优先级，仅允许排版密度差异。

#### Scenario: 关键状态在不同终端一致可见
- **WHEN** 管理员在桌面端和移动端分别查看同一上游
- **THEN** 健康状态、熔断状态、配额状态与并发状态 MUST 在两端都可见且语义一致

#### Scenario: 主次操作分层一致
- **WHEN** 管理员在不同终端执行上游操作
- **THEN** 主操作与次操作的分层关系 MUST 一致，避免交互语义漂移

### Requirement: 上游工作台必须展示模型发现状态与目录来源
系统 SHALL 在上游管理工作台中展示每个上游的模型发现状态、最近抓取时间与目录来源，帮助管理员判断当前模型配置是否基于真实发现还是推断候选。

#### Scenario: 展示原生发现成功状态
- **WHEN** 某上游最近一次模型发现成功
- **THEN** 工作台 MUST 展示成功状态、最近抓取时间与原生来源标记

#### Scenario: 展示发现失败与 fallback 状态
- **WHEN** 某上游最近一次原生发现失败且存在 LiteLLM fallback 结果
- **THEN** 工作台 MUST 同时展示原生失败状态与 LiteLLM 推断来源标记

### Requirement: 上游工作台必须支持从目录浏览结果导入模型规则
系统 SHALL 允许管理员在上游工作台中浏览目录缓存、选择模型并导入为当前上游的显式允许规则。

#### Scenario: 从目录批量导入模型
- **WHEN** 管理员在目录浏览界面中选中多个模型并确认导入
- **THEN** 系统 MUST 将这些模型导入为当前上游的显式规则
- **AND** 工作台 MUST 在导入完成后回显更新后的规则摘要

#### Scenario: 导入前区分来源类型
- **WHEN** 管理员浏览可导入目录
- **THEN** 系统 MUST 让管理员区分原生发现条目与 LiteLLM 推断条目

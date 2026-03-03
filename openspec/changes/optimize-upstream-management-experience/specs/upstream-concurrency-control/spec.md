## ADDED Requirements

### Requirement: 上游支持独立并发上限配置
系统 SHALL 支持为每个上游配置独立并发上限，用于约束该上游可同时处理的请求数量。

#### Scenario: 配置为空表示不限流
- **WHEN** 管理员未为某上游设置并发上限
- **THEN** 系统 MUST 将该上游视为“不限并发上限”

#### Scenario: 配置有效上限值
- **WHEN** 管理员为上游设置并发上限为正整数
- **THEN** 系统 MUST 在路由阶段将该值作为该上游的最大并发容量约束

### Requirement: 并发满载时自动转移且不触发熔断
系统 SHALL 在上游并发满载时进行候选排除与自动转移，且 MUST NOT 将该事件视为上游故障。

#### Scenario: 同 tier 存在其他可用上游时转移
- **WHEN** 当前候选上游达到并发上限且同优先级 tier 存在其他可用上游
- **THEN** 系统 MUST 自动转移到同 tier 其他可用上游继续处理请求

#### Scenario: 同 tier 全满时降级下一 tier
- **WHEN** 某优先级 tier 内所有候选上游均达到并发上限
- **THEN** 系统 MUST 尝试下一优先级 tier 的可用上游而非直接失败

#### Scenario: 并发满载不触发健康降级和熔断
- **WHEN** 请求因并发满载从某上游转移
- **THEN** 系统 MUST NOT 将该上游标记为 unhealthy，且 MUST NOT 累积熔断失败计数

### Requirement: 并发占用信息可被管理端查看
系统 SHALL 在上游管理界面展示每个上游的当前并发占用与上限，支持快速识别容量瓶颈。

#### Scenario: 展示实时并发占用
- **WHEN** 管理员打开上游管理页面
- **THEN** 每个上游条目 MUST 展示 `current_concurrency / max_concurrency` 或“不限”状态

#### Scenario: 并发满载状态可视化
- **WHEN** 上游当前并发占用达到配置上限
- **THEN** 该上游条目 MUST 显示明确的“并发已满”状态提示

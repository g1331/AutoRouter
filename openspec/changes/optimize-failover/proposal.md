## Why

当前系统的故障转移机制过于简单：仅在网络错误或 5xx/429 响应时重试最多 3 次，缺乏对上游健康状态的持续跟踪和智能恢复策略。用户需要更可靠的故障转移能力：当某个上游故障时自动切换到同类型的其他上游，并支持可配置的故障阈值、自动恢复时间和半开状态探测，以提供真正无缝的使用体验。

## What Changes

- **新增 Circuit Breaker 熔断器机制**：为每个上游维护健康状态（Closed/Opened/Half-Open），超过失败阈值后自动熔断
- **可配置的故障转移策略**：支持配置失败阈值、熔断持续时间、半开探测间隔
- **同类型上游自动故障转移**：当 upstream 故障时，自动选择同 provider_type 的其他 healthy upstream
- **智能恢复机制**：熔断后进入 Half-Open 状态，通过探测请求验证恢复情况，成功后自动关闭熔断
- **增强健康检查**：整合被动检查（请求结果）和主动检查（定期探测）
- **配置持久化**：熔断器状态和健康统计存储在数据库，支持多实例共享

## Capabilities

### New Capabilities

- `circuit-breaker`: 熔断器核心机制，包括状态管理、阈值判断、状态转换
- `upstream-failover`: 上游故障转移逻辑，同类型 upstream 自动切换
- `health-monitoring`: 增强健康监控，支持被动检测和主动探测

### Modified Capabilities

- `model-based-routing`: 集成熔断器检查到路由决策中，优先选择 healthy upstream

## Impact

- **数据库**：新增 circuit_breaker_states 表存储熔断器状态
- **核心服务**：修改 model-router.ts、load-balancer.ts 集成健康检查
- **代理路由**：修改 proxy route 的故障转移逻辑，支持熔断器感知
- **配置**：新增熔断器相关配置项（阈值、持续时间等）
- **API**：可选新增管理 API 查询熔断器状态、手动重置

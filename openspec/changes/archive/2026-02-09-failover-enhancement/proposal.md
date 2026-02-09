## Why

当前的负载均衡机制在上游返回错误时会直接将错误透传给下游客户端，而不是自动进行故障转移重试。这导致下游无法享受无缝的使用体验，即使系统中存在其他可用的上游。设计目标是让下游享受无缝体验，所有复杂性由 AutoRouter 承担。

## What Changes

- **增强 Failover 触发条件**: 从仅 5xx/429 扩展到所有非 2xx 响应都触发 failover
- **改进重试策略**: 默认尝试所有可用上游直到成功或全部耗尽，而非固定 3 次
- **流式响应首包验证**: 在开始流式传输前验证首个响应包，失败时可切换上游重试
- **统一错误响应**: 所有上游失败后返回 AutoRouter 自己的错误格式，不透露上游信息
- **下游断开检测**: 优雅处理下游客户端超时断开，不影响系统稳定性
- **可配置 Failover 策略**: 支持配置重试策略、排除特定状态码等

## Capabilities

### New Capabilities

- `failover-strategy`: 可配置的故障转移策略，包括重试模式（exhaust_all/max_attempts）、排除状态码、流式响应处理模式等

### Modified Capabilities

无现有 specs 需要修改。

## Impact

- **代码影响**:
  - `src/app/api/proxy/v1/[...path]/route.ts`: 重构 `forwardWithFailover` 函数
  - `src/lib/services/proxy-client.ts`: 可能需要调整流式响应处理
  - `src/lib/services/load-balancer.ts`: 可能需要调整上游选择逻辑
- **API 影响**: 错误响应格式变更（返回 AutoRouter 统一格式而非上游原始错误）
- **行为变更**: 4xx 错误不再直接透传，会触发 failover 重试

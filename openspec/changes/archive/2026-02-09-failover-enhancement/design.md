## Context

当前 AutoRouter 的 proxy 层在 `src/app/api/proxy/v1/[...path]/route.ts` 中实现了基本的 failover 机制，但存在以下限制：

1. **有限的 failover 触发条件**: 仅 5xx 和 429 状态码触发重试
2. **固定重试次数**: 硬编码 `MAX_FAILOVER_ATTEMPTS = 3`
3. **错误透传**: 非 failover 错误直接返回给下游，暴露上游信息
4. **流式响应风险**: 流开始后无法重试

相关代码：

- `forwardWithFailover()`: 核心 failover 循环
- `shouldFailover()`: 判断是否触发 failover
- `isFailoverableError()`: 判断异常是否可重试
- `wrapStreamWithConnectionTracking()`: 流式响应追踪

## Goals / Non-Goals

**Goals:**

- 所有非 2xx 响应都触发 failover，让下游享受无缝体验
- 默认尝试所有可用上游，直到成功或全部耗尽
- 流式响应采用首包验证，在开始传输前可重试
- 统一错误响应格式，不透露上游信息
- 优雅处理下游断开，不影响系统稳定性
- 支持配置化的 failover 策略

**Non-Goals:**

- 不实现跨实例的分布式 failover 状态同步
- 不实现请求级别的超时配置（使用上游配置的超时）
- 不实现流中途错误的重试（技术上不可行）
- 不修改熔断器核心逻辑（复用现有实现）

## Decisions

### Decision 1: Failover 触发条件

**选择**: 所有非 2xx 响应都触发 failover

**理由**:

- 4xx 错误可能是上游特定问题（如 401 key 失效、403 配额、404 模型不支持）
- 不同上游可能有不同的验证规则和支持范围
- 用户明确要求"任何错误都应该由我们软件捕获"

**替代方案**:

- 仅 5xx + 429: 当前实现，但 4xx 会透传
- 可配置白名单: 增加复杂度，默认行为不够友好

### Decision 2: 重试策略

**选择**: 默认 `exhaust_all` - 尝试所有可用上游

**理由**:

- 最大化成功率，符合"无缝体验"目标
- 下游有自己的超时机制，会主动断开
- 通过检测 `request.signal.aborted` 避免无效重试

**实现**:

```typescript
type FailoverStrategy = "exhaust_all" | "max_attempts";

interface FailoverConfig {
  strategy: FailoverStrategy;
  maxAttempts?: number; // 当 strategy 为 max_attempts 时使用
  excludeStatusCodes?: number[]; // 不触发 failover 的状态码
}
```

### Decision 3: 流式响应处理 - 首包验证

**选择**: First-Chunk Validation（首包验证）

**理由**:

- 大多数错误（401/403/429/500）在首个响应就返回
- 延迟增加极小（仅等待首个 chunk）
- 保持流式实时性
- 平衡了重试能力和用户体验

**流程**:

1. 发送请求到上游
2. 等待 HTTP headers + 首个 chunk
3. 如果是错误响应 → 不开始流式传输，切换上游重试
4. 如果是正常数据 → 开始流式传输给下游
5. 流中途出错 → 发送 SSE 错误事件（无法重试，接受风险）

**替代方案**:

- 接受风险: 延迟最低但无重试能力
- 完整缓冲: 可完整重试但失去实时性，内存占用高
- 预检请求: 增加一次 RTT，且预检成功不保证流式成功

### Decision 4: 错误响应格式

**选择**: 返回 AutoRouter 统一错误格式

**格式**:

```json
{
  "error": {
    "message": "服务暂时不可用，请稍后重试",
    "type": "service_unavailable",
    "code": "ALL_UPSTREAMS_UNAVAILABLE"
  }
}
```

**理由**:

- 不透露上游信息，保护隐私
- 统一的错误格式，下游易于处理
- 详细的 failover 历史记录在内部日志中

### Decision 5: 下游断开检测

**选择**: 监听 `request.signal.aborted`

**实现**:

```typescript
// 在 failover 循环中检查
if (request.signal.aborted) {
  // 取消当前上游请求
  // 清理资源
  // 记录日志 (client_disconnected)
  // 静默退出
  return;
}
```

**理由**:

- 标准 Web API，无需额外依赖
- 可以及时停止无效的重试
- 避免资源浪费

## Risks / Trade-offs

### Risk 1: 4xx 错误重试可能无意义

**风险**: 某些 4xx（如 400 Bad Request）可能是请求本身的问题，重试其他上游也会失败
**缓解**:

- 提供 `excludeStatusCodes` 配置选项
- 默认全部重试，让用户根据实际情况调整
- 即使重试失败，也不会比当前行为更差

### Risk 2: 流中途错误无法重试

**风险**: 首包验证通过后，流中途出错无法切换上游
**缓解**:

- 这种情况实际发生概率很低
- 发送 SSE 错误事件通知下游
- 记录日志供排查
- 这是流式响应的固有限制，无法完全避免

### Risk 3: 重试耗时过长

**风险**: `exhaust_all` 策略可能导致请求耗时很长
**缓解**:

- 下游有自己的超时机制，会主动断开
- 检测 `request.signal.aborted` 及时停止
- 熔断器会快速排除不健康的上游
- 可配置 `max_attempts` 策略作为替代

### Risk 4: 错误信息丢失

**风险**: 统一错误格式可能让下游难以调试
**缓解**:

- 内部日志完整记录 failover 历史
- 管理员可通过日志查看详细错误
- 可考虑在 debug 模式下返回更多信息（未来增强）

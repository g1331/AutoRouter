## Context

当前故障转移机制基于简单的重试逻辑（最多3次），没有持续跟踪上游健康状态。当上游故障时，系统需要更智能的熔断和恢复机制来确保用户体验。

现有组件：

- `model-router.ts`: 根据 model 前缀选择 provider_type，但仅返回单个 upstream
- `load-balancer.ts`: 支持轮询/加权/最少连接策略，但依赖 group 概念
- `health-checker.ts`: 被动健康检查（基于请求结果），支持主动探测
- `proxy-client.ts`: 代理转发，支持流式响应

## Goals / Non-Goals

**Goals:**

- 实现 Circuit Breaker 熔断器模式，防止级联故障
- 同 provider_type 的 upstream 之间自动故障转移
- 支持可配置的失败阈值、熔断持续时间、半开探测
- 熔断器状态持久化，支持多实例共享
- 智能恢复：半开状态下探测成功后自动恢复

**Non-Goals:**

- 跨 provider_type 的故障转移（如 OpenAI 故障转 Anthropic）
- 全局负载均衡（多实例间状态共享使用数据库）
- 复杂的预测性故障检测

## Decisions

### 1. Circuit Breaker 状态机设计

采用经典三态状态机：

```
┌─────────┐     失败阈值达到      ┌─────────┐
│ CLOSED  │ ───────────────────▶ │  OPEN   │
│ (正常)  │                      │ (熔断)  │
└────┬────┘                      └────┬────┘
     ▲                               │
     │ 探测成功                       │ 熔断持续时间结束
     │                               ▼
     │                          ┌─────────┐
     └──────────────────────────│ HALF-OPEN│
                                │ (半开)  │
                                └─────────┘
                                   │
                                   │ 探测失败
                                   ▼
                              回到 OPEN
```

**决策理由**: 标准熔断器模式，业界验证，实现清晰。

### 2. 数据模型设计

新增 `circuit_breaker_states` 表：

```sql
- upstream_id: UUID PRIMARY KEY (关联 upstreams)
- state: ENUM ('closed', 'open', 'half_open')
- failure_count: INT (当前连续失败次数)
- success_count: INT (半开状态下的成功次数)
- last_failure_at: TIMESTAMP (最后一次失败时间)
- opened_at: TIMESTAMP (熔断开始时间)
- last_probe_at: TIMESTAMP (最后一次探测时间)
- config: JSON (上游特定的熔断配置)
```

**决策理由**: 每个 upstream 独立维护自己的熔断状态，config 字段支持 upstream 级别的自定义配置。

### 3. 配置层级

```
全局默认值 (环境变量/配置文件)
    ↓
Provider Type 级别配置 (可选)
    ↓
Upstream 级别配置 (数据库 circuit_breaker_states.config)
```

默认配置：

- `failureThreshold`: 5 (连续失败次数触发熔断)
- `successThreshold`: 2 (半开状态下成功次数恢复)
- `openDuration`: 30s (熔断持续时间)
- `probeInterval`: 10s (半开状态探测间隔)
- `probeTimeout`: 5s (探测请求超时)

### 4. 故障转移流程

```
1. 请求到达，提取 model
2. 获取 provider_type (openai/anthropic/google)
3. 查询所有同 provider_type 的 active upstreams
4. 过滤掉 state = 'open' 的 upstreams
5. 在剩余 upstreams 中应用负载均衡策略
6. 发送请求
7. 根据结果更新熔断器状态
8. 如果失败且可重试，回到步骤 4 (排除失败 upstream)
```

### 5. 与现有架构整合

- **保留 group 概念**: 作为可选的高级功能，用于自定义策略
- **简化 model-router**: 优先使用 provider_type 查询，group 作为 fallback
- **增强 load-balancer**: 增加 `selectFromProviderType()` 方法
- **复用 health-checker**: 熔断器状态变更时同步更新 health 表

### 6. 探测请求设计

半开状态下，允许有限流量通过以探测恢复情况：

- 每 `probeInterval` 允许 1 个请求通过
- 或者使用轻量级健康检查端点（如模型列表接口）

**决策理由**: 避免在恢复期间发送真实用户请求到可能故障的上游。

## Risks / Trade-offs

| Risk                     | Mitigation                                              |
| ------------------------ | ------------------------------------------------------- |
| 数据库成为单点故障       | 熔断器状态查询使用短缓存（1-5秒），失败时降级为内存状态 |
| 所有上游同时熔断         | 提供 "force open" 机制，允许请求尝试以发现恢复          |
| 半开状态探测影响用户体验 | 探测请求使用后台定时任务，不阻塞真实请求                |
| 配置过于复杂             | 提供合理的默认值，大部分用户无需自定义                  |

## Migration Plan

1. **数据库迁移**: 创建 `circuit_breaker_states` 表，为现有 upstreams 初始化记录（state='closed'）
2. **代码部署**: 先部署熔断器逻辑，默认关闭（阈值设极高），观察后再调整
3. **配置调整**: 逐步调低阈值到合理值
4. **监控**: 添加熔断器状态指标，观察触发频率

## Open Questions (Resolved)

1. **是否需要 Admin API 手动重置熔断器状态？**
   - **决策**: 需要。提供 `POST /api/admin/circuit-breakers/{upstreamId}/force-open` 和 `force-close` 接口，允许管理员在紧急情况下手动干预。

2. **是否需要熔断事件通知（Webhook）？**
   - **决策**: 预留扩展点，首期不实现。在 `circuit_breaker_states` 表中保留 `last_transition_reason` 字段，未来可扩展事件通知机制。

3. **半开状态探测使用真实请求还是独立健康检查？**
   - **决策**: 使用真实请求被动检测。HALF_OPEN 状态下按 `probeInterval` 间隔放行真实用户请求作为探测，根据请求结果决定是否状态转移。避免额外的健康检查请求开销。

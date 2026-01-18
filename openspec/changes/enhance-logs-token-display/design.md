## Context

当前日志系统仅记录基础 Token（prompt_tokens、completion_tokens、total_tokens），无法反映现代 AI API 的完整计费模型。

主流提供商的缓存机制已成为成本优化的关键：

- OpenAI：自动缓存，cached_tokens 享受 50% 折扣
- Anthropic：手动缓存控制，cache_read 享受 90% 折扣

## Goals / Non-Goals

### Goals

1. 完整记录所有影响计费的 Token 类型
2. 提供直观的 Token 显示，用户一眼能看懂
3. 支持自动刷新，实时监控请求

### Non-Goals

1. 不实现完整的成本计算（不同提供商价格不同）
2. 不实现 Token 用量告警（后续迭代）
3. 不支持 audio_tokens（当前业务不涉及音频）

## Decisions

### 1. 数据库字段设计

**决策**：新增 4 个独立字段而非 JSON 存储

```sql
cached_tokens INTEGER DEFAULT 0      -- OpenAI cached_tokens
reasoning_tokens INTEGER DEFAULT 0   -- OpenAI reasoning_tokens
cache_creation_tokens INTEGER DEFAULT 0  -- Anthropic cache_creation
cache_read_tokens INTEGER DEFAULT 0  -- Anthropic cache_read
```

**理由**：

- 便于聚合查询和统计
- 类型安全，避免 JSON 解析开销
- 与现有字段风格一致

**备选方案**：

- JSON 字段存储完整 usage 对象 - 灵活但查询复杂
- 单独 token_details 表 - 过度设计

### 2. Token 提取策略

**决策**：统一字段名，屏蔽提供商差异

| 数据库字段            | OpenAI 来源                                | Anthropic 来源              |
| --------------------- | ------------------------------------------ | --------------------------- |
| cached_tokens         | prompt_tokens_details.cached_tokens        | cache_read_input_tokens     |
| reasoning_tokens      | completion_tokens_details.reasoning_tokens | N/A                         |
| cache_creation_tokens | N/A                                        | cache_creation_input_tokens |
| cache_read_tokens     | prompt_tokens_details.cached_tokens        | cache_read_input_tokens     |

**理由**：

- 前端无需关心提供商差异
- 统计分析更简单
- 便于未来支持更多提供商

### 3. Token 显示格式

**决策**：分层标签式 + Tooltip 详情

表格显示（紧凑）：

```
总计: 27,323
输入: 27,296 | 输出: 27
缓存: 25,000 ✨
```

Tooltip 详情（完整）：

```
输入 Token: 27,296
  - 缓存读取: 25,000
  - 新增输入: 2,296
输出 Token: 27
  - 推理: 0
总计: 27,323
```

**理由**：

- 表格保持紧凑，不影响整体布局
- Tooltip 提供完整信息，满足深入分析需求
- 缓存标识（✨）快速识别缓存命中

### 4. 自动刷新实现

**决策**：使用 React Query 的 `refetchInterval` + localStorage 持久化

```typescript
const [refreshInterval, setRefreshInterval] = useState(() => {
  return localStorage.getItem("logs-refresh-interval") || "0";
});

useRequestLogs(page, pageSize, {
  refetchInterval: parseInt(refreshInterval) * 1000 || false,
});
```

**理由**：

- React Query 原生支持，无需额外状态管理
- 用户偏好持久化，跨会话保持
- 刷新时自动复用缓存，减少闪烁

## Risks / Trade-offs

### 1. 数据库迁移

**风险**：新增字段需要迁移，现有数据默认为 0

**缓解**：

- 使用 `DEFAULT 0` 确保向后兼容
- 历史数据缓存字段显示为 0 是合理的（无法追溯）

### 2. SSE 流式响应的 Token 提取

**风险**：SSE 响应的 usage 信息在最后一个 chunk，需要正确解析

**缓解**：

- 当前 proxy-client 已正确处理，usage 从完整响应提取
- 增加单元测试覆盖 SSE 场景

### 3. 前端性能

**风险**：自动刷新可能导致频繁重渲染

**缓解**：

- React Query 智能缓存，无变化不重渲染
- 提供关闭选项，用户可控

## Migration Plan

1. 生成数据库迁移 `pnpm db:generate`
2. 应用迁移 `pnpm db:migrate`
3. 部署后端更新
4. 部署前端更新
5. 无需数据迁移，历史记录缓存字段默认 0

**回滚**：

- 数据库字段可保留（不影响现有功能）
- 前端可回滚到旧版本

## Open Questions

1. 是否需要支持 audio_tokens？当前暂不支持，后续按需添加
2. 是否需要在仪表盘统计中展示缓存 Token？建议后续迭代

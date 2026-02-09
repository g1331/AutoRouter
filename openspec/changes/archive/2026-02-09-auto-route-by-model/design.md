## Context

当前 AutoRouter 的路由逻辑位于 `src/app/api/proxy/v1/[...path]/route.ts`，依赖客户端发送的 Header 进行路由决策：

- `X-Upstream-Name`: 直接路由到指定上游
- `X-Upstream-Group`: 使用负载均衡器在分组内选择上游
- 无 Header: 使用默认上游

这种方式要求用户修改客户端配置，与现代 AI Gateway（如 LiteLLM、OpenRouter、claude-code-hub）的零配置理念不符。

参考 ding113/claude-code-hub 的实现，其通过以下方式实现自动路由：

1. 从请求体解析 `model` 字段
2. 根据模型前缀匹配 Provider 类型（`claude-*` → anthropic, `gpt-*` → codex）
3. 使用 `allowedModels` 和 `modelRedirects` 进行精细控制
4. 支持会话粘性（session reuse）保证多轮对话一致性

## Goals / Non-Goals

**Goals:**

- 实现基于请求 `model` 参数的自动路由，无需客户端修改
- 支持模型前缀到上游分组的智能映射
- 保持负载均衡和故障转移能力
- 支持模型重定向（如将 `gpt-4` 映射到 `claude-3-opus`）
- 移除 Header 路由方式，简化架构

**Non-Goals:**

- 不实现会话粘性（session reuse）—— 超出当前范围
- 不实现动态模型发现 —— 使用静态配置
- 不保留 Header 路由作为 fallback —— 完全移除

## Decisions

### Decision 1: 完全移除 Header 路由（而非保留为 fallback）

**Rationale**: 简化代码路径，避免维护两套路由逻辑。用户如果需要特定路由，可以通过配置模型重定向实现。

**Alternatives considered**:

- 保留 Header 作为 override：增加复杂度，且与零配置理念冲突
- 保留 Header 作为 fallback：代码路径混乱，难以调试

### Decision 2: 使用上游分组（Upstream Group）作为路由目标

**Rationale**: 复用现有的负载均衡和故障转移机制。模型映射到分组，而非直接映射到上游。

**Mapping 规则**:
| 模型前缀 | 目标分组 | 说明 |
|---------|---------|------|
| `claude-*` | `anthropic` | Anthropic Claude 系列 |
| `gpt-*` | `openai` | OpenAI GPT 系列 |
| `gemini-*` | `google` | Google Gemini 系列 |

### Decision 3: 上游配置增加 `providerType` 和 `allowedModels`

**Rationale**: 允许精细控制上游支持的模型类型，支持同一分组内多类型上游共存。

**Schema**:

```typescript
providerType: "anthropic" | "openai" | "google" | "custom"
allowedModels: string[] | null  // null 表示接受所有模型
modelRedirects: Record<string, string>  // 模型名称映射
```

### Decision 4: 路由决策流程

```
1. 解析请求体获取 model
2. 根据 model 前缀确定目标分组
3. 在分组内筛选支持该模型的上游（allowedModels 检查）
4. 应用模型重定向（如有）
5. 使用现有负载均衡器选择上游
6. 执行故障转移（如需要）
```

## Risks / Trade-offs

| Risk                           | Mitigation                                  |
| ------------------------------ | ------------------------------------------- |
| 现有用户依赖 Header 路由       | 发布 Breaking Change 公告，提供迁移指南     |
| 模型前缀冲突（如自定义模型名） | 支持 `allowedModels` 显式声明，优先精确匹配 |
| 分组不存在时的 fallback        | 返回 400 错误，提示配置对应分组             |
| 性能影响（解析请求体）         | 请求体解析已在 proxy 中进行，无额外开销     |

## Migration Plan

1. **数据库迁移**: 添加 `provider_type`, `allowed_models`, `model_redirects` 字段
2. **配置迁移**: Admin UI 支持新字段配置
3. **代码部署**: 新路由逻辑上线
4. **文档更新**: 移除 Header 相关文档，更新配置指南
5. **Rollback**: 保留旧版本镜像，可快速回滚

## Open Questions

1. 是否需要支持用户自定义模型前缀映射规则？（当前使用硬编码规则）
2. 多模态模型（如 `claude-3-vision`）是否需要特殊处理？
3. 是否需要支持模型别名（如 `gpt-4-turbo` 映射到 `gpt-4-turbo-preview`）？

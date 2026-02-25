# Backend Affinity Logging

## Overview

扩展请求日志系统，持久化会话亲和性决策信息，使前端能够展示亲和性绑定状态、迁移决策等关键信息。

## Requirements

### Functional Requirements

1. **数据库字段扩展**
   - `session_id` (TEXT, nullable): 会话标识符，用于追踪同一会话的请求序列
   - `affinity_hit` (BOOLEAN, DEFAULT FALSE): 是否命中亲和性缓存
   - `affinity_migrated` (BOOLEAN, DEFAULT FALSE): 是否发生迁移到更高优先级上游

2. **日志接口扩展**
   - `StartRequestLogInput` 接口添加 `sessionId` 字段
   - `UpdateRequestLogInput` 接口添加 `affinityHit` 和 `affinityMigrated` 字段
   - `RequestLogResponse` 类型添加对应字段

3. **代理路由集成**
   - 在 `forwardWithFailover` 中将亲和性信息传递给日志记录
   - 记录会话 ID（如果存在）
   - 记录亲和性命中状态和迁移状态

### Non-Functional Requirements

- 向后兼容：所有新字段均为 nullable，不影响现有日志数据
- 性能：字段添加不应对日志写入性能产生显著影响
- 存储：会话 ID 为 UUID 格式（36字符），存储开销可控

## API Schema

### Database Schema Changes

```sql
-- PostgreSQL
ALTER TABLE request_logs
  ADD COLUMN session_id TEXT,
  ADD COLUMN affinity_hit BOOLEAN DEFAULT FALSE,
  ADD COLUMN affinity_migrated BOOLEAN DEFAULT FALSE;

-- SQLite
ALTER TABLE request_logs
  ADD COLUMN session_id TEXT;
ALTER TABLE request_logs
  ADD COLUMN affinity_hit INTEGER DEFAULT 0;
ALTER TABLE request_logs
  ADD COLUMN affinity_migrated INTEGER DEFAULT 0;
```

### TypeScript Types

```typescript
// src/types/api.ts
export interface RequestLogResponse {
  // ... existing fields ...
  session_id: string | null;
  affinity_hit: boolean;
  affinity_migrated: boolean;
}

// src/lib/services/request-logger.ts
export interface LogRequestInput {
  // ... existing fields ...
  sessionId?: string | null;
  affinityHit?: boolean;
  affinityMigrated?: boolean;
}

export interface UpdateRequestLogInput {
  // ... existing fields ...
  sessionId?: string | null;
  affinityHit?: boolean;
  affinityMigrated?: boolean;
}
```

## Behavior

### 日志写入流程

1. **请求开始时**：记录 `session_id`（如果请求中包含会话标识）
2. **路由决策后**：根据 `selectFromProviderType` 返回结果记录 `affinity_hit` 和 `affinity_migrated`
3. **请求完成后**：更新日志条目，填充所有字段

### 字段值规则

| 场景 | session_id | affinity_hit | affinity_migrated |
|------|------------|--------------|-------------------|
| 无会话标识 | null | false | false |
| 亲和性未命中 | uuid | false | false |
| 亲和性命中，无迁移 | uuid | true | false |
| 亲和性命中，发生迁移 | uuid | true | true |

## Error Handling

- 会话 ID 提取失败时，字段设为 null，不影响日志记录
- 亲和性信息未传递时，使用默认值 false
- 数据库写入失败时，按现有错误处理流程（记录错误但不阻断请求）

## Testing

- 单元测试：验证日志接口正确处理新字段
- 集成测试：验证代理路由正确传递亲和性信息
- 数据库测试：验证迁移脚本正确执行

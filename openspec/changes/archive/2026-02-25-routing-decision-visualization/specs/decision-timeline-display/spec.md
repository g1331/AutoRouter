# Decision Timeline Display

## Overview

重构路由决策展示组件，采用时间线叙事布局，让用户按顺序理解决策过程：模型解析 → 亲和性评估 → 上游选择 → 执行重试 → 最终结果。

## Requirements

### Functional Requirements

1. **时间线布局**
   - 按 5 个阶段展示决策过程：
     ① MODEL RESOLUTION（模型解析）
     ② SESSION AFFINITY（会话亲和性）
     ③ UPSTREAM SELECTION（上游选择）
     ④ EXECUTION & RETRIES（执行与重试）
     ⑤ FINAL RESULT（最终结果）

2. **模型解析阶段**
   - 展示原始模型名称和解析后的模型名称
   - 如果发生模型重定向，用箭头 `──→` 指示转换
   - 显示重定向图标（RefreshCw）

3. **会话亲和性阶段**
   - 展示会话 ID（截断显示，hover 显示完整值）
   - 展示亲和性状态：
     - 🔗 命中绑定（绿色）
     - ✗ 未命中（灰色）
     - ↗️ 迁移至更高优先级（琥珀色）
   - 展示迁移评估条件（如适用）：
     - 累计 Token 数
     - 阈值
     - 比较结果（✓ 或 ✗）

4. **上游选择阶段**
   - 展示候选上游列表
   - 每个候选显示：名称、权重、熔断状态
   - 选中的上游高亮显示（背景色 + 字体加粗）
   - 被排除的上游显示在单独区域，标注排除原因

5. **最终结果阶段**
   - 展示最终选中的上游名称
   - 展示总耗时
   - 展示缓存效果（如适用）：本次读取的缓存 Token 数

### Non-Functional Requirements

- 视觉风格：保持 Cassette Futurism 风格（琥珀色配色、终端字体、LED 状态灯）
- 响应式：在窄屏下使用水平滚动或折叠部分阶段
- 性能：大数据量时使用虚拟滚动

## UI Design

### 紧凑视图（表格行内）

```
┌─────────────────────────────────────────────────────────┐
│  [上游] rc  │  [决策链] 自动路由 → 分层选择 → 亲和绑定  │
│             │  [指标] 2/3候选 │ ⚡故障转移 │ 🔗绑定命中  │
└─────────────────────────────────────────────────────────┘
```

### 展开视图（时间线）

```
┌────────────────────────────────────────────────────────────────┐
│  ① MODEL RESOLUTION                                            │
│    gpt-5.3-codex ──→ gpt-5.3-codex                             │
│                                                                 │
│  ② SESSION AFFINITY                                            │
│    会话ID: 550e84... │ 🔗 命中绑定                              │
│    [迁移评估] 15,234 < 50,000 ✓ │ ↗️ 迁移至 premium-openai      │
│                                                                 │
│  ③ UPSTREAM SELECTION                                          │
│    ● premium-openai [closed]  w:10  ← 选中                     │
│    ○ rc [closed]  w:5                                          │
│    ✗ backup [open]  熔断排除                                   │
└────────────────────────────────────────────────────────────────┘
```

## Component Interface

```typescript
interface RoutingDecisionDisplayProps {
  // 现有字段
  routingDecision: RoutingDecisionLog | null;
  upstreamName: string | null;
  routingType: string | null;
  failoverAttempts: number;

  // 新增字段
  sessionId?: string | null;
  affinityHit?: boolean;
  affinityMigrated?: boolean;
  cumulativeTokens?: number;
  migrationThreshold?: number;
}
```

## Accessibility

- 阶段标题使用语义化标题标签（h4）
- 图标使用 aria-label 描述含义
- 颜色不作为唯一信息载体（图标 + 文字双重编码）

## i18n

新增翻译键：
- `timeline.modelResolution`
- `timeline.sessionAffinity`
- `timeline.upstreamSelection`
- `timeline.executionRetries`
- `timeline.finalResult`
- `affinity.hit`
- `affinity.missed`
- `affinity.migrated`
- `affinity.thresholdCheck`

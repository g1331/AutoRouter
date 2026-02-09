## Context

当前请求日志表格使用两种不同的交互模式展示详细信息：

1. **Token 信息** - 使用 hover tooltip（`TokenDisplay` 组件）
2. **路由决策** - 使用 hover tooltip + 可展开详情行（`RoutingDecisionDisplay` 组件）

这导致交互不一致，且 tooltip 对触屏设备不友好。

**当前组件结构：**

```
logs-table.tsx
├── TokenDisplay (带 Tooltip)
│   └── TokenTooltipContent (tooltip 内容)
├── RoutingDecisionDisplay (带 Tooltip)
│   ├── compact view (表格单元格)
│   └── expanded view (展开详情)
└── Expanded Row (仅当 hasFailover || hasRoutingDecision)
    ├── RoutingDecisionDisplay (expanded)
    └── Failover History
```

## Goals / Non-Goals

**Goals:**

- 统一交互模式：所有详细信息都通过展开行查看
- 移除 tooltip 依赖，提升触屏设备体验
- 所有日志行都可展开，无论是否有路由决策或故障转移
- 保持表格紧凑视图的信息密度不变

**Non-Goals:**

- 不改变数据结构或 API
- 不改变表格列的布局
- 不添加新的功能特性

## Decisions

### 1. 移除 Tooltip 而非替换为其他交互

**决定**: 直接移除 `<Tooltip>` 组件包装，保留内部显示内容

**理由**:

- 展开行已经提供了查看详情的方式
- 减少代码复杂度
- 避免引入新的交互模式

**替代方案**:

- 使用 click-to-show popover → 增加复杂度，与展开行功能重复

### 2. 展开区域布局采用两列并排

**决定**: Token 明细和路由决策并排显示，故障转移历史在下方占满宽度

```
┌─────────────────────────────────────────────────────────┐
│  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ TOKEN 明细      │  │ 路由决策详情                 │  │
│  │ ...             │  │ ...                         │  │
│  └─────────────────┘  └─────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐│
│  │ 故障转移 (如果有)                                    ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**理由**:

- 充分利用水平空间
- Token 和路由是同级信息，并排更直观
- 故障转移是时间线信息，适合占满宽度展示

**替代方案**:

- 三列并排 → 在窄屏上可能过于拥挤
- 垂直堆叠 → 浪费水平空间，展开区域过长

### 3. 复用现有的 TokenTooltipContent 组件

**决定**: 将 `TokenTooltipContent` 重命名为 `TokenDetailContent` 并导出，在展开区域复用

**理由**:

- 避免重复代码
- 保持样式一致性
- 已有的布局和格式化逻辑可以直接使用

### 4. 展开触发条件改为始终可展开

**决定**: `canExpand = true`（所有行都可展开）

**理由**:

- 每行都有 Token 信息，展开总是有内容可看
- 统一的交互预期，用户不需要猜测哪些行可以展开
- 简化代码逻辑

## Risks / Trade-offs

| 风险                                                 | 缓解措施                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| 用户习惯改变 - 原来 hover 就能看到的信息现在需要点击 | 表格紧凑视图保留足够信息（总数、输入/输出、缓存徽章），只有需要详细分解时才需展开 |
| 展开区域内容过多 - 同时显示 Token、路由、故障转移    | 使用清晰的分区和标题，视觉上区分不同信息块                                        |
| 性能影响 - 所有行都渲染展开按钮                      | 展开按钮是轻量级组件，影响可忽略                                                  |

## Implementation Notes

**文件改动清单：**

1. `src/components/admin/token-display.tsx`
   - 移除 `<Tooltip>` 和 `<TooltipTrigger>` 包装
   - 导出 `TokenTooltipContent` 为 `TokenDetailContent`

2. `src/components/admin/routing-decision-display.tsx`
   - 移除 compact 模式的 `<Tooltip>` 包装
   - 保留 expanded 模式不变

3. `src/components/admin/logs-table.tsx`
   - 修改 `canExpand` 为 `true`
   - 在展开区域添加 Token 明细区块
   - 调整展开区域布局为两列

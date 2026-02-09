## Why

当前请求日志表格中，Token 信息和路由决策信息都使用 hover tooltip 展示详情。这种交互方式存在几个问题：

1. **触屏设备不友好** - tooltip 需要鼠标悬停，在触屏设备上难以触发
2. **信息对比困难** - 鼠标移开 tooltip 就消失，不方便对比多行数据
3. **交互模式不一致** - 路由决策有展开详情区域，但 Token 信息只能通过 tooltip 查看
4. **视觉干扰** - tooltip 可能遮挡表格其他内容

通过统一使用展开详情区域展示完整信息，可以提供更一致、更友好的用户体验。

## What Changes

- **移除 TokenDisplay 组件的 tooltip 交互**，只保留紧凑显示（总数 + 输入/输出 + 缓存徽章）
- **移除 RoutingDecisionDisplay 组件的 tooltip 交互**，只保留紧凑显示（upstream 名称 + 路由类型徽章 + 指示器）
- **所有日志行都可展开**，不再限制只有 failover 或 routing decision 的行才能展开
- **展开详情区域同时显示 Token 明细和路由决策详情**，使用并排布局
- **保留故障转移历史**在展开区域的底部（如果有的话）

## Capabilities

### New Capabilities

- `unified-log-detail-view`: 统一的日志详情展示，整合 Token 明细、路由决策和故障转移信息

### Modified Capabilities

- 无（此改动主要是交互方式调整，不涉及功能需求变更）

## Impact

- **前端组件**:
  - `src/components/admin/token-display.tsx` - 移除 Tooltip 包装
  - `src/components/admin/routing-decision-display.tsx` - 移除 Tooltip 包装
  - `src/components/admin/logs-table.tsx` - 修改展开逻辑，新增展开区 Token 展示

- **国际化**:
  - 复用现有的 `logs.tokenDetails` 等翻译键，无需新增

- **API**:
  - 无变更，使用现有的请求日志数据结构

## 1. TokenDisplay 组件改造

- [ ] 1.1 移除 `TokenDisplay` 组件的 `<Tooltip>` 包装，保留紧凑显示内容
- [ ] 1.2 将 `TokenTooltipContent` 重命名为 `TokenDetailContent` 并导出
- [ ] 1.3 更新 `TokenDetailContent` 样式适配展开区域（可选：调整间距）

## 2. RoutingDecisionDisplay 组件改造

- [ ] 2.1 移除 `RoutingDecisionDisplay` compact 模式的 `<Tooltip>` 和 `<TooltipProvider>` 包装
- [ ] 2.2 保留紧凑显示内容（upstream 名称、路由类型徽章、指示器）
- [ ] 2.3 确保 expanded 模式（`compact={false}`）保持不变

## 3. LogsTable 展开逻辑改造

- [ ] 3.1 修改 `canExpand` 逻辑为 `true`（所有行都可展开）
- [ ] 3.2 在展开区域添加 Token 明细区块，使用 `TokenDetailContent` 组件
- [ ] 3.3 调整展开区域布局为两列并排（Token 左侧，路由决策右侧）
- [ ] 3.4 保持故障转移历史在底部占满宽度

## 4. 测试

- [ ] 4.1 更新 `TokenDisplay` 组件测试，移除 tooltip 相关测试
- [ ] 4.2 更新 `RoutingDecisionDisplay` 组件测试，移除 tooltip 相关测试
- [ ] 4.3 添加/更新 `logs-table` 测试，验证所有行可展开
- [ ] 4.4 验证展开区域同时显示 Token 和路由决策

## Context

当前项目使用 Cassette Futurism 设计系统，在 `globals.css` 中定义了丰富的视觉效果：

- 动画：`cf-flicker-in`, `cf-pulse-glow`, `cf-data-scan`, `cf-phosphor-trail`, `cf-cursor-blink`
- 视觉：`cf-scanlines`, `cf-retro-grid`, `cf-vignette`, `cf-glow-*`
- 状态：LED 指示灯样式、ASCII 风格元素

但表格组件（`upstreams-table.tsx`, `logs-table.tsx`）仅使用了基础的琥珀色调和等宽字体，未利用这些效果。

**现有上游表格功能：**

- 名称、Provider、Provider 类型
- **分组 (group_name)** - 显示为 Badge
- 权重 (weight)
- **健康状态 (health_status)** - 显示为图标 + 文字
- **熔断器状态 (circuit_breaker)** - 显示为图标 + 文字
- 端点 URL
- 创建时间
- 操作按钮（测试、编辑、删除）

**现有组件结构：**

```
src/components/
├── ui/
│   └── table.tsx          # 基础表格组件 (shadcn/ui)
└── admin/
    ├── upstreams-table.tsx  # 上游管理表格（含分组、健康、熔断器）
    ├── logs-table.tsx       # 请求日志表格
    └── ...
```

## Goals / Non-Goals

**Goals:**

- 充分利用现有 Cassette Futurism 设计系统的视觉效果
- 创建可复用的终端风格 UI 组件
- 提升上游管理和日志界面的视觉冲击力和沉浸感
- 保持良好的性能和可访问性

**Non-Goals:**

- 不改变数据结构或 API
- 不引入新的外部依赖（纯 CSS/Tailwind 实现）
- 不改变现有功能逻辑
- 不做移动端适配优化（保持现有响应式行为）

## Decisions

### 1. 组件架构：组合式而非替换式

**决定**: 创建新的终端风格组件，通过组合方式增强现有表格，而非完全重写

**理由**:

- 保持与现有 shadcn/ui 表格组件的兼容性
- 渐进式增强，降低风险
- 组件可独立测试和复用

**替代方案**:

- 完全重写表格组件 → 风险高，改动大
- 使用第三方动画库 → 增加依赖，与设计系统不一致

### 2. 上游表格：保持表格形态 + 增强视觉

**决定**: 保持表格行结构，但增加 LED 状态灯、进度条等视觉元素

**理由**:

- 卡片式布局虽然视觉冲击力强，但会大幅增加垂直空间占用
- 表格形态更适合快速扫描和比较多个上游
- 通过 LED 灯和进度条已能显著提升视觉效果

**替代方案**:

- 卡片式布局 → 空间占用大，不适合 5+ 个上游的场景

### 3. 分组显示：按分组折叠 + 分组状态汇总

**决定**: 上游按分组折叠显示，每个分组显示汇总状态（健康数/总数）

**视觉设计**:

```
┌─ GROUP: openai ──────────────────────────────────────────────────────────┐
│  ◉ 3/3 HEALTHY   CIRCUIT: ████████████████░░░░ 80%   [▼ EXPAND]         │
├──────────────────────────────────────────────────────────────────────────┤
│  rightcode   ◉ healthy   ███░░░░░░░ 3   CLOSED   https://...            │
│  pv-cx       ◉ healthy   █░░░░░░░░░ 1   CLOSED   https://...            │
│  duck        ◉ healthy   █░░░░░░░░░ 1   CLOSED   https://...            │
└──────────────────────────────────────────────────────────────────────────┘

┌─ GROUP: anthropic ───────────────────────────────────────────────────────┐
│  ◎ 1/2 DEGRADED  CIRCUIT: ████░░░░░░░░░░░░░░░░ 20%   [▼ EXPAND]         │
├──────────────────────────────────────────────────────────────────────────┤
│  tiger-cc    ◎ degraded  █░░░░░░░░░ 1   HALF     https://...            │
│  anyrouter   ● offline   █░░░░░░░░░ 1   OPEN     https://...            │
└──────────────────────────────────────────────────────────────────────────┘

┌─ UNGROUPED ──────────────────────────────────────────────────────────────┐
│  ...                                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

**理由**:

- 分组是路由的核心概念，视觉上应该突出
- 折叠显示减少垂直空间，快速查看分组健康状态
- 分组状态汇总让运维一眼看出问题所在

**替代方案**:

- 平铺显示 + 分组列 → 当前方案，但分组关系不够直观

### 4. 日志表格：增强行级视觉反馈

**决定**: 保持表格结构，增加扫描线动画、错误行发光、实时指示灯

**理由**:

- 日志数据量大，表格形态是最高效的展示方式
- 通过动画效果增加"实时感"而非改变布局

### 5. Sparkline 实现：纯 CSS 方案

**决定**: 使用 CSS 渐变 + 伪元素实现简化版 sparkline，而非 SVG 或 Canvas

**理由**:

- 轻量，无需额外渲染开销
- 与 Cassette Futurism 的 ASCII 美学一致
- 显示趋势方向即可，不需要精确数值

**实现方式**:

```
延迟趋势: ▁▂▃▂▁▂▃▄▃▂  ← 使用 Unicode block 字符
```

**替代方案**:

- SVG sparkline → 更精确但增加复杂度
- Canvas → 性能好但与设计风格不符

### 6. 动画性能：CSS-only + will-change 优化

**决定**: 所有动画使用纯 CSS，关键元素添加 `will-change` 提示

**理由**:

- CSS 动画由浏览器优化，不阻塞 JS 主线程
- 避免 React 重渲染导致的性能问题

**优化策略**:

- 脉冲动画使用 `opacity` 和 `box-shadow`（GPU 加速）
- 扫描线使用 `transform: translateX()`（GPU 加速）
- 避免动画 `width`, `height`, `top`, `left`

### 7. 组件文件组织

**决定**: 在 `src/components/ui/` 下创建 `terminal/` 子目录

```
src/components/ui/terminal/
├── terminal-header.tsx      # 终端风格表头
├── status-led.tsx           # LED 状态指示灯
├── ascii-progress.tsx       # ASCII 进度条
├── mini-sparkline.tsx       # 迷你趋势图
└── index.ts                 # 统一导出
```

**理由**:

- 与现有 ui 组件结构一致
- 便于统一导出和管理
- 明确这是终端风格的专用组件集

## Risks / Trade-offs

| 风险               | 缓解措施                                                       |
| ------------------ | -------------------------------------------------------------- |
| 动画过多影响性能   | 使用 CSS-only 动画，添加 `prefers-reduced-motion` 媒体查询支持 |
| 视觉效果分散注意力 | 动画仅用于状态变化和新数据，静态时保持简洁                     |
| 可访问性问题       | LED 状态同时提供文字标签，不仅依赖颜色                         |
| Unicode 字符兼容性 | Sparkline 使用常见 block 字符，回退为纯文本数值                |

## Implementation Notes

**新增 CSS 类（如 globals.css 中未定义）：**

```css
/* LED 脉冲动画 */
.cf-led-pulse {
  animation: cf-led-pulse 2s ease-in-out infinite;
}

@keyframes cf-led-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* 数据扫描线（如未定义） */
.cf-data-scan::after {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--cf-amber-500), transparent);
  animation: cf-scan 2s ease-in-out;
}
```

**Sparkline Unicode 字符映射：**

```typescript
const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
// 将数值映射到 0-7 索引
```

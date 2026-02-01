## Why

当前表格界面（上游管理、请求日志）过于平庸，未充分利用项目已定义的 Cassette Futurism 设计系统。globals.css 中定义了丰富的视觉效果（扫描线、LED 脉冲、磷光拖尾、数据扫描动画等），但表格组件几乎没有使用，导致界面缺乏"监控终端"的沉浸感，与普通管理后台无异。

## What Changes

### 上游管理界面 - "Node Array" 节点阵列

- 从传统表格行改为卡片式布局，每个上游是一个"节点卡片"
- 添加 LED 状态指示灯（◉ ◎ ●）显示健康状态，带脉冲动画
- 使用 ASCII 进度条显示权重、成功率
- 添加迷你 sparkline 显示延迟趋势
- 故障节点边框红色发光效果
- 表头使用扫描线效果
- 卡片进入时使用 flicker-in 动画

### 请求日志界面 - "Signal Stream" 信号流

- 添加实时录制指示灯 [● REC] 红色脉冲
- 新数据进入时扫描线动画效果
- 错误行边缘持续红色发光
- 错误行自动展开显示详情（终端风格缩进 ├─ └─）
- 底部闪烁光标表示"实时监控中"
- 状态码使用 LED 指示灯样式
- 表头使用终端风格 "SYS.REQUEST_STREAM"

### 通用增强

- 统一的终端风格表头组件
- 状态 LED 指示灯组件（支持脉冲动画）
- ASCII 进度条组件
- 迷你 Sparkline 组件

## Capabilities

### New Capabilities

- `terminal-table-header`: 终端风格表头组件，支持扫描线效果、状态指示灯、实时标签
- `status-led-indicator`: LED 状态指示灯组件，支持多种状态和脉冲动画
- `ascii-progress-bar`: ASCII 风格进度条组件，用于显示权重、成功率等
- `mini-sparkline`: 迷你趋势图组件，用于显示延迟、请求量等时序数据
- `node-array-layout`: 上游管理的卡片式节点阵列布局
- `signal-stream-layout`: 请求日志的信号流式布局

### Modified Capabilities

无

## Impact

### 代码影响

- `src/components/admin/upstreams-table.tsx` - 重构为卡片式布局
- `src/components/admin/logs-table.tsx` - 添加信号流视觉效果
- `src/components/ui/` - 新增终端风格 UI 组件
- `src/app/globals.css` - 可能需要补充动画定义

### 依赖

- 无新增外部依赖，完全基于现有 Tailwind + CSS 动画

### 性能考量

- 动画效果需要考虑大量数据时的性能
- Sparkline 组件需要轻量实现（纯 CSS 或 SVG）
- 脉冲动画使用 CSS animation，不影响 JS 主线程

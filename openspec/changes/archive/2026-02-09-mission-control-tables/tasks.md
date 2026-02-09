## 1. 基础组件 - Terminal UI 组件库

- [x] 1.1 创建 `src/components/ui/terminal/` 目录结构
- [x] 1.2 实现 `StatusLed` 组件（◉ ◎ ● 状态灯 + 脉冲动画）
- [x] 1.3 实现 `AsciiProgress` 组件（███░░░ 进度条）
- [x] 1.4 实现 `MiniSparkline` 组件（▁▂▃▄▅▆▇█ 趋势图）
- [x] 1.5 实现 `TerminalHeader` 组件（扫描线 + 状态指示灯）
- [x] 1.6 创建 `index.ts` 统一导出

## 2. CSS 动画补充

- [x] 2.1 检查 `globals.css` 中是否已有所需动画定义
- [x] 2.2 添加 `cf-led-pulse` 动画（如未定义）
- [x] 2.3 添加 `cf-cursor-blink` 动画（如未定义）
- [x] 2.4 添加 `prefers-reduced-motion` 媒体查询支持

## 3. 上游管理界面改造 (Node Array)

- [x] 3.1 重构 `upstreams-table.tsx` 添加分组逻辑
- [x] 3.2 实现分组头部组件（GROUP: name + 状态汇总）
- [x] 3.3 实现分组折叠/展开功能
- [x] 3.4 替换健康状态显示为 `StatusLed` 组件
- [x] 3.5 替换熔断器状态显示为 `StatusLed` + `AsciiProgress`
- [x] 3.6 替换权重显示为 `AsciiProgress` 组件
- [x] 3.7 添加 `TerminalHeader` 到表格顶部
- [x] 3.8 添加错误行红色发光效果
- [x] 3.9 添加数据刷新时的 flicker-in 动画

## 4. 请求日志界面改造 (Signal Stream)

- [x] 4.1 添加 `TerminalHeader` 到日志表格顶部
- [x] 4.2 实现 [● REC] 实时录制指示灯
- [x] 4.3 实现请求速率显示 [↓ X.X/s]
- [x] 4.4 替换状态码显示为 `StatusLed` 样式
- [x] 4.5 添加新数据进入时的扫描线动画
- [x] 4.6 添加错误行红色发光效果
- [x] 4.7 更新展开详情为终端风格缩进（├─ └─）
- [x] 4.8 添加底部闪烁光标指示器
- [x] 4.9 添加流统计信息 footer

## 5. 测试

- [x] 5.1 为 `StatusLed` 组件编写单元测试
- [x] 5.2 为 `AsciiProgress` 组件编写单元测试
- [x] 5.3 为 `MiniSparkline` 组件编写单元测试
- [x] 5.4 为 `TerminalHeader` 组件编写单元测试
- [x] 5.5 更新 `upstreams-table` 测试（分组功能）
- [x] 5.6 更新 `logs-table` 测试（新视觉效果）
- [x] 5.7 测试 reduced-motion 支持

## 6. 可访问性验证

- [x] 6.1 验证所有 LED 指示灯有 aria-label
- [x] 6.2 验证进度条有适当的 role 和 aria 属性
- [x] 6.3 验证折叠/展开按钮有正确的 aria-expanded
- [x] 6.4 验证动画在 reduced-motion 下正确禁用

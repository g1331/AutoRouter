# Change: 将前端设计系统从 Material You 更换为磁带未来主义风格

## Why

当前的 Material Design 3 (Material You) 设计风格存在以下问题：

1. **缺乏辨识度** - Material Design 是 Google 的通用设计语言，被大量应用使用，导致产品视觉上缺乏独特性
2. **风格过于"现代"** - 圆角、柔和色彩、流畅动画的组合容易给人"AI 产品"或"SaaS 模板"的刻板印象
3. **与产品定位不符** - AutoRouter 作为 AI API Gateway，是一个技术基础设施产品，需要传达"专业、可靠、技术感"的视觉语言

磁带未来主义（Cassette Futurism）是 80-90 年代科幻作品中的美学风格，以《银翼杀手》《异形》《2001太空漫游》的船载终端界面为代表，具有以下特点：

- **强烈的技术感** - 等宽字体、CRT 显示效果、扫描线
- **独特的视觉辨识度** - 琥珀色/绿色磷光色调、深黑背景
- **专业感** - 工业化、功能至上的界面设计
- **怀旧与未来的结合** - 复古元素与现代交互的融合

## What Changes

### 设计系统重构

- **BREAKING**: 移除 Material Design 3 设计系统
- **NEW**: 引入磁带未来主义设计系统
  - 新的颜色系统（琥珀色为主色调，深黑背景）
  - 新的字体系统（等宽字体 + 像素字体）
  - CRT 效果（扫描线、发光、噪点）
  - 新的组件样式（粗边框、直角/斜切角、发光效果）

### 组件改造

- 侧边栏：从 Navigation Rail 改为终端风格导航
- 表格：从 Material Table 改为终端列表风格
- 卡片：从圆角卡片改为边框发光面板
- 按钮：从 Material Button 改为工业风格按钮
- 表单：从 Filled/Outlined 改为终端输入框风格
- 对话框：从 Material Dialog 改为系统弹窗风格

### 页面重构

- Dashboard：系统状态监控面板风格
- API Keys：终端风格列表
- Upstreams：系统配置界面

## Impact

- **Affected specs**:
  - `admin-console-ui` (新增) - 定义 UI 设计系统、无障碍要求、性能约束
- **Affected code**:
  - `apps/web/src/app/globals.css` - 完全重写
  - `apps/web/src/components/ui/*` - 调整组件样式（15+ 组件）
  - `apps/web/src/components/admin/*` - 业务组件样式适配
  - `apps/web/src/app/(dashboard)/*` - 页面布局调整
  - `apps/web/src/app/(auth)/*` - 登录页面样式
  - `apps/web/tailwind.config.ts` - 主题配置
  - `apps/web/src/app/layout.tsx` - 字体引入
  - `apps/web/package.json` - 可能新增测试依赖 (axe-core, playwright)
- **Migration**: 纯视觉变更，不影响功能和 API
- **Breaking changes**: 完全替换现有视觉风格，无法增量迁移

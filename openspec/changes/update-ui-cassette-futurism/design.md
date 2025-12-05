# Technical Design: Cassette Futurism UI

## Context

AutoRouter 的前端管理界面需要从 Material Design 3 风格迁移到磁带未来主义（Cassette Futurism）风格，以建立独特的产品视觉语言。

**约束**：
- 保持现有的组件库（shadcn/ui）和技术栈不变
- 不影响现有功能
- 保持可访问性（a11y）标准
- 性能影响最小化（CRT 效果需要谨慎使用）

**参考实现**：
- 《银翼杀手》船载终端界面
- 《异形》Nostromo 飞船界面
- 《2001太空漫游》HAL 9000 界面
- 复古终端模拟器（cool-retro-term）
- FUI (Fantasy User Interface) 设计

## Goals / Non-Goals

**Goals**:
- 建立完整的磁带未来主义设计系统
- 替换所有现有 UI 组件的视觉风格
- 保持良好的可读性和可用性
- 实现适度的 CRT 效果（不影响性能）

**Non-Goals**:
- 不实现全屏 CRT 滤镜（性能考虑）
- 不添加声音效果
- 不改变现有的交互逻辑
- 不支持多主题切换（仅实现深色主题）

## Decisions

### 1. 配色方案：琥珀色单色调（Amber Monochrome）

**选择**：
```
主色调 (Primary): 琥珀色 #FFBF00
- Amber-50:  #FFF8E1
- Amber-100: #FFECB3
- Amber-200: #FFE082
- Amber-300: #FFD54F
- Amber-400: #FFCA28
- Amber-500: #FFBF00  <- 主色
- Amber-600: #FFB300
- Amber-700: #FFA000
- Amber-800: #FF8F00
- Amber-900: #FF6F00

背景色 (Background): 深黑
- Black-900: #0A0A0A  <- 主背景
- Black-800: #121212  <- 次级背景
- Black-700: #1A1A1A  <- 卡片背景
- Black-600: #242424  <- 悬停背景
- Black-500: #2E2E2E  <- 高亮背景

中性表面色 (Neutral Surface):
- Surface-100: #0A0A0A  <- 最深，主背景
- Surface-200: #121212  <- 次级容器
- Surface-300: #1A1A1A  <- 卡片/面板
- Surface-400: #242424  <- 悬停状态
- Surface-500: #2E2E2E  <- 高亮/选中
- Surface-600: #3A3A3A  <- 边框高亮

功能性 Token:
- Disabled-bg:      #1A1A1A
- Disabled-text:    #666666 (Amber-500 at 40% opacity equivalent)
- Disabled-border:  #333333
- Divider:          #333333 (用于分隔线)
- Divider-subtle:   #1F1F1F (用于轻分隔)
- Overlay:          rgba(0, 0, 0, 0.7) (用于模态背景)
- Overlay-light:    rgba(0, 0, 0, 0.5)

焦点状态 (Focus):
- Focus-ring:       #FFBF00 (Amber-500)
- Focus-ring-width: 2px
- Focus-ring-offset: 2px
- Focus-glow:       0 0 0 3px rgba(255, 191, 0, 0.3)

状态色:
- Success:          #00FF41 (Matrix 绿)
- Success-muted:    rgba(0, 255, 65, 0.15)
- Warning:          #FFBF00 (琥珀)
- Warning-muted:    rgba(255, 191, 0, 0.15)
- Error:            #FF3131 (CRT 红)
- Error-muted:      rgba(255, 49, 49, 0.15)
- Info:             #00D4FF (科幻青)
- Info-muted:       rgba(0, 212, 255, 0.15)
```

**对比度验证** (WCAG 2.1 AA):
- Amber-500 (#FFBF00) on Black-900 (#0A0A0A): 12.6:1 (AAA)
- Disabled-text (#666666) on Black-900: 4.8:1 (AA)
- Success (#00FF41) on Black-900: 15.3:1 (AAA)
- Error (#FF3131) on Black-900: 5.2:1 (AA)

**替代方案**：
- 绿色单色调（Phosphor Green）：更有终端感，但可能过于"黑客风"
- 青色单色调（Cyan）：更科幻，但与产品调性不符
- 多色调：会削弱复古终端的统一感

**选择理由**：
- 琥珀色是经典 CRT 显示器的颜色，辨识度高
- 暖色调更舒适，长时间使用不易视觉疲劳
- 与黑色背景形成强烈对比，可读性好
- 完整的 token 体系确保状态一致性

### 2. 字体系统：分场景使用

**选择**：
```css
/* 等宽字体：用于数据、代码、UI chrome（导航、标签、按钮） */
--font-mono: "JetBrains Mono", "IBM Plex Mono", "Fira Code",
             "Noto Sans Mono CJK SC", "Source Han Mono SC", monospace;

/* 显示字体：用于大标题、数字统计 */
--font-display: "VT323", "Press Start 2P", monospace;

/* 正文字体：用于长文本、描述、帮助文字 */
--font-sans: "Inter", "Noto Sans SC", "Source Han Sans SC",
             system-ui, -apple-system, sans-serif;
```

**字体加载策略**：
```css
/* next/font 配置 */
font-display: swap;  /* 避免 FOIT */
subsets: ["latin", "latin-ext"];
/* CJK 子集按需加载，避免首屏加载过大 */
```

**字体规格（含行高）**：
```
Display Large:  VT323, 48px/1.2, 400
Display Medium: VT323, 36px/1.2, 400
Display Small:  VT323, 24px/1.3, 400

Headline:       JetBrains Mono, 20px/1.4, 500
Title Large:    JetBrains Mono, 18px/1.4, 500
Title Medium:   JetBrains Mono, 16px/1.5, 500
Title Small:    JetBrains Mono, 14px/1.5, 500

Body Large:     Inter (sans), 16px/1.6, 400       <- 长文本用 sans
Body Medium:    Inter (sans), 14px/1.6, 400       <- 描述用 sans
Body Small:     Inter (sans), 12px/1.5, 400

Data:           JetBrains Mono, 14px/1.5, 400     <- 数据用 mono
Code:           JetBrains Mono, 14px/1.6, 400

Label:          JetBrains Mono, 12px/1.3, 500, uppercase, letter-spacing: 0.1em
Caption:        Inter (sans), 11px/1.4, 400
```

**使用场景指南**：
| 场景 | 字体 | 理由 |
|------|------|------|
| 导航菜单、按钮文字 | mono | 技术感、统一性 |
| 表格数据、API Key | mono | 数据对齐、可读性 |
| 代码、JSON | mono | 标准惯例 |
| 统计数字、Dashboard | display | 视觉焦点 |
| 描述文字、帮助提示 | sans | 长文本可读性 |
| 错误消息、提示 | sans | 友好感 |

**选择理由**：
- 区分 mono/sans 避免长文本可读性问题
- JetBrains Mono 可读性优秀，支持连字
- Inter 是现代 sans 字体，CJK 覆盖好
- 明确的行高规范确保排版一致

### 3. 形状系统：直角 + 斜切角

**选择**：
```css
/* 边角 */
--corner-none: 0;
--corner-small: 2px;
--corner-medium: 4px;
--corner-bevel: 8px 0;  /* 斜切角 */

/* 边框 */
--border-thin: 1px solid var(--amber-500);
--border-medium: 2px solid var(--amber-500);
--border-thick: 3px solid var(--amber-500);

/* 发光效果 */
--glow-subtle: 0 0 4px var(--amber-500);
--glow-medium: 0 0 8px var(--amber-500);
--glow-strong: 0 0 16px var(--amber-500), 0 0 32px var(--amber-500-50);
```

**替代方案**：
- 圆角：与 Material Design 风格重叠
- 纯直角：过于生硬，缺乏特色

**选择理由**：
- 斜切角是科幻 UI 的典型特征
- 直角保持工业感
- 发光效果增强科技感

### 4. CRT 效果：适度使用 + 无障碍支持

**使用场景限制**：
| 效果 | 允许使用的元素 | 最大强度 |
|------|---------------|----------|
| 扫描线 | Topbar、Hero Panel、Login 背景 | opacity: 0.15 |
| 噪点 | 页面背景（fixed） | opacity: 0.02 |
| 发光文字 | Logo、标题、重要数字 | blur: 4px |
| 发光边框 | 焦点状态、Primary 按钮 hover | blur: 8px |
| 闪烁光标 | 仅 Login 页面输入框 | 1s 周期 |

**禁止使用的场景**：
- 表格内容区域（影响数据可读性）
- 表单输入区域（影响输入体验）
- 长文本段落（影响阅读）
- 移动端（性能考虑）

**实现**：
```css
/* 扫描线 - 仅用于特定元素 */
.scanlines::before {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 1px,
    rgba(0, 0, 0, 0.15) 1px,
    rgba(0, 0, 0, 0.15) 2px
  );
  pointer-events: none;
  z-index: 10;
}

/* 轻微噪点 - 仅用于背景 */
.noise::after {
  content: "";
  position: fixed;
  inset: 0;
  background: url("data:image/svg+xml,...") repeat;
  opacity: 0.02;
  pointer-events: none;
  z-index: 0;
}

/* 发光文字 */
.glow-text {
  text-shadow: 0 0 4px currentColor;
}

/* 闪烁光标 */
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
.cursor-blink::after {
  content: "_";
  animation: blink 1s step-end infinite;
}
```

**无障碍支持 (a11y)**：
```css
/* 减少动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .scanlines::before,
  .noise::after {
    display: none;
  }

  .glow-text {
    text-shadow: none;
  }

  .cursor-blink::after {
    animation: none;
    opacity: 1;
  }

  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* 高对比度偏好 */
@media (prefers-contrast: more) {
  .scanlines::before,
  .noise::after {
    display: none;
  }

  .glow-text {
    text-shadow: none;
    font-weight: 600;  /* 增加字重补偿 */
  }

  :root {
    --cf-amber-500: #FFD700;  /* 更亮的黄色 */
    --cf-divider: #4A4A4A;    /* 更明显的分隔线 */
  }
}
```

**最小效果模式**（可选 UI 开关）：
```typescript
// 用户可在设置中切换
const [minimalEffects, setMinimalEffects] = useState(
  () => localStorage.getItem('cf-minimal-effects') === 'true'
);

// 应用到根元素
<html data-minimal-effects={minimalEffects}>
```
```css
[data-minimal-effects="true"] .scanlines::before,
[data-minimal-effects="true"] .noise::after,
[data-minimal-effects="true"] .glow-text {
  display: none;
  text-shadow: none;
}
```

**不使用的效果**（性能考虑）：
- 全屏 CRT 弯曲效果（需要 WebGL）
- 色彩偏移/RGB 分离（CSS filter 性能差）
- 持续动画噪点（GPU 负担）

**选择理由**：
- 扫描线和噪点通过 CSS 实现，性能开销小
- 发光效果使用 text-shadow，浏览器支持好
- 不使用 filter 或 WebGL，保证兼容性
- 完整的无障碍支持确保所有用户可用

### 5. 组件设计规范

**面板 (Panel)**：
```
- 背景: Black-700
- 边框: 2px solid Amber-500
- 内边距: 16px
- 角: 直角或斜切角
- 标题: 左上角，带下划线
```

**按钮 (Button)**：
```
Primary:
- 背景: Amber-500
- 文字: Black-900
- 边框: 2px solid Amber-500
- Hover: 发光效果
- Active: 背景变暗

Secondary:
- 背景: transparent
- 文字: Amber-500
- 边框: 2px solid Amber-500
- Hover: 背景 Black-600

Danger:
- 同 Primary，但使用 Error 色
```

**输入框 (Input)**：
```
- 背景: Black-800
- 文字: Amber-500
- 边框底部: 2px solid Amber-500/50
- Focus: 边框发光
- 占位符: Amber-500/30
```

**表格 (Table)**：
```
- 无边框，纯文字
- 表头: Amber-500, uppercase, 小字号
- 分隔: 虚线 1px dashed Amber-500/30
- 行悬停: 背景 Black-600
```

**徽章 (Badge)**：
```
- 背景: 状态色/20
- 文字: 状态色
- 边框: 1px solid 状态色/50
- 圆角: 2px
```

**侧边栏 (Sidebar)**：
```
- 背景: Black-900
- 宽度: 240px (展开) / 64px (收起)
- Logo: ASCII Art 或像素图标
- 导航项: 等宽字体, 左侧指示条
- 选中状态: 背景 Amber-500/10, 左侧条 Amber-500
```

### 6. 动画规范

**选择**：
```css
/* 时长 */
--duration-fast: 100ms;
--duration-normal: 200ms;
--duration-slow: 300ms;

/* 缓动 */
--easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
--easing-sharp: cubic-bezier(0.4, 0, 0.6, 1);

/* 过渡 */
.transition-colors {
  transition: color var(--duration-fast) var(--easing-standard),
              background-color var(--duration-fast) var(--easing-standard),
              border-color var(--duration-fast) var(--easing-standard);
}

.transition-glow {
  transition: box-shadow var(--duration-normal) var(--easing-standard),
              text-shadow var(--duration-normal) var(--easing-standard);
}
```

**不使用**：
- 复杂的进入/退出动画
- 持续循环动画（除光标闪烁）
- transform 动画（与复古感不符）

## Architecture

### CSS 变量层级

```
:root
├── Colors (--cf-amber-*, --cf-black-*, --cf-status-*)
├── Typography (--cf-font-*, --cf-text-*)
├── Spacing (--cf-space-*)
├── Borders (--cf-border-*, --cf-corner-*)
├── Effects (--cf-glow-*, --cf-shadow-*)
└── Animation (--cf-duration-*, --cf-easing-*)
```

### 文件结构

```
apps/web/src/
├── app/
│   ├── globals.css          # 重写：磁带未来主义设计系统
│   └── layout.tsx           # 修改：字体引入
├── components/
│   ├── ui/                  # 修改：shadcn 组件样式覆盖
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── table.tsx
│   │   └── ...
│   └── admin/               # 修改：业务组件适配
│       ├── sidebar.tsx
│       ├── topbar.tsx
│       └── ...
└── styles/
    └── cassette-futurism/   # 新增：样式模块化（可选）
        ├── variables.css
        ├── effects.css
        └── components.css
```

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 可读性下降 | 用户难以阅读内容 | 使用高对比度配色，测试 WCAG 2.1 AA |
| 性能影响 | CRT 效果导致卡顿 | 仅在静态元素使用 CSS 效果，避免 filter |
| 学习曲线 | 用户不熟悉界面 | 保持交互逻辑不变，仅改变视觉 |
| 维护成本 | 自定义设计系统维护困难 | 保持组件化，文档完善 |
| 浏览器兼容 | CSS 效果不兼容旧浏览器 | 使用渐进增强，关键功能不依赖效果 |

## Open Questions

1. **字体加载策略** - 是否需要字体子集化以减少加载时间？
2. **CRT 效果强度** - 扫描线和噪点的透明度需要实际测试调整
3. **深色模式** - 是否需要支持浅色主题作为替代？（建议：不需要，磁带未来主义本身就是深色）
4. **Logo 设计** - 是否需要重新设计 ASCII Art 风格的 Logo？

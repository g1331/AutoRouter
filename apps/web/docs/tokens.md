# Cassette Futurism Design Tokens

AutoRouter Admin Console 的设计系统文档。

## 概述

Cassette Futurism 是一种复古未来主义视觉语言，灵感来自 1980-90 年代科幻作品中的终端界面，如《银翼杀手》《异形》《2001 太空漫游》。

## 颜色 Tokens

### 主色调 (Amber)

| Token     | CSS Variable     | Tailwind         | 用途                  |
| --------- | ---------------- | ---------------- | --------------------- |
| amber-500 | `--cf-amber-500` | `text-amber-500` | 主要文字、边框        |
| amber-400 | `--cf-amber-400` | `text-amber-400` | 交互态文字            |
| amber-700 | `--cf-amber-700` | `text-amber-700` | 次要文字、placeholder |

### 背景色 (Black/Surface)

| Token       | CSS Variable       | Tailwind         | 用途             |
| ----------- | ------------------ | ---------------- | ---------------- |
| black-900   | `--cf-black-900`   | `bg-black-900`   | 主背景 (#0A0A0A) |
| surface-200 | `--cf-surface-200` | `bg-surface-200` | 卡片背景         |
| surface-300 | `--cf-surface-300` | `bg-surface-300` | 弹出层背景       |
| surface-400 | `--cf-surface-400` | `bg-surface-400` | 悬停态背景       |

### 状态色

| Token          | CSS Variable          | Tailwind              | 用途           |
| -------------- | --------------------- | --------------------- | -------------- |
| status-success | `--cf-status-success` | `text-status-success` | 成功 (#00FF41) |
| status-error   | `--cf-status-error`   | `text-status-error`   | 错误 (#FF3131) |
| status-warning | `--cf-status-warning` | `text-status-warning` | 警告 (#FFBF00) |
| status-info    | `--cf-status-info`    | `text-status-info`    | 信息 (#00D4FF) |

## 字体 Tokens

| Token        | CSS Variable        | Tailwind       | 用途                              |
| ------------ | ------------------- | -------------- | --------------------------------- |
| font-mono    | `--cf-font-mono`    | `font-mono`    | 代码、数据、标签 (JetBrains Mono) |
| font-display | `--cf-font-display` | `font-display` | 大数字显示 (VT323)                |
| font-sans    | `--cf-font-sans`    | `font-sans`    | 正文描述 (Inter)                  |

## 效果 Tokens

### 发光效果 (Glow)

| Token       | CSS Variable       | Tailwind                | 用途             |
| ----------- | ------------------ | ----------------------- | ---------------- |
| glow-subtle | `--cf-glow-subtle` | `shadow-cf-glow-subtle` | hover/focus 微光 |
| glow-medium | `--cf-glow-medium` | `shadow-cf-glow-medium` | 面板边框         |
| glow-error  | `--cf-glow-error`  | `shadow-cf-glow-error`  | 错误状态发光     |

### 焦点环 (Focus Ring)

| Token            | CSS Variable            | Tailwind         | 用途             |
| ---------------- | ----------------------- | ---------------- | ---------------- |
| focus-ring       | `--cf-focus-ring`       | `ring-amber-500` | 焦点环颜色       |
| focus-ring-width | `--cf-focus-ring-width` | `ring-cf`        | 焦点环宽度 (2px) |

## 圆角 Tokens

| Token         | CSS Variable         | Tailwind        | 用途               |
| ------------- | -------------------- | --------------- | ------------------ |
| corner-small  | `--cf-corner-small`  | `rounded-cf-sm` | 按钮、输入框 (2px) |
| corner-medium | `--cf-corner-medium` | `rounded-cf-md` | 卡片、弹窗 (4px)   |

## 动画 Tokens

| Token           | CSS Variable           | Tailwind             | 用途             |
| --------------- | ---------------------- | -------------------- | ---------------- |
| duration-fast   | `--cf-duration-fast`   | `duration-cf-fast`   | 快速过渡 (100ms) |
| duration-normal | `--cf-duration-normal` | `duration-cf-normal` | 正常过渡 (200ms) |
| easing-standard | `--cf-easing-standard` | `ease-cf-standard`   | 标准缓动         |

## 无障碍指南

### prefers-reduced-motion

所有动画组件都应尊重用户的动画偏好设置：

```tsx
// Tailwind 类
"motion-reduce:animate-none";
"motion-reduce:before:animate-none";
```

### prefers-contrast

高对比度模式下，移除发光效果并增强边框：

```css
@media (prefers-contrast: more) {
  .cf-glow-text {
    text-shadow: none;
    font-weight: 600;
  }
}
```

### 焦点可见性

所有可交互元素必须有明确的焦点指示：

```tsx
"focus-visible:ring-cf focus-visible:ring-amber-500";
```

## 使用示例

### 按钮

```tsx
<Button variant="primary">PRIMARY ACTION</Button>
<Button variant="secondary">SECONDARY</Button>
<Button variant="destructive">DELETE</Button>
```

### 输入框

```tsx
<Input placeholder="Enter value..." />
<Input aria-invalid="true" /> // 错误状态
```

### 状态徽章

```tsx
<Badge variant="success">ONLINE</Badge>
<Badge variant="error">OFFLINE</Badge>
<Badge variant="warning">PENDING</Badge>
```

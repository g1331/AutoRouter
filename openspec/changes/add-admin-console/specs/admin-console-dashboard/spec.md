# Spec: Admin Console - Dashboard

## ADDED Requirements

### Requirement: Dashboard Overview

管理员访问 Dashboard 页面时，应显示系统的统计概览和快捷操作入口。

#### Scenario: 显示统计卡片

**Given** 数据库中存在：

- 10 个 API Keys（8 个 active，2 个 inactive）
- 3 个 Upstreams（2 个 active，1 个 inactive）

**When** 管理员访问 `/dashboard` 页面

**Then** 应显示 2 个统计卡片：

- "API Keys"：显示总数 10
- "Upstreams"：显示总数 3

**And** 每个卡片应包含图标和标题

#### Scenario: 统计卡片布局

**Given** 管理员访问 `/dashboard` 页面

**When** 页面加载完成

**Then** 统计卡片应水平排列（在桌面端）

**And** 卡片之间应有适当间距

**And** 卡片应使用一致的设计风格（shadcn/ui Card 组件）

#### Scenario: 加载状态

**Given** 管理员访问 `/dashboard` 页面

**When** API 请求尚未完成

**Then** 统计卡片应显示骨架屏（Skeleton）

**And** 不应显示具体数字

**When** API 请求完成

**Then** 骨架屏消失，显示实际统计数字

#### Scenario: 错误处理

**Given** 管理员访问 `/dashboard` 页面

**When** API 请求失败（网络错误）

**Then** 统计卡片应显示 "-" 或 "N/A"

**And** 应显示错误提示 toast "加载统计数据失败"

**And** 应提供 "重试" 按钮或自动重试（TanStack Query retry）

---

### Requirement: Quick Actions

Dashboard 应提供快捷操作入口，方便管理员快速创建资源。

#### Scenario: 显示快捷操作按钮

**Given** 管理员访问 `/dashboard` 页面

**When** 页面加载完成

**Then** 应显示 2 个快捷操作按钮：

- "创建 API Key"
- "添加 Upstream"

**And** 按钮应清晰可见（显眼的颜色和图标）

#### Scenario: 点击 "创建 API Key" 按钮

**Given** 管理员在 `/dashboard` 页面

**When** 管理员点击 "创建 API Key" 按钮

**Then** 应跳转到 `/keys` 页面

**Or** 应打开 "创建 API Key" 对话框（如果实现了全局对话框）

#### Scenario: 点击 "添加 Upstream" 按钮

**Given** 管理员在 `/dashboard` 页面

**When** 管理员点击 "添加 Upstream" 按钮

**Then** 应跳转到 `/upstreams` 页面

**Or** 应打开 "添加 Upstream" 对话框（如果实现了全局对话框）

---

### Requirement: Navigation

Dashboard 应提供清晰的导航，方便管理员访问其他页面。

#### Scenario: 侧边栏导航

**Given** 管理员在 `/dashboard` 页面

**When** 页面渲染完成

**Then** 应显示侧边栏（Sidebar）

**And** 侧边栏应包含导航链接：

- "Dashboard"（当前高亮）
- "API Keys"
- "Upstreams"

**And** 当前路由对应的链接应高亮显示

#### Scenario: 点击导航链接

**Given** 管理员在 `/dashboard` 页面

**When** 管理员点击侧边栏的 "API Keys" 链接

**Then** 应跳转到 `/keys` 页面

**And** 侧边栏的 "API Keys" 链接应高亮

**And** "Dashboard" 链接应取消高亮

#### Scenario: 顶部栏

**Given** 管理员在 `/dashboard` 页面

**When** 页面渲染完成

**Then** 应显示顶部栏（Topbar）

**And** 顶部栏应包含：

- 页面标题 "Dashboard"
- 用户菜单（右侧）

**And** 用户菜单应包含 "登出" 按钮

---

### Requirement: Data Fetching

Dashboard 统计数据应通过 Admin API 获取，支持缓存和自动刷新。

#### Scenario: 获取 API Keys 总数

**Given** 管理员访问 `/dashboard` 页面

**When** 前端需要获取 API Keys 总数

**Then** 应调用 `GET /admin/keys?page=1&page_size=1`

**And** 从响应的 `total` 字段读取总数

**Or** 应调用专门的统计 API（如果后端提供 `GET /admin/stats`）

#### Scenario: 获取 Upstreams 总数

**Given** 管理员访问 `/dashboard` 页面

**When** 前端需要获取 Upstreams 总数

**Then** 应调用 `GET /admin/upstreams?page=1&page_size=1`

**And** 从响应的 `total` 字段读取总数

#### Scenario: 缓存统计数据

**Given** 管理员访问 `/dashboard` 页面

**When** 统计数据加载完成

**Then** TanStack Query 应缓存数据（queryKey: `['stats']` 或分别缓存）

**And** staleTime 应设置为 30 秒（避免频繁请求）

**When** 管理员在 30 秒内刷新页面

**Then** 应直接使用缓存数据，不发起新请求

**When** 超过 30 秒后刷新页面

**Then** 应重新请求统计数据

#### Scenario: 自动刷新（可选）

**Given** 管理员在 `/keys` 页面成功创建一个 API Key

**When** 创建操作完成

**Then** 应 invalidate Dashboard 统计缓存（queryKey: `['stats']`）

**When** 管理员返回 `/dashboard` 页面

**Then** 统计数据应自动刷新，显示最新的 keys 总数

---

### Requirement: Responsive Design

Dashboard 应支持不同屏幕尺寸，至少在桌面端提供良好体验。

#### Scenario: 桌面端布局

**Given** 管理员在桌面端（宽度 >= 1024px）访问 `/dashboard` 页面

**When** 页面渲染完成

**Then** 侧边栏应显示在左侧（固定宽度）

**And** 主内容区域应占据剩余空间

**And** 统计卡片应水平排列（每行 2-3 个）

#### Scenario: 平板端布局（可选）

**Given** 管理员在平板端（宽度 768px - 1023px）访问 `/dashboard` 页面

**When** 页面渲染完成

**Then** 侧边栏可以折叠或显示为汉堡菜单

**And** 统计卡片应调整为每行 1-2 个

#### Scenario: 手机端布局（可选，低优先级）

**Given** 管理员在手机端（宽度 < 768px）访问 `/dashboard` 页面

**When** 页面渲染完成

**Then** 侧边栏应折叠，显示为汉堡菜单

**And** 统计卡片应垂直排列（每行 1 个）

---

### Requirement: User Experience

Dashboard 应提供友好的用户体验，清晰展示系统状态。

#### Scenario: 空状态提示

**Given** 数据库中不存在任何 API Keys 和 Upstreams

**When** 管理员访问 `/dashboard` 页面

**Then** 统计卡片应显示数字 0

**And** 应显示友好提示 "系统还没有任何数据，点击下方按钮开始配置"

**And** 快捷操作按钮应突出显示

#### Scenario: 统计卡片图标

**Given** 管理员访问 `/dashboard` 页面

**When** 统计卡片渲染完成

**Then** "API Keys" 卡片应显示相关图标（如钥匙图标）

**And** "Upstreams" 卡片应显示相关图标（如服务器图标）

**And** 图标应使用 lucide-react 图标库

#### Scenario: 页面标题

**Given** 管理员访问 `/dashboard` 页面

**When** 页面渲染完成

**Then** 浏览器标签页标题应为 "Dashboard - AutoRouter Admin"

**And** 顶部栏应显示 "Dashboard" 标题

---

### Requirement: Future Enhancements（预留，不在本次实现）

以下功能为预留设计，暂不实现，但 UI 布局应预留空间。

#### Scenario: 今日请求数统计（预留）

**Given** 后端实现了请求日志统计 API

**When** 管理员访问 `/dashboard` 页面

**Then** 应显示第三个统计卡片 "今日请求"，显示当天的请求总数

#### Scenario: 最近活动列表（预留）

**Given** 系统记录了最近的操作（创建 key、添加 upstream 等）

**When** 管理员访问 `/dashboard` 页面

**Then** 应显示 "最近活动" 区域

**And** 列出最近 5 条操作记录（时间、操作类型、资源名称）

#### Scenario: 实时监控图表（预留）

**Given** 系统支持实时监控数据推送

**When** 管理员访问 `/dashboard` 页面

**Then** 应显示请求量折线图（过去 24 小时）

**And** 图表应实时更新（WebSocket 或轮询）

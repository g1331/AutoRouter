# Change: Admin Console 管理界面

## Why

当前系统已完成 API Key 管理和上游动态配置的后端实现，但缺少配套的管理界面：

1. **运维困难** - 管理员必须通过 curl 或 Postman 手动调用 Admin API，操作繁琐且易出错
2. **可视化缺失** - 无法直观查看 API keys、upstreams 的状态和统计信息
3. **用户体验差** - 创建 key 时需要手动复制 upstream ID，容易混淆
4. **无审计界面** - 虽然后端记录了请求日志，但无法通过界面查看和分析

这限制了系统的可用性，增加了运维成本，不适合非技术人员使用。

## What Changes

### 核心功能

**认证系统**：

- 登录页面 - 输入 Admin Token 进行认证
- Token 存储 - sessionStorage + React Context（页面刷新不丢失，关闭浏览器清除）
- 自动重定向 - 未认证访问管理页面自动跳转登录，认证后跳转回原页面
- 401 处理 - 检测到 401 响应自动清除 token 并重定向登录

**Dashboard 总览**：

- 统计卡片 - API Keys 总数、Upstreams 总数、今日请求数（预留）
- 最近活动 - 最近创建的 keys 和 upstreams（预留）
- 快捷操作 - 快速跳转到创建 key/upstream 的入口

**API Keys 管理**：

- 列表展示 - 表格显示 key prefix、名称、权限的 upstreams、创建时间、过期时间、状态
- 分页控制 - 支持翻页（基于后端 page/page_size 参数）
- 创建 Key - 模态框表单，输入名称、描述、选择 upstreams（多选）、设置过期时间（可选）
- 显示完整 Key - 创建成功后一次性显示完整 key value（带复制按钮，关闭后不再显示）
- 撤销 Key - 确认对话框，撤销后立即刷新列表
- 状态标识 - 显示 active/inactive/expired 状态（颜色区分）

**Upstreams 管理**：

- 列表展示 - 表格显示名称、provider、base_url、masked key、默认标记、状态
- 分页控制 - 支持翻页
- 创建 Upstream - 模态框表单，输入所有必需字段（name、provider、base_url、api_key）
- 编辑 Upstream - 模态框表单，可修改除 name 外的所有字段（api_key 可选更新）
- 删除 Upstream - 确认对话框（软删除），警告可能影响关联的 keys
- 默认标记 - 显示 is_default 标识（仅一个可设为默认）

**交互体验**：

- Loading 状态 - 所有异步操作显示加载状态（骨架屏或 spinner）
- 错误提示 - Toast 通知显示成功/失败消息
- 表单验证 - 实时验证（React Hook Form + Zod），显示错误提示
- 空状态 - 无数据时显示友好的空状态（带创建入口）
- 乐观更新 - 删除/撤销操作立即更新 UI（TanStack Query mutation）

### 技术实现

**前端架构**：

- Next.js 16 App Router - 基于现有 `apps/web` 脚手架
- shadcn/ui + Tailwind CSS - 企业级 UI 组件库（Radix UI primitives）
- TanStack Query - 数据获取、缓存、分页、mutation 管理
- React Hook Form + Zod - 表单处理和验证
- AuthContext - 轻量级认证状态管理（无需 Zustand）

**目录结构**：

```
apps/web/src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx          # 登录页面
│   ├── (dashboard)/
│   │   ├── layout.tsx             # Dashboard 布局（sidebar + topbar + 认证守卫）
│   │   ├── dashboard/
│   │   │   └── page.tsx           # 总览页
│   │   ├── keys/
│   │   │   └── page.tsx           # API Keys 管理
│   │   └── upstreams/
│   │       └── page.tsx           # Upstreams 管理
│   ├── layout.tsx                 # 根布局（providers）
│   └── globals.css                # Tailwind 样式
├── components/
│   ├── ui/                        # shadcn 组件（button, input, dialog, table...）
│   └── admin/                     # 业务组件
│       ├── key-list-table.tsx
│       ├── key-create-dialog.tsx
│       ├── upstream-list-table.tsx
│       ├── upstream-form-dialog.tsx
│       └── ...
├── hooks/
│   ├── use-admin-client.ts        # 封装 fetch 请求（自动注入 token）
│   ├── use-api-keys.ts            # TanStack Query hooks（keys 相关）
│   └── use-upstreams.ts           # TanStack Query hooks（upstreams 相关）
├── lib/
│   ├── api.ts                     # API 客户端（fetch 封装）
│   └── utils.ts                   # 工具函数
└── providers/
    ├── auth-provider.tsx          # AuthContext + sessionStorage 管理
    └── query-provider.tsx         # TanStack Query client 配置
```

**环境变量**：

```env
# apps/web/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Impact

**Affected specs**:

- 新建 `admin-console-auth` - 前端认证和 token 管理规范
- 新建 `admin-console-keys` - API Keys 管理界面规范
- 新建 `admin-console-upstreams` - Upstreams 管理界面规范
- 新建 `admin-console-dashboard` - Dashboard 总览规范（简化版）

**Affected code**:

- `apps/web/src/app/` - 新增所有路由页面
- `apps/web/src/components/` - 新增 UI 和业务组件
- `apps/web/src/hooks/` - 新增数据获取 hooks
- `apps/web/src/lib/` - 新增 API 客户端
- `apps/web/src/providers/` - 新增 providers
- `apps/web/package.json` - 新增依赖（shadcn/ui 相关包）
- `apps/web/tailwind.config.ts` - shadcn/ui 配置

**Breaking Changes**:

- 无 - 纯新增功能，不影响现有代码

**Dependencies**（新增）:

- `@tanstack/react-query` - 数据状态管理
- `react-hook-form` - 表单处理
- `zod` - 数据验证
- `@radix-ui/*` - shadcn/ui 底层依赖（通过 shadcn CLI 自动安装）
- `class-variance-authority`, `clsx`, `tailwind-merge` - shadcn/ui 工具包
- `date-fns` - 日期格式化（显示创建时间、过期时间）
- `lucide-react` - 图标库

**Security Considerations**:

- Admin Token 仅存储在 sessionStorage（不使用 localStorage 或 cookie）
- 关闭浏览器后自动清除认证状态
- 所有 API 请求自动注入 `Authorization: Bearer` header
- 检测 401 响应自动清除 token 并重定向（防止无限循环）
- 敏感信息（完整 API key）仅在创建时显示一次，关闭对话框后不可再查看

**Out of Scope**（后续功能）:

- 请求日志查看界面（虽然后端已有 request_logs 表，但不在本次实现范围）
- 多语言支持（当前仅中文）
- 深色模式（当前仅浅色模式）
- 高级权限管理（当前仅单一 Admin Token）
- 数据导出功能（CSV/JSON 导出 keys/upstreams）

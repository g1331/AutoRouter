# Implementation Tasks: Admin Console

## 1. 环境准备和依赖安装

- [x] 1.1 安装 shadcn/ui CLI 和初始化
  - `npx shadcn@latest init` - 配置 Tailwind、组件目录等
- [x] 1.2 添加核心依赖
  - `pnpm add @tanstack/react-query`
  - `pnpm add react-hook-form zod @hookform/resolvers`
  - `pnpm add date-fns` - 日期格式化
  - `pnpm add class-variance-authority clsx tailwind-merge` - 已通过 shadcn init 自动安装
- [x] 1.3 安装 shadcn/ui 组件
  - `npx shadcn@latest add button input label`
  - `npx shadcn@latest add dialog card table`
  - `npx shadcn@latest add select checkbox form`
  - `npx shadcn@latest add toast dropdown-menu`
  - `npx shadcn@latest add badge skeleton separator`
  - 额外安装：popover, calendar, textarea
- [x] 1.4 配置环境变量
  - 创建 `apps/web/.env.local`
  - 添加 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`

## 2. 核心基础设施

- [x] 2.1 创建 API 客户端 `src/lib/api.ts`
  - createApiClient() - 封装 fetch，自动注入 Authorization header
  - 统一错误处理（401 自动跳转登录）
  - 支持泛型返回类型
  - 实现：ApiError, UnauthorizedError 错误类，get/post/put/delete 方法
- [x] 2.2 创建 Auth Provider `src/providers/auth-provider.tsx`
  - AuthContext - 提供 token, setToken, logout, apiClient
  - 从 sessionStorage 加载 token（hydration）
  - 提供 useAuth hook
  - 实现 handleUnauthorized 自动清除 token 并跳转
- [x] 2.3 创建 Query Provider `src/providers/query-provider.tsx`
  - 配置 TanStack Query client
  - 设置默认选项（staleTime: 30s, gcTime: 5min, retry: 1）
- [x] 2.4 更新根布局 `src/app/layout.tsx`
  - 包裹 QueryProvider 和 AuthProvider
  - 添加 Toaster 组件（sonner）

## 3. 认证系统

- [x] 3.1 创建登录页面 `src/app/(auth)/login/page.tsx`
  - 表单：输入 Admin Token（React Hook Form + Zod）
  - 提交后存储到 sessionStorage 和 AuthContext
  - 重定向到 dashboard（或 redirect 参数指定的页面）
  - 实现：精美的登录 UI，包含品牌展示和特性介绍
- [x] 3.2 创建认证守卫 `src/app/(dashboard)/layout.tsx`
  - 检查 token 是否存在
  - 未认证自动重定向到 /login（带 redirect 参数）
  - 包含 Sidebar 布局
- [x] 3.3 实现 401 处理
  - API 客户端检测 401 响应
  - 清除 token 并重定向到 /login
  - 显示 toast 提示 "认证已过期，请重新登录"

## 4. Dashboard 总览页

- [x] 4.1 创建 Dashboard 页面 `src/app/(dashboard)/dashboard/page.tsx`
  - 顶部统计卡片（API Keys 总数、Upstreams 总数）
  - 使用 TanStack Query 获取数据（GET /admin/keys?page=1&page_size=1 获取 total）
  - Skeleton loading 状态
- [x] 4.2 创建统计卡片组件
  - 直接在 dashboard/page.tsx 中使用 Card 组件实现
  - 显示标题、数值、图标
  - 支持 loading 状态（Skeleton）
- [x] 4.3 添加快捷操作区域
  - "创建 API Key" 卡片
  - "添加 Upstream" 卡片
  - 点击跳转到对应页面（待实现链接）

## 5. API Keys 管理页面

- [x] 5.1 创建 Keys 页面 `src/app/(dashboard)/keys/page.tsx`
  - 顶部操作栏（创建按钮）
  - Keys 列表表格
  - 分页控件（上一页/下一页按钮）
- [x] 5.2 创建数据获取 hooks `src/hooks/use-api-keys.ts`
  - useAPIKeys(page, pageSize) - 获取 keys 列表
  - useCreateAPIKey() - 创建 key mutation
  - useRevokeAPIKey() - 撤销 key mutation
- [x] 5.3 创建 Keys 列表表格 `src/components/admin/keys-table.tsx`
  - 列：名称、key_prefix、描述、upstreams 数量、过期时间、创建时间、操作
  - 状态标识（badge）：永不过期（绿色）、即将过期（琥珀色）、已过期（红色）
  - 操作列：复制 key 前缀、撤销按钮
  - 空状态显示
- [x] 5.4 创建 Key 创建对话框 `src/components/admin/create-key-dialog.tsx`
  - 表单字段：name、description、upstream_ids（多选 Checkbox）、expires_at（Calendar 日期选择器）
  - React Hook Form + Zod 验证
  - 提交后显示完整 key（ShowKeyDialog）
  - 成功后刷新列表（TanStack Query invalidate）
- [x] 5.5 创建 Key 显示对话框 `src/components/admin/show-key-dialog.tsx`
  - 显示完整 key value（深色背景代码块）
  - 复制按钮（点击复制到剪贴板）
  - 警告提示：关闭后无法再次查看
- [x] 5.6 创建撤销确认对话框 `src/components/admin/revoke-key-dialog.tsx`
  - 显示 key prefix 和名称
  - 确认按钮（危险样式）
  - 撤销后 toast 提示 + 刷新列表

## 6. Upstreams 管理页面

- [x] 6.1 创建 Upstreams 页面 `src/app/(dashboard)/upstreams/page.tsx`
  - 顶部操作栏（添加按钮）
  - Upstreams 列表表格
  - 分页控件
- [x] 6.2 创建数据获取 hooks `src/hooks/use-upstreams.ts`
  - useUpstreams(page, pageSize) - 获取 upstreams 列表
  - useCreateUpstream() - 创建 upstream mutation
  - useUpdateUpstream() - 更新 upstream mutation
  - useDeleteUpstream() - 删除 upstream mutation
- [x] 6.3 创建 Upstreams 列表表格 `src/components/admin/upstreams-table.tsx`
  - 列：名称、provider、base_url、描述、创建时间、操作
  - Provider 标识（badge）：OpenAI（绿色）、Anthropic（紫色）、Azure（蓝色）、Gemini（琥珀色）
  - 操作列：编辑、删除按钮
  - 空状态显示
- [x] 6.4 创建 Upstream 表单对话框 `src/components/admin/upstream-form-dialog.tsx`
  - 支持创建和编辑模式
  - 表单字段：name、provider（Select 下拉选择）、base_url、api_key、description
  - 编辑模式：api_key 留空表示不更新
  - React Hook Form + Zod 验证
  - 成功后 toast 提示 + 刷新列表
- [x] 6.5 创建删除确认对话框 `src/components/admin/delete-upstream-dialog.tsx`
  - 显示 upstream 名称、provider、base_url
  - 警告：可能影响关联的 API keys
  - 确认按钮（危险样式）
  - 删除后 toast 提示 + 刷新列表

## 7. 共享组件和工具

- [x] 7.1 分页功能
  - 直接在 keys/page.tsx 和 upstreams/page.tsx 中实现
  - 显示总数、当前页/总页数
  - 上一页、下一页按钮
- [x] 7.2 空状态显示
  - 直接在 keys-table.tsx 和 upstreams-table.tsx 中实现
  - 显示图标、标题、描述
  - 引导用户创建第一个资源
- [x] 7.3 创建 Sidebar 导航 `src/components/admin/sidebar.tsx`
  - 导航链接：Dashboard、API Keys、Upstreams
  - 当前路由高亮
  - Logo 和标题（AutoRouter Admin Console）
  - 响应式设计（支持折叠）
- [x] 7.4 创建 Topbar `src/components/admin/topbar.tsx`
  - 显示页面标题
  - 用户菜单（DropdownMenu + 登出按钮）
- [x] 7.5 创建工具函数 `src/lib/utils.ts`
  - cn() - 类名合并（shadcn 默认提供）
  - 日期格式化使用 date-fns（formatDistanceToNow）
  - 复制到剪贴板使用 navigator.clipboard API

## 8. 类型定义

- [x] 8.1 创建 API 类型定义 `src/types/api.ts`
  - APIKeyCreate, APIKeyResponse, APIKey, APIKeyCreateResponse
  - UpstreamCreate, UpstreamUpdate, UpstreamResponse, Upstream
  - PaginatedResponse<T>, PaginatedAPIKeysResponse, PaginatedUpstreamsResponse
  - ErrorDetail
  - 与后端 Pydantic schemas 保持一致

## 9. 交互优化

- [x] 9.1 添加 Loading 状态
  - 表格加载时显示 loading spinner
  - Dashboard 统计卡片加载时显示 Skeleton
  - 按钮提交时显示 loading 状态（disabled + "...中"）
- [x] 9.2 添加错误处理
  - API 错误显示 toast 通知（sonner）
  - 表单验证错误内联显示（FormMessage）
  - 401 错误自动跳转登录
- [x] 9.3 添加 Toast 通知
  - 成功操作：toast.success
  - 错误操作：toast.error
  - 信息提示：toast.info（登出）
- [ ] 9.4 实现乐观更新（可选优化）
  - 当前实现：成功后 invalidateQueries 刷新列表
  - 后续可优化为 TanStack Query optimistic updates

## 10. 测试

- [ ] 10.1 手动功能测试
  - 登录流程（正确/错误 token）
  - 创建 API Key（各种字段组合）
  - 撤销 API Key
  - 创建 Upstream
  - 编辑 Upstream
  - 删除 Upstream
  - 分页导航
  - 401 自动登出
- [ ] 10.2 UI 测试（可选，使用 Playwright）
  - 登录测试
  - Key 创建流程测试
  - Upstream CRUD 测试
- [ ] 10.3 响应式测试
  - 桌面端（1920x1080）
  - 平板端（768x1024）
  - 手机端适配（可选）

## 11. 文档和部署

- [ ] 11.1 更新 README.md
  - 添加前端开发指南
  - 环境变量说明
  - 启动命令
- [ ] 11.2 创建前端 .env.example
  - `NEXT_PUBLIC_API_BASE_URL`
- [ ] 11.3 添加构建和部署说明
  - `pnpm --filter web build`
  - 静态导出配置（如果需要）
  - Vercel/Netlify 部署配置
- [ ] 11.4 创建用户使用指南
  - 如何登录
  - 如何管理 Keys 和 Upstreams
  - 截图和示例

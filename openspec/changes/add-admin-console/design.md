# Technical Design: Admin Console

## Context

AutoRouter 已完成后端 API Key 管理功能，但缺少配套的可视化管理界面。当前管理员必须通过 curl/Postman 手动调用 Admin API，操作繁琐且易出错。

**约束**：
- 必须复用后端现有的 Admin API（不修改后端）
- 基于现有的 Next.js 16 脚手架（`apps/web`）
- 认证基于单一 Admin Token（无用户系统）
- 支持分页（后端已实现 page/page_size 参数）

**参考实现**：
- Supabase Dashboard - 清晰的 API Keys 管理界面
- Vercel Dashboard - 简洁的项目管理和统计展示
- Railway Dashboard - 友好的环境变量和配置管理

## Goals / Non-Goals

**Goals**:
- ✅ 提供直观的 Web UI 管理 API Keys 和 Upstreams
- ✅ 实现安全的认证流程（Admin Token）
- ✅ 完整的 CRUD 操作（创建、查看、编辑、删除）
- ✅ 良好的用户体验（loading、错误提示、空状态）
- ✅ 响应式设计（至少支持桌面端）

**Non-Goals** (后续版本):
- ❌ 多用户系统（当前仅单一 Admin Token）
- ❌ 请求日志查看（虽然后端已有 request_logs 表）
- ❌ 实时监控和 Dashboard 图表
- ❌ 多语言支持（当前仅中文）
- ❌ 深色模式（当前仅浅色）

## Decisions

### 1. 技术栈：shadcn/ui + TanStack Query

**选择**：
- **UI 组件库**：shadcn/ui（基于 Radix UI + Tailwind CSS）
- **数据获取**：TanStack Query (React Query v5)
- **表单处理**：React Hook Form + Zod
- **样式**：Tailwind CSS
- **状态管理**：React Context（仅认证状态）

**替代方案**：
- Ant Design / Material-UI：过于重量级，不符合项目简洁风格
- SWR：功能不如 TanStack Query 完善（mutation、pagination、optimistic updates）
- Zustand：当前状态简单，无需独立状态管理库

**选择理由**：
- shadcn/ui 提供企业级 UI 组件，可完全自定义，无运行时依赖
- TanStack Query 专为服务端状态设计，自动处理缓存、重试、分页、乐观更新
- React Hook Form 性能优秀，与 shadcn/ui 无缝集成
- Tailwind CSS 与 Next.js 默认配置一致，无需额外配置

### 2. 认证方案：sessionStorage + React Context

**选择**：
- Admin Token 存储在 **sessionStorage**（不使用 localStorage 或 cookie）
- 通过 React Context 提供全局访问
- 页面刷新时从 sessionStorage 恢复 token
- 关闭浏览器后自动清除

**替代方案**：
- localStorage：持久化存储，但关闭浏览器后仍存在（安全风险）
- httpOnly Cookie：更安全，但需要后端支持（当前后端无 session 管理）
- 内存存储：页面刷新后丢失（用户体验差）

**选择理由**：
- sessionStorage 平衡了安全性和用户体验（关闭浏览器清除，刷新保留）
- 无需修改后端（后端仅验证 Bearer token，无 session 管理）
- React Context 提供便捷的全局访问，无需 props drilling

### 3. 路由结构：App Router + Route Groups

**选择**：
```
app/
├── (auth)/                # 认证相关（无布局）
│   └── login/
│       └── page.tsx
├── (dashboard)/           # 管理后台（带布局）
│   ├── layout.tsx         # Sidebar + Topbar + 认证守卫
│   ├── dashboard/
│   │   └── page.tsx       # 总览页
│   ├── keys/
│   │   └── page.tsx       # API Keys 管理
│   └── upstreams/
│       └── page.tsx       # Upstreams 管理
├── layout.tsx             # 根布局（providers）
└── globals.css
```

**选择理由**：
- Route Groups 分离认证和管理后台布局（`(auth)` vs `(dashboard)`）
- 认证守卫在 `(dashboard)/layout.tsx` 统一处理，避免每个页面重复代码
- 符合 Next.js App Router 最佳实践

### 4. API 客户端设计

**选择**：
```typescript
// src/lib/api.ts
export function createApiClient(getToken: () => string | null) {
  return {
    async fetch<T>(path: string, options?: RequestInit): Promise<T> {
      const token = getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options?.headers,
      };

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        // 触发登出逻辑
        throw new UnauthorizedError('Token expired or invalid');
      }

      if (!response.ok) {
        const error = await response.json();
        throw new ApiError(error.detail || 'Request failed', response.status);
      }

      return response.json();
    },
  };
}
```

**选择理由**：
- 封装 fetch API，自动注入 Authorization header
- 统一处理 401 错误（自动清除 token 并重定向）
- 统一错误格式（ApiError）
- 支持泛型返回类型（TypeScript 类型安全）

### 5. 数据获取策略：TanStack Query + Custom Hooks

**选择**：
```typescript
// src/hooks/use-api-keys.ts
export function useApiKeys(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['api-keys', page, pageSize],
    queryFn: () => apiClient.fetch<PaginatedResponse<APIKey>>(`/admin/keys?page=${page}&page_size=${pageSize}`),
    staleTime: 30_000, // 30秒内不重新获取
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: APIKeyCreate) => apiClient.fetch('/admin/keys', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API Key 创建成功');
    },
  });
}
```

**选择理由**：
- Custom hooks 封装数据获取逻辑，页面组件保持简洁
- TanStack Query 自动处理缓存、loading、error 状态
- mutation 成功后自动 invalidate cache 并刷新列表
- staleTime 减少不必要的网络请求

### 6. 表单验证：Zod Schema

**选择**：
```typescript
// API Key 创建表单验证
const apiKeyCreateSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(255, '名称过长'),
  description: z.string().optional(),
  upstream_ids: z.array(z.string().uuid()).min(1, '至少选择一个 Upstream'),
  expires_at: z.date().optional(),
});

type APIKeyCreateForm = z.infer<typeof apiKeyCreateSchema>;
```

**选择理由**：
- Zod 提供强类型验证，与 TypeScript 无缝集成
- 验证规则与后端 Pydantic schema 一致
- React Hook Form 原生支持 Zod resolver
- 验证错误自动显示在表单字段下方

### 7. 组件结构：Composition Pattern

**选择**：
- **Presentational Components**（`src/components/ui/`）：shadcn/ui 提供，纯 UI 展示
- **Container Components**（`src/components/admin/`）：业务逻辑，组合 UI 组件
- **Page Components**（`src/app/.../page.tsx`）：数据获取，组合 Container Components

**示例**：
```typescript
// page.tsx（数据获取）
export default function KeysPage() {
  const { data, isLoading } = useApiKeys(page, pageSize);
  return <KeysTable data={data} isLoading={isLoading} />;
}

// KeysTable（业务逻辑）
function KeysTable({ data, isLoading }) {
  const revokeMutation = useRevokeApiKey();
  return (
    <Table>
      {data.items.map(key => (
        <TableRow key={key.id}>
          {/* ... */}
          <Button onClick={() => revokeMutation.mutate(key.id)}>撤销</Button>
        </TableRow>
      ))}
    </Table>
  );
}
```

**选择理由**：
- 职责分离：数据获取、业务逻辑、UI 展示分离
- 可测试性：每个层级可独立测试
- 可复用性：UI 组件可跨页面复用

## Architecture

### 数据流

```
User Action
    ↓
React Component
    ↓
TanStack Query Hook (useApiKeys, useCreateApiKey)
    ↓
API Client (createApiClient)
    ↓
Backend Admin API (/admin/keys, /admin/upstreams)
    ↓
Database (SQLite/PostgreSQL)
```

### 认证流程

```
1. 用户访问 /dashboard
   ↓
2. (dashboard)/layout.tsx 检查 AuthContext.token
   ↓
3a. 如果 token 存在 → 渲染页面
3b. 如果 token 为 null → 重定向到 /login?redirect=/dashboard
   ↓
4. 用户在 /login 输入 Admin Token
   ↓
5. 验证成功 → setToken() + sessionStorage.setItem()
   ↓
6. 重定向回 /dashboard
```

### 401 错误处理

```
API Client 检测到 401
    ↓
抛出 UnauthorizedError
    ↓
全局错误边界捕获
    ↓
清除 AuthContext.token + sessionStorage
    ↓
显示 Toast: "认证已过期，请重新登录"
    ↓
重定向到 /login
```

## Component Breakdown

### Core Components（shadcn/ui，~10 个）

- Button, Input, Label - 基础表单控件
- Dialog, Card - 布局和模态框
- Table, TableRow, TableCell - 数据表格
- Select, Checkbox - 复杂表单控件
- Badge, Skeleton - 状态展示
- Toast, Toaster - 通知

### Admin Components（~12 个）

1. **KeysTable** - API Keys 列表表格
2. **CreateKeyDialog** - 创建 Key 模态框
3. **ShowKeyDialog** - 显示完整 Key
4. **RevokeKeyDialog** - 撤销确认对话框
5. **UpstreamsTable** - Upstreams 列表表格
6. **UpstreamFormDialog** - 创建/编辑 Upstream 模态框
7. **DeleteUpstreamDialog** - 删除确认对话框
8. **StatsCard** - Dashboard 统计卡片
9. **Pagination** - 分页控件
10. **EmptyState** - 空状态展示
11. **Sidebar** - 侧边栏导航
12. **Topbar** - 顶部栏

## Security Considerations

1. **Token 存储**：
   - 仅使用 sessionStorage（关闭浏览器清除）
   - 不使用 localStorage（持久化风险）
   - 不使用 cookie（无需后端支持）

2. **XSS 防护**：
   - React 自动转义输出（防止 XSS）
   - 不使用 dangerouslySetInnerHTML

3. **CSRF 防护**：
   - 当前不需要（Admin Token 通过 Authorization header 传递，不使用 cookie）

4. **敏感数据显示**：
   - 完整 API Key 仅在创建时显示一次
   - 列表仅显示 key_prefix（如 `sk-auto-****`）
   - Upstream API key 显示为 masked 格式（如 `sk-***1234`）

5. **错误信息**：
   - 不在 UI 显示详细的服务端错误（防止信息泄露）
   - 仅显示友好的用户提示

## Performance Considerations

1. **缓存策略**：
   - TanStack Query staleTime: 30s（减少不必要的请求）
   - 列表数据缓存按 page 和 pageSize 隔离

2. **分页**：
   - 后端分页（page/page_size 参数）
   - 默认 pageSize: 20
   - 避免一次性加载大量数据

3. **乐观更新**：
   - 删除/撤销操作立即更新 UI
   - 失败时回滚（TanStack Query 自动处理）

4. **代码分割**：
   - Next.js App Router 自动按路由分割
   - 对话框组件使用 dynamic import（可选）

## Migration Path

当前系统：
- 无前端管理界面
- 管理员通过 curl/Postman 调用 Admin API

迁移后：
- 提供 Web UI 管理界面
- 保留 Admin API（向后兼容）
- 管理员可选择 UI 或 API 方式管理

无需数据迁移，纯新增功能。

## UI Theme: Cassette Futurism

**更新于 2025-12-07**: UI 设计风格已从 Material Design 3 更换为 Cassette Futurism（磁带未来主义）。

### 设计理念

灵感来自 1980-90 年代科幻作品中的终端界面（《银翼杀手》《异形》《2001 太空漫游》）：

- **主色调**：琥珀色 (#FFBF00) - 复古 CRT 显示器风格
- **背景色**：深黑色 (#0A0A0A) - 高对比度
- **字体**：JetBrains Mono (代码)、VT323 (数字)、Inter (正文)
- **效果**：边框发光、扫描线、噪点纹理

### 设计 Tokens

详见 `apps/web/docs/tokens.md`

### 无障碍性

- 所有动画尊重 `prefers-reduced-motion`
- 所有交互元素有 `focus-visible` 焦点环
- 高对比度模式支持 `prefers-contrast: more`

## Future Enhancements（Phase 2）

1. **请求日志查看**：
   - 新增 `/logs` 页面
   - 显示 request_logs 表数据
   - 支持过滤（按 key、upstream、日期范围）

2. **深色模式**：
   - Tailwind CSS dark mode
   - 用户偏好存储（localStorage）

3. **多语言支持**：
   - i18n 库（next-intl）
   - 支持中英文切换

4. **高级权限**：
   - 多用户系统
   - RBAC（Role-Based Access Control）
   - 不同用户不同权限

5. **数据导出**：
   - 导出 API Keys 列表（CSV/JSON）
   - 导出请求日志（分析用）

6. **实时监控**：
   - WebSocket 实时推送
   - 请求量实时图表
   - 错误率监控

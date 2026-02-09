# Spec: Admin Console Authentication

## ADDED Requirements

### Requirement: Login Page

Admin 用户必须通过登录页面输入 Admin Token 进行认证，认证成功后才能访问管理界面。

#### Scenario: 成功登录

**Given** Admin 用户访问登录页面 `/login`

**When** 用户输入正确的 Admin Token 并提交表单

**Then** Token 应存储在 sessionStorage 中（key: `admin_token`）

**And** Token 应存储在 AuthContext 中

**And** 用户应重定向到 `/dashboard` 页面

**And** 显示成功提示 toast "登录成功"

#### Scenario: 登录失败（错误的 Token）

**Given** Admin 用户访问登录页面 `/login`

**When** 用户输入错误的 Admin Token 并提交表单

**Then** 应调用后端 API 验证 Token（如 `GET /admin/keys?page=1&page_size=1`）

**And** 后端返回 403 错误

**And** 显示错误提示 toast "Admin Token 无效，请检查后重试"

**And** Token 不应存储在 sessionStorage 或 AuthContext 中

**And** 用户保持在 `/login` 页面

#### Scenario: 登录后重定向到原页面

**Given** 未认证用户访问 `/keys` 页面

**And** 认证守卫重定向到 `/login?redirect=/keys`

**When** 用户输入正确的 Admin Token 并登录成功

**Then** 用户应重定向到 `/keys` 页面（而不是 `/dashboard`）

#### Scenario: 表单验证

**Given** Admin 用户访问登录页面 `/login`

**When** 用户提交空表单

**Then** 应显示验证错误 "请输入 Admin Token"

**And** 不应调用后端 API

---

### Requirement: Authentication Guard

所有管理后台页面（`/dashboard`、`/keys`、`/upstreams`）必须验证用户是否已认证，未认证用户自动重定向到登录页面。

#### Scenario: 未认证用户访问管理页面

**Given** sessionStorage 中没有 `admin_token`

**When** 用户访问 `/dashboard` 页面

**Then** 用户应立即重定向到 `/login?redirect=/dashboard`

**And** 不应渲染任何管理页面内容

#### Scenario: 已认证用户访问管理页面

**Given** sessionStorage 中存在有效的 `admin_token`

**And** AuthContext 已初始化 token

**When** 用户访问 `/dashboard` 页面

**Then** 应渲染 Dashboard 页面内容

**And** 不应发生重定向

#### Scenario: 页面刷新后恢复认证状态

**Given** 用户已登录，sessionStorage 中存在 `admin_token`

**When** 用户刷新 `/dashboard` 页面（F5 或重新加载）

**Then** AuthContext 应从 sessionStorage 恢复 token

**And** 用户应保持在 `/dashboard` 页面

**And** 不应重定向到登录页面

#### Scenario: 关闭浏览器后清除认证状态

**Given** 用户已登录

**When** 用户关闭浏览器窗口

**Then** sessionStorage 中的 `admin_token` 应被清除

**And** 下次打开浏览器访问管理页面时，应重定向到登录页面

---

### Requirement: Logout

用户可以主动登出，清除认证状态并返回登录页面。

#### Scenario: 用户点击登出按钮

**Given** 用户已登录并在任意管理页面

**When** 用户点击 Topbar 中的 "登出" 按钮

**Then** sessionStorage 中的 `admin_token` 应被清除

**And** AuthContext 中的 token 应设置为 null

**And** 用户应重定向到 `/login` 页面

**And** 显示提示 toast "已登出"

---

### Requirement: 401 Error Handling

当后端返回 401 错误时，前端应自动清除认证状态并重定向到登录页面，防止用户继续使用过期或无效的 Token。

#### Scenario: API 请求返回 401

**Given** 用户已登录，token 存储在 AuthContext

**When** 任意 API 请求返回 401 Unauthorized 响应

**Then** sessionStorage 中的 `admin_token` 应被清除

**And** AuthContext 中的 token 应设置为 null

**And** 用户应重定向到 `/login` 页面

**And** 显示提示 toast "认证已过期，请重新登录"

#### Scenario: 防止 401 重定向循环

**Given** 用户在 `/login` 页面

**When** API 请求返回 401（如验证 token 失败）

**Then** 不应触发重定向（已经在登录页面）

**And** 仅显示错误提示 toast

---

### Requirement: Token Storage Security

Admin Token 的存储必须平衡安全性和用户体验，避免常见的安全风险。

#### Scenario: Token 仅存储在 sessionStorage

**Given** 用户成功登录

**When** 系统存储 Admin Token

**Then** Token 应存储在 sessionStorage（key: `admin_token`）

**And** Token 不应存储在 localStorage（持久化风险）

**And** Token 不应存储在 cookie（无需后端支持）

**And** Token 不应暴露在 URL 参数中

#### Scenario: 关闭浏览器自动清除 Token

**Given** 用户已登录

**When** 用户关闭所有浏览器窗口/标签页

**Then** sessionStorage 应被浏览器清除

**And** Token 不应持久化到磁盘

#### Scenario: 多标签页共享认证状态

**Given** 用户在标签页 A 已登录

**When** 用户在同一浏览器打开新标签页 B 并访问 `/dashboard`

**Then** 标签页 B 应从 sessionStorage 读取 token

**And** 标签页 B 应正常显示管理页面（无需重新登录）

**Note**: sessionStorage 在同一浏览器会话的不同标签页间是**隔离的**，因此实际上标签页 B 需要重新登录。如果需要共享认证状态，应使用 localStorage（但存在安全风险）。当前设计选择安全性优先。

---

### Requirement: API Client Integration

所有 Admin API 请求必须自动注入 Authorization header，无需手动添加。

#### Scenario: API 请求自动注入 Token

**Given** 用户已登录，token 为 `test-admin-token-123`

**When** 前端调用任意 Admin API（如 `GET /admin/keys`）

**Then** 请求 header 应包含 `Authorization: Bearer test-admin-token-123`

**And** Content-Type 应为 `application/json`

#### Scenario: 未认证时不注入 Token

**Given** 用户未登录，AuthContext.token 为 null

**When** 前端调用 API（如登录验证）

**Then** 请求 header 不应包含 `Authorization` 字段

**Or** Authorization header 值为空

# Tasks: 成员信息边界——上游可见性（按用户 + 批量）与密钥归属分离

> 注：可见性从「全局单例开关」重设计为「按用户属性 + 批量入口」。密钥归属分离部分（3、6 组）不受影响，保持已完成。

## 1. 数据模型：按用户可见性，移除全局单例

- [x] 1.1 `users` 表新增 `expose_upstreams` 布尔列（默认 `false`），PG + SQLite 双方言；移除本分支引入的 `portal_settings` 表与类型、schema.ts 派发项；撤掉旧的 portal_settings 迁移并重新生成双方言迁移（净增量只加 users 列）。运行 `pnpm db:check:consistency`，通过后提交。

## 2. 服务层：按用户可见性 + 批量 + 密钥对齐

- [x] 2.1 `user-service`：`UserListItem`/`toListItem`/`createUser`/`updateUser` 支持 `exposeUpstreams`（默认隐藏；`updateUser` 切到隐藏时按 `replace` 重对齐该用户密钥）；`setUserUpstreams` 改按该用户 `expose_upstreams` 选择对齐模式；新增批量 `setUsersUpstreamVisibility(exposeUpstreams, userIds?)`（省略 userIds 即全体成员，切隐藏者重对齐，返回受影响数）。删除 `portal-settings-service` 及其测试。补服务测试，通过后提交。

## 3. 成员端接口按登录成员自身设置分支

- [x] 3.1 `/api/user/upstreams`、`/api/user/keys`（创建/更新）、`/api/user/logs` 改为读当前登录成员自身的 `expose_upstreams`（替换原全局 `getPortalSettings`）；更新相关路由测试，通过后提交。

## 4. 管理端 API：单用户 + 批量

- [x] 4.1 `PUT /api/admin/users/{id}` 增加 `expose_upstreams`（requireAdmin + zod）；新增 `PATCH /api/admin/users/upstream-visibility` 批量路由；移除 `/api/admin/portal-settings` 路由及其测试；`api-transformers` 用户响应补 `expose_upstreams`。补路由测试，通过后提交。

## 5. 前端：设置页回退 + 用户管理页可见性

- [x] 5.1 撤掉设置页全局开关、`use-portal-settings` hook 与 `PortalSettings*` 类型。
- [x] 5.2 用户管理页：编辑用户对话框加“上游可见”开关（走 updateUser）；页面加批量设置可见性入口（全体成员，确认对话框 + toast 受影响数）；补中英文文案与 hooks。
- [x] 5.3 补组件测试（编辑对话框开关、批量入口）；E2E 页面级 mock 补用户 `expose_upstreams`、移除 portal-settings 桩；运行前端组件测试、lint、format、tsc 与本地 E2E，通过后提交。

## 6. 密钥归属分离（保持已完成，不受可见性重设计影响）

- [x] 6.1 `listApiKeys` 的 `unowned` 过滤与归属人装配、`GET /api/admin/keys` 的 `owner_scope`/`user_id`、密钥响应 `user_id`/`user_name`。
- [x] 6.2 管理台密钥页归属范围切换与归属徽章、用户管理页按人密钥弹窗、分配密钥对话框只列无归属密钥；门户密钥对话框隐藏态与密钥表格“自动路由”。

## 7. 整体验证与交接

- [x] 7.1 运行相关 Vitest、迁移一致性、lint、format check、tsc；复核 OpenSpec 规格与实现一致性，本地刷新 dev 环境验证；提交并推送分支、更新 draft PR #239。

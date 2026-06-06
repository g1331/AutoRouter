<!-- 阶段一 · 用户体系基础能力（任务组 1–8）：完成后系统达到可独立合并发布的完整状态，建议作为独立 PR -->

## 1. 数据模型与迁移

- [ ] 1.1 在 `schema-pg.ts` 新增 `users` 表（id、username 唯一且小写归一、password_hash、display_name、role 默认 member、is_active 默认 true、created_at、updated_at）
- [ ] 1.2 在 `schema-sqlite.ts` 同步定义 `users` 表，时间戳沿用 `timestamp_ms` + `.defaultNow()`、主键沿用 `text().$defaultFn(() => randomUUID())`，保持与全表风格一致
- [ ] 1.3 在两套 schema 新增 `user_upstreams` 关联表（user_id、upstream_id），沿用现有 `api_key_upstreams` 关联表写法
- [ ] 1.4 给两套 schema 的 `api_keys.user_id` 添加引用 `users(id)` 的外键（ON DELETE SET NULL）与索引 `idx_api_keys_user_id`
- [ ] 1.5 给 `request_logs` 与 `request_billing_snapshots` 各新增冗余 `user_id` 列与索引
- [ ] 1.6 导出新表与新列的类型定义，并在 `schema.ts` 方言派发中正确 re-export
- [ ] 1.7 运行 `pnpm db:generate` 与 `pnpm db:generate:sqlite` 生成两套迁移文件
- [ ] 1.8 运行 `pnpm db:check:consistency` 确认 schema 与迁移一致，并补充验证新表、外键、冗余列存在的测试（不依赖 SQLite 外键运行时强制）
- [ ] 1.9 通过质量门禁（lint、format、tsc）后提交：`feat(users): 新增 users/user_upstreams 表与归属外键、事实表冗余列`

## 2. 密码、JWT 与配置基础

- [ ] 2.1 在 `package.json` 引入 `jose` 依赖
- [ ] 2.2 在 `config.ts` 的 Zod schema 新增可选 `JWT_SECRET`；实现未配置时从 `ENCRYPTION_KEY` 经 Web Crypto（`crypto.subtle` + HKDF，info 标签 `autorouter-jwt-v1`）派生签名密钥；两者皆缺失时 fail-fast 抛配置错误
- [ ] 2.3 在 `auth.ts` 复用 bcrypt 增加密码哈希与校验函数（`hashPassword` / `verifyPassword`）及密码最小强度校验（不少于 8 字符），与 API Key 哈希共用 `BCRYPT_ROUNDS`
- [ ] 2.4 新增 JWT 工具模块：签发（payload 仅含 userId、role、exp，不含用户名，过期初始 24 小时）与验证（`jose.jwtVerify` 固定算法，拒绝 alg=none）
- [ ] 2.5 为密码哈希、强度校验、JWT 签发与验证、Web Crypto 密钥派生确定性、双密钥缺失 fail-fast、固定算法拒绝畸形 token 编写单元测试
- [ ] 2.6 通过质量门禁后提交：`feat(auth): 新增密码哈希、JWT 工具与密钥派生`

## 3. 统一角色感知鉴权

- [ ] 3.1 定义 `AuthPrincipal` 判别联合类型（admin_token / user / null）
- [ ] 3.2 实现 `authenticate(request)`：ADMIN_TOKEN 用 `timingSafeEqual` 常量时间比较且不查库；JWT 验签后查库校验 `is_active` 并以查库最新 `role` 为准
- [ ] 3.3 实现 `requireAdmin(request)` 与 `requireUser(request)` 门禁封装，分别处理 401 与 403，`requireUser` 返回携带 userId 的主体
- [ ] 3.4 为三类身份、未认证、停用用户、过期/畸形 token、admin 降级后旧 token 被拒、admin_token 不触发查库编写单元测试
- [ ] 3.5 通过质量门禁后提交：`feat(auth): 新增统一角色感知鉴权工具`

## 4. 登录与会话端点

- [ ] 4.1 实现 `POST /api/auth/login`：按归一化用户名查用户、is_active、bcrypt 比对密码，成功签发 JWT 并返回用户基本信息
- [ ] 4.2 统一失败响应，确保用户名不存在与密码错误返回一致的 401，密码明文不进入日志
- [ ] 4.3 实现登录失败限流（按用户名与 IP 失败计数 + 短时锁定）
- [ ] 4.4 实现 `GET /api/auth/me` 返回当前用户资料，供前端获取展示信息
- [ ] 4.5 为登录成功、密码错误、停用账号、不存在用户名、限流触发与解除、/api/auth/me 编写测试
- [ ] 4.6 通过质量门禁后提交：`feat(auth): 新增登录、限流与当前用户端点`

## 5. 现有 admin route 鉴权迁移

- [ ] 5.1 将全部 `/api/admin/*` route 的内联 `validateAdminAuth(authHeader)` 替换为 `requireAdmin(request)`
- [ ] 5.2 以简单字面 pattern grep `validateAdminAuth` 确认 `src/app/api/admin/` 下无残留，核对带 `params` 与多方法 route 均已迁移，并决定是否清退无调用方的 `withAdminAuth` 死代码
- [ ] 5.3 补充覆盖典型 admin route 在三类身份下行为的回归测试，确认 ADMIN_TOKEN 行为不变、member 被拒
- [ ] 5.4 运行现有 admin route 测试套件确认无回归
- [ ] 5.5 通过质量门禁后提交：`refactor(admin): 迁移 admin route 到统一角色鉴权`

## 6. 管理员用户管理 API

- [ ] 6.1 新增用户管理 service：创建、分页列表（含名下密钥数量聚合）、更新资料、改用户名（复用唯一与归一化校验）、重置密码、停用启用、删除（名下密钥归属置空，单事务原子完成，不依赖 SQLite 外键）
- [ ] 6.2 实现最后一个启用 admin 的锁定保护，拒绝停用或删除
- [ ] 6.3 实现 `/api/admin/users` 路由组（集合分页与单条），以 `requireAdmin` 守卫，响应不含 password_hash
- [ ] 6.4 实现 API Key 所有权分配/回收接口（分配校验目标用户存在）与用户可用上游配置接口（写 `user_upstreams`）
- [ ] 6.5 为用户 CRUD、改用户名冲突、最后 admin 锁定、所有权分配、可用上游配置、member 越权拒绝、删除置空归属的事务性在 pg 与 sqlite 两种 dbType 下编写测试
- [ ] 6.6 通过质量门禁后提交：`feat(users): 新增管理员用户管理 API`

## 7. 前端认证状态与登录页

- [ ] 7.1 升级 `auth-provider.tsx`：principal 由 token 快照派生并缓存（保持 useSyncExternalStore 快照稳定），解码仅取 role 且对畸形 token 容错退化为未认证，复用现有 `handleUnauthorized`/`isHydrated`；username/displayName 经 `/api/auth/me` 或登录响应获取
- [ ] 7.2 调整 `api.ts` 客户端使 Authorization 头适配 JWT 与 ADMIN_TOKEN 两种 token；实现登出清除凭据
- [ ] 7.3 改造 `(auth)/login/page.tsx` 为双模式（账号登录默认、管理员令牌登录标签），账号模式调用登录端点，令牌模式沿用探针逻辑
- [ ] 7.4 为登录页两种模式、AuthProvider 状态转换、畸形 token 容错、登出编写组件测试
- [ ] 7.5 通过质量门禁后提交：`feat(auth): 前端登录双模式与认证状态升级`

## 8. 用户管理页面与导航入口

- [ ] 8.1 新增用户管理数据 hooks（分页列表、创建、更新、改用户名、重置密码、停用启用、删除、分配密钥、配置可用上游），遵循 TanStack Query 模式
- [ ] 8.2 新增用户管理页面与组件（分页用户列表、新建用户表单、编辑与操作菜单、配置可用上游、分配密钥），复用 `ui/` 原语，最后 admin 危险操作入口禁用
- [ ] 8.3 在 `sidebar.tsx` 的 `systemNavigation` 追加用户管理入口并扩展 `labelKey` 联合类型，按角色控制可见性（门户导航留待第 12 组统一处理）
- [ ] 8.4 在 `en.json` 与 `zh-CN.json` 补全用户管理相关全部文案
- [ ] 8.5 为用户管理页面渲染、创建表单、最后 admin 入口禁用、按角色过滤导航编写组件测试
- [ ] 8.6 通过质量门禁后提交：`feat(users): 新增用户管理页面与导航入口`

<!-- 阶段二 · 用户自助门户（任务组 9–13）：在阶段一基础上叠加，建议作为独立 PR -->

## 9. 用户侧数据隔离与个人数据 API

- [ ] 9.1 在代理入口密钥校验路径增加对归属用户 `is_active` 的回查，停用用户名下密钥代理失效；无归属密钥不受影响
- [ ] 9.2 在请求日志与账单快照写入路径填入冗余 `user_id`（密钥当前归属快照）
- [ ] 9.3 新增用户侧 service：以 userId 强制过滤，提供个人概览汇总、个人请求记录、个人用量统计，基于事实表冗余 `user_id` 聚合
- [ ] 9.4 实现 `/api/user/overview`、`/api/user/logs`、`/api/user/usage` 端点，以 `requireUser` 守卫并注入 userId 过滤
- [ ] 9.5 为停用用户后其密钥代理被拒、删除密钥后历史用量仍归属、用户只读自己数据、越权读他人数据被拒、无密钥用户返回空结果编写测试
- [ ] 9.6 通过质量门禁后提交：`feat(portal): 新增用户侧数据隔离与个人数据 API`

## 10. 用户自助 API Key 管理与改密

- [ ] 10.1 新增用户侧密钥 service：创建（归属强制当前用户、`access_mode` 强制 restricted、授权上游限定 `user_upstreams` 子集）、更新、停用启用、删除、额度仅可收紧
- [ ] 10.2 实现 `/api/user/keys` 路由组，服务端拦截修改归属、操作他人密钥、认领无主密钥、授权越界上游、放宽额度的尝试
- [ ] 10.3 实现 `/api/user/password` 自助改密端点：校验原密码 + 新密码强度
- [ ] 10.4 为自助创建归属与 restricted 强制、授权越界被拒、放宽额度被拒、操作他人密钥被拒、无法转移归属、删除吊销、改密成功与原密码错误编写测试
- [ ] 10.5 通过质量门禁后提交：`feat(portal): 新增用户自助密钥管理与改密`

## 11. 公共壳层抽取与门户页面

- [ ] 11.1 从 `(dashboard)/layout.tsx` 抽取不含 `LivePulseProvider`、不含管理后台移动根路由集合的公共 `AppShell` 组件，由两个路由组各自包裹各自的 Provider 与导航
- [ ] 11.2 新增门户数据 hooks（个人概览、个人请求记录、个人密钥管理、改密），遵循 TanStack Query 模式
- [ ] 11.3 新增 `(portal)` 路由组与 layout，实现个人概览、我的请求、我的密钥、修改密码页面；请求页复用日志列表组件，密钥页复用密钥组件并约束为自助操作范围
- [ ] 11.4 在 `en.json` 与 `zh-CN.json` 补全门户相关全部文案
- [ ] 11.5 为壳层抽取后管理后台无回归、门户各页面渲染与自助操作编写组件测试
- [ ] 11.6 通过质量门禁后提交：`feat(portal): 抽取公共壳层并新增自助门户页面`

## 12. 角色路由分流与门户导航

- [ ] 12.1 实现登录后按角色分流：admin/admin_token 进入管理后台，member 进入门户
- [ ] 12.2 实现 member 访问管理后台路由时的客户端重定向，服务端管理接口保持 403 兜底
- [ ] 12.3 在 `sidebar.tsx` 按角色渲染管理后台与门户两套导航集合，门户移动端栅格适配为对应列数而非 `grid-cols-5`，共用 `AppShell`
- [ ] 12.4 为按角色分流、member 客户端重定向、member 调用管理接口服务端 403、两套导航渲染编写组件测试
- [ ] 12.5 通过质量门禁后提交：`feat(portal): 角色路由分流与门户导航`

## 13. 集成校验与收尾

- [ ] 13.1 运行 `pnpm test:run` 全量单元与组件测试，修复回归
- [ ] 13.2 运行 `pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm format:check` 确认全部通过
- [ ] 13.3 更新 `.env.example` 补充 `JWT_SECRET` 说明，更新 `AGENTS.md` 中认证与用户体系相关描述
- [ ] 13.4 补充登录、用户管理、自助门户、数据越权、停用连带失效的 E2E 场景，运行 `pnpm e2e` 确认通过
- [ ] 13.5 通过质量门禁后提交：`test(multi-user): 补全集成校验与文档更新`

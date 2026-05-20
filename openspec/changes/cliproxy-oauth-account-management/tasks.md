## 1. 数据模型

- [x] 1.1 在 `src/lib/db/schema-pg.ts` 中新增 `cliproxyAuthAccounts` 表（`cliproxy_auth_accounts`），含 id、instanceId（外键引用 cliproxyInstances、onDelete cascade）、authFileName、provider、email、status、disabled、prefix、modelCount、priority、note、rawMetadata、lastSyncedAt、createdAt、updatedAt，建立 `(instanceId, authFileName)` 唯一约束与 instanceId 索引
- [x] 1.2 在 `src/lib/db/schema-sqlite.ts` 中以等价字段新增 `cliproxyAuthAccounts` 表，字段集合与约束与 PostgreSQL 版本一致
- [x] 1.3 在两套 schema 与 `schema.ts` 中补充表导出与 `CliproxyAuthAccount`、`NewCliproxyAuthAccount` 类型导出，并补充 relations
- [x] 1.4 运行 `pnpm db:generate` 与 `pnpm db:generate:sqlite` 生成迁移文件，检查迁移为纯新增表
- [x] 1.5 运行 `pnpm exec tsc --noEmit` 确认类型检查通过，同步更新 `migrate-sqlite` 测试的迁移数量与清单断言，提交本阶段代码

## 2. 管理 API 客户端

- [ ] 2.1 新增 `src/lib/services/cliproxy-management-client.ts`，定义 auth-files、模型、auth-url、auth-status 等响应的 TypeScript 类型，按 CLIProxyAPI 实际契约定义
- [ ] 2.2 实现 `listAuthFiles`、`getAuthFileModels` 两个只读调用，统一注入 `Authorization: Bearer`、设置超时、容错解析响应缺失字段
- [ ] 2.3 实现 `patchAuthFileStatus`、`patchAuthFileFields` 两个写入调用，请求体按 CLIProxyAPI 契约构造
- [ ] 2.4 实现 `getProviderAuthUrl`、`getAuthStatus` 两个 OAuth 流程调用，`getProviderAuthUrl` 默认携带 `is_webui=true`
- [ ] 2.5 为管理 API 客户端编写单元测试，覆盖鉴权头注入、超时、字段缺失容错、各端点请求与响应解析
- [ ] 2.6 运行 `pnpm test:run` 与 `pnpm exec tsc --noEmit` 确认通过，提交本阶段代码

## 3. 账号同步与账号管理服务

- [ ] 3.1 新增 `src/lib/services/cliproxy-auth-account-service.ts`，实现账号同步：拉取 auth-files、按白名单解析非敏感字段、查询模型数量、按 `(instanceId, authFileName)` upsert、移除失效条目
- [ ] 3.2 在同步服务中实现单账号模型查询失败容错，保证整体同步不中断
- [ ] 3.3 实现账号列表查询、账号启停、账号字段更新，启停与字段更新先调用 CLIProxyAPI 再更新本地缓存
- [ ] 3.4 在 `cliproxy-instance-crud.ts` 的 `deleteCliproxyInstance` 引用校验扩展点补充逻辑，存在缓存账号时抛出 `CliproxyInstanceInUseError`
- [ ] 3.5 为账号同步与账号管理服务编写单元测试，覆盖新增同步、移除失效、模型查询失败容错、启停、字段更新、删除引用保护
- [ ] 3.6 运行 `pnpm test:run` 与 `pnpm exec tsc --noEmit` 确认通过，提交本阶段代码

## 4. OAuth 登录流程服务

- [ ] 4.1 新增 `src/lib/services/cliproxy-oauth-login-service.ts`，实现发起登录：校验服务商、调用 `getProviderAuthUrl`、返回授权地址与会话标识
- [ ] 4.2 实现登录状态查询：透传 CLIProxyAPI 状态，状态为成功时触发该实例账号同步
- [ ] 4.3 为 OAuth 登录流程服务编写单元测试，覆盖发起登录、轮询进行中、登录成功触发同步、登录失败
- [ ] 4.4 运行 `pnpm test:run` 与 `pnpm exec tsc --noEmit` 确认通过，提交本阶段代码

## 5. Admin API

- [ ] 5.1 新增 `src/app/api/admin/cliproxy/instances/[id]/auth-accounts/route.ts`，实现 GET 列出实例下账号
- [ ] 5.2 新增 `src/app/api/admin/cliproxy/instances/[id]/auth-accounts/sync/route.ts`，实现 POST 触发账号同步
- [ ] 5.3 新增 `src/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/route.ts` 与 `status/route.ts`，实现 PATCH 字段更新与 PATCH 启停
- [ ] 5.4 新增 `src/app/api/admin/cliproxy/instances/[id]/oauth-login/route.ts` 与 `status/route.ts`，实现 POST 发起登录与 GET 轮询状态
- [ ] 5.5 新增账号的 API 响应转换逻辑，输出非敏感字段的 snake_case 形态
- [ ] 5.6 为全部 Admin API 路由编写测试，覆盖列表、同步、启停、字段更新、发起登录、轮询、鉴权失败、实例不存在
- [ ] 5.7 运行 `pnpm test:run`、`pnpm exec tsc --noEmit`、`pnpm lint` 确认通过，提交本阶段代码

## 6. 收尾验证

- [ ] 6.1 运行 `pnpm format:check` 确认格式统一，运行 `pnpm test:run` 复核全部测试通过
- [ ] 6.2 回看本变更全部改动，确认双 schema 无字段漂移、token 明文未进入缓存表、`db:check:consistency` 通过
- [ ] 6.3 使用 `openspec validate` 校验本变更工件完整，提交收尾改动

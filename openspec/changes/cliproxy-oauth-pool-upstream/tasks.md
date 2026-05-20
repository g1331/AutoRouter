## 1. 数据模型

- [x] 1.1 在 `src/lib/db/schema-pg.ts` 的 `upstreams` 表新增可空字段 `cliproxyInstanceId`（外键引用 cliproxyInstances、onDelete set null）、`cliproxyAuthFileName`、`cliproxyProvider`
- [x] 1.2 在 `src/lib/db/schema-sqlite.ts` 的 `upstreams` 表以等价字段新增三个 CLIProxyAPI 关联字段
- [x] 1.3 运行 `pnpm db:generate` 与 `pnpm db:generate:sqlite` 生成迁移文件，检查迁移为纯列新增
- [x] 1.4 运行 `pnpm exec tsc --noEmit` 确认类型检查通过，同步更新 `migrate-sqlite` 测试的迁移数量与清单断言，提交本阶段代码

## 2. 池上游预设服务

- [ ] 2.1 新增 `src/lib/services/cliproxy-upstream-preset.ts`，定义服务商路径后缀与路由能力预设常量表（codex / anthropic / gemini）
- [ ] 2.2 实现 `createCliproxyPoolUpstream`：取实例行、拼接代理地址、解密客户端 API Key、按服务商预设能力、复用 `createUpstream` 落库、回填 `cliproxyInstanceId` 与 `cliproxyProvider`
- [ ] 2.3 实现单账号前缀拼接的单一常量与构造函数，集中表达 CLIProxyAPI 账号前缀在模型名中的拼接形式
- [ ] 2.4 实现 `createCliproxySingleAccountUpstream`：取实例与账号缓存记录、确定或写入账号前缀、以池上游配置为基础创建上游、设置 `cliproxyAuthFileName`、写入携带前缀的 `alias` 模型规则
- [ ] 2.5 为池上游预设服务编写单元测试，覆盖三类服务商池上游创建、关联字段回填、单账号映射、实例与账号不存在
- [ ] 2.6 运行 `pnpm test:run` 与 `pnpm exec tsc --noEmit` 确认通过，提交本阶段代码

## 3. 实例删除校验扩展

- [ ] 3.1 在 `cliproxy-instance-crud.ts` 的 `deleteCliproxyInstance` 中补充对 `upstreams` 表 `cliproxyInstanceId` 引用的校验，存在关联上游时抛出 `CliproxyInstanceInUseError`
- [ ] 3.2 更新 `cliproxy-instance-crud` 测试，覆盖存在关联上游时拒绝删除、无引用时允许删除
- [ ] 3.3 运行 `pnpm test:run` 与 `pnpm exec tsc --noEmit` 确认通过，提交本阶段代码

## 4. Admin API

- [ ] 4.1 新增 `src/app/api/admin/cliproxy/instances/[id]/pool-upstreams/route.ts`，实现 POST 创建服务商池上游
- [ ] 4.2 新增 `src/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/upstream/route.ts`，实现 POST 创建单账号映射上游
- [ ] 4.3 为两个 API 路由编写测试，覆盖创建成功、鉴权失败、实例不存在、账号不存在、非法服务商
- [ ] 4.4 运行 `pnpm test:run`、`pnpm exec tsc --noEmit`、`pnpm lint` 确认通过，提交本阶段代码

## 5. 收尾验证

- [ ] 5.1 运行 `pnpm format:check` 确认格式统一，运行 `pnpm test:run` 复核全部测试通过
- [ ] 5.2 回看本变更全部改动，确认双 schema 无字段漂移、既有上游不受影响、`db:check:consistency` 通过
- [ ] 5.3 使用 `openspec validate` 校验本变更工件完整，提交收尾改动

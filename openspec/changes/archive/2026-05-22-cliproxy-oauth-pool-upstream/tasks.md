## 1. 数据模型

- [x] 1.1 在 `src/lib/db/schema-pg.ts` 的 `upstreams` 表新增可空字段 `cliproxyInstanceId`（外键引用 cliproxyInstances、onDelete set null）、`cliproxyAuthFileName`、`cliproxyProvider`
- [x] 1.2 在 `src/lib/db/schema-sqlite.ts` 的 `upstreams` 表以等价字段新增三个 CLIProxyAPI 关联字段
- [x] 1.3 运行 `pnpm db:generate` 与 `pnpm db:generate:sqlite` 生成迁移文件，检查迁移为纯列新增
- [x] 1.4 运行 `pnpm exec tsc --noEmit` 确认类型检查通过，同步更新 `migrate-sqlite` 测试的迁移数量与清单断言，提交本阶段代码

## 2. 上游预设服务

- [x] 2.1 新增 `src/lib/services/cliproxy-upstream-preset.ts`，定义服务商路径后缀与路由能力预设常量表（codex / anthropic / gemini），定义前缀拼接常量 `CLIPROXY_PREFIX_DELIMITER` 与构造函数 `buildCliproxyPrefixedModel`
- [x] 2.2 实现 `createCliproxyPoolUpstream`：取实例行、拼接代理地址、解密客户端 API Key、按服务商预设能力、复用 `createUpstream` 落库、回填 `cliproxyInstanceId` 与 `cliproxyProvider`
- [x] 2.3 实现 `createCliproxySingleAccountUpstream`：取实例与账号缓存记录、确定或经 CLIProxyAPI 写入账号前缀、以池上游配置为基础创建上游、回填 `cliproxyInstanceId`、`cliproxyProvider` 与 `cliproxyAuthFileName`
- [x] 2.4 为预设服务编写单元测试，覆盖三类服务商池上游创建、关联字段回填、单账号映射、确定与写入前缀、实例与账号不存在
- [x] 2.5 运行 `pnpm test:run` 与 `pnpm exec tsc --noEmit` 确认通过，提交本阶段代码

## 3. 转发层前缀注入

- [x] 3.1 在 `proxy-client.ts` 的 `forwardRequest` 增加可选 `modelOverride` 入参，请求体为 JSON 时改写其中的模型名，Gemini 原生请求同步改写 URL 中的模型段
- [x] 3.2 在代理路由 `forwardWithFailover` 选定上游后，按上游 `cliproxyAuthFileName` 取账号前缀，拼出携带前缀的模型名作为 `modelOverride` 传入；字段为空时不注入
- [x] 3.3 实现取账号前缀的辅助函数，模型名已含前缀分隔符时跳过注入避免重复拼接
- [x] 3.4 为转发层注入编写单元测试，覆盖单账号上游注入前缀、普通上游与池上游不改写、failover 切换上游重新判定、模型名已含前缀时跳过
- [x] 3.5 运行 `pnpm test:run` 与 `pnpm exec tsc --noEmit` 确认通过，提交本阶段代码

## 4. 实例删除校验扩展

- [x] 4.1 在 `cliproxy-instance-crud.ts` 的 `deleteCliproxyInstance` 中补充对 `upstreams` 表 `cliproxyInstanceId` 引用的校验，存在关联上游时抛出 `CliproxyInstanceInUseError`
- [x] 4.2 更新 `cliproxy-instance-crud` 测试，覆盖存在关联上游时拒绝删除、无引用时允许删除
- [x] 4.3 运行 `pnpm test:run` 与 `pnpm exec tsc --noEmit` 确认通过，提交本阶段代码

## 5. Admin API

- [x] 5.1 新增 `src/app/api/admin/cliproxy/instances/[id]/pool-upstreams/route.ts`，实现 POST 创建服务商池上游
- [x] 5.2 新增 `src/app/api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/upstream/route.ts`，实现 POST 创建单账号映射上游
- [x] 5.3 为两个 API 路由编写测试，覆盖创建成功、鉴权失败、实例不存在、账号不存在、非法服务商
- [x] 5.4 运行 `pnpm test:run`、`pnpm exec tsc --noEmit`、`pnpm lint` 确认通过，提交本阶段代码

## 6. 收尾验证

- [x] 6.1 运行 `pnpm format:check` 确认格式统一，运行 `pnpm test:run` 复核全部测试通过
- [x] 6.2 回看本变更全部改动，确认双 schema 无字段漂移、既有上游不受影响、`db:check:consistency` 通过
- [x] 6.3 使用 `openspec validate` 校验本变更工件完整，提交收尾改动

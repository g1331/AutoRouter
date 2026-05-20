## 1. 数据模型

- [x] 1.1 在 `src/lib/db/schema-pg.ts` 中新增 `cliproxyInstances` 表（`cliproxy_instances`），字段包含 id、name（唯一）、mode、baseUrl、managementUrl、clientApiKeyEncrypted、managementKeyEncrypted、enabled、description、createdAt、updatedAt，并补充 name 与 enabled 索引
- [x] 1.2 在 `src/lib/db/schema-sqlite.ts` 中以等价字段新增 `cliproxyInstances` 表，主键与时间戳按 SQLite 方言表达，字段集合与语义与 PostgreSQL 版本一致
- [x] 1.3 在两套 schema 中补充 `CliproxyInstance` 与 `NewCliproxyInstance` 推导类型导出，并确认 `schema.ts` 正确再导出
- [x] 1.4 运行 `pnpm db:generate` 生成迁移文件，检查迁移内容为纯新增表
- [x] 1.5 运行 `pnpm exec tsc --noEmit` 确认类型检查通过，提交本阶段代码（数据模型与迁移）

## 2. 服务层

- [x] 2.1 新增 `src/lib/services/cliproxy-instance-crud.ts`，实现实例的列表、详情、创建、更新、删除，写入时对客户端 API Key 与管理密钥执行 Fernet 加密，更新时未提交密钥则保留原值
- [x] 2.2 在 CRUD 服务中定义 `CliproxyInstanceNotFoundError` 等领域错误，并预留删除前引用校验扩展点
- [x] 2.3 新增实例地址校验逻辑，按 `mode` 分流：`managed` 仅校验 URL 格式与 http/https 协议，`external` 复用 `upstream-ssrf-validator.ts` 执行完整 SSRF 校验，校验同时作用于 baseUrl 与 managementUrl
- [x] 2.4 新增 `src/lib/services/cliproxy-connection-tester.ts`，调用目标实例管理 API 只读端点 `GET /v0/management/auth-files`，区分连接成功、鉴权失败、地址不可达、服务异常四类结果，请求设置 10 秒超时上限
- [x] 2.5 为 CRUD 服务与连通性检测服务编写单元测试，覆盖加密入库、更新保留密钥、地址校验分流、四类检测结果
- [x] 2.6 运行 `pnpm test:run` 与 `pnpm exec tsc --noEmit` 确认通过，提交本阶段代码（服务层与测试）

## 3. Admin API

- [ ] 3.1 新增 `src/app/api/admin/cliproxy/instances/route.ts`，实现 GET 列表与 POST 创建，复用 `validateAdminAuth`、`errorResponse`、Zod 入参校验，响应不返回密钥明文
- [ ] 3.2 新增 `src/app/api/admin/cliproxy/instances/[id]/route.ts`，实现 GET 详情、PATCH 更新、DELETE 删除，处理实例不存在错误
- [ ] 3.3 新增 `src/app/api/admin/cliproxy/instances/[id]/test/route.ts`，对已保存实例执行连通性检测
- [ ] 3.4 新增 `src/app/api/admin/cliproxy/instances/test/route.ts`，对未保存配置执行创建前预检测
- [ ] 3.5 新增 API 响应转换逻辑，将实例记录转为 API 响应形态，密钥字段转为是否已配置的布尔标记
- [ ] 3.6 为四个 API 路由编写测试，覆盖创建、查询、更新、删除、鉴权失败、实例不存在、密钥明文不外泄
- [ ] 3.7 运行 `pnpm test:run`、`pnpm exec tsc --noEmit`、`pnpm lint` 确认通过，提交本阶段代码（Admin API 与测试）

## 4. 收尾验证

- [ ] 4.1 运行 `pnpm format` 统一格式，运行 `pnpm test:run --coverage` 复核测试覆盖
- [ ] 4.2 回看本变更全部改动，确认未引入与需求无关的改动、双 schema 字段无漂移、密钥明文未进入数据库与 API 响应
- [ ] 4.3 使用 `openspec` 校验本变更工件完整，提交收尾改动

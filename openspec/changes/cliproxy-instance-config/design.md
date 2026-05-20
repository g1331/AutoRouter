## Context

AutoRouter 现有上游模型（`upstreams` 表）假定上游是一个普通的 HTTP API 服务，凭一个加密 API Key 即可访问。GitHub issue #142 要求引入 CLIProxyAPI 这一新型上游来源。CLIProxyAPI 是一个独立的 OAuth 协议适配服务，它同时暴露两类接口：

第一类是代理转发接口，AutoRouter 的请求转发面通过它访问 Codex、Claude、Gemini 的 OAuth 账号，使用客户端 API Key 鉴权。第二类是管理接口（`/v0/management/*`），AutoRouter 的管理面通过它查询 OAuth 账号、发起登录流程，使用管理密钥鉴权。

这两类接口可能位于不同的地址。在受管 sidecar 部署中，CLIProxyAPI 与 AutoRouter 同处一个 docker compose 网络，AutoRouter 通过内网主机名访问。在外部服务部署中，CLIProxyAPI 是一个独立运行的服务，通过其对外地址访问。

因此，在创建任何 CLI OAuth 上游之前，系统必须先有一个能够描述“一个 CLIProxyAPI 服务”的基础资源。本变更交付该资源模型与其管理能力。后续变更（OAuth 账号管理、CLI OAuth 上游预设、sidecar 部署支持）都依赖本变更。

当前约束包括：数据库需同时支持 PostgreSQL 与 SQLite 两套 schema；敏感凭据必须复用既有 Fernet 加密机制；Admin API 鉴权统一走 `ADMIN_TOKEN` Bearer 认证；既有 SSRF 校验会拦截私有地址。

## Goals / Non-Goals

**Goals:**

交付 `cliproxy_instances` 数据模型，支持登记多个 CLIProxyAPI 实例，PostgreSQL 与 SQLite 双 schema 同步。

实例的客户端 API Key 与管理密钥以 Fernet 加密存储，明文不落数据库。

交付 CLIProxyAPI 实例的 Admin API 增删改查，鉴权与既有 Admin API 一致。

交付管理 API 连通性检测能力，验证目标实例地址可达且管理密钥有效。

为 CLIProxyAPI 实例地址设计独立于普通上游的地址校验策略，允许受管 sidecar 的内网地址。

**Non-Goals:**

不涉及 OAuth 账号查询与管理，由后续变更 `cliproxy-oauth-account-management` 交付。

不涉及 CLI OAuth 上游的创建与请求转发，由后续变更交付。

不涉及前端实例配置界面，本变更仅交付后端服务与 API。

不涉及 docker compose sidecar 编排文件，由后续变更 `cliproxy-sidecar-deployment` 交付。

## Decisions

### 决策一：多实例数据模型

采用独立的 `cliproxy_instances` 表支持多实例，而非把单个 CLIProxyAPI 配置塞进现有的设置体系。

理由是 issue #142 同时覆盖受管 sidecar 与外部服务两种部署形态，单实例模型会提前封闭扩展空间。CLIProxyAPI 实例需要成为可独立增删改查的受管资源，后续变更中 CLI OAuth 上游与 OAuth 账号都需要外键引用具体实例。

表结构如下：

```
┌─────────────────────────────────────────────────────────────────┐
│ cliproxy_instances                                               │
├──────────────────────────┬────────────────────────────────────── │
│ id                       │ 主键 (pg: uuid / sqlite: text uuid)   │
│ name                     │ 实例名称，唯一，长度 1-64             │
│ mode                     │ 运行模式枚举: managed | external      │
│ base_url                 │ 代理转发基础地址 (转发面使用)         │
│ management_url           │ 管理 API 地址 (管理面使用)            │
│ client_api_key_encrypted │ 客户端 API Key，Fernet 密文           │
│ management_key_encrypted │ 管理 API 密钥，Fernet 密文            │
│ enabled                  │ 是否启用，布尔，默认 true             │
│ description              │ 备注，可空                            │
│ created_at / updated_at  │ 时间戳                                │
└──────────────────────────┴───────────────────────────────────────┘
```

`mode` 取值 `managed` 表示受管 sidecar，`external` 表示外部服务。该字段限定为枚举，避免自由字符串导致部署行为不一致。

`base_url` 与 `management_url` 分列两个字段。CLIProxyAPI 的代理接口与管理接口在部署上可能分处不同地址或端口，合并为单字段会丢失表达能力。

考虑过的替代方案是复用 `traffic_recording_settings` 那样的单行设置表。该方案被否决，因为它只能描述一个实例，与 issue #142 的双部署形态目标冲突。

### 决策二：敏感凭据 Fernet 加密

`client_api_key_encrypted` 与 `management_key_encrypted` 两列存储 Fernet 密文，复用 `src/lib/utils/encryption.ts` 既有的 `encrypt` 与 `decrypt` 函数，与 `upstreams.api_key_encrypted` 完全一致的处理方式。

写入时在服务层加密，读取明文仅在连通性检测与后续转发场景按需解密。Admin API 的查询响应绝不返回密钥明文，参考 `upstreams` 现有的 API 转换约定（`api-transformers.ts`），仅返回是否已配置的布尔标记。

不引入新的加密依赖。两个字段对应两个独立用途的密钥，分列存储而非合并为 JSON，便于各自独立更新。

### 决策三：地址校验策略

CLIProxyAPI 实例地址需要一套独立于普通上游的校验策略。

现有 `upstream-ssrf-validator.ts` 会拦截私有 IP 与内网地址，这对普通上游是正确的防护。但受管 sidecar 模式下 CLIProxyAPI 地址正是内网地址（例如 `http://cliproxyapi:8317`），若沿用同一套 SSRF 校验会导致 sidecar 模式完全不可用。

校验策略按 `mode` 分流：

```
            ┌─────────────────────────────┐
            │  提交 cliproxy_instances 地址  │
            └──────────────┬──────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                          ▼
       mode = managed             mode = external
              │                          │
   允许私有/内网地址            执行完整 SSRF 校验
   仅校验 URL 格式合法          (复用 upstream-ssrf-validator)
   与协议为 http/https          拦截私有 IP 与云元数据端点
              │                          │
              └────────────┬─────────────┘
                           ▼
                  通过则允许写入
```

`managed` 模式校验 URL 格式合法、协议为 `http` 或 `https`，不做私有地址拦截，因为 sidecar 地址本就是受管内网地址。`external` 模式执行完整 SSRF 校验，因为外部地址由管理员输入，存在被诱导访问内网的可能。

考虑过对全部模式统一放行，被否决，因为 `external` 模式的地址校验不严会引入 SSRF 隐患。也考虑过统一拦截，同样被否决，因为它使 sidecar 模式不可用。按模式分流是唯一同时满足安全与可用的方案。

### 决策四：连通性检测

新增连通性检测服务，调用目标实例管理 API 的一个轻量只读端点，验证地址可达且管理密钥有效。

CLIProxyAPI 管理 API 中 `GET /v0/management/auth-files` 是列出凭据的只读端点，适合作为探活目标。检测逻辑携带解密后的管理密钥发起请求，根据响应区分四种结果：

| 结果 | 判定依据 | 返回信息 |
|------|----------|----------|
| 成功 | HTTP 2xx | 连接正常 |
| 鉴权失败 | HTTP 401 / 403 | 管理密钥无效 |
| 地址不可达 | 连接超时 / DNS 失败 / 连接拒绝 | 管理 API 地址不可达 |
| 服务异常 | 其他非 2xx | CLIProxyAPI 返回异常状态 |

检测端点设计为两种调用形态。一是对已保存实例的检测 `POST /api/admin/cliproxy/instances/:id/test`，二是创建实例前对未保存配置的预检测 `POST /api/admin/cliproxy/instances/test`，后者直接接收待测配置，便于管理员在保存前验证。

`v0` 前缀意味着 CLIProxyAPI 管理 API 未冻结，探活端点的选择集中在连通性检测服务一处，后续若 CLIProxyAPI 接口变动，仅需改动此处。

### 决策五：Admin API 路由与服务分层

新增路由族 `src/app/api/admin/cliproxy/instances`，结构对齐既有 `upstreams` 路由族：

```
src/app/api/admin/cliproxy/instances/
├── route.ts              GET 列表 / POST 创建
├── test/route.ts         POST 未保存配置预检测
└── [id]/
    ├── route.ts          GET 详情 / PATCH 更新 / DELETE 删除
    └── test/route.ts     POST 已保存实例检测
```

服务层新增 `src/lib/services/cliproxy-instance-crud.ts` 负责数据库 CRUD 与加解密，新增 `src/lib/services/cliproxy-connection-tester.ts` 负责连通性检测，分别对齐既有的 `upstream-crud.ts` 与 `upstream-connection-tester.ts`。

所有路由复用 `validateAdminAuth` 鉴权、`errorResponse` 错误响应、Zod 入参校验、`createLogger` 日志，与既有 Admin API 完全一致。

### 决策六：删除约束

删除实例时需要校验是否仍被引用。本变更尚未引入引用 `cliproxy_instances` 的其他表，但后续变更会让 `cliproxy_auth_accounts` 与 `upstreams` 引用它。

本变更在删除服务中预留引用校验扩展点，当前实现直接允许删除。外键关系在后续变更中创建时，由后续变更补充 `onDelete` 策略与删除前校验逻辑。本变更不提前创建尚无对应表的外键。

## Risks / Trade-offs

[CLIProxyAPI 管理 API 未冻结] → `v0` 前缀表明接口可能变动。缓解措施是将所有对 CLIProxyAPI 管理 API 的调用集中在 `cliproxy-connection-tester.ts` 一处，接口契约变动时改动面收敛在单一模块。

[external 模式 SSRF 隐患] → 外部实例地址由管理员输入，可能被诱导指向内网。缓解措施是 `external` 模式强制执行完整 SSRF 校验，与普通上游同等防护强度。

[管理密钥泄露面] → 连通性检测需在内存中解密管理密钥。缓解措施是密钥明文仅在检测函数调用栈内存活，不写日志、不进 API 响应、不缓存。

[双 schema 漂移] → PostgreSQL 与 SQLite 两套 schema 手工维护，易出现字段不一致。缓解措施是在 tasks 中将两套 schema 的字段定义列为同一任务的并行子项，并在类型检查与测试阶段交叉验证。

[连通性检测阻塞] → 检测请求面对不可达地址可能长时间挂起。缓解措施是为检测请求设置明确的超时上限（建议 10 秒），超时按地址不可达处理。

## Migration Plan

数据库迁移通过 `pnpm db:generate` 生成。`cliproxy_instances` 是全新表，迁移为纯新增，不触碰既有表，无数据回填需求。

部署顺序为先应用数据库迁移（`pnpm db:migrate`），再部署包含新 API 的应用代码。新表在被后续变更引用前不影响任何既有功能。

回滚策略：本变更新增的表与 API 相互独立且不被既有功能依赖，回滚时移除新 API 代码即可，`cliproxy_instances` 表可保留为空表不影响系统，无需逆向迁移。

## Open Questions

CLIProxyAPI 管理 API 的鉴权头部具体形式（`Authorization: Bearer` 还是自定义头部）需在实现连通性检测前以 CLIProxyAPI 源码或实测确认。当前设计假定为 Bearer 形式，若不符，调整集中在 `cliproxy-connection-tester.ts`。

`management_url` 是否需要进一步区分“后端可访问地址”与“浏览器可访问地址”。本变更暂不拆分，若后续 OAuth 登录变更确认浏览器侧需要独立地址，再以新变更追加字段。

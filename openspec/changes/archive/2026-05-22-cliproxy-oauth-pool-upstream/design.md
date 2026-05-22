## Context

`cliproxy-instance-config` 与 `cliproxy-oauth-account-management` 两个变更已交付 CLIProxyAPI 实例登记与 OAuth 账号管理。本变更让这些 OAuth 能力作为 AutoRouter 上游对外服务。

AutoRouter 的上游模型已相当完整：`upstreams` 表含 `baseUrl`、`apiKeyEncrypted`、`routeCapabilities`、`modelRules` 等字段，路由、熔断、计费、并发、请求日志机制均已就绪。一个 CLIProxyAPI 池上游本质上就是一个普通上游：代理地址指向 CLIProxyAPI 的服务商专属路径，鉴权使用 CLIProxyAPI 客户端 API Key，路由能力按服务商预设。

issue #142 给出的服务商代理路径如下：

```
Codex   池上游  →  {实例代理地址}/v1
                    能力 codex_cli_responses / openai_responses
Claude  池上游  →  {实例代理地址}/api/provider/anthropic/v1
                    能力 claude_code_messages / anthropic_messages
Gemini  池上游  →  {实例代理地址}/api/provider/google
                    能力 gemini_native_generate
```

因此本变更不重写路由与转发，重点是“一键创建上游”的预设逻辑、上游与 CLIProxyAPI 的关联建模，以及单账号固定路由。

## Goals / Non-Goals

**Goals:**

为 `upstreams` 表新增 CLIProxyAPI 关联字段，PostgreSQL 与 SQLite 双 schema 同步。

交付按服务商一键创建 OAuth 池上游的能力，复用既有 `createUpstream`。

交付将单个 OAuth 账号固定映射为上游的能力。

将 `cliproxy_instances` 删除校验扩展为同时检查 `upstreams` 引用。

交付上述能力的 Admin API。

**Non-Goals:**

不改动熔断、计费、请求日志机制，不引入新的路由决策逻辑。转发层仅为单账号上游增加模型名前缀注入这一处针对性改写。

不涉及前端界面与 sidecar 部署文件。

不修改 CLIProxyAPI 内部的账号调度逻辑，池上游内部账号选择由 CLIProxyAPI 负责。

## Decisions

### 决策一：上游关联字段

`upstreams` 表新增三个可空字段：

```
cliproxy_instance_id    所属 CLIProxyAPI 实例，可空，外键 → cliproxy_instances.id
cliproxy_auth_file_name 绑定的 OAuth 账号文件名，可空（仅单账号映射上游有值）
cliproxy_provider       CLI 服务商 codex / anthropic / gemini，可空
```

三个字段全部可空。既有普通上游这三个字段为空，行为不变。池上游设置 `cliproxy_instance_id` 与 `cliproxy_provider`；单账号映射上游额外设置 `cliproxy_auth_file_name`。

外键 `cliproxy_instance_id` 的 `onDelete` 采用 `set null`，配合应用层删除校验：应用层在实例仍被上游引用时拒绝删除，外键 `set null` 是兜底保护，避免悬空引用。

考虑过将关联信息塞进既有 `config` JSON 字段。该方案被否决，因为关联关系需要被查询（实例删除校验需要按 `cliproxy_instance_id` 反查上游），JSON 字段不利于此类查询与外键约束。

### 决策二：池上游一键创建

新增 `cliproxy-upstream-preset.ts`，提供按服务商创建池上游的能力。

```
   createCliproxyPoolUpstream(instanceId, provider, options)
   ════════════════════════════════════════════════════════
   1. 取实例行，校验存在
   2. baseUrl   = 实例 baseUrl + 服务商路径后缀
   3. apiKey    = 解密的实例客户端 API Key
   4. routeCapabilities = 服务商能力预设
   5. 复用 createUpstream 落库
   6. 落库后回填 cliproxy_instance_id 与 cliproxy_provider
```

服务商路径后缀与能力预设在模块内以常量表表达，集中维护。池上游创建复用既有 `createUpstream`，因此自动获得名称唯一校验、能力校验、计费倍率等既有行为。

`createUpstream` 入参不含 CLIProxyAPI 关联字段，因此关联字段在上游落库后通过一次 `update` 回填，避免改动 `createUpstream` 的公共入参签名而影响既有调用方。

### 决策三：单账号映射上游

将某个 OAuth 账号固定映射为上游，依赖 CLIProxyAPI 的账号前缀机制。前缀拼接形式已通过核对 CLIProxyAPI 源码确认：客户端发送的模型名须为 `<前缀>/<模型名>`，分隔符为正斜杠，前缀在前。CLIProxyAPI 在转发前由 `sdk/cliproxy/auth/conductor.go` 的 `rewriteModelForAuth` 自动剥离前缀。前缀通过管理 API `PATCH /v0/management/auth-files/fields` 的 `prefix` 字段写入，CLIProxyAPI 不会自动生成前缀，须由 AutoRouter 决定取值并主动写入；前缀自身不得包含正斜杠。

```
   createCliproxySingleAccountUpstream(instanceId, authFileName, options)
   ═══════════════════════════════════════════════════════════════════
   1. 取实例行与账号缓存记录，校验存在
   2. 确定该账号前缀:
        - 账号已有前缀则沿用
        - 账号无前缀则生成一个并经 cliproxy-auth-account-service
          调用 CLIProxyAPI 写入该账号
   3. 以对应服务商池上游配置为基础创建上游
   4. 设置 cliproxy_auth_file_name 标记为单账号上游
```

前缀的注入位置选择转发层而非模型规则。AutoRouter 的模型规则引擎中 `regex` 规则仅做匹配放行、不改写模型名，`alias` 规则仅对精确字符串做改写，无通配改写能力。若用 `alias` 逐模型改写，须在创建时拉取账号模型清单快照并随 CLIProxyAPI 侧模型增删持续同步，未列入快照的模型会被规则引擎拒绝。因此本变更不在模型规则中表达前缀，而在转发层注入。

转发层注入流程：代理在 `forwardWithFailover` 每次选定上游后，检查该上游的 `cliproxy_auth_file_name`。该字段非空时，按账号缓存记录取出前缀，将请求体中的模型名改写为 `<前缀>/<模型名>` 再发往 CLIProxyAPI；字段为空的普通上游与池上游不受影响。failover 切换上游时按新选上游重新判定，互不串扰。

前缀拼接形式集中为单一常量 `CLIPROXY_PREFIX_DELIMITER` 与单一构造函数 `buildCliproxyPrefixedModel`，CLIProxyAPI 后续若调整约定时改动面收敛在一处。模型名已自带前缀（已含正斜杠）时跳过注入，避免重复拼接。

### 决策四：实例删除校验扩展

`cliproxy-instance-crud.ts` 的 `deleteCliproxyInstance` 当前已校验缓存 OAuth 账号引用。本变更扩展为同时校验 `upstreams` 表中 `cliproxy_instance_id` 的引用，存在关联上游时抛出 `CliproxyInstanceInUseError`。

数据库外键 `set null` 是兜底，应用层显式校验给出可理解的错误信息。

### 决策五：Admin API

```
POST /api/admin/cliproxy/instances/[id]/pool-upstreams
     body { provider }                     创建服务商 OAuth 池上游

POST /api/admin/cliproxy/instances/[id]/auth-accounts/[accountName]/upstream
                                           将该账号映射为单账号上游
```

两个端点复用 `validateAdminAuth` 与既有错误响应约定，成功返回创建后的上游信息。

## Risks / Trade-offs

[CLIProxyAPI 账号前缀拼接形式] → 单账号路由依赖前缀在模型名中的拼接约定。该约定已通过核对 CLIProxyAPI 源码确认为 `<前缀>/<模型名>`。仍将拼接形式集中为单一常量与构造函数，使 CLIProxyAPI 后续若调整约定时改动面收敛在一处。

[关联字段回填两步写入] → 上游先落库再回填关联字段，中间失败会产生关联字段为空的池上游。缓解措施是回填失败时记录告警，该上游仍是可用的普通上游，可由管理员手动补充或删除重建。

[服务商路径后缀随 CLIProxyAPI 变化] → 路径后缀是 CLIProxyAPI 的对外约定。缓解措施是后缀集中为常量表，CLIProxyAPI 调整时改动集中。

[池上游与既有上游并存的选路] → 池上游是普通上游，参与既有按能力与模型的选路。缓解措施是依赖既有 `upstream-route-capabilities` 的能力匹配与候选筛选机制，本变更不引入新的选路逻辑。

## Migration Plan

数据库迁移通过 `pnpm db:generate` 与 `pnpm db:generate:sqlite` 生成。`upstreams` 表新增三个可空字段，迁移为纯列新增，既有数据不受影响，无回填需求。

部署顺序为先应用迁移再部署应用代码。

回滚策略：新增字段可空且仅被本变更的新代码使用，回滚移除新代码即可，字段可保留。删除校验扩展为新增分支，回滚后退回仅校验账号引用。

## Open Questions

CLIProxyAPI 账号前缀在模型名中的拼接形式已核实为 `<前缀>/<模型名>`，详见决策三，无遗留待核实项。

池上游是否需要默认填充模型清单。本变更创建的池上游沿用既有上游的模型发现机制，不在创建时强制拉取模型清单，由管理员按需触发既有的模型发现流程。

---
title: 数据库 schema
outline: deep
---

# 数据库 schema

AutoRouter 用 Drizzle ORM 维护数据库 schema，PostgreSQL 是首选生产数据库、SQLite 仅用于本地开发沙箱。所有表 / 关系 / 类型在源码里都有可靠的单一定义，转发链路、统计聚合、计费快照都从这些表读写。

这一页给出表清单、表与表的关系、JSON 列存储什么 TypeScript 类型、迁移如何管理、以及客户端怎么拿到 `db` 实例。所有引用都指向 `master` 分支源码。某张表在路由 / 计费 / 录制中是怎么被消费的，参见对应的架构页或使用文档。

## 两个 schema 文件，一个 barrel

数据库 schema 同时维护两份：

- `src/lib/db/schema-pg.ts` —— PostgreSQL 版本，**全部生产能力以这一份为准**
- `src/lib/db/schema-sqlite.ts` —— SQLite 版本，仅供本地沙箱
- `src/lib/db/schema.ts` —— barrel，按 `config.dbType` 在两份之间切换

barrel 文件做的事情只有一件：

```ts
// src/lib/db/schema.ts:1-5
import { config } from "../utils/config";
import * as pgSchema from "./schema-pg";
import * as sqliteSchema from "./schema-sqlite";

const schema = (config.dbType === "sqlite" ? sqliteSchema : pgSchema) as typeof pgSchema;
```

整个项目所有业务代码都从 `@/lib/db` 这个 barrel 导入表对象与类型，不直接 import `schema-pg` 或 `schema-sqlite`，保证一份业务代码同时能跑在两套数据库上。

::: warning SQLite 不是平替
注释（`src/lib/db/index.ts:14`）明确说明：SQLite 在结构上对常规 CRUD 兼容，但 `PERCENTILE_CONT` 等 PG 专用 SQL 在 SQLite 上不可用。统计聚合（`/api/admin/stats/*`）在 SQLite 上会有部分查询直接报错。线上务必用 PostgreSQL。
:::

## 表清单

`schema-pg.ts` 内总共定义 20 张表，按用途分四组：

### 客户端 Key 与上游

| 表                       | 行号    | 用途                                                    |
| ------------------------ | ------- | ------------------------------------------------------- |
| `api_keys`               | 44-69   | 下游客户端 Key 与限额规则                               |
| `upstreams`              | 74-128  | 上游 provider 配置（详见 [上游模型](./upstream-model)） |
| `upstream_health`        | 133-152 | 上游健康状态与探测结果（一对一）                        |
| `upstream_probe_results` | 157-195 | 协议能力 / 客户端 profile 的诊断探测结果                |
| `api_key_upstreams`      | 200-217 | Key ↔ Upstream 多对多授权                               |

### 熔断器与失败规则

| 表                       | 行号    | 用途                                                                    |
| ------------------------ | ------- | ----------------------------------------------------------------------- |
| `circuit_breaker_states` | 222-251 | 每个上游一行的熔断器状态机（详见 [失败转移与熔断](./failover-circuit)） |
| `upstream_failure_rules` | 257-274 | 命中后免于触发熔断的失败规则（含全局与上游局部）                        |

### 请求日志与录制

| 表                           | 行号    | 用途                                                                 |
| ---------------------------- | ------- | -------------------------------------------------------------------- |
| `request_logs`               | 279-342 | 每次请求一行的审计日志（详见 [请求日志与统计](../usage/logs-stats)） |
| `traffic_recording_settings` | 347-355 | 流量录制全局单例配置                                                 |
| `traffic_recordings`         | 360-390 | 录制文件索引（详见 [请求录制](../usage/request-recording)）          |

### 计费与价格

| 表                               | 行号    | 用途                                           |
| -------------------------------- | ------- | ---------------------------------------------- |
| `billing_model_prices`           | 395-417 | 自动同步的模型价格目录（openrouter / litellm） |
| `billing_manual_price_overrides` | 422-436 | 管理后台手动覆盖的价格                         |
| `billing_tier_rules`             | 443-469 | 按上下文长度分档计费规则                       |
| `billing_price_sync_history`     | 474-486 | 价格同步任务运行历史                           |
| `request_billing_snapshots`      | 544-587 | 每条 `request_logs` 一份的计费快照（一对一）   |

### 后台任务与扩展

| 表                          | 行号    | 用途                                                                        |
| --------------------------- | ------- | --------------------------------------------------------------------------- |
| `background_sync_tasks`     | 491-514 | 后台任务调度状态（单例 per task name）                                      |
| `background_sync_task_runs` | 519-539 | 后台任务每次运行的历史                                                      |
| `compensation_rules`        | 592-607 | 出站 header 补偿 / 改写规则                                                 |
| `cliproxy_instances`        | 718-738 | CLIProxyAPI 实例注册（详见 [CLIProxyAPI 集成位置](./cliproxy-integration)） |
| `cliproxy_auth_accounts`    | 744-771 | 从 CLIProxyAPI 缓存的 OAuth 账号元数据                                      |

::: tip 没有 users 表
`api_keys.user_id` 列保留为 nullable，无外键约束，源码 `schema-pg.ts:53` 注释 `// Reserved for future user system`。当前认证只有「客户端 API Key」与「Admin Bearer Token」两种身份，没有完整的用户系统。
:::

## 外键与级联策略

| 子表                        | 列                        | 父表                 | onDelete   |
| --------------------------- | ------------------------- | -------------------- | ---------- |
| `upstreams`                 | `cliproxy_instance_id`    | `cliproxy_instances` | `set null` |
| `upstream_health`           | `upstream_id` (UNIQUE)    | `upstreams`          | `cascade`  |
| `upstream_probe_results`    | `upstream_id`             | `upstreams`          | `cascade`  |
| `api_key_upstreams`         | `api_key_id`              | `api_keys`           | `cascade`  |
| `api_key_upstreams`         | `upstream_id`             | `upstreams`          | `cascade`  |
| `circuit_breaker_states`    | `upstream_id` (UNIQUE)    | `upstreams`          | `cascade`  |
| `upstream_failure_rules`    | `upstream_id` (nullable)  | `upstreams`          | `cascade`  |
| `request_logs`              | `api_key_id`              | `api_keys`           | `set null` |
| `request_logs`              | `upstream_id`             | `upstreams`          | `set null` |
| `traffic_recordings`        | `request_log_id`          | `request_logs`       | `set null` |
| `traffic_recordings`        | `api_key_id`              | `api_keys`           | `set null` |
| `traffic_recordings`        | `upstream_id`             | `upstreams`          | `set null` |
| `request_billing_snapshots` | `request_log_id` (UNIQUE) | `request_logs`       | `cascade`  |
| `request_billing_snapshots` | `api_key_id`              | `api_keys`           | `set null` |
| `request_billing_snapshots` | `upstream_id`             | `upstreams`          | `set null` |
| `cliproxy_auth_accounts`    | `instance_id`             | `cliproxy_instances` | `cascade`  |

**一对一约束**：靠 UNIQUE 字段实现，上面表里标 `(UNIQUE)` 的三行——`upstream_health.upstream_id`、`circuit_breaker_states.upstream_id`、`request_billing_snapshots.request_log_id`——每条父记录最多对应一条子记录。

**级联与设空的语义**：

- `cascade`：父记录被删，子记录跟着被物理删除。删除一个 `upstreams` 行会同时清掉它的健康状态、探测结果、熔断器、授权关系等。
- `set null`：父记录被删，子记录的外键列被设为 `NULL`，子记录本身保留。删除一个 `upstreams` 后，历史 `request_logs` 和 `request_billing_snapshots` 仍然存在，但 `upstream_id` 变成 NULL，统计页面会显示「未知上游」。
- `cliproxy_instance_id` 用 `set null` 是为了允许「删除 CLIProxyAPI 实例时不影响上游配置本身」——但应用层在 `deleteCliproxyInstance` 会先做引用检查并抛 409，FK set null 实际只在绕过应用层删除时才会触发（详见 [使用 / CLIProxyAPI 外部 vs sidecar](../usage/cliproxy-modes)）。

## JSON 列与 TypeScript 类型

Drizzle 的 `json()` 列通过 `.$type<T>()` 注解绑定 TypeScript 类型，但**数据库层不做运行时校验**，类型安全只在编译期成立。所有 JSON 列：

| 表                       | 列                    | 注解类型                                           |
| ------------------------ | --------------------- | -------------------------------------------------- |
| `api_keys`               | `allowed_models`      | `string[] \| null`                                 |
| `api_keys`               | `spending_rules`      | `{period_type, limit, period_hours?}[] \| null`    |
| `upstreams`              | `route_capabilities`  | `string[] \| null`                                 |
| `upstreams`              | `allowed_models`      | `string[] \| null`                                 |
| `upstreams`              | `model_redirects`     | `Record<string,string> \| null`                    |
| `upstreams`              | `model_discovery`     | `UpstreamModelDiscoveryConfig \| null`             |
| `upstreams`              | `model_catalog`       | `UpstreamModelCatalogEntry[] \| null`              |
| `upstreams`              | `model_rules`         | `UpstreamModelRule[] \| null`                      |
| `upstreams`              | `queue_policy`        | `UpstreamQueuePolicy \| null`                      |
| `upstreams`              | `failure_rule_config` | `{useGlobalRules: boolean} \| null`                |
| `upstreams`              | `affinity_migration`  | `{enabled, metric, threshold} \| null`             |
| `upstreams`              | `spending_rules`      | `{period_type, limit, period_hours?}[] \| null`    |
| `upstream_failure_rules` | `match`               | `UpstreamFailureRuleMatch`                         |
| `circuit_breaker_states` | `config`              | `{failureThreshold?,…,streamIdleTimeout?} \| null` |
| `request_logs`           | `header_diff`         | `HeaderDiff \| null`                               |
| `compensation_rules`     | `capabilities`        | `string[]`                                         |
| `compensation_rules`     | `sources`             | `string[]`                                         |
| `cliproxy_auth_accounts` | `raw_metadata`        | `Record<string, unknown> \| null`                  |

`UpstreamModelDiscoveryConfig` / `UpstreamModelCatalogEntry` / `UpstreamModelRule` 等导入自 `@/lib/services/upstream-model-types`（`schema-pg.ts:16-21`）。`UpstreamFailureRuleMatch` 与 `UpstreamFailureRuleConfig` 是 schema 文件内的本地类型（`schema-pg.ts:29-39`）。

::: warning request_logs 的 JSON 实际存为 text
`request_logs.failover_history`、`routing_decision`、`thinking_config` 三列在 schema 中是 `text` 而不是 `json`（`schema-pg.ts:310-311`），写入时调用 `JSON.stringify`、读取时手动 `JSON.parse`。这是历史选择，目的是兼容 SQLite 与避免某些 PG 版本对大 JSON 文档的索引问题。新加字段应优先用 `json()`，并补 `$type<>()` 注解。
:::

## 索引

显式定义的非 PK / 非 UNIQUE 单列索引按表汇总：

| 表                               | 索引列                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `api_keys`                       | `key_hash`, `is_active`                                                             |
| `upstreams`                      | `name`, `is_active`, `priority`                                                     |
| `upstream_health`                | `upstream_id`, `is_healthy`                                                         |
| `upstream_probe_results`         | `upstream_id`, `status`, `checked_at`                                               |
| `api_key_upstreams`              | `api_key_id`, `upstream_id`                                                         |
| `circuit_breaker_states`         | `upstream_id`, `state`                                                              |
| `upstream_failure_rules`         | `upstream_id`, `enabled`, `priority`                                                |
| `request_logs`                   | `api_key_id`, `upstream_id`, `created_at`, `routing_type`                           |
| `traffic_recordings`             | `request_log_id`, `api_key_id`, `upstream_id`, `status_code`, `model`, `created_at` |
| `billing_model_prices`           | `model`, `source`                                                                   |
| `billing_manual_price_overrides` | `model`                                                                             |
| `billing_tier_rules`             | `model`, `source`                                                                   |
| `billing_price_sync_history`     | `created_at`                                                                        |
| `background_sync_tasks`          | `enabled`, `next_run_at`                                                            |
| `background_sync_task_runs`      | `task_name`, `started_at`, `status`                                                 |
| `request_billing_snapshots`      | `request_log_id`, `billing_status`, `model`, `created_at`                           |
| `compensation_rules`             | `enabled`                                                                           |
| `cliproxy_instances`             | `name`, `enabled`                                                                   |
| `cliproxy_auth_accounts`         | `instance_id`                                                                       |

另有复合 UNIQUE 索引（同时充当复合查询索引）：

| 表                       | 复合唯一键                                                           |
| ------------------------ | -------------------------------------------------------------------- |
| `upstream_probe_results` | `(upstream_id, route_capability, client_profile, probe_template_id)` |
| `api_key_upstreams`      | `(api_key_id, upstream_id)`                                          |
| `billing_model_prices`   | `(model, source)`                                                    |
| `billing_tier_rules`     | `(model, source, threshold_input_tokens)`                            |
| `cliproxy_auth_accounts` | `(instance_id, auth_file_name)`                                      |

## 关系定义

Drizzle 的 `relations()` 没有放在独立文件，而是直接写在 `schema-pg.ts:609-782` 的尾部。每张表的关联关系（含一对多 / 多对一 / 多对多）都声明在那里，可以直接在 `db.query.api_keys.findFirst({ with: { upstreams: true } })` 这样的查询里使用。

## 迁移目录

PostgreSQL 与 SQLite 各自有独立的迁移目录：

| 目录              | 用途            | 文件数                          |
| ----------------- | --------------- | ------------------------------- |
| `drizzle/`        | PostgreSQL 迁移 | 当前 40 个 SQL（最高编号 0037） |
| `drizzle-sqlite/` | SQLite 迁移     | 当前 16 个 SQL                  |

两套迁移**并不严格一一对应**，因为某些 PG 特定能力（json 类型、`gen_random_uuid()`、`timestamptz`）在 SQLite 上需要不同的表达方式甚至跳过。每次给 `schema-pg.ts` 加字段后，标准流程：

```bash
# 1. 生成 PG 迁移
pnpm db:generate

# 2. 手动同步改 schema-sqlite.ts，并单独生成 SQLite 迁移
pnpm exec drizzle-kit generate --config=drizzle-sqlite.config.ts
```

`drizzle/meta/_journal.json` 记录 PG 迁移的应用顺序。最近五次 PG 迁移示例：

| idx | tag                          | 大致改动                                                                                           |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| 33  | `0033_shocking_emma_frost`   | 创建 `traffic_recording_settings` 与 `traffic_recordings`                                          |
| 34  | `0034_youthful_sally_floyd`  | 创建 `cliproxy_instances`                                                                          |
| 35  | `0035_powerful_nightcrawler` | 创建 `cliproxy_auth_accounts`                                                                      |
| 36  | `0036_furry_warhawk`         | 把 `cliproxy_auth_accounts.provider` / `status` 列拓宽为 `text`                                    |
| 37  | `0037_familiar_nico_minoru`  | 给 `upstreams` 加 `cliproxy_instance_id` / `cliproxy_auth_file_name` / `cliproxy_provider` 列 + FK |

## 客户端单例与连接池

源码：`src/lib/db/index.ts`。

`db` 通过懒加载 Proxy 暴露给业务代码（`index.ts:82`），第一次访问时按 `config.dbType` 选择底层驱动：

- **PostgreSQL（生产）**：用 `postgres` 库（postgres.js）建立连接池
  - `max: 10`（最多 10 个连接）
  - `idle_timeout: 20` 秒
  - `connect_timeout: 10` 秒
  - 源码 `index.ts:38-43`
- **SQLite（开发）**：动态 `require('@libsql/client')`（`index.ts:59-63`），按 `SQLITE_DB_PATH` 指向本地文件

`db` 是单例，跨整个 Node.js 进程共享。导出还包括 `closeDatabase()`（`index.ts:92`）用于优雅停机时关闭连接池，主要在测试 setup / teardown 里调用。

## 类型导出

每张表都同时导出 `$inferSelect`（读类型）和 `$inferInsert`（写类型），命名约定 `Xxx` / `NewXxx`：

```ts
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
```

类型定义在 `schema-pg.ts:784-821`，barrel 在 `schema.ts:41-78` 重新命名导出，业务代码统一从 `@/lib/db` 导入。`src/types/api.ts` 用这些基础类型组合出 API 请求 / 响应 DTO，所有 admin 路由（`src/app/api/admin/**`）和服务层都消费它们。

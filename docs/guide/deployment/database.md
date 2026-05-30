---
title: 数据库选型与初始化
outline: deep
---

# 数据库选型与初始化

AutoRouter 同时维护 PostgreSQL 与 SQLite 两份 Drizzle schema，但二者并不是平替：PostgreSQL 是生产唯一推荐项，SQLite 仅服务本地开发沙箱。本页说明两种选型的差别、首次初始化命令、`db:push` 与 `db:migrate` 的取舍、迁移文件结构、以及 CI 上如何验证迁移幂等。

不在本页范围内的内容：表清单与字段含义见架构介绍中的 [数据库 schema](../architecture/database-schema)；备份与恢复见 [数据持久化与备份](./persistence-backup)；环境变量与默认值见 [环境变量参考](./env-reference)。

## 选型对照

| 维度                          | PostgreSQL                                              | SQLite                                       |
| ----------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| 适用场景                      | 生产部署、所有公开发行版本                              | 本地开发、单机演示、E2E 测试                 |
| Drizzle dialect               | `postgresql`                                            | `sqlite`                                     |
| Schema 入口                   | `src/lib/db/schema.ts`（barrel，经其导入 schema-pg.ts） | `src/lib/db/schema-sqlite.ts`                |
| Migration 目录                | `drizzle/`                                              | `drizzle-sqlite/`                            |
| Drizzle config                | `drizzle.config.ts`                                     | `drizzle-sqlite.config.ts`                   |
| 连接来源                      | `DATABASE_URL`                                          | `SQLITE_DB_PATH`（默认 `./data/dev.sqlite`） |
| Generate 命令                 | `pnpm db:generate`                                      | `pnpm db:generate:sqlite`                    |
| Migrate 命令                  | `pnpm db:migrate`                                       | `pnpm db:migrate:sqlite`                     |
| 统计聚合（`PERCENTILE_CONT`） | 完整支持                                                | 部分查询直接报错                             |
| 并发与连接池                  | 多连接、ACID                                            | 单文件，多连接需要打开 WAL                   |
| 部署形态                      | `docker-compose.yml` 默认启动 `postgres:16-alpine` 容器 | 应用进程直接读写本地文件                     |

::: warning SQLite 不是平替
`src/lib/db/index.ts:13` 的注释明确指出：SQLite 在结构上对常规 CRUD 兼容；`index.ts:71` 进一步说明 `PERCENTILE_CONT` 等 PG 专用 SQL 在 SQLite 上不可用，统计聚合（`/api/admin/stats/*`）会有部分查询直接报错。任何生产部署都必须使用 PostgreSQL。SQLite 仅服务本地开发，避免在没有 Docker 的环境下也能跑 E2E。
:::

## DB_TYPE 自动推断与 fail-fast

`src/lib/utils/config.ts:72` 的 `loadConfig()` 函数把 `dbType` 默认为「有 `DATABASE_URL` 时取 `postgres`，否则取 `sqlite`」。也就是说：

- 设置了 `DATABASE_URL` 而未显式声明 `DB_TYPE`：按 PostgreSQL 处理。
- 未设置 `DATABASE_URL` 也未显式声明 `DB_TYPE`：按 SQLite 处理。
- 显式 `DB_TYPE=postgres`：必须再提供 `DATABASE_URL`，否则启动期校验失败。
- 显式 `DB_TYPE=sqlite`：使用 `SQLITE_DB_PATH`（默认 `./data/dev.sqlite`）。

`src/lib/utils/config.ts:99-105` 还有一道生产环境的 fail-fast 守卫：当 `NODE_ENV=production` 且既没有 `DB_TYPE` 又没有 `DATABASE_URL` 时，启动期直接抛出错误，避免静默回退到 SQLite 然后埋下 `PERCENTILE_CONT` 等运行期失败。

## PostgreSQL 初始化

Docker Compose 部署是 PostgreSQL 的默认形态。`docker-compose.yml` 中已经预置 `db` 服务（`postgres:16-alpine`），与 `autorouter` 服务挂在同一 `autorouter-net` 网络。最小可启动 `.env` 仅需：

```env
POSTGRES_USER=autorouter
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=autorouter
DATABASE_URL=postgresql://autorouter:<strong-password>@db:5432/autorouter
```

`DATABASE_URL` 中的密码必须与 `POSTGRES_PASSWORD` 字面一致——`docker-compose.yml` 把这两个值分别透传给 `db` 与 `autorouter` 容器，二者不会自动同步。任何一侧改动都需要同步另一侧并重启栈，否则应用容器会持续报 `password authentication failed`。

启动命令：

```bash
docker compose up -d
```

`autorouter` 容器对 `db.condition: service_healthy` 有 `depends_on` 约束，会等 `pg_isready` 通过后才启动。容器 entrypoint（`scripts/docker-entrypoint.sh`）在应用启动**之前**会自动跑一遍迁移——脚本内嵌一段不依赖 `drizzle-kit` 的自实现 migration runner，按文件名顺序 apply `drizzle/*.sql`，并把已 apply 的迁移哈希记到 `__drizzle_migrations` 表里。这意味着每次 `docker compose up -d`、`docker compose restart autorouter` 或新版本镜像首启都会增量 apply 新迁移，不需要部署人手工触发 `pnpm db:migrate`。

::: tip 手工跑迁移的几种场景
绝大多数运行期场景由 entrypoint 自动处理。只有在下列特殊情况下才需要手工干预：

- 开发期对本地 SQLite 操作：`pnpm db:migrate:sqlite`。
- 在容器外、对 PG 单独 apply 某条 SQL：`docker compose exec db psql -U autorouter -d autorouter -f /path/to/migration.sql`。
- 跑 `pnpm db:migrate` / `drizzle-kit migrate` 需要 dev 依赖，**生产容器内不可用**——`Dockerfile` 的 standalone runner stage 只 copy `postgres` 这一个 node_modules 子包，`drizzle-kit` 是 devDependency 不进镜像。需要在本地或 CI runner 上跑。

:::

### 本地 PostgreSQL（非 Docker）

直接连本机 PostgreSQL 时，把 `DATABASE_URL` 改为 host 是 `localhost`：

```env
DATABASE_URL=postgresql://autorouter:password@localhost:5432/autorouter
```

在容器内填 `localhost` 会指向应用容器自身而不是数据库——只有非容器场景才用 `localhost`。在容器里跑应用、外部跑 PG 的混合形态，需要用宿主机 IP 或 `host.docker.internal`。

## SQLite 初始化

SQLite 部署不需要任何编排，应用启动时按 `SQLITE_DB_PATH`（默认 `./data/dev.sqlite`）创建或打开数据库文件。最简单的本地开发：

```bash
pnpm db:migrate:sqlite     # 用 scripts/db/migrate-sqlite.mjs 对齐 drizzle-sqlite/ 下迁移
pnpm dev                   # 启动 Next.js dev server
```

如需切换 SQLite 文件位置：

```env
DB_TYPE=sqlite
SQLITE_DB_PATH=./data/scratch.sqlite
```

Playwright E2E（`playwright.e2e.config.ts:19`）也走 SQLite 路径：webServer 命令为 `pnpm db:migrate:sqlite && pnpm dev --port ${port}`，确保每次 E2E 跑前数据库 schema 都是最新。

## 迁移流程

Drizzle 把 schema 变更通过 SQL 迁移文件管理。常用命令对照：

| 命令                        | 作用                                                                          |
| --------------------------- | ----------------------------------------------------------------------------- |
| `pnpm db:generate`          | 比对 `schema.ts`（PG dialect）与 `drizzle/` 现状，生成新的 PG 迁移文件        |
| `pnpm db:generate:sqlite`   | 比对 `schema-sqlite.ts` 与 `drizzle-sqlite/` 现状，生成新的 SQLite 迁移文件   |
| `pnpm db:migrate`           | 把 `drizzle/` 下未 apply 的迁移按序施加到 `DATABASE_URL` 指向的 PG            |
| `pnpm db:migrate:sqlite`    | 把 `drizzle-sqlite/` 下未 apply 的迁移施加到 `SQLITE_DB_PATH` 文件            |
| `pnpm db:check:consistency` | 校验「`drizzle/` 与 schema-pg」「`drizzle-sqlite/` 与 schema-sqlite」是否一致 |
| `pnpm db:push`              | 跳过迁移文件，直接把 schema 推到数据库；仅供本地快速迭代用                    |
| `pnpm db:studio`            | 启动 Drizzle Studio 可视化查看数据                                            |

### `db:generate` 与 `db:push` 的取舍

`db:push` 直接把 schema diff 应用到数据库，不生成迁移文件。它的速度优势仅在本地开发循环——「改一行 schema、看一眼 Studio」。**任何要写入 git 的 schema 变更都必须走 `db:generate`**：

1. `db:push` 不留任何审计 / 回滚痕迹，迁移历史里缺这一步，后续在其他环境的迁移就对不齐。
2. `db:push` 不会同时维护 `drizzle-sqlite/` 那一份，会让两份 schema 漂移。
3. CI 的 `migration` job 通过 `db:check:consistency` 校验 schema 与迁移目录一致性，`db:push` 留下的差异会被 CI 直接拒绝。

### 标准 schema 变更流程

修改 `src/lib/db/schema-pg.ts`（与 `schema-sqlite.ts` 中对应字段）后：

```bash
pnpm db:generate
pnpm db:generate:sqlite

# 两次 generate 都产出文件后再统一 apply 验证
pnpm db:migrate
pnpm db:migrate:sqlite
```

把新生成的 `drizzle/<id>_*.sql`、`drizzle/meta/<id>_snapshot.json`、`drizzle-sqlite/...` 一并 commit。`schema-pg.ts` 与 `schema-sqlite.ts` 不允许只改一边——否则 `db:check:consistency` 直接报错。

### 迁移目录结构

```
drizzle/
├── 0000_fresh_blizzard.sql
├── 0001_thankful_sinister_six.sql
├── ...
└── meta/
    ├── _journal.json
    ├── 0000_snapshot.json
    └── ...

drizzle-sqlite/
├── 0000_broken_post.sql
├── ...
└── meta/
    ├── _journal.json
    └── ...
```

`meta/_journal.json` 是 Drizzle 维护的迁移登记表，每次 `db:generate` 会追加一条目；`meta/<id>_snapshot.json` 是当时的 schema 快照，下次 `db:generate` 用它跟当前 schema 比对得出 diff。

::: tip 不要手工编辑迁移 SQL
迁移文件由 `drizzle-kit` 生成。手工修改 SQL 会让下一次 `db:generate` 的 diff 计算偏离实际数据库状态，最终在 `db:check:consistency` 上失败。若需要补充非默认行为（例如在 PG 上加 `CONCURRENTLY` 索引），通常做法是：先 `db:generate` 拿到基线迁移，再在该 SQL 文件末尾「追加」一行而非「重写」前面的内容，并保留 meta snapshot 不变。
:::

## CI 上的迁移校验

`.github/workflows/verify.yml` 中的 `migration` job 拉起一个真实 `postgres:16-alpine` 服务容器并依次执行：

1. `pnpm db:check:consistency`：脚本 `scripts/ci/check-drizzle-consistency.mjs` 内部对每个 dialect（`postgres` + `sqlite`）都重新跑一次 `db:generate*`，若生成结果与已 commit 的 SQL / snapshot 不同则失败。
2. `pnpm db:migrate`：把 `drizzle/` 全量 apply 到空 PG。
3. `pnpm db:migrate`：第二次 apply，验证幂等性。重复 apply 不能产生任何 diff 或副作用。

`migration` 失败的两类常见情形：

- `db:check:consistency` 不通过：通常是只改了 `schema-pg.ts` 没改 `schema-sqlite.ts`，或者反过来。修复方式是把两份 schema 改齐并重新 `db:generate*`。
- `db:migrate` 第二次失败：迁移文件中存在非幂等操作（例如 `CREATE TABLE` 没加 `IF NOT EXISTS`、`INSERT` 未做去重）。Drizzle 默认生成的 SQL 是幂等的，遇到这种情况通常是手工编辑过迁移 SQL。

## 与升级 / 回滚的关系

升级到新镜像 tag 时，迁移由 autorouter 容器 entrypoint 在启动期自动 apply（见上文）。这条自动路径对**前向兼容**的迁移完全够用：

- **前向兼容的迁移**：新版本仅新增列 / 新增可空字段 / 新增表 / 索引变化。`docker compose up -d` 切镜像 → entrypoint 自动 apply 新迁移 → 应用启动。中间无需手工干预。

但**破坏性迁移**（删列、改类型、重命名）需要额外注意：

- 旧版本应用代码仍指向旧字段，新镜像 entrypoint 一旦 apply 破坏性迁移，旧版本副本（例如蓝绿部署中尚未切流量的旧实例）会立刻看到字段缺失而崩溃。
- 回滚到旧 tag 时，旧版本应用启动**不会自动反向迁移**——entrypoint 只 forward apply，不 rollback；旧版本会直接尝试读不存在的字段或写已经被改类型的列。

因此涉及破坏性迁移的版本切换在升级前必须先做 `pg_dump`（备份方式见 [数据持久化与备份](./persistence-backup)）。回滚路径只能依靠把 dump 回灌到迁移前状态，再切回旧镜像；没有备份就没有破坏性回滚。详细策略见 [升级与回滚](./upgrade-rollback)。

## 来源对照

- `drizzle.config.ts`、`drizzle-sqlite.config.ts`：dialect 与连接来源
- `src/lib/db/index.ts`、`src/lib/db/schema.ts`：barrel 与运行期 schema 选择
- `src/lib/utils/config.ts`：`DB_TYPE` 自动推断与生产 fail-fast 守卫
- `package.json` scripts 段：`db:generate` / `db:migrate` / `db:check:consistency` / `db:push` 命令定义
- `scripts/ci/check-drizzle-consistency.mjs`、`scripts/db/migrate-sqlite.mjs`：迁移一致性与 SQLite 迁移实现
- `scripts/docker-entrypoint.sh`：容器启动期自动 apply `drizzle/*.sql` 的内嵌 migration runner（不依赖 `drizzle-kit`）
- `Dockerfile`：standalone runner stage 只 copy `postgres` 子包，确认 `drizzle-kit` 不在生产镜像内
- `.github/workflows/verify.yml` 的 `migration` job：CI 层迁移校验
- `playwright.e2e.config.ts`：E2E webServer 命令中如何对齐 SQLite schema

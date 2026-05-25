---
title: 升级与回滚
outline: deep
---

# 升级与回滚

AutoRouter 的版本切换围绕「替换 `AUTOROUTER_IMAGE` 指向的镜像 tag」展开。镜像本身由 `release.yml` 在 ghcr.io 上发布，部署侧只需把 `.env` 中的 tag 改到目标版本再 `docker compose up -d` 即可生效。`.env` 的其他字段、数据库内容、加密密钥、CLIProxy OAuth 凭据等都保持原样。本页给出源码 + docker compose、CI + 远端 SSH 两条路径下的升级与回滚步骤，覆盖 schema 兼容、数据卷复用、sidecar 同步几个关键约束。

不在本页范围内的内容：CI 工作流本身的触发与配置见 [GitHub Actions CI 部署](./github-actions)；备份策略见 [数据持久化与备份](./persistence-backup)；schema 兼容性见 [数据库选型与初始化](./database)。

## 镜像 tag 与版本号

`release.yml`（`.github/workflows/release.yml:96-100`）发布的镜像 tag 形态如下：

| tag 形态                     | 何时存在         | 含义                              |
| ---------------------------- | ---------------- | --------------------------------- |
| `vMAJOR.MINOR.PATCH`         | 每个稳定 release | 完整版本号，长期固定              |
| `MAJOR.MINOR.PATCH`          | 每个稳定 release | 同上，semver 标准形式             |
| `MAJOR.MINOR`                | 仅稳定 release   | minor 滚动 tag                    |
| `latest`                     | 仅稳定 release   | 始终指向最新稳定版                |
| `vMAJOR.MINOR.PATCH-alpha.N` | 预发布           | 不会触碰 `latest` / `MAJOR.MINOR` |
| `vMAJOR.MINOR.PATCH-beta.N`  | 预发布           | 不会触碰 `latest` / `MAJOR.MINOR` |

升级与回滚都通过把 `AUTOROUTER_IMAGE` 改成 `ghcr.io/g1331/autorouter:<tag>` 来完成。生产部署强烈建议显式 pin 到具体 `v*` tag 或 `@sha256:<digest>`，避免 `latest` 在某次 push 后悄悄漂移。版本号与 release notes 规则见架构介绍中的 [版本与发布](../architecture/release)。

## 升级前的兼容性确认

每次升级前先看 release notes，确认两件事：

1. **数据库迁移是否包含破坏性变更**：删列、改类型、重命名等。release notes 中标记为 `BREAKING` 的迁移需要走「先迁后切」的流程（详见下文）。
2. **环境变量是否变化**：新增的必填字段、被移除的字段、默认值变更。`.env` 缺失字段会导致启动期校验失败。

当前 release 在 GitHub Releases 页面的 `## Generated Notes` 段会按 `New Features` / `Bug Fixes` / `Security` / `Performance` / `Documentation` / `Tests` / `Maintenance` / `Other Changes` 分组（详见 [版本与发布](../architecture/release)）。`Bug Fixes` 中含「迁移」字样的条目要特别留意。

## 路径 A：源码 + docker compose 升级

```bash
cd /opt/autorouter            # 或本地仓库目录

# 1. 拉一次目标 tag 的最新 docker-compose.yml（不同版本之间可能有调整）
RELEASE_TAG=v0.2.0
curl -fsSL -o docker-compose.yml \
  "https://raw.githubusercontent.com/g1331/AutoRouter/${RELEASE_TAG}/docker-compose.yml"

# 2. 在 .env 中切换 AUTOROUTER_IMAGE
sed -i "s|^AUTOROUTER_IMAGE=.*|AUTOROUTER_IMAGE=ghcr.io/g1331/autorouter:${RELEASE_TAG}|" .env

# 3. 拉镜像
docker compose pull autorouter

# 4. 启动
docker compose up -d
```

带 sidecar 的部署多两步：

```bash
# 1b. 同步 sidecar 叠加文件（升级新 release 的 cliproxy 模板/脚本变化）
curl -fsSL -o docker-compose.cliproxy.yml \
  "https://raw.githubusercontent.com/g1331/AutoRouter/${RELEASE_TAG}/docker-compose.cliproxy.yml"
curl -fsSL -o cliproxy/config.yaml.template \
  "https://raw.githubusercontent.com/g1331/AutoRouter/${RELEASE_TAG}/cliproxy/config.yaml.template"
curl -fsSL -o cliproxy/docker-entrypoint.sh \
  "https://raw.githubusercontent.com/g1331/AutoRouter/${RELEASE_TAG}/cliproxy/docker-entrypoint.sh"
chmod +x cliproxy/docker-entrypoint.sh

# 4b. 双 -f 启动
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d
```

`docker compose up -d` 看到镜像变化会重建对应容器；`postgres-data`、`autorouter-data`、`cliproxy-auth`、`cliproxy-logs` 等 named volume 是持久的，重建容器不会清空。

### 升级后 smoke

```bash
curl http://localhost:3331/api/health
```

预期返回中 `version` 字段为目标版本号（不带 `v` 前缀）。再带上 admin token 验证管理 API：

```bash
curl -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  http://localhost:3331/api/admin/health?active_only=true
```

返回 `200` + 健康上游列表 = 应用、数据库、管理鉴权三道关都通了。

## 路径 B：CI + 远端 SSH 升级

`deploy-personal.yml` 把上述步骤自动化。每次升级：

1. 等 `release.yml` 把新 tag 推到 ghcr.io（GitHub Actions 页面看到对应 release 即可）。
2. 在 GitHub Actions 页面手工触发 `Personal Deploy`，`image_ref` 与 `confirm_release_id` 都填新 tag。
3. 等待流水线完成，`Verify deployment` 步骤会自动 smoke `/api/health`、`/api/admin/health` 与一笔完整代理转发。

工作流远端执行时只会覆写 `.env` 中的 `AUTOROUTER_IMAGE` 与 `ADMIN_TOKEN` 两行（`.github/workflows/deploy-personal.yml:112-127`），其他字段保留。这保证升级 / 回滚不会重置数据库密码与 `ENCRYPTION_KEY`，原数据继续可读。

::: warning sidecar 不会被 CI 同步
`deploy-personal.yml` 只 `curl` 主 `docker-compose.yml`。升级新 release 时如果 `docker-compose.cliproxy.yml` 或 `cliproxy/` 目录有变化（例如新增 CLIPROXY 变量、调整 entrypoint），CI 不会自动同步。需要手工按 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar) 的「升级与回滚」段更新 sidecar 资料。
:::

## 数据库迁移与升级顺序

`deploy-personal.yml` 当前不会在远端自动跑数据库迁移，迁移由部署人手工触发。这导致升级时必须按 schema 兼容性区分顺序：

### 前向兼容的迁移

新版本仅新增列 / 新增可空字段 / 新增表 / 索引变化，旧版本应用代码不读新字段。这类升级可以「先切镜像、再跑迁移」或「先迁移、再切镜像」皆可，操作风险低：

```bash
# 切镜像
docker compose up -d
# 跑迁移（容器内）
docker compose exec autorouter node node_modules/drizzle-kit/bin.cjs migrate
```

### 破坏性迁移

新版本删列 / 改类型 / 重命名表 / 修改约束。此时旧版本应用如果还在跑、又遇到新 schema，会立刻失败。必须按下面顺序：

1. 短暂停业务：`docker compose stop autorouter`（PG 容器保持运行）。
2. 跑迁移：`docker compose exec db psql -U autorouter -d autorouter -f /tmp/migrate.sql`，或者临时启动一个新版本镜像在 entrypoint 加 `--migrate-only` 等价物（项目当前没有该选项，手工跑 `node drizzle-kit migrate` 是标准做法）。
3. 切镜像：修改 `.env` 中 `AUTOROUTER_IMAGE`，`docker compose up -d autorouter`。

破坏性迁移不能回滚——回滚意味着把已经 `DROP` 掉的列变回来，等价于「换库」。因此破坏性升级**必须**在升级前完成 `pg_dump` 离线备份。

## 回滚到上一个版本

回滚的路径与升级镜像（镜像方向相反）相同。

### 路径 A：源码 + docker compose

```bash
# 1. 拉对应旧 tag 的 docker-compose.yml（保证编排与旧版本对齐）
PREVIOUS_TAG=v0.1.0
curl -fsSL -o docker-compose.yml \
  "https://raw.githubusercontent.com/g1331/AutoRouter/${PREVIOUS_TAG}/docker-compose.yml"

# 2. 切回旧镜像
sed -i "s|^AUTOROUTER_IMAGE=.*|AUTOROUTER_IMAGE=ghcr.io/g1331/autorouter:${PREVIOUS_TAG}|" .env

# 3. 拉镜像
docker compose pull autorouter

# 4. 启动
docker compose up -d
```

### 路径 B：CI + 远端 SSH

直接触发 `deploy-personal.yml`，`image_ref` 与 `confirm_release_id` 填到目标旧 tag。流水线会自动用旧 tag 对应的 `docker-compose.yml` 与镜像覆盖运行版本。

### 回滚的 schema 限制

回滚的前提是：旧版本 schema 与当前数据库 schema **完全兼容**。三种情形分别处理：

| 场景                                                | 处置                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| 升级时没跑过新 release 的迁移                       | 直接切回镜像即可                                                        |
| 升级跑了新 release 的迁移，但都是前向兼容（仅新增） | 直接切回镜像；旧版本看不到新字段但能继续工作                            |
| 升级跑了破坏性迁移                                  | 必须先用 `pg_dump` 备份回灌到迁移前状态，再切回旧镜像；无备份则无法回滚 |

::: danger 没有备份就没有破坏性回滚
破坏性迁移意味着旧版本应用代码与新 schema 不兼容、新版本代码也不再认识旧字段。回滚前如果没有迁移前的 dump，回滚会让应用容器在启动期立刻报字段缺失错误。强烈建议每次涉及 BREAKING 迁移的升级前都先做一份完整的 `pg_dump`（备份方式见 [数据持久化与备份](./persistence-backup)）。
:::

## `.env` 在升级 / 回滚时的最小变更

正常的升级 / 回滚操作只动 `AUTOROUTER_IMAGE` 一行。其余字段保持原样：

| 字段                               | 升级 / 回滚时是否需要变更                                             |
| ---------------------------------- | --------------------------------------------------------------------- |
| `AUTOROUTER_IMAGE`                 | 是。切到目标 tag 或 digest                                            |
| `POSTGRES_*` / `DATABASE_URL`      | 否。改这些会让新容器连不上现有数据库                                  |
| `ENCRYPTION_KEY`                   | 否。改这些会让原本加密的字段全部不可解                                |
| `ADMIN_TOKEN`                      | 否。除非主动轮换；CI 部署模式下会被 secret 覆盖                       |
| `PORT`                             | 否。除非有端口冲突需要换                                              |
| `CLIPROXY_*`                       | 否。除非随版本调整凭据                                                |
| `RECORDER_*`（已废弃为运行时配置） | 否。这些已经不再影响运行期行为，运行期开关在管理后台 Runtime Settings |

任何「需要顺手改一下密码 / 密钥」的需求与升级 / 回滚解耦：先单独完成密钥轮换并验证可用，再做版本切换。混在一起做出问题时难以定位是版本还是密钥的问题。

## 升级失败时的快速回滚清单

按下面三步快速回到上一个工作版本：

1. **找回上一个 tag**：从 `docker compose ps --format json` 或 GitHub Actions 「最近一次成功的 deploy-personal.yml run」摘要里取出上一次部署的 tag。
2. **回滚镜像**：按上节「路径 A / 路径 B」之一切回去。
3. **smoke**：`curl /api/health` 看 `version` 字段、再带 admin token 看 `/api/admin/health`。两项都通过则回滚成功。

如果 `/api/health` 立即报 500、容器反复重启：

| 现象                                         | 大概率原因                                                 |
| -------------------------------------------- | ---------------------------------------------------------- |
| 日志中含 `ENCRYPTION_KEY` 校验失败           | `.env` 被误改或丢字段。先从备份恢复 `.env`                 |
| 日志中含 `column "x" does not exist`         | 上次升级跑过破坏性迁移、当前 schema 已经不兼容回滚目标     |
| 日志中含 `password authentication failed`    | `.env` 与 `db` 容器内 PG 密码不一致，常见于动手改过 `.env` |
| 容器启动后 30s 内被 healthcheck 判 unhealthy | 数据库还未 ready 或迁移阻塞了启动；查看 `db` 日志          |

更完整的排查路径见 [常见部署问题排查](./troubleshooting)。

## 来源对照

- `.github/workflows/release.yml`：镜像 tag 生成规则与 release notes 模板
- `.github/workflows/deploy-personal.yml`：远端升级 / 回滚操作的实现（只覆写 `AUTOROUTER_IMAGE` 与 `ADMIN_TOKEN`）
- `docker-compose.yml`、`docker-compose.cliproxy.yml`：编排定义；版本之间的差异需要手工对齐
- `src/lib/utils/config.ts`：启动期对 `ENCRYPTION_KEY` 与 `ADMIN_TOKEN` 的强制校验，决定了 `.env` 在升级时的不可变字段

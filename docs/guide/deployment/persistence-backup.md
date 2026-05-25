---
title: 数据持久化与备份
outline: deep
---

# 数据持久化与备份

AutoRouter 的运行状态分布在四个位置：PostgreSQL 数据库、`autorouter-data` 容器卷、CLIProxyAPI 的 `cliproxy-auth` 与 `cliproxy-logs` 卷（仅启用 sidecar 时存在）、磁盘上的流量录制目录。备份策略需要按位置分别处理，单独备份数据库无法恢复全部状态。本页给出每类持久化位置的备份与恢复样例，附带 named volume 与 bind mount 两种存储形态的变体。

不在本页范围内的内容：删除 sidecar 卷后 OAuth 凭据如何重建见 [CLIProxyAPI 首次使用指南](../usage/cliproxy-first-time)；升级 / 回滚的整体流程见 [升级与回滚](./upgrade-rollback)；流量录制本身的运行期配置见 [请求录制](../usage/request-recording)。

## 持久化位置清单

| 位置                                           | 形态                             | 内容                                                                               | 丢失后果                                                         |
| ---------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| PostgreSQL 数据库（默认在 `postgres-data` 卷） | docker compose 命名卷            | 上游配置、客户端 Key、熔断状态、请求日志、计费快照、CLIProxy 实例与账号注册        | 系统状态归零，需要重新登记上游与 Key                             |
| `autorouter-data` 卷                           | docker compose 命名卷            | 容器内 `/app/data`；当前主要承载 SQLite 模式的 `dev.sqlite`，PG 部署下该卷基本为空 | 仅 SQLite 模式有影响；PG 部署可忽略                              |
| `cliproxy-auth` 卷                             | docker compose 命名卷（sidecar） | Codex / Claude / Gemini 的 OAuth token 明文                                        | 所有账号需要在 CLIProxyAPI 管理端重新 OAuth 登录                 |
| `cliproxy-logs` 卷                             | docker compose 命名卷（sidecar） | CLIProxyAPI 的运行日志                                                             | 仅丢历史日志，不影响运行                                         |
| 流量录制目录（`RECORDER_FIXTURES_DIR`）        | 容器内目录或绑定挂载             | 已录制的请求 / 响应 fixture（JSON 文件）；数据库 `traffic_recordings` 表仅存索引   | 索引仍在，但 `fixture_path` 指向的文件已丢失，回放与详情查看失效 |
| `ENCRYPTION_KEY`（不在卷里，但同等关键）       | `.env` 文件                      | Fernet 加密密钥，用于解密上游 API Key、CLIProxy 凭据等敏感字段                     | 数据库行还在，但所有加密字段都无法解密；上游配置必须逐条手工重填 |

::: danger 备份策略必须覆盖 .env
`.env` 中的 `ENCRYPTION_KEY` 不存在于任何 named volume 中，标准的 `docker volume` 备份命令不会带上它。一旦 `.env` 丢失且没有离线副本，即使 PG 数据库完整恢复，所有上游凭据仍然不可读。`.env` 必须作为独立项纳入备份计划，建议在密码管理器或离线介质中保留至少一份。
:::

## docker named volume 与 bind mount 对照

`docker-compose.yml`（仓库内默认）使用 named volume：

```yaml
volumes:
  autorouter-data:
  postgres-data:

services:
  autorouter:
    volumes:
      - autorouter-data:/app/data
  db:
    volumes:
      - postgres-data:/var/lib/postgresql/data
```

named volume 的实际路径由 Docker 管理，宿主机上通常位于 `/var/lib/docker/volumes/<volume-name>/_data`。Compose 启动时会自动在卷名前加 project 前缀，宿主机上看到的实际名为 `<project>_<volume-name>`。`/opt/autorouter` 部署目录对应的 project 名通常是 `autorouter`，因此实际卷名形如 `autorouter_postgres-data`。

若希望把卷数据直接放到宿主机指定目录（便于现有备份策略复用），改用 bind mount：

```yaml
# docker-compose.override.yml
services:
  autorouter:
    volumes:
      - /var/lib/autorouter/data:/app/data
  db:
    volumes:
      - /var/lib/autorouter/postgres:/var/lib/postgresql/data
```

bind mount 的目录由运维方自行准备，权限由宿主机文件系统决定。PG 数据目录在大多数 Linux 发行版上需要属主 UID `999`（容器内 postgres 用户的 UID），否则 `db` 容器会在启动期报权限错误：

```bash
sudo mkdir -p /var/lib/autorouter/postgres
sudo chown -R 999:999 /var/lib/autorouter/postgres
```

`docker-compose.override.yml` 与主 `docker-compose.yml` 在 `docker compose up` 时按文件名顺序合并，无需再带 `-f`。

## PostgreSQL 备份

数据库是状态最丰富的位置，备份选 `pg_dump` 即可。下面给出三种典型场景。

### 方案 A：在主机上调 `docker exec` 执行 `pg_dump`

适用于「应用容器与 DB 容器都在同一台主机」的常见场景。

```bash
# 1. 用容器内的 pg_dump 把整个数据库 dump 到主机
docker exec autorouter-db \
  pg_dump --clean --if-exists -U autorouter autorouter \
  > /backup/autorouter-$(date +%Y%m%d-%H%M%S).sql

# 2. 压缩
gzip /backup/autorouter-*.sql
```

`--clean --if-exists` 让 dump 在 restore 时先 `DROP` 旧对象，避免恢复到非空库时冲突。`autorouter` 是用户名与数据库名，按 `.env` 实际值调整。

### 方案 B：定时备份（cron）

```bash
# /etc/cron.d/autorouter-backup
0 3 * * *  root  /usr/local/bin/autorouter-backup.sh
```

```bash
#!/bin/bash
# /usr/local/bin/autorouter-backup.sh
set -euo pipefail

BACKUP_DIR=/backup/autorouter
RETENTION_DAYS=14
DATE_TAG=$(date +%Y%m%d-%H%M%S)

mkdir -p "${BACKUP_DIR}"

docker exec autorouter-db \
  pg_dump --clean --if-exists -U autorouter autorouter \
  | gzip > "${BACKUP_DIR}/db-${DATE_TAG}.sql.gz"

# 同步备份 .env（因为 ENCRYPTION_KEY 在这里）
cp /opt/autorouter/.env "${BACKUP_DIR}/env-${DATE_TAG}.env"

# 清理超过保留期的旧备份
find "${BACKUP_DIR}" -name "db-*.sql.gz" -mtime +${RETENTION_DAYS} -delete
find "${BACKUP_DIR}" -name "env-*.env" -mtime +${RETENTION_DAYS} -delete
```

`.env` 必须随 dump 一起备份，否则 dump 恢复后所有加密字段无法解密。

### 方案 C：物理备份（停机）

只在「主机维护期、明确停机」时使用。直接 `tar` 整个 PG 数据目录：

```bash
docker compose stop db
sudo tar czf /backup/autorouter-pgdata-$(date +%Y%m%d-%H%M%S).tar.gz \
  -C /var/lib/docker/volumes/autorouter_postgres-data _data
docker compose start db
```

物理备份的 restore 路径是「停机 → 解压回 `_data` → 启动」，跨 PG 主版本时不通用，平常不推荐。

## PostgreSQL 恢复

```bash
# 1. 准备一个空数据库（如果是全新机器，按 .env 先 docker compose up -d db 即可）
docker compose up -d db
docker exec -i autorouter-db \
  dropdb -U autorouter --if-exists autorouter
docker exec -i autorouter-db \
  createdb -U autorouter autorouter

# 2. 灌入备份
gunzip < /backup/autorouter-db-20260524-030001.sql.gz \
  | docker exec -i autorouter-db psql -U autorouter -d autorouter

# 3. 若 .env 也丢失，先把备份的 .env 还原
cp /backup/autorouter/env-20260524-030001.env /opt/autorouter/.env

# 4. 启动应用
docker compose up -d
```

`docker exec -i` 的 `-i` 是必须的，否则 stdin 不会传入容器内的 `psql`。

::: warning 跨主版本 dump / restore
如果备份来源是 `postgres:16`、目标主机用了 `postgres:17`，建议先在目标主机用同版本的 `pg_dump` 再 dump 一遍（或直接迁数据库版本前先做 dump）。否则 dump 中包含的 `pg_dump` 版本声明与目标版本不一致时偶发警告。
:::

## CLIProxyAPI `cliproxy-auth` 备份

`cliproxy-auth` 存的是 OAuth token 明文，丢失等于「所有账号需要 CLIProxyAPI 管理端重新 OAuth 登录」。如果接入的账号比较多，备份它能省下大量重做登录的时间。

### 在线热备（推荐）

借助一次性容器把 named volume 的内容打包出来：

```bash
docker run --rm \
  -v autorouter_cliproxy-auth:/source:ro \
  -v /backup:/backup \
  alpine \
  sh -c 'cd /source && tar czf /backup/cliproxy-auth-$(date +%Y%m%d-%H%M%S).tar.gz .'
```

参数解释：

| 参数                                     | 作用                                                         |
| ---------------------------------------- | ------------------------------------------------------------ |
| `-v autorouter_cliproxy-auth:/source:ro` | 以只读方式挂入实际的卷（注意：实际卷名带 `<project>_` 前缀） |
| `-v /backup:/backup`                     | 挂入主机的备份目录                                           |
| `alpine` + `sh -c '...tar czf...'`       | 用临时容器打包；用 alpine 避免镜像膨胀                       |

实际项目前缀按 `docker volume ls --filter name=cliproxy` 的输出取。

### 恢复

```bash
# 1. 创建（或清空）目标卷
docker volume create autorouter_cliproxy-auth

# 2. 把备份回灌
docker run --rm \
  -v autorouter_cliproxy-auth:/target \
  -v /backup:/backup:ro \
  alpine \
  sh -c 'cd /target && tar xzf /backup/cliproxy-auth-20260524-030001.tar.gz'

# 3. 启动 sidecar
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d cliproxyapi
```

## 流量录制目录备份

`recordTrafficFixture`（`src/lib/services/traffic-recorder.ts:517`）把录制内容以 JSON 写到 `RECORDER_FIXTURES_DIR`（默认 `tests/fixtures`，仓库内默认；deploy 工作流通常落到 `/app/data/...` 之类挂入卷的位置）。数据库 `trafficRecordings` 表只存元数据与 `fixture_path` 路径。这意味着：

- 单独备份 PG 不足以恢复录制；恢复后详情页打开会找不到文件。
- 单独备份录制目录也不够；查询索引、过滤、统计都依赖 PG。

完整的录制备份必须 PG 与录制目录一起做。`RECORDER_FIXTURES_DIR` 通常会挂入名为 `autorouter-data` 的 named volume（如默认编排），或挂入 bind mount。备份方式与 `cliproxy-auth` 同套路：用一次性容器 + `tar`。

```bash
docker run --rm \
  -v autorouter_autorouter-data:/source:ro \
  -v /backup:/backup \
  alpine \
  sh -c 'cd /source && tar czf /backup/autorouter-data-$(date +%Y%m%d-%H%M%S).tar.gz .'
```

不需要长期保留录制时，可在管理后台「系统 → 请求录制」面板配置 `retention_days` 让后台清理任务自动处理。

## bind mount 形态下的备份

把所有 named volume 都改成 bind mount 后，备份命令变得跟普通文件备份没区别：

```bash
# PG 数据 + 应用数据 + sidecar
sudo tar czf /backup/autorouter-$(date +%Y%m%d-%H%M%S).tar.gz \
  -C / \
  var/lib/autorouter/postgres \
  var/lib/autorouter/data \
  var/lib/autorouter/cliproxy-auth \
  opt/autorouter/.env
```

bind mount 的好处：与现有备份系统（borg / restic / 普通 rsync）无缝衔接、`.env` 可以放在同一棵子树内一起备份。代价：宿主机权限策略需要自己维护，PG 数据目录的 UID 要对齐。

::: tip 不要在备份中包含 cliproxy-logs
`cliproxy-logs` 仅是日志，丢了不影响业务，长期备份反而浪费空间。备份脚本中可以明确排除：

```bash
tar --exclude='*/cliproxy-logs/*' ...
```

:::

## 验证备份

备份能成功生成不等于能成功恢复。建议每月做一次完整恢复演练：

1. 在备用机或同主机的另一个 project（用 `COMPOSE_PROJECT_NAME=autorouter-restore`）启动一套空栈。
2. 按上述步骤恢复 PG dump、`.env`、`cliproxy-auth`、录制目录。
3. 启动栈，登录管理后台，验证：上游列表、客户端 Key 列表、CLIProxyAPI 实例「连通性检测」、最近一笔请求日志详情都能正常打开。

只跑命令不验证恢复结果，遇到真实故障时常会发现备份缺一项。

## 来源对照

- `docker-compose.yml`：`autorouter-data` 与 `postgres-data` 卷声明
- `docker-compose.cliproxy.yml`：`cliproxy-auth` 与 `cliproxy-logs` 卷声明（带 sidecar 时）
- `src/lib/services/traffic-recorder.ts`、`src/lib/services/traffic-recording-service.ts`：录制目录的实际写入位置
- `src/lib/db/schema-pg.ts` 中 `traffic_recordings` 表的 `fixture_path` 字段：解释为何数据库与目录必须同步备份
- `.github/workflows/deploy-personal.yml`：远端 `.env` 由 CI 首次生成并维护，备份必须独立纳入

---
title: 常见部署问题排查
outline: deep
---

# 常见部署问题排查

本页按部署阶段从前向后梳理常见故障：容器无法启动 → healthcheck 反复失败 → 应用内部请求异常 → 排查 `localhost` 与服务名陷阱 → `ENCRYPTION_KEY` 丢失的连锁影响。每个故障都给出诊断路径与修复路径，避免凭日志关键字盲猜。

不在本页范围内的内容：运行期请求层面的故障（具体上游 5xx、SSE 中断、计费异常等）见使用指南中的 [故障排查手册](../usage/troubleshooting)；HTTPS / 反向代理层面的问题见 [HTTPS 与反向代理](./https-proxy)。

## 诊断起点：三条状态命令

不管什么现象，先跑这三条命令拿到统一视图：

```bash
# 1. 容器是否在跑、是否 healthy
docker compose ps

# 2. 关键容器最近日志
docker compose logs --tail=200 autorouter
docker compose logs --tail=200 db

# 3. 端到端探针（不需要 token）
curl -fsS http://localhost:${PORT:-3331}/api/health
```

带 sidecar 的部署需要把 compose 命令换成双 `-f` 形态：

```bash
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml ps
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml logs --tail=200 cliproxyapi
```

`docker compose ps` 的 `STATUS` 列形如 `Up 3 minutes (healthy)`、`Up 30 seconds (health: starting)`、`Restarting (1) Less than a second ago` 等，是定位故障类型的第一信号。

## 容器无法启动

容器在 `docker compose up -d` 后立即退出，反复重启，或者根本启动不起来。按容器分别处理。

### `autorouter` 反复重启

`docker compose logs autorouter` 找到第一段错误。最常见的几类：

#### `ENCRYPTION_KEY is required` 或长度校验失败

`src/lib/utils/config.ts:23` 强制 `encryptionKey` 长度 44（base64 编码的 32 字节）。诊断：

```bash
grep "^ENCRYPTION_KEY=" .env
```

修复：

- 字段不存在：补上一行 `ENCRYPTION_KEY=<新生成的 base64 32 字节>`。生成命令 `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`。
- 字段存在但长度不对：常见错误是把 hex 当 base64 填了。重新生成并替换。
- `.env` 字段全在但容器还是读不到：`docker compose config` 看实际注入到容器的环境变量。如果 `.env` 不在 `docker-compose.yml` 同目录下，Compose 不会加载它，可以用 `docker compose --env-file=/path/to/.env up -d` 显式指定。

::: danger 不要为了通过校验随便填一个 ENCRYPTION_KEY
首次部署时 `ENCRYPTION_KEY` 是一次性事件——它锁定数据库中所有已加密字段的解密能力。如果当前数据库已经有上游配置，换一个新密钥意味着所有上游 API Key 都无法再解密。补救路径只剩下「逐条手工重填」。这种情况下优先从备份恢复原 `.env`，详见 [数据持久化与备份](./persistence-backup)。
:::

#### `ADMIN_TOKEN is required`

`src/lib/utils/config.ts:25` 强制 `adminToken` 至少 1 个字符。修复方式同上，缺失就补。

#### `DATABASE_URL is required in production`

`src/lib/utils/config.ts:99-105` 在 `NODE_ENV=production` 时强制要求 `DATABASE_URL`。`docker-compose.yml` 默认会注入 `NODE_ENV=production`，因此即便本地的「开发用」`.env` 没有 `DATABASE_URL`，应用容器也会 fail-fast。

修复：在 `.env` 中显式提供 `DATABASE_URL=postgresql://...@db:5432/...`。

#### `password authentication failed`

应用容器能跑起来但持续报错。诊断：

```bash
grep "^POSTGRES_PASSWORD=" .env
grep "^DATABASE_URL=" .env
```

`POSTGRES_PASSWORD` 与 `DATABASE_URL` 中嵌入的密码必须字面一致。`docker-compose.yml` 把这两个值分别透传给 `db` 容器（用作 PG 初始化密码）与 `autorouter` 容器（用作连接密码），二者不会自动同步。任何一侧改动后必须同步另一侧。

::: warning 改密码不会改库内现有用户
PG 容器只在「初次创建 `postgres-data` 卷时」读取 `POSTGRES_PASSWORD` 初始化超级用户。卷已经有数据时改 `POSTGRES_PASSWORD` 不会改库里实际的用户密码。要变更现有部署的密码：

1. `docker compose exec db psql -U autorouter -d autorouter -c "ALTER USER autorouter PASSWORD '<新密码>';"`
2. 同步改 `.env` 中 `POSTGRES_PASSWORD` 与 `DATABASE_URL`。
3. `docker compose up -d` 让应用容器读到新连接串。
   :::

#### `next start` 报 `Could not find a production build`

镜像里的 standalone build 没就绪。通常发生在本地直接 `docker build .` 但 Dockerfile 阶段被截断，或者镜像引用的不是 `release.yml` 发布的 tag。修复：换成官方 ghcr.io 镜像即可。

```env
AUTOROUTER_IMAGE=ghcr.io/g1331/autorouter:v0.1.0
```

### `db` 容器无法启动

`docker compose logs db` 找日志。最常见两类：

#### `PANIC: could not write to file ...`

PG 数据目录权限不对。多见于 bind mount 形态——宿主机目录所有者不是 UID 999（容器内 postgres 用户）。修复：

```bash
sudo chown -R 999:999 /var/lib/autorouter/postgres
docker compose restart db
```

#### `database files are incompatible with server`

升级了 PG 主版本但 `postgres-data` 卷里还是旧版本的数据目录。修复有两条路径：

- 推荐路径：在旧 PG 镜像下 `pg_dump` 出来、清空卷、新版本下 `psql` 灌回去。
- 临时路径：把 `image: postgres:16-alpine` 回退到旧版本。

升级 PG 主版本是计划内动作，正常运营周期不会触发这条错误。

### `cliproxyapi` 容器无法启动（仅带 sidecar 时）

`docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml logs cliproxyapi`。最常见的错误：

#### `unable to load config.yaml`

`cliproxy/docker-entrypoint.sh` 在启动期读取 `CLIPROXY_*` 环境变量、渲染 `config.yaml.template` 为 `config.yaml`。任一字段缺失会让渲染失败。检查 `.env` 是否完整包含 `CLIPROXY_CLIENT_API_KEY` 与 `CLIPROXY_MANAGEMENT_KEY` 两个必填字段，缺失参考 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar) 补齐。

#### `cliproxy/config.yaml.template: no such file`

叠加文件挂入的 `./cliproxy/` 路径在主机上不存在。CI 路径部署时常见——`deploy-personal.yml` 只拉主 compose，不会拉 sidecar 资料。修复方式同上：按 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar) 把 sidecar 资料补齐到 `${DEPLOY_DIR}/cliproxy/`。

## Healthcheck 反复失败

容器在跑但 `STATUS` 长期停在 `(health: starting)` 或 `(unhealthy)`。

### `autorouter` 健康检查不通过

`docker-compose.yml` 内对 `autorouter` 的 healthcheck 是 `wget -q --spider http://localhost:3000/api/health`，每 30s 一次、超时 10s、失败 3 次判 unhealthy、启动期 40s。失败时按下面顺序排查：

1. 进入容器手动测一遍：`docker compose exec autorouter wget -qO- http://localhost:3000/api/health`。返回 JSON 即应用就绪。
2. 应用未就绪：看 `docker compose logs autorouter`。常见情形：
   - 启动期间数据库还在做 `pg_isready` 但不健康（再等 40 秒，启动期内属于正常）。
   - 启动期反复连数据库失败：见上文「`password authentication failed`」与「`DATABASE_URL is required`」。
3. 应用就绪但 healthcheck 仍报失败：通常是宿主机或代理把容器内部 `localhost` 端口拦截了——不应该发生，因为 `wget` 在容器内跑。如果出现，重启 Docker daemon 或者排查是否有 LSM（AppArmor / SELinux）规则。

### `db` 健康检查不通过

`db` 的 healthcheck 是 `pg_isready -U autorouter -d autorouter`。失败时：

```bash
docker compose exec db pg_isready -U autorouter -d autorouter
docker compose exec db psql -U autorouter -d autorouter -c "SELECT 1;"
```

`pg_isready` 通过但 `psql` 失败：超级用户密码或库名与 `.env` 不一致。

`pg_isready` 始终失败：数据目录损坏；检查 `docker compose logs db`，按上文「`PANIC: could not write to file`」或「`database files are incompatible`」处理。

### `cliproxyapi` 健康检查不通过

healthcheck 是 `wget -q --spider http://localhost:${CLIPROXY_PORT:-8317}/healthz`。失败时：

```bash
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml exec cliproxyapi \
  wget -qO- "http://localhost:${CLIPROXY_PORT:-8317}/healthz"
```

返回非 200：通常是 `CLIPROXY_*` 配置不全或 OAuth 卷损坏。看 `docker compose logs cliproxyapi`。

## `localhost` 与服务名陷阱

部署里最常见的请求层错误。

### 现象

- AutoRouter 报「上游地址不可达」，但用 host shell `curl http://localhost:8317/...` 正常。
- AutoRouter 管理后台「CLIProxyAPI 实例连通性检测」失败，提示「地址不可达」。
- 调用方报「上游 connection refused」，但上游服务在容器外能 ping 通。

### 根因

`autorouter` 容器内的 `localhost` 指向 **AutoRouter 容器自身**，不是宿主机、也不是其他容器。

- AutoRouter → CLIProxyAPI（同 Compose 网络）：必须用容器服务名 `cliproxyapi`。
- AutoRouter → 宿主机上跑的服务：用宿主机 IP，或在 `docker-compose.yml` 中给该服务声明 `extra_hosts: host.docker.internal:host-gateway` 后用 `host.docker.internal`。
- AutoRouter → 外部公网服务：直接用公网 DNS / IP。

### 修复

把 AutoRouter 管理后台中所有「上游 base URL」「CLIProxyAPI 代理基础地址」字段中的 `localhost` 都改成对应的容器服务名或公网地址。最常见的两条对照：

| 错误填写                | 正确填写                                                                    |
| ----------------------- | --------------------------------------------------------------------------- |
| `http://localhost:8317` | `http://cliproxyapi:8317`（受管 sidecar）或 `http://<公网/内网 IP>:8317`    |
| `http://localhost:8080` | `http://host.docker.internal:8080`（同机宿主机服务，需要 extra_hosts 配置） |

详细说明见 [部署形态总览](./overview) 的「容器服务名 vs `localhost`」段，以及 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar) 的「在 AutoRouter 管理端登记实例」一节。

## `ENCRYPTION_KEY` 丢失的影响

`ENCRYPTION_KEY` 用 Fernet 算法加密下面这些字段，落地到 PG：

- `upstreams.api_key`：上游 provider 的 API Key
- `apiKeys.key_value`：客户端 API Key 的明文备份
- `cliproxyInstances.client_api_key`、`cliproxyInstances.management_key`：CLIProxyAPI 凭据
- 其他敏感字段（按 schema 演进可能新增）

### 现象

切到新密钥（或丢失 `.env` 后用新密钥重启）后：

- 任何「调用上游」的请求立即 500，错误日志含 `decryption failed` / `invalid token`。
- 管理后台打开上游详情，密钥栏显示无法解密。
- CLIProxyAPI 实例连通性检测一律失败。

### 排查

```bash
grep "^ENCRYPTION_KEY=" .env | md5sum
```

把当前 `.env` 中的密钥与「上次正常工作时的备份」做哈希对比（不要在日志里输出密钥本身）。两者不一致即密钥已变更。

### 修复

**优先**：从备份恢复原 `.env`。`.env` 不在数据库 dump 里，必须有离线副本。恢复后立即 `docker compose up -d` 重启容器，所有加密字段立即可解。

**没有备份**：只能逐条手工重填。在管理后台：

1. 上游：删除每个上游、重新创建并填入原始 API Key（API Key 必须有外部来源）。
2. 客户端 Key：删除并重新生成。新 Key 与旧 Key 不同，所有客户端需要更新。
3. CLIProxyAPI 实例：删除并重新登记。OAuth 账号本身保留在 `cliproxy-auth` 卷里，登记好实例后无需重新登录。

这条路径要花数小时到数天，取决于上游数量与客户端配合度。这也是为什么 [数据持久化与备份](./persistence-backup) 里强调「`.env` 必须纳入备份策略」。

## 网络与端口

部署后无法从宿主机或公网访问 AutoRouter。

### 宿主机 `curl http://localhost:3331/...` 拒绝连接

| 检查                                                        | 处理                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `docker compose ps` 显示 `autorouter` 已 `Up (healthy)`?    | 否：先按前几节修复启动问题                               |
| `.env` 中 `PORT=...` 与实际 `curl` 端口是否一致？           | 默认 `3331`；改过的话 `curl http://localhost:<改后端口>` |
| 宿主机其他进程是否占了 `3331`？`ss -lntp \| grep 3331`      | 是：换 `PORT` 或停掉占用进程                             |
| 是否在容器侧绑了 `127.0.0.1:3331`，但用宿主机外部 IP 访问？ | 改 ports bind 形态，或换成 `127.0.0.1` 访问              |

### 外部访问报 502 / 504（反向代理后端不可达）

反向代理与 AutoRouter 之间通讯有问题。按下面顺序排：

1. 反代主机 `curl http://127.0.0.1:3331/api/health` 通吗？
2. 反向代理的 `upstream` 或 `reverse_proxy` 指向正确？
3. SSE 路径上 `proxy_buffering off` 与 `proxy_read_timeout 600s` 都配了？（见 [HTTPS 与反向代理](./https-proxy)）

### 「上游 5xx」但应用本身没问题

属于运行期上游故障，不是部署问题。见使用指南中的 [故障排查手册](../usage/troubleshooting)。

## 来源对照

- `docker-compose.yml`、`docker-compose.cliproxy.yml`：healthcheck 定义与卷结构
- `src/lib/utils/config.ts`：启动期校验逻辑（`ENCRYPTION_KEY` 长度、`DATABASE_URL` 必填守卫等）
- `src/lib/utils/encryption.ts`：Fernet 加密实现，决定了 `ENCRYPTION_KEY` 丢失的不可恢复性
- `.github/workflows/deploy-personal.yml`：远端部署期 smoke 步骤，定义了「最低限度可用」的标准
- `cliproxy/docker-entrypoint.sh`：sidecar 启动期配置渲染逻辑

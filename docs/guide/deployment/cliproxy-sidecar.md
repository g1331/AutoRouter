---
title: CI 部署后追加 CLIProxyAPI sidecar
outline: deep
---

# CI 部署后追加 CLIProxyAPI sidecar

`deploy-personal.yml` 完成后，目标服务器上只有主 `docker-compose.yml` 与作业生成的 `.env`，没有 `docker-compose.cliproxy.yml`、`cliproxy/` 目录以及 `.env` 中的 `CLIPROXY_*` 段。本页给出在不再触发 CI 的前提下，从服务器侧手工把 sidecar 资料补齐的完整步骤。

如果是源码 + docker compose 路径，受管 sidecar 的资料已经在仓库里了，可以直接 `docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d` 启动，不需要本页这套补齐流程；本页仅针对「CI 部署 + 远端服务器」这条组合路径。

## 前置条件

- `deploy-personal.yml` 至少成功跑过一次，服务器上已经存在 `${DEPLOY_DIR}/docker-compose.yml` 与 `.env`（默认 `DEPLOY_DIR=/opt/autorouter`）。
- 当前以可执行 `docker` 命令的用户身份登录到该服务器，并位于 `${DEPLOY_DIR}` 目录下。
- 准备好两组 CLIProxyAPI 凭据（客户端 API Key 与管理密钥），稍后既要写入 `.env`，也要在 AutoRouter 管理端登记实例时录入；两侧必须一致。

下面以默认部署目录为例。如果使用了自定义 `DEPLOY_DIR`，请把示例中的 `/opt/autorouter` 替换为实际路径。

## 第一步：拉取 sidecar 叠加文件与配置资料

`deploy-personal.yml` 通过 `raw.githubusercontent.com/<repo>/<release-tag>/docker-compose.yml` 拉取主 compose 文件。叠加文件与 cliproxy 目录使用同样的 URL 形态。请把示例中的 `<RELEASE_TAG>` 替换为本次部署使用的 release tag（与 `deploy-personal.yml` 触发时输入的 `confirm_release_id` 一致），保证与已运行镜像同源。

```bash
cd /opt/autorouter
RELEASE_TAG=v0.1.0   # 替换为实际部署的 release tag
BASE_URL=https://raw.githubusercontent.com/g1331/AutoRouter/${RELEASE_TAG}

curl -fsSL -o docker-compose.cliproxy.yml "${BASE_URL}/docker-compose.cliproxy.yml"

mkdir -p cliproxy
curl -fsSL -o cliproxy/config.yaml.template "${BASE_URL}/cliproxy/config.yaml.template"
curl -fsSL -o cliproxy/docker-entrypoint.sh "${BASE_URL}/cliproxy/docker-entrypoint.sh"
chmod +x cliproxy/docker-entrypoint.sh
```

完成后目录结构应当与仓库 `cliproxy/` 一致：

```
/opt/autorouter
├── .env
├── docker-compose.yml
├── docker-compose.cliproxy.yml
└── cliproxy
    ├── config.yaml.template
    └── docker-entrypoint.sh
```

`docker-compose.cliproxy.yml` 把 `cliproxy/` 下两份文件以只读方式挂入容器，其中入口脚本会读取 `CLIPROXY_*` 环境变量、把模板渲染为实际的 `config.yaml`，再启动 CLIProxyAPI 进程。这就要求宿主路径必须与叠加文件的相对路径一致，所以本步骤必须在 `${DEPLOY_DIR}` 目录下执行。

## 第二步：在 `.env` 中追加 `CLIPROXY_*` 段

`deploy-personal.yml` 生成的 `.env` 不含 `CLIPROXY_*` 字段，需要手工追加。可以把 `.env.example` 中 CLIProxyAPI Sidecar 段拷过来再填值，也可以直接 `cat >>`：

```bash
cat >> /opt/autorouter/.env <<'EOF'

# ============================================================================
# CLIProxyAPI Sidecar
# ============================================================================
CLI_PROXY_IMAGE=eceasy/cli-proxy-api:latest
CLIPROXY_PORT=8317
CLIPROXY_CLIENT_API_KEY=<生成或自定的客户端 API Key>
CLIPROXY_MANAGEMENT_KEY=<生成或自定的管理密钥>
CLIPROXY_ALLOW_REMOTE=true
CLIPROXY_PROXY_URL=
EOF
```

填写说明：

| 字段                      | 必填         | 取值要求                                                                                                         |
| ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `CLI_PROXY_IMAGE`         | 否（建议改） | 默认 `eceasy/cli-proxy-api:latest`。生产部署建议固定到具体 tag 或 digest，避免 `latest` 漂移                     |
| `CLIPROXY_PORT`           | 否           | 默认 `8317`。如目标服务器该端口被占用，可改为其他端口，并相应调整后续登记实例时填写的地址                        |
| `CLIPROXY_CLIENT_API_KEY` | 是           | 客户端 API Key，所有经 CLIProxyAPI 转发的代理请求需携带；必须与 AutoRouter 管理端登记实例时的客户端 API Key 一致 |
| `CLIPROXY_MANAGEMENT_KEY` | 是           | 管理 API 密钥，AutoRouter 调用 CLIProxyAPI 管理接口时使用；必须与 AutoRouter 管理端登记实例时的管理密钥一致      |
| `CLIPROXY_ALLOW_REMOTE`   | 否           | 默认 `true`。受管 sidecar 下 AutoRouter 与 CLIProxyAPI 跨容器，跨容器访问需置为 `true`，不要改为 `false`         |
| `CLIPROXY_PROXY_URL`      | 否           | OAuth 出站代理。受限网络下填写 `http://`、`https://` 或 `socks5://` 形式，留空表示不使用                         |

两个密钥可以用与 `ADMIN_TOKEN` 相同的方法生成：

```bash
openssl rand -hex 32
```

::: warning 这两个密钥要在三处保持一致
`.env` 中的 `CLIPROXY_CLIENT_API_KEY` 与 `CLIPROXY_MANAGEMENT_KEY` 既是 CLIProxyAPI 容器启动时的配置来源，也是 AutoRouter 管理端登记 CLIProxyAPI 实例时录入的明文来源。任何一侧修改都要同步另一侧，否则连通性检测会失败。
:::

## 第三步：双 `-f` 启动 sidecar

引入叠加文件启动整个栈，会在已运行的 `autorouter` 与 `db` 之外新增 `cliproxyapi` 服务：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cliproxy.yml \
  up -d
```

`docker compose` 看到两个 `-f` 时会把它们按顺序合并：第二个文件追加 `cliproxyapi` 服务、追加 `cliproxy-auth` 与 `cliproxy-logs` 两个 named volume，原 `autorouter` 与 `db` 服务保持不变。两个 volume 在显式删除前持久化，跨容器重启保留 OAuth 凭据与日志。

观察启动结果：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cliproxy.yml \
  ps

docker compose \
  -f docker-compose.yml \
  -f docker-compose.cliproxy.yml \
  logs -f cliproxyapi
```

`cliproxyapi` 的 healthcheck 是 `wget http://localhost:${CLIPROXY_PORT:-8317}/healthz`，启动期 20 秒，间隔 30 秒，失败 3 次判 unhealthy。`STATUS` 列稳定为 `healthy` 即说明容器已就绪。

::: tip 后续都需要带上两个 `-f`
启用 sidecar 后，针对该部署的任何 compose 命令都需要带上两个 `-f`，否则 `docker compose` 只会看到主文件中的两个服务，对 `cliproxyapi` 的任何操作都会被视为停止该服务并清理。例如重启 cliproxy：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cliproxy.yml \
  restart cliproxyapi
```

:::

## 第四步：在 AutoRouter 管理端登记实例

回到 AutoRouter 管理后台「CLIProxyAPI」面板，新增一条实例记录，运行模式选择「受管 sidecar」，按如下填写：

| 字段           | 取值                                                      |
| -------------- | --------------------------------------------------------- |
| 代理基础地址   | `http://cliproxyapi:8317`（同一 Docker 网络的服务名解析） |
| 管理 API 地址  | 同样以服务名 `cliproxyapi` 访问                           |
| 客户端 API Key | 与 `.env` 中 `CLIPROXY_CLIENT_API_KEY` 完全一致           |
| 管理 API 密钥  | 与 `.env` 中 `CLIPROXY_MANAGEMENT_KEY` 完全一致           |

代理基础地址处不要填写 `http://localhost:8317`：AutoRouter 与 CLIProxyAPI 是两个独立容器，AutoRouter 容器内的 `localhost` 指向自身，根本到达不了 CLIProxyAPI。Docker 网络内的容器互访依赖服务名解析。

保存后点击「连通性检测」，预期得到「地址可达且密钥有效」。检测失败的主要原因：

| 现象                        | 原因                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| 「地址不可达」              | 代理基础地址填写了 `localhost`；或代理基础地址端口与 `CLIPROXY_PORT` 不一致；或 sidecar 容器未运行 |
| 「客户端 API Key 校验失败」 | 实例记录中的客户端 API Key 与 `.env` 中 `CLIPROXY_CLIENT_API_KEY` 不一致                           |
| 「管理 API 鉴权失败」       | 实例记录中的管理密钥与 `.env` 中 `CLIPROXY_MANAGEMENT_KEY` 不一致                                  |

连通性检测通过后，下一步是 OAuth 登录账号与创建池上游。具体流程参见 [CLIProxyAPI 首次使用指南](../usage/cliproxy-first-time) 与现有长篇 [`docs/cliproxy-deployment.md`](/cliproxy-deployment)。

## 升级与回滚

升级 sidecar 资料时，把第一步的 `RELEASE_TAG` 改为新的 release tag 重新 `curl` 覆盖三份文件，然后重新执行第三步即可。`.env` 中的 `CLIPROXY_*` 段在版本升级时一般不需要变更，按需更新即可。

要回退到不含 sidecar 的部署形态，先停掉并清理 `cliproxyapi` 服务，然后只用主文件启动：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cliproxy.yml \
  stop cliproxyapi
docker compose \
  -f docker-compose.yml \
  -f docker-compose.cliproxy.yml \
  rm -f cliproxyapi

docker compose -f docker-compose.yml up -d
```

`cliproxy-auth` 与 `cliproxy-logs` 两个 named volume 在显式 `docker volume rm` 之前保留，再次启用 sidecar 时已登录账号无需重新授权。如果需要彻底清理 OAuth 凭据：

```bash
docker volume rm cliproxy-auth cliproxy-logs
```

::: danger 清理 cliproxy-auth 会清空 OAuth 凭据
`cliproxy-auth` 中存放 Codex / Claude / Gemini 的 OAuth token 明文。删除该卷后，所有账号都需要在 CLIProxyAPI 管理端重新登录，AutoRouter 管理端登记的实例记录仍在但池上游会因为无可用账号而失效。生产环境执行前务必确认。
:::

## 不在本页范围内

- 受管 sidecar 与外部 CLIProxyAPI 两种形态的对比、字段填写差异：参见后续「CLIProxyAPI 外部 vs sidecar 选择」与现有长篇 [`docs/cliproxy-deployment.md`](/cliproxy-deployment)。
- OAuth 登录与池上游创建的完整流程：参见 [CLIProxyAPI 首次使用指南](../usage/cliproxy-first-time)。
- 出站代理的取值与验证方式：参见后续「CLIProxyAPI 出站代理配置」与现有长篇出站代理小节。
- `CLIPROXY_*` 字段的完整参考与默认值：参见 [环境变量参考](./env-reference) 的 CLIProxyAPI 段。

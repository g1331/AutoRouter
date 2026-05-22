# CLIProxyAPI 部署指南

## 概述

AutoRouter 通过集成 CLIProxyAPI 来支持 Codex、Claude Code、Gemini CLI 等基于 OAuth 账号的上游能力。CLIProxyAPI 负责 OAuth 登录、token 持久化与刷新、协议适配、多账号调度；AutoRouter 负责 API Key、上游授权、路由选择、请求日志与计费。请求形态如下：

```
客户端  ->  AutoRouter  ->  CLIProxyAPI  ->  Codex / Claude / Gemini OAuth 账号
```

本文档说明两种 CLIProxyAPI 部署方式，以及凭据一致性、数据持久化与出站代理的配置方式。

## 两类地址的区分

部署与配置过程中涉及两类地址，含义不同，须分别配置：

| 地址类型             | 方向                                 | 配置位置                                                                |
| -------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| CLIProxyAPI 服务地址 | AutoRouter -> CLIProxyAPI            | AutoRouter 管理端登记实例时填写的代理地址与管理地址                     |
| OAuth 出站代理       | CLIProxyAPI -> 上游 OAuth / 模型 API | CLIProxyAPI 的 `proxy-url` 配置，sidecar 下经 `CLIPROXY_PROXY_URL` 注入 |

「CLIProxyAPI 服务地址」决定 AutoRouter 如何访问 CLIProxyAPI。「OAuth 出站代理」决定 CLIProxyAPI 如何访问 Codex、Claude、Gemini 的登录与模型服务，用于受限网络环境。

## 部署方式一：外部 CLIProxyAPI

适用于 CLIProxyAPI 已独立运行，或与 AutoRouter 分开运维的场景。此时无需引入 `docker-compose.cliproxy.yml`，仅以主 `docker-compose.yml` 启动 AutoRouter：

```bash
docker compose -f docker-compose.yml up -d
```

随后在 AutoRouter 管理端登记一个 CLIProxyAPI 实例，运行模式选择「外部服务」，并填写：

- 代理基础地址：外部 CLIProxyAPI 的转发地址，例如 `http://cliproxy.example.com:8317`。
- 管理 API 地址：外部 CLIProxyAPI 的管理接口地址。
- 客户端 API Key：与外部 CLIProxyAPI 配置中 `api-keys` 的某一项一致。
- 管理 API 密钥：与外部 CLIProxyAPI 配置中 `remote-management.secret-key` 一致。

外部 CLIProxyAPI 的安装、配置与持久化由其自身运维流程负责，本文档不再展开。

## 部署方式二：受管 sidecar

适用于希望 CLIProxyAPI 与 AutoRouter 一起编排、统一启停的场景。该方式通过可选叠加文件 `docker-compose.cliproxy.yml` 增加一个 `cliproxyapi` 服务，与 AutoRouter 处于同一 Docker 网络。

### 配置环境变量

在 `.env` 中设置 CLIProxyAPI sidecar 相关变量，参见 `.env.example` 的 CLIProxyAPI Sidecar 段落：

```env
CLI_PROXY_IMAGE=eceasy/cli-proxy-api:latest
CLIPROXY_PORT=8317
CLIPROXY_CLIENT_API_KEY=<客户端 API Key>
CLIPROXY_MANAGEMENT_KEY=<管理 API 密钥>
CLIPROXY_ALLOW_REMOTE=true
CLIPROXY_PROXY_URL=
```

建议将 `CLI_PROXY_IMAGE` 固定到具体 tag 或 digest，避免 `latest` 漂移导致行为不一致。

### 启动

引入叠加文件启动，受管 sidecar 显式启用：

```bash
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d
```

容器启动时，`cliproxy/docker-entrypoint.sh` 读取 `CLIPROXY_*` 环境变量，将 `cliproxy/config.yaml.template` 渲染为实际配置后再启动 CLIProxyAPI 进程。客户端 API Key 与管理密钥均来源于 `.env`，不写入仓库。

### 在 AutoRouter 登记实例

sidecar 启动后，在 AutoRouter 管理端登记一个 CLIProxyAPI 实例，运行模式选择「受管 sidecar」，并填写：

- 代理基础地址：`http://cliproxyapi:8317`，其中 `cliproxyapi` 为同一 Docker 网络中的服务名。
- 管理 API 地址：同样以服务名 `cliproxyapi` 访问。
- 客户端 API Key：与 `.env` 中 `CLIPROXY_CLIENT_API_KEY` 一致。
- 管理 API 密钥：与 `.env` 中 `CLIPROXY_MANAGEMENT_KEY` 一致。

## 凭据一致性要求

CLIProxyAPI 运行期使用明文凭据，AutoRouter 数据库中 `cliproxy_instances` 表以 Fernet 加密保存同一组凭据。两者不会自动同步，须由管理员手工保证一致：

1. 受管 sidecar 模式下，`.env` 中的 `CLIPROXY_CLIENT_API_KEY` 与 `CLIPROXY_MANAGEMENT_KEY` 是 CLIProxyAPI 配置来源，也是登记实例记录时录入 AutoRouter 的明文来源，两处必须填写同一组值。
2. 外部 CLIProxyAPI 模式下，登记实例时填写的客户端 API Key 与管理密钥，必须与外部 CLIProxyAPI 配置中的 `api-keys` 与 `remote-management.secret-key` 一致。
3. 修改任一侧凭据后，须同步更新另一侧。

登记实例后，使用 AutoRouter 管理端的连通性检测验证地址可达且密钥有效。检测失败通常意味着地址不可达或凭据不一致。

## 数据持久化

受管 sidecar 使用两个 named volume 持久化 CLIProxyAPI 数据：

| Volume          | 容器内路径             | 用途                                       |
| --------------- | ---------------------- | ------------------------------------------ |
| `cliproxy-auth` | `/root/.cli-proxy-api` | OAuth token 文件目录（auth-dir），敏感数据 |
| `cliproxy-logs` | `/CLIProxyAPI/logs`    | 运行日志目录                               |

OAuth token 明文仅存在于 `cliproxy-auth` 卷，不进入 AutoRouter 数据库。容器重启或重建后，已登录账号无需重新授权。

### 备份与迁移

named volume 的备份与迁移可通过临时容器完成。导出 `cliproxy-auth` 卷为压缩包：

```bash
docker run --rm \
  -v cliproxy-auth:/data:ro \
  -v "$(pwd):/backup" \
  alpine tar czf /backup/cliproxy-auth.tar.gz -C /data .
```

恢复到目标环境的同名卷：

```bash
docker run --rm \
  -v cliproxy-auth:/data \
  -v "$(pwd):/backup" \
  alpine sh -c "tar xzf /backup/cliproxy-auth.tar.gz -C /data"
```

使用 `docker volume inspect cliproxy-auth` 可查看卷在宿主机上的实际挂载点。

### auth-dir 改用 bind mount 的变体

如需直接查看 OAuth token 文件，或纳入宿主机统一备份策略，可将 `cliproxy-auth` 卷替换为宿主机目录 bind mount。在 `docker-compose.cliproxy.yml` 中将：

```yaml
- cliproxy-auth:/root/.cli-proxy-api
```

替换为：

```yaml
- ./cliproxy-data/auths:/root/.cli-proxy-api
```

并移除 `volumes` 段中的 `cliproxy-auth` 声明。采用 bind mount 时，须确保宿主机目录不被纳入源码仓库，并对其设置合适的访问权限，避免 token 文件泄露。

## 出站代理配置

在受限网络环境下，CLIProxyAPI 可能无法直接访问 Codex、Claude、Gemini 的登录与模型 API，此时需要配置出站代理。

受管 sidecar 模式下，在 `.env` 中设置 `CLIPROXY_PROXY_URL`，该值会注入到 CLIProxyAPI 配置的 `proxy-url`：

```env
# HTTP 代理
CLIPROXY_PROXY_URL=http://proxy-host:8080

# HTTPS 代理
CLIPROXY_PROXY_URL=https://proxy-host:8443

# SOCKS5 代理
CLIPROXY_PROXY_URL=socks5://proxy-host:1080
```

留空表示不使用出站代理。修改后重启 `cliproxyapi` 服务使配置生效：

```bash
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d cliproxyapi
```

外部 CLIProxyAPI 模式下，出站代理由外部 CLIProxyAPI 自身的 `config.yaml` 中 `proxy-url` 配置。

出站代理配置完成后，可通过 AutoRouter 管理端发起一次 OAuth 登录或连通性测试，验证 CLIProxyAPI 经代理访问上游服务正常。

## 回滚

受管 sidecar 为可选叠加，停止并移除 `cliproxyapi` 服务不影响 AutoRouter 与数据库：

```bash
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml stop cliproxyapi
docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml rm -f cliproxyapi
```

此后仅以主 `docker-compose.yml` 启动即可恢复到不含 sidecar 的部署形态。`cliproxy-auth` 与 `cliproxy-logs` 卷在显式删除前保留。

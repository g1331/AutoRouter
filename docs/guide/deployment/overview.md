---
title: 部署形态总览
outline: deep
---

# 部署形态总览

AutoRouter 的官方部署路径目前是两条，差别在于「镜像是否由 CI 构建、由谁把 docker compose 拉到服务器、由谁维护 `.env`」。CLIProxyAPI 受管 sidecar 是叠加在任一主路径之上的可选形态。本页说明这两条主路径与叠加形态的适用范围，便于在动手之前选定方向，避免后续把两条路径的命令混用。

## 两条主路径

| 路径                                          | 镜像来源                                                                  | docker compose 文件来源                                                  | `.env` 维护方                                                    | 适合场景                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **A. 源码 + docker compose**                  | 本地从 `Dockerfile` 构建，或从 `ghcr.io/g1331/autorouter` 拉取已发布镜像  | 仓库内 `docker-compose.yml`                                              | 手工拷贝 `.env.example` 后编辑                                   | 个人服务器、临时验证、与项目同步开发                                                          |
| **B. CI + 远端 SSH（`deploy-personal.yml`）** | 由 `release.yml` 在打 tag 时构建并推送到 `ghcr.io/g1331/autorouter:<tag>` | 部署作业通过 `curl` 从对应 tag 的 `raw.githubusercontent.com` 拉到服务器 | 部署作业首次运行时自动生成，缺失字段会用 `openssl rand` 随机填充 | 个人长期服务器、希望按 release tag 升级回滚、不愿意把 GitHub Actions 之外的部署脚本带上服务器 |

两条路径产出的运行形态是等价的——都是 `autorouter` 与 `db` 两个容器、共享 `autorouter-net` bridge 网络、两个 named volume（`autorouter-data`、`postgres-data`）。区别只在「谁把这些文件放到服务器、谁负责更新它们」。

### 路径 A：源码 + docker compose

适合直接对接本地开发节奏的部署。最短命令链是：

```bash
git clone https://github.com/g1331/AutoRouter.git
cd AutoRouter
cp .env.example .env       # 然后按需修改 .env 中的密钥
docker compose up -d
```

镜像默认值在 `docker-compose.yml` 中：

```yaml
image: ${AUTOROUTER_IMAGE:-ghcr.io/g1331/autorouter:latest}
```

`AUTOROUTER_IMAGE` 未设置时使用 `latest` tag。若希望与某个具体 release 对齐，请在 `.env` 中显式 pin 到 `ghcr.io/g1331/autorouter:v<version>` 或带 digest 的 `ghcr.io/g1331/autorouter@sha256:<digest>`，避免 `latest` 漂移。

完整步骤见 [快速开始（源码 docker compose）](./quickstart)，每个环境变量字段的语义见 [环境变量参考](./env-reference)。

### 路径 B：CI + 远端 SSH（`deploy-personal.yml`）

适合个人长期服务器的「按 release 升级 / 按 tag 回滚」节奏。部署的触发方式不是 push，而是手工在 GitHub Actions 页面对 `deploy-personal.yml` 触发 `workflow_dispatch`，输入三个参数：

| 输入                 | 含义                       | 形式                                                                                                                                                                           |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image_ref`          | 要部署的镜像引用           | `v0.1.0`（自动补全 `ghcr.io/g1331/autorouter:` 前缀），或 `ghcr.io/...` 完整引用，或 `sha256:...` digest                                                                       |
| `environment_name`   | GitHub Environment 名称    | 默认 `personal-production`，作业会绑定到该 environment 的 secrets 与审批策略                                                                                                   |
| `confirm_release_id` | 用于二次确认的 release tag | 例如 `v0.1.0`；作业会校验该 tag 在本地可解析（`git rev-parse refs/tags/<tag>`）并且 GitHub 上存在对应 release（`gh release view`），不校验 tag 是否位于 `origin/master` 路径上 |

工作流通过 `appleboy/ssh-action` 登录目标服务器、`mkdir -p ${DEPLOY_DIR}`（默认 `/opt/autorouter`，可由 secret `DEPLOY_DIR` 覆盖）、`curl` 拉对应 tag 的 `docker-compose.yml`、首次部署时自动生成 `.env`（`POSTGRES_PASSWORD` / `ENCRYPTION_KEY` 由 `openssl rand` 随机填充，`ADMIN_TOKEN` 来自 GitHub secret），最后执行 `docker pull` 与 `docker compose up -d --remove-orphans`。完成后还会通过 `/api/health` 与一次完整代理 smoke test 校验部署可用性。

需要在 GitHub 上配置的 secrets：

| Secret            | 必填 | 默认值            | 用途                                                       |
| ----------------- | ---- | ----------------- | ---------------------------------------------------------- |
| `SERVER_HOST`     | 是   | 无                | 目标服务器主机名或 IP                                      |
| `SERVER_USER`     | 是   | 无                | SSH 登录用户                                               |
| `SSH_PRIVATE_KEY` | 是   | 无                | SSH 私钥                                                   |
| `SERVER_PORT`     | 否   | `22`              | SSH 端口                                                   |
| `DEPLOY_DIR`      | 否   | `/opt/autorouter` | 部署目录                                                   |
| `ADMIN_TOKEN`     | 是   | 无                | 管理 API token，作业会在 `.env` 中强制写入；缺失会终止部署 |

发布镜像本身由独立的 `release.yml` 完成：向 `master` 推送 `v*` 形式的 tag 即触发构建并推送到 `ghcr.io`。tag 命名遵守 `vMAJOR.MINOR.PATCH` 或 `vMAJOR.MINOR.PATCH-(alpha|beta).N`，且必须指向 `origin/master` 上的提交。release notes 由 `git-cliff` 按 `cliff.toml` 规则自动生成。

完整配置步骤参见 [GitHub Actions CI 部署](./github-actions)。

## 何时叠加 CLIProxyAPI sidecar

CLIProxyAPI 是 AutoRouter 用来承接 Codex、Claude、Gemini 等 OAuth 上游账号的代理服务。它有两种与 AutoRouter 协作的形态，仓库为受管 sidecar 形态提供了可选叠加文件 `docker-compose.cliproxy.yml`：

| CLIProxyAPI 形态                                           | 是否需要本仓库的叠加文件 | 配置位置                                                                                                                  |
| ---------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **外部 CLIProxyAPI**（已独立部署或与 AutoRouter 分开运维） | 不需要                   | 在 AutoRouter 管理端「登记实例」时填写外部地址即可                                                                        |
| **受管 sidecar**（与 AutoRouter 一起编排、统一启停）       | 需要                     | 启动时同时引入 `docker-compose.cliproxy.yml`：`docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d` |

叠加文件中 `cliproxyapi` 服务挂入仓库内的 `cliproxy/config.yaml.template` 与 `cliproxy/docker-entrypoint.sh`，入口脚本在容器启动时读取 `CLIPROXY_*` 环境变量并把模板渲染为实际配置。OAuth 凭据由 named volume `cliproxy-auth` 持久化，跨容器重建保留登录状态。该服务默认仅在 `autorouter-net` 内可达，AutoRouter 通过服务名 `cliproxyapi` 访问；除非确有需要，不要解开端口映射对外暴露。

需要特别强调的是「容器服务名」与「`localhost`」的差别：在受管 sidecar 形态下，AutoRouter 与 CLIProxyAPI 是两个独立容器，AutoRouter 的「`localhost`」指向自身容器，不会到达 CLIProxyAPI。登记实例时的代理地址必须填写 `http://cliproxyapi:8317`，使用同一 Docker 网络中的服务名解析。

## 路径与叠加形态的组合

两条主路径与 CLIProxyAPI 叠加可以任意组合，常见组合如下：

| 主路径                   | 是否带 sidecar | 启动命令                                                                    | 适用                                                                                                                                              |
| ------------------------ | -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 源码 + docker compose | 否             | `docker compose up -d`                                                      | 只需要常规上游（OpenAI / Anthropic 等普通 API Key）                                                                                               |
| A. 源码 + docker compose | 是             | `docker compose -f docker-compose.yml -f docker-compose.cliproxy.yml up -d` | 本地或个人服务器同时治理 Codex / Claude / Gemini OAuth 账号                                                                                       |
| B. CI + 远端 SSH         | 否             | `deploy-personal.yml` 触发即完成                                            | 远端服务器按 release tag 升级，且不需要 OAuth 类上游                                                                                              |
| B. CI + 远端 SSH         | 是             | `deploy-personal.yml` 完成后手工补 sidecar                                  | 远端服务器需要 OAuth 类上游，但 `deploy-personal.yml` 不会自动配置 sidecar，须按 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar) 手工补齐 |

`deploy-personal.yml` 当前只拉主 `docker-compose.yml`，不会拉 `docker-compose.cliproxy.yml` 与 `cliproxy/` 目录，也不会维护 `.env` 中的 `CLIPROXY_*` 段。因此「CI 部署 + sidecar」是一条两步路径：先用 CI 完成 AutoRouter 主部署，再手工把 sidecar 资料补到服务器。

## 不在本页范围内

下列内容由其他专门页面承载，避免本页膨胀成「全量部署手册」：

- 源码 + docker compose 的最小完整步骤：[快速开始（源码 docker compose）](./quickstart)
- CI 部署完成后手工补 sidecar 的具体命令：[CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar)
- 每个环境变量的字段说明：[环境变量参考](./env-reference)
- CLIProxyAPI 的两种形态对比与详细字段填写：参见现有长篇 [`docs/cliproxy-deployment.md`](/cliproxy-deployment) 与未来的「CLIProxyAPI 外部 vs sidecar 选择」「CLIProxyAPI 首次使用指南」
- HTTPS 与反向代理：参见后续「HTTPS 与反向代理」一节

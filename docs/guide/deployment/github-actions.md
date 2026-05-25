---
title: GitHub Actions CI 部署
outline: deep
---

# GitHub Actions CI 部署

仓库内置三条 GitHub Actions 工作流共同支撑「打 tag → 构建并推送镜像 → 在远端服务器上完成部署」的全自动链路：`release.yml` 负责构建与发布镜像，`deploy-personal.yml` 负责把已发布镜像通过 SSH 推送到目标服务器，`verify.yml` 在每个 PR 与 master push 上跑质量门禁。本页按这条主链路顺序展开，覆盖触发方式、Secrets 清单、首次配置步骤、与 `docker compose` 主部署路径的衔接位置。

不在本页范围内的内容：每个环境变量字段的语义见 [环境变量参考](./env-reference)；CLIProxyAPI sidecar 的补齐流程见 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar)；版本号与镜像 tag 的语义化规则见架构介绍中的 [版本与发布](../architecture/release)。

## 工作流总览

| 工作流文件                              | 触发方式                                                                           | 职责                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `.github/workflows/release.yml`         | 向 `master` 推送形如 `v*` 的 tag                                                   | 校验 tag 形式、生产构建、推送镜像到 `ghcr.io/g1331/autorouter`、生成 release  |
| `.github/workflows/deploy-personal.yml` | 在 GitHub Actions 页面手工触发 `workflow_dispatch`                                 | 拉取目标 release tag 对应的 `docker-compose.yml`，通过 SSH 在远端启动并 smoke |
| `.github/workflows/verify.yml`          | 向 `master` 推送相关源码 / 配置 / 工作流变更，或对 `master` 开 PR 时               | ESLint、Prettier、`tsc`、Vitest、迁移一致性、代理稳定性、Playwright E2E       |
| `.github/workflows/docs.yml`            | `docs/**` / `README*` / `docs.yml` 自身 / `package.json` / `pnpm-lock.yaml` 变更时 | 构建 VitePress 站点，master 推送时部署到 GitHub Pages                         |
| `.github/workflows/dependabot-fix.yml`  | Dependabot 在 `package.json` 上开 PR 时                                            | 重新生成 `pnpm-lock.yaml` 并回推到 PR 分支                                    |

`release.yml` 与 `deploy-personal.yml` 是一对：前者把镜像发布出去，后者把镜像部署上线。`verify.yml` 与 `docs.yml` 在主干上做质量保障。`dependabot-fix.yml` 解决 Dependabot 不能正确处理 pnpm workspace 时 lockfile 不同步的问题。

## `release.yml`：tag 触发的发布流水线

### 触发条件

工作流在收到 `tags: ["v*"]` push 时执行（`.github/workflows/release.yml:3-5`）。tag 必须满足下列正则才能被接受：

```text
^v[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta)\.[0-9]+)?$
```

也就是 `vMAJOR.MINOR.PATCH`、`vMAJOR.MINOR.PATCH-alpha.N` 或 `vMAJOR.MINOR.PATCH-beta.N` 三种形态之一。带 `-alpha.N` / `-beta.N` 后缀的 tag 会被标记为 prerelease；不带后缀的稳定 tag 会同时被发布为 `latest`。

除此之外还有第二条硬约束：tag 指向的 commit 必须在 `origin/master` 路径上。工作流通过 `git merge-base --is-ancestor` 校验该约束（`.github/workflows/release.yml:48-51`），不满足时直接失败，避免在 feature 分支上误打 tag 后发出脏镜像。

### 构建与推送

通过 tag 校验后流水线依次执行：

1. `pnpm install --frozen-lockfile` 安装依赖。
2. `pnpm build` 完成 Next.js 生产构建。`DB_TYPE=postgres` 与 `NEXT_TELEMETRY_DISABLED=1` 在构建期注入，应用版本号通过 `NEXT_PUBLIC_APP_VERSION` 注入（取自 tag 去掉前缀 `v` 后的部分）。
3. `actionlint` 校验所有工作流文件本身。
4. `docker/setup-buildx-action` 准备 Buildx，`docker/login-action` 用 `GITHUB_TOKEN` 登录 `ghcr.io`。
5. `docker/metadata-action` 生成镜像 tag 集合。
6. `docker/build-push-action` 推送镜像，平台限定 `linux/amd64`，构建缓存通过 `type=gha` 复用。

镜像 tag 的具体生成规则按 `docker/metadata-action` 的 `tags:` 段（`.github/workflows/release.yml:96-100`），合计 4 条：

1. `type=raw,value=<github.ref_name>`：始终生成，使用 push 进来的原始 tag 字符串。
2. `type=semver,pattern=<version>`：始终生成，完整 semver。
3. `type=semver,pattern=<major>.<minor>`：仅稳定 tag（不含 `-` 后缀）。
4. `type=raw,value=latest`：仅稳定 tag。

`<github.ref_name>` 与 `<version>` / `<major>.<minor>` 在 release.yml 的 yaml 中分别对应 GitHub Actions 上下文表达式与 docker/metadata-action 的内置占位符；上述说明用尖括号包住，避免与 VitePress 的 Vue 模板语法冲突，原文里它们仍是带双花括号的标准写法（直接看仓库内 `.github/workflows/release.yml:96-100` 即可）。

带 alpha/beta 后缀的 tag 只会更新与 tag 本身同名的镜像，不会污染 `latest` 与 `MAJOR.MINOR`，避免预览版本被默认拉取到生产环境。

### Release notes 与基线计算

镜像推送完成后流水线再生成 release notes：

- `notes_baseline` 步骤（`.github/workflows/release.yml:116-159`）决定 `git-cliff` 的对比起点：
  - 稳定 tag：取出当前 commit 可达的最近一个稳定 tag（即不带 `-alpha`/`-beta` 后缀的 `vN.N.N`）。
  - alpha/beta tag：取出同一基线版本下、同一渠道的上一颗预发布 tag。如果该基线下没有更早的同渠道 tag，则回退到最近一个稳定 tag。
- `git-cliff` 用 `cliff.toml` 中的规则把 commits 分组成 `New Features` / `Bug Fixes` / `Security` / `Performance` / `Documentation` / `Tests` / `Maintenance` / `Other Changes` 等段（详见 [版本与发布](../architecture/release)）。
- 预发布 tag 渲染 changelog 时会带上 `--ignore-tags '.*-(alpha|beta)\\.[0-9]+$'`，避免预发布版本被当成稳定版本写入对比。

最后 `softprops/action-gh-release` 创建 GitHub Release，body 内嵌前述 metadata 与生成的 changelog。释出的 `release-body.md` 与 `release-metadata.json` 同时作为 artifact 上传，便于事后审计。

### 所需权限与 Environment

工作流声明的最小权限：

```yaml
permissions:
  contents: write # 创建 GitHub Release 时需要
  packages: write # 推送镜像到 ghcr.io 时需要
```

`environment: release` 用来给 release job 绑定 GitHub Environment 上的二次保护：若仓库给 `release` environment 配置了 reviewer 审批策略，则流水线会在 release job 启动前等待人工审批。该机制对个人项目非必要，但对多人协作仓库推荐启用。

## `deploy-personal.yml`：远端 SSH 部署

### 触发方式

只能通过 GitHub Actions 页面手工触发 `workflow_dispatch`。三个输入字段（`.github/workflows/deploy-personal.yml:4-18`）：

| 输入                 | 含义                       | 形式                                                                                                            |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `image_ref`          | 要部署的镜像引用           | `v0.1.0`（自动补全 `ghcr.io/g1331/autorouter:` 前缀）；或完整 `ghcr.io/...` 引用；或 `sha256:...` digest        |
| `environment_name`   | GitHub Environment 名称    | 默认 `personal-production`；作业会绑定到该 environment 的 secrets 与审批策略                                    |
| `confirm_release_id` | 用于二次确认的 release tag | 例如 `v0.1.0`。流水线会校验该 tag 存在、tag 指向的 commit 在 `origin/master` 路径上、对应 GitHub Release 也存在 |

`confirm_release_id` 是一道防呆——必须填写当前要部署的 release tag，且与 `image_ref` 配套。误输入会让流水线在 `validate` 阶段直接拒绝，避免把错版本推上服务器。

### 必须配置的 Secrets

`deploy-personal.yml` 把 `appleboy/ssh-action` 作为运行手段，需要在目标 GitHub Environment（默认 `personal-production`）的 secrets 中配置下列项：

| Secret            | 必填 | 默认值            | 用途                                                                            |
| ----------------- | ---- | ----------------- | ------------------------------------------------------------------------------- |
| `SERVER_HOST`     | 是   | 无                | 目标服务器主机名或 IP                                                           |
| `SERVER_USER`     | 是   | 无                | SSH 登录用户                                                                    |
| `SSH_PRIVATE_KEY` | 是   | 无                | SSH 私钥                                                                        |
| `SERVER_PORT`     | 否   | `22`              | SSH 端口                                                                        |
| `DEPLOY_DIR`      | 否   | `/opt/autorouter` | 部署目录，主 `docker-compose.yml` 与 `.env` 都在该目录下                        |
| `ADMIN_TOKEN`     | 是   | 无                | 管理 API token。首次部署写入 `.env`；每次部署都会用该值覆盖 `.env` 中已有的字段 |

`SSH_PRIVATE_KEY` 推荐使用专为该工作流生成的最小权限密钥，并把对应公钥 `authorized_keys` 中的 `command=` 限定为「只允许 `docker compose` 子命令」之类的策略，进一步收紧风险面（可选）。

### 远端执行流程

工作流登录服务器后逐步执行（`.github/workflows/deploy-personal.yml:78-130`）：

1. `mkdir -p ${DEPLOY_DIR}`，进入该目录。
2. `curl -fsSL -o docker-compose.yml https://raw.githubusercontent.com/<repo>/<release-tag>/docker-compose.yml`，拉取与 `confirm_release_id` 完全对齐的主 compose 文件。
3. 首次部署时 `.env` 不存在，自动生成：`POSTGRES_PASSWORD` 取自 `openssl rand -base64 24` 去掉 `/+=` 后截前 32 字节，`ENCRYPTION_KEY` 取自 `openssl rand -base64 32`，`ADMIN_TOKEN` 来自 GitHub secret，`PORT` 写死为 `3331`。
4. 已有 `.env` 时只覆盖 `AUTOROUTER_IMAGE` 与 `ADMIN_TOKEN` 两行，其余字段保持不变。这是升级 / 回滚的关键路径——切换 release tag 不会重置加密密钥与数据库密码，原数据继续可读。
5. `docker pull "${IMAGE}"` 拉取目标镜像。
6. `docker compose up -d --remove-orphans` 启动整套栈。

第三步生成的 `ENCRYPTION_KEY` 是一次性事件：首次部署成功后该密钥就固化在服务器 `.env` 中，后续工作流不再生成、也不会覆盖。这意味着丢失该 `.env` 等同于丢失整个加密体系（详见 [环境变量参考](./env-reference)）。生产环境强烈建议在首次部署后立刻把该文件备份到密码管理器或离线介质。

::: warning .env 不会自动维护 CLIPROXY* 段
`deploy-personal.yml` 只 `curl` 主 `docker-compose.yml`，不会拉取 `docker-compose.cliproxy.yml`、`cliproxy/` 目录，也不会向 `.env` 写入任何 `CLIPROXY*\*` 字段。需要 OAuth 类上游时，必须按 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar) 手工补齐。
:::

### Verify 阶段

部署完成后流水线立即进入 `Verify deployment` 步骤，这是 `deploy-personal.yml` 与朴素 `docker compose up -d` 最大的差别——CI 会在远端执行一次完整 smoke：

1. 轮询 `docker ps` 直到 `autorouter` 容器进入 `healthy`，最多等 60 秒。
2. `curl http://localhost:${PORT}/api/health`，比对返回 JSON 中的 `version` 字段与 `confirm_release_id`（去掉前缀 `v`）。版本不一致则报错，证明镜像没有正确切换。
3. `curl -H "Authorization: Bearer ${ADMIN_TOKEN}" /api/admin/health?active_only=true`，验证管理 API 鉴权正常。
4. 在容器内启动一个 Node.js 子进程，在 127.0.0.1 上拉起 mock 上游（监听 `3101`），通过 Admin API 创建测试上游与测试 Key，分别发一笔非流式与流式请求经过 `/api/proxy/v1/chat/completions`，验证转发链路与 SSE 流均工作，最后删除测试资源。

第四步的 mock smoke 会把请求经过整条「鉴权 → 选路 → 转发 → 日志 → 计费」链路。只有这一步通过才会写入 `GITHUB_STEP_SUMMARY`，相当于「部署成功」的硬性证明。

## `verify.yml`：PR 与 master 的质量门禁

`verify.yml` 是部署链路的前置：进入 release 流程之前的每一个 PR 都必须先通过这条工作流。一共 6 个 job，并行运行，最后由 `verify-status` 聚合判定：

| Job               | 关键步骤                                                                                  | 失败时含义                                               |
| ----------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `quality`         | `pnpm lint` / `pnpm format:check` / `pnpm exec tsc --noEmit` / `pnpm test:run --coverage` | 代码格式 / 类型 / 单元测试任一不通过                     |
| `build`           | `pnpm build`                                                                              | Next.js 生产构建失败                                     |
| `migration`       | `pnpm db:check:consistency`、`pnpm db:migrate`（两次，验证幂等性）                        | drizzle 迁移目录与 schema 不一致，或迁移在 PG 上无法运行 |
| `proxy-stability` | `pnpm test:proxy-stability`                                                               | 代理转发链路在新构建下不稳定                             |
| `e2e`             | `pnpm exec playwright install --with-deps chromium` + `pnpm e2e`                          | Playwright E2E 用例失败                                  |
| `actionlint`      | `raven-actions/actionlint@v2`                                                             | 工作流语法或常见错误                                     |

`migration` 与 `proxy-stability` 两个 job 在 ubuntu runner 上拉起 `postgres:16-alpine` 服务容器跑真实 PG，避免迁移在内存数据库上「能跑但生产 PG 上失败」的盲区。`migration` 还会连续 `db:migrate` 两次，验证幂等：第二次 apply 应当无变化，否则迁移本身有副作用。

`verify-status` 是 `needs: [...]` 收尾 job，对所有上游 job 的 `result` 做并集判断。GitHub 分支保护规则中把 `verify-status` 设为必需，就一次绑定了全部门禁，无需在保护策略里逐个勾选。

::: tip Dependabot PR 例外处理
所有 install 步骤都按 `github.actor == 'dependabot[bot]'` 选择 `--no-frozen-lockfile`，避免 Dependabot 单独改 `package.json` 时 lockfile 不同步触发 install 失败。配套的 `dependabot-fix.yml` 会在 PR 上自动重生 lockfile 并 push 回 PR 分支。
:::

## 首次配置步骤

按下列顺序完成一次「从 fork 仓库到能用 `deploy-personal.yml` 部署」的配置：

1. **打开 GHCR 写入权限**：仓库 `Settings → Actions → General → Workflow permissions` 选 `Read and write permissions`。`release.yml` 需要 `packages: write` 才能推送镜像。
2. **创建 GitHub Environment**：仓库 `Settings → Environments → New environment`，名称建议沿用默认值 `personal-production`。可选给该 environment 设 reviewer 审批策略，给 deploy 加一道人工确认门。
3. **配置 Secrets**：按上面「必须配置的 Secrets」表，把 `SERVER_HOST` / `SERVER_USER` / `SSH_PRIVATE_KEY` / `ADMIN_TOKEN` 等添加到该 environment。
4. **首发**：本地准备好版本号（修改 `package.json` 的 `version` 字段，新版本应当符合 [版本与发布](../architecture/release) 中描述的命名规则），merge 到 `master`，给该 commit 打 `v0.0.1`（或对应版本）的 tag 并 push：

   ```bash
   git tag v0.0.1
   git push origin v0.0.1
   ```

   `release.yml` 自动触发，几分钟后 `ghcr.io/g1331/autorouter:v0.0.1` 可用。

5. **首次部署**：到 GitHub Actions 页面手工触发 `Personal Deploy`，`image_ref` 填 `v0.0.1`，`confirm_release_id` 填同一个 `v0.0.1`。流水线会通过 SSH 在目标服务器上完成首次部署并自动 smoke。
6. **可选：补 sidecar**：若需要 Codex / Claude / Gemini OAuth 上游，按 [CI 部署后追加 CLIProxyAPI sidecar](./cliproxy-sidecar) 手工补齐。

## 后续升级与回滚

后续每次只需：

- **升级**：在 `master` 上 push 新 tag → 等 `release.yml` 完成 → 手工触发 `deploy-personal.yml`，`image_ref` 与 `confirm_release_id` 都填新 tag。
- **回滚**：手工触发 `deploy-personal.yml`，`image_ref` 与 `confirm_release_id` 填到目标旧 tag 即可。流水线会用旧 tag 对应的 `docker-compose.yml` 与镜像覆盖运行版本，`.env` 中除 `AUTOROUTER_IMAGE` 与 `ADMIN_TOKEN` 外的字段保持原样，数据卷不动，加密密钥不变。

完整的升级与回滚流程见 [升级与回滚](./upgrade-rollback)。

## 来源对照

本页所有事实均来自仓库当前 master 上的下列文件：

- `.github/workflows/release.yml`：tag 校验、镜像 tag 生成规则、release notes 基线计算
- `.github/workflows/deploy-personal.yml`：远端 SSH 流程、首次 `.env` 生成规则、smoke 步骤
- `.github/workflows/verify.yml`：质量门禁 job 拓扑
- `.github/workflows/docs.yml`：VitePress 站点构建与 Pages 部署
- `.github/workflows/dependabot-fix.yml`：lockfile 自动修复
- `cliff.toml`：release notes 模板与分组规则
- `docker-compose.yml`、`docker-compose.cliproxy.yml`：部署编排默认值

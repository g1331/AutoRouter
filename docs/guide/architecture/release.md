---
title: 版本与发布
outline: deep
---

# 版本与发布

AutoRouter 按 SemVer 风格做版本管理，所有正式发布都通过「打 tag → `release.yml` 构建镜像 → 写 GitHub Release」这条链路落地，没有手工写 release notes 的环节。`git-cliff` 按 `cliff.toml` 把 commits 分组渲染成 changelog，镜像 tag 由 `docker/metadata-action` 按规则生成。本页梳理整套流程的版本号规则、tag 形态、release notes 生成、镜像 tag 策略、与升级 / 回滚的衔接。

不在本页范围内的内容：CI 工作流本身见 [GitHub Actions CI 部署](../deployment/github-actions)；部署 / 升级 / 回滚的具体命令见 [升级与回滚](../deployment/upgrade-rollback)；Conventional Commits 在贡献流程里的扮演见 [贡献指南与代码规范](./contributing)。

## 版本号规则

仓库使用 SemVer 风格的 `MAJOR.MINOR.PATCH`，可选追加 `-alpha.N` 或 `-beta.N` 后缀：

| 形态                         | 例子             | 含义                                                        |
| ---------------------------- | ---------------- | ----------------------------------------------------------- |
| `vMAJOR.MINOR.PATCH`         | `v0.2.0`         | 稳定 release，会同时刷新 `latest` 与 `MAJOR.MINOR` 镜像 tag |
| `vMAJOR.MINOR.PATCH-alpha.N` | `v0.3.0-alpha.1` | 公开预览。预发布渠道；不会触碰 `latest` / `MAJOR.MINOR`     |
| `vMAJOR.MINOR.PATCH-beta.N`  | `v0.3.0-beta.2`  | 公开预览。预发布渠道；不会触碰 `latest` / `MAJOR.MINOR`     |

`release.yml` 通过下列正则强制 tag 形态（`.github/workflows/release.yml:39`）：

```text
^v[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta)\.[0-9]+)?$
```

不在该正则范围内的 tag（例如 `v0.1.0-rc.1` 或 `v0.1`）都会被流水线直接拒绝。

### 何时升 PATCH / MINOR / MAJOR

| 升哪一位 | 触发条件                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------- |
| PATCH    | 仅含 bugfix / 文档 / 内部重构；不改公开 API、不引入破坏性 schema 迁移                                 |
| MINOR    | 新增功能；可能新增 schema 列或表，但保持向后兼容；保留旧字段                                          |
| MAJOR    | 不向后兼容的变更：删表 / 删字段 / 改公开 API 行为 / 默认值的不兼容调整 / 强制要求新增的必填环境变量等 |

`0.x` 阶段对 SemVer 的承诺较弱：MINOR 之间可能存在小幅破坏性变更，但仍建议尽量保留向后兼容、并在 release notes 与升级文档里显式列出。

### 何时用 alpha / beta

- **alpha**：内部 / 早期试用。预期会有调整空间，不应当用于生产。
- **beta**：API 表层稳定，邀请较多人试用。可以用于生产，但建议显式 pin 到具体 `-beta.N`。

`alpha` 与 `beta` 的发布频率没有硬性规定。常见路径是「先发若干个 `-alpha.N` 收集反馈，再发若干个 `-beta.N` 稳定一波，最后发对应 `vMAJOR.MINOR.PATCH` 正式版」。

## tag 与提交的关系

`release.yml` 对 tag 指向的 commit 还有一道硬约束（`.github/workflows/release.yml:47-51`）：

```bash
git fetch origin master
if ! git merge-base --is-ancestor "${RELEASE_COMMIT}" origin/master; then
  echo "::error::Release tag must point to a commit contained in origin/master"
  exit 1
fi
```

意思是：tag 必须指向 `origin/master` 路径上的 commit。这条约束防止在 feature 分支上误打 tag 后发出脏镜像，也意味着「先合 PR 到 master、再打 tag」是唯一允许的顺序。

完整发布流程：

1. 在 `master` 上确认要发布的 commit。
2. 在该 commit 上打 tag：

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. `release.yml` 自动触发，跑校验 / 构建 / 推送 / 生成 release。
4. 之后由部署侧通过 [升级与回滚](../deployment/upgrade-rollback) 决定何时切到新镜像。

### 误打 tag 怎么办

如果 tag 已经 push 但 release 不应当发出：

```bash
# 1. 等 release.yml 跑完（被流水线拒绝最干净；若已成功则继续）
git push --delete origin v0.2.0
git tag -d v0.2.0

# 2. 已经创建了 GitHub Release：在 Releases 页面 → 该 release → Delete
# 3. 已经推到 ghcr.io：尝试在 ghcr 控制台删除该 tag 对应的版本
```

仍残留的镜像 tag 会让 `deploy-personal.yml` 仍能拉到错版本，因此误发后的清理必须完整覆盖「git tag、GitHub Release、ghcr.io 镜像」三处。

## 镜像 tag 策略

`docker/metadata-action` 根据 release.yml 中的 `tags:` 段生成镜像 tag 集合（`.github/workflows/release.yml:96-100`）：

```yaml
tags: |
  type=raw,value=${{ github.ref_name }}
  type=semver,pattern={{version}}
  type=semver,pattern={{major}}.{{minor}},enable=${{ !contains(steps.validate.outputs.release_version, '-') }}
  type=raw,value=latest,enable=${{ !contains(steps.validate.outputs.release_version, '-') }}
```

四条规则对应实际生成的 tag（以 `v0.2.0` 与 `v0.3.0-alpha.1` 为例）：

```text
稳定 release (v0.2.0):
  type=raw,value=<ref_name>             →  v0.2.0
  type=semver,pattern=<version>         →  0.2.0
  type=semver,pattern=<major>.<minor>   →  0.2
  type=raw,value=latest                 →  latest

预发布 (v0.3.0-alpha.1):
  type=raw,value=<ref_name>             →  v0.3.0-alpha.1
  type=semver,pattern=<version>         →  0.3.0-alpha.1
  type=semver,pattern=<major>.<minor>   →  —（不生成）
  type=raw,value=latest                 →  —（不生成）
```

上面示意里 `<ref_name>` / `<version>` / `<major>.<minor>` 在 release.yml 的原始 yaml 中分别对应 GitHub Actions 上下文表达式与 docker/metadata-action 的占位符（实际写法见上一个 yaml 代码块）。

设计目的：

- `latest` 与 `MAJOR.MINOR` 滚动 tag 始终指向最新稳定版，方便快速试用。
- 预发布 tag 只创建「与 tag 自身同名」的镜像，避免预览版本被默认拉取到生产。
- `v0.2.0` 与 `0.2.0` 同时存在，是为了兼容部分客户端只识别带 / 不带 `v` 前缀两种风格。

::: warning 生产部署不要用 latest
`latest` 的好处是「不需要查最新版本号」，代价是每次 release 后语义在悄悄漂移。生产部署应当显式 pin 到具体 `vMAJOR.MINOR.PATCH` 或 `@sha256:<digest>`，详见 [升级与回滚](../deployment/upgrade-rollback)。
:::

## 镜像平台与构建缓存

`docker/build-push-action` 在 release.yml 中固定 `platforms: linux/amd64`。当前不构建 arm64 镜像；arm 平台的部署需要自行 build。

构建缓存通过 `type=gha` 复用 GitHub Actions 缓存，跨同一仓库的不同 release 共享，减少重复构建成本。缓存的 invalidation 由 buildx 自身管理，通常不需要人工干预。

## release notes 自动生成

release notes 不写手稿，由 `git-cliff` + `cliff.toml` 自动渲染。

### 基线计算

每次发布要确定一个「对比起点」（previous tag），release notes 的内容是「上次到本次之间的所有 commits」。基线计算逻辑见 `release.yml:116-159`：

| 当前 tag 类型    | 基线选择                                                               |
| ---------------- | ---------------------------------------------------------------------- |
| 稳定 `vN.N.N`    | 取当前 commit 可达的最近一个稳定 tag                                   |
| `vN.N.N-alpha.N` | 取「同一基线下同渠道的上一颗预发布 tag」，没有则回退到最近一个稳定 tag |
| `vN.N.N-beta.N`  | 取「同一基线下同渠道的上一颗预发布 tag」，没有则回退到最近一个稳定 tag |

举例：

- `v0.2.0` 之前的稳定 tag 是 `v0.1.0`，基线就是 `v0.1.0`。
- `v0.3.0-alpha.1` 是某基线下首颗 alpha，没有同渠道前任，基线退化到最近的稳定 `v0.2.0`。
- `v0.3.0-alpha.2`：基线是 `v0.3.0-alpha.1`。
- `v0.3.0-beta.1`：基线是「v0.3.0 基线下同渠道（beta）」的上一颗 beta；没有则退化到最近稳定。

稳定 tag 渲染 changelog 时会带上 `--ignore-tags '.*-(alpha|beta)\\.[0-9]+$'`，避免预发布 tag 被 git-cliff 当作稳定对比基线。

### commit 分组

`cliff.toml:44-56` 定义了 commit 前缀到分组的映射：

| 前缀                     | 分组          |
| ------------------------ | ------------- |
| `feat`                   | New Features  |
| `fix`                    | Bug Fixes     |
| `security`               | Security      |
| `perf`                   | Performance   |
| `docs` / `doc`           | Documentation |
| `test`                   | Tests         |
| `refactor`               | Maintenance   |
| `ci` / `build` / `chore` | Maintenance   |
| 其他                     | Other Changes |

`cliff.toml:13` 把分组顺序固定为：

```
New Features → Bug Fixes → Security → Performance → Documentation → Tests → Maintenance → Other Changes
```

每条 commit 渲染时按 commit subject（或者关联 PR 的 title）展示，自动追加 PR 链接：

```text
- Some commit subject ([#42](https://github.com/g1331/AutoRouter/pull/42))
```

`cliff.toml:33-35` 的 postprocessor 会把 commit subject 中开头的 `feat(scope)!:` / `fix:` 等前缀去掉，避免 release notes 中重复出现「fix: fix bug」之类的累赘。

`Merge pull request` 与 `Merge branch` 会被显式 skip。

### release body 结构

release.yml 把 release body 拼接为：

```
## Release Metadata

- Tag: ...
- Release version: ...
- Package version: ...
- Commit: ...
- Previous tag: ...
- Compare range: ...
- Image: ghcr.io/g1331/autorouter:vN.N.N
- Image digest: sha256:...

## Generated Notes

<git-cliff 渲染结果>

## Changelog

Full Changelog: https://github.com/g1331/AutoRouter/compare/<previous>...<current>
```

每次 release 都会同时上传 `release-body.md` 与 `release-metadata.json` 作为 artifact，便于事后审计「这个 release 的镜像 digest 是多少」「对比基线是哪一颗 tag」等问题。

## `package.json` version 与 tag 的关系

`release.yml:36-37` 在校验阶段读取 `package.json` 中的 `version`，与 tag（去掉 `v` 前缀）做对比并双写进 release metadata：

```bash
PACKAGE_VERSION=$(node -p "require('./package.json').version")
ACTUAL_TAG="${GITHUB_REF_NAME}"
```

当前流水线**不强制**两者一致——`release-metadata.json` 中分别记录 `releaseVersion`（来自 tag）与 `packageVersion`（来自 `package.json`）。推荐每次打 tag 前都在 PR 中同步更新 `package.json` 的 `version` 字段，让两者保持一致，避免 `npm version` 与 git tag 漂移。

实际应用版本号通过 `NEXT_PUBLIC_APP_VERSION` 注入到镜像构建产物里（`release.yml:73`），并由 `/api/health` 端点返回。`deploy-personal.yml` 的 verify 阶段会比对 `/api/health` 返回的 `version` 与 `confirm_release_id`，二者必须一致。

## 发布前检查清单

打 tag 之前确认：

| 检查                                                             | 处理                               |
| ---------------------------------------------------------------- | ---------------------------------- |
| 当前 commit 在 `origin/master` 上                                | 否则 `release.yml` 直接拒绝        |
| `package.json` 的 `version` 已更新到目标版本号                   | PR 中同步改                        |
| `verify.yml` 在该 commit 上已经 `verify-status` 通过             | 否则发出去的镜像可能有未发现的回归 |
| 涉及 schema 变更：迁移已生成、`db:check:consistency` 通过        | PR 阶段就要确认                    |
| 涉及破坏性变更：commit / PR title 已 `feat!:` / `fix!:` 显式标注 | 影响后续 changelog 解读            |
| `docker-compose.yml` 与 `docker-compose.cliproxy.yml` 改动       | 升级文档中要交代清楚               |

预发布渠道（alpha/beta）的检查清单可以略松，但破坏性变更与 schema 迁移仍然必须显式标注。

## 与升级 / 回滚的衔接

| 文档                                                   | 衔接点                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| [GitHub Actions CI 部署](../deployment/github-actions) | 镜像构建、远端 SSH 部署、smoke 步骤的细节                  |
| [升级与回滚](../deployment/upgrade-rollback)           | `AUTOROUTER_IMAGE` 切换的实际操作、schema 兼容性的处理顺序 |
| [数据持久化与备份](../deployment/persistence-backup)   | 破坏性升级前的 `pg_dump` 必要性                            |
| [贡献指南与代码规范](./contributing)                   | Conventional Commits 前缀如何影响 release notes 分组       |

## 来源对照

- `.github/workflows/release.yml`：tag 校验、镜像 tag 规则、基线计算、release body 拼装
- `.github/workflows/deploy-personal.yml`：verify 阶段如何比对 `/api/health.version` 与 `confirm_release_id`
- `cliff.toml`：commit 分组规则与 postprocessor
- `package.json`：`version` 字段与 `release.yml` 的版本比对
- `docker-compose.yml`：`AUTOROUTER_IMAGE` 默认 `ghcr.io/g1331/autorouter:latest` 的来源

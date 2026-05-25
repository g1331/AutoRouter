---
title: 贡献指南与代码规范
outline: deep
---

# 贡献指南与代码规范

本页面向第一次给 AutoRouter 提交 PR 的人：从在哪里讨论需求、用什么分支、代码风格如何统一、pre-commit 钩子做什么、PR 合入路径、OpenSpec 提案的使用场景。所有规则的事实来源是仓库中的 `.pre-commit-config.yaml`、`eslint.config.mjs`、`.prettierrc`、`.github/workflows/verify.yml`、`openspec/` 目录。本文只是把这些零散事实串成可执行的协作路径。

不在本页范围内的内容：测试如何组织见 [测试策略](./testing)；版本号与 release 流程见 [版本与发布](./release)；CI 工作流细节见 [GitHub Actions CI 部署](../deployment/github-actions)。

## 协作前先看哪几样

建议在动手写代码之前先看：

| 资料                           | 看的目的                                               |
| ------------------------------ | ------------------------------------------------------ |
| 仓库 `master` 分支 `README.md` | 当前能力、技术栈、运行方式                             |
| `CLAUDE.md`                    | 项目对协作者的约定（含代码风格、目录布局、常用命令）   |
| GitHub Issues                  | 是否已有相关讨论或正在做的变更                         |
| `openspec/` 目录               | 大型变更的提案、规格、任务拆解（详见下文 OpenSpec 段） |
| `.github/workflows/verify.yml` | PR 要通过哪些 CI 门禁                                  |

避免重复造轮子的最好办法是先在 issue 区或现有 OpenSpec 变更里找一遍，再决定要不要新开。

## 分支与提交

### 分支

- 主分支：`master`。所有 PR 合入 `master`，再由 `release.yml` 在打 tag 时构建镜像。
- 功能分支：从 `master` 拉取，命名建议带前缀，例如 `feat/xxx`、`fix/xxx`、`docs/xxx`、`chore/xxx`、`refactor/xxx`。
- 实验分支：长期未合的实验性分支不建议留在 origin 上，本地用即可。

### Commit 信息

仓库使用 Conventional Commits 风格，`cliff.toml` 中的 `commit_parsers`（`cliff.toml:44-56`）把以下前缀映射到 release notes 分组：

| 前缀                     | 进入 release notes 哪一组 |
| ------------------------ | ------------------------- |
| `feat`                   | New Features              |
| `fix`                    | Bug Fixes                 |
| `security`               | Security                  |
| `perf`                   | Performance               |
| `docs` / `doc`           | Documentation             |
| `test`                   | Tests                     |
| `refactor`               | Maintenance               |
| `ci` / `build` / `chore` | Maintenance               |
| 任何其他                 | Other Changes             |

带 scope 也可以（例如 `feat(billing): ...`），release notes 渲染时会自动去掉 `(scope)!:` 这一段。`Merge pull request` 与 `Merge branch` 在 release notes 中跳过。

把每个 commit 的第一行写成「能直接进 release notes 的描述」是一个低成本的协作习惯——这样 release notes 不需要后期手工润色。

### 不要做的

- `--no-verify` 跳 pre-commit。CLAUDE.md 已经显式禁止。
- 一次 PR 把无关的多个主题混在一起。多主题 PR 评审困难、回滚困难、release notes 也会脏。
- 大段的「顺手清理 / 重排顺序 / 改命名」夹在主题改动里。这类纯格式 / 命名变更最好单独 PR。

## 代码风格

| 工具       | 配置文件                         | 触发时机                                        |
| ---------- | -------------------------------- | ----------------------------------------------- |
| Prettier   | `.prettierrc`                    | pre-commit 钩子 + `verify.yml` 的 `quality` job |
| ESLint     | `eslint.config.mjs`              | pre-commit 钩子 + `verify.yml`                  |
| TypeScript | `tsconfig.json` + `tsc --noEmit` | pre-commit 钩子 + `verify.yml`                  |

### Prettier

仓库的 `.prettierrc`：

```json
{
  "singleQuote": false,
  "trailingComma": "es5",
  "semi": true,
  "printWidth": 100,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

要点：双引号；结尾分号；行宽 100；箭头函数始终带括号；行尾 LF。Windows 上 git 默认会把 LF 转 CRLF，建议在仓库目录下：

```bash
git config core.autocrlf false
```

避免在 commit 时把 LF 误转成 CRLF 导致 Prettier 整文件 reformat。

### ESLint

`eslint.config.mjs` 基于 `eslint-config-next` 的 `core-web-vitals` 与 `typescript` 预设，附加几条本地规则：

| 规则                                | 取值                                                     | 用途                                       |
| ----------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| `no-console`                        | `warn`，允许 `console.warn` / `console.error`            | 防止误把临时 `console.log` 留到生产代码    |
| `no-restricted-imports`             | 禁 `../*../*`                                            | 阻止三层及以上相对路径，强制走 `@/` 别名   |
| `@typescript-eslint/no-unused-vars` | `warn`，允许 `^_` 前缀                                   | 未用变量降为告警，便于在工作过程中保留占位 |
| `tsdoc/syntax`                      | `warn`（针对 `src/**/*.ts`，跳过 components/hooks）      | 公共 API 的 TSDoc 语法校验                 |
| `jsdoc/*`                           | `warn`（针对 `src/lib/services/**` 与 `src/app/api/**`） | service 与 API 入口要求最低限度的文档覆盖  |

`pnpm lint` 即跑全套；本地修复用 `pnpm exec eslint --fix <文件>`。

### TypeScript

整个仓库走 strict 模式（`tsconfig.json` 内 `"strict": true`）。CI 与 pre-commit 钩子都跑 `pnpm exec tsc --noEmit`。本地写代码时若 IDE 与 CLI 报错不一致，先在 IDE 里 reload TS server，再看是否有 stale 缓存。

CLAUDE.md 显式说明：**不写无依据的防御性编程 / 埋雷式保护逻辑**。这条不被 eslint 强制，但属于评审时会反复提的口径。

## pre-commit 钩子

仓库使用 Python `pre-commit` 框架（不是 husky）。配置在 `.pre-commit-config.yaml`，本地安装：

```bash
pip install pre-commit            # 或 pipx install pre-commit
pre-commit install                # 写入 .git/hooks/pre-commit
```

`.pre-commit-config.yaml` 中的钩子分两段：

### 通用文件检查

来自 `pre-commit/pre-commit-hooks` 的标准 hooks：

| 钩子                      | 触发条件                                                             |
| ------------------------- | -------------------------------------------------------------------- |
| `check-added-large-files` | 拒绝大于 500 KB 的文件（`docs/images/` 例外）                        |
| `check-yaml`              | 校验 YAML 语法（`.claude` / `.codex` / `.gemini` / `openspec` 排除） |
| `check-toml`              | 校验 TOML 语法                                                       |
| `check-json`              | 校验 JSON 语法                                                       |
| `end-of-file-fixer`       | 文件结尾必须有换行                                                   |
| `trailing-whitespace`     | 行尾无空白                                                           |

### 本地 hooks

| 钩子       | 命令                         | 范围                                         |
| ---------- | ---------------------------- | -------------------------------------------- |
| `prettier` | `pnpm exec prettier --check` | `*.(js,jsx,ts,tsx,css,json,md,yml,yaml)`     |
| `eslint`   | `pnpm exec eslint --fix`     | `src/**/*.(js,jsx,ts,tsx)`                   |
| `tsc`      | `pnpm exec tsc --noEmit`     | 仓库内有 `*.ts` / `*.tsx` 改动时全量类型检查 |

`tsc` 钩子设置了 `pass_filenames: false`：单文件改动也会触发全量类型检查，因为 TypeScript 的依赖图意味着小改动可能让其他文件报错。

::: warning 不要用 --no-verify 跳过失败
任何 pre-commit 失败都应该先修复再 commit，不要用 `git commit --no-verify` 跳过。CI 的 `verify.yml` 会跑同样的检查；本地跳过只是把失败推到 PR 审查阶段，浪费协作者时间。
:::

如果钩子误报或确实需要跳过，按下面顺序处理：

1. 大文件超过 500KB：先确认是不是该提交（是不是构建产物 / 依赖 / 临时数据）。是就放在 `.gitignore` 里；确实需要的资源在 `.pre-commit-config.yaml` 中 explicit allowlist。
2. Prettier 误报：通常是行尾或换行问题。`pnpm exec prettier --write <文件>` 让 Prettier 自动修复。
3. ESLint 报某条规则太严：先看是不是项目层面的口径问题；若确实需要例外，按 ESLint 的 `// eslint-disable-next-line <rule>` 单行 disable，并在 commit 里说明原因。

## PR 流程

1. **提 issue 或留言**：若改动属于「方案有不同选择」「会改公共接口」「跨多个模块」，先在 issue / OpenSpec 提案里说明意图，避免方向走错。
2. **拉分支、写实现、跑测试**：本地至少跑 `pnpm test:run` 与 `pnpm exec tsc --noEmit`，必要时跑 `pnpm e2e`。
3. **提 PR**：标题与首条 commit 风格一致（Conventional Commits）；PR body 简要写：动机、改了什么、是否引入破坏性变更、是否需要数据库迁移。模板可参考 `cliff.toml` 各分组的实际产出。
4. **等 CI**：`verify.yml` 的 `verify-status` 必须通过；docs 改动会触发 `docs.yml`。CI 失败先看日志而不是反复重试。
5. **响应 review**：fix 类响应直接 push 新 commit；不强行 rebase / squash，PR 合入时由 reviewer 选合并策略。
6. **合入**：默认由 reviewer 操作 merge。仓库近期实际历史以 merge commit（`Merge pull request #N from ...`）为主，配合 `cliff.toml:45` 中显式 `skip` 这类 commit 的设定，保证 release notes 渲染时只看到主题 commit。需要 squash 把多个 fixup 合并的话由 reviewer 决定。

## OpenSpec 提案

仓库内置 OpenSpec 工作流（目录 `openspec/`）。当一项变更同时具备以下任一特征时，建议先开 OpenSpec 提案再动手写代码：

- 影响多个模块的设计选择，例如新增一类上游 / 改写鉴权流程。
- 引入新的运行期组件（后台任务、缓存层、外部依赖）。
- 涉及公开 API / 数据库 schema 变更，且不止 1～2 张表。
- 需要在 PR 之间共享语境，例如「先合 A 再合 B」。

OpenSpec 把变更拆成几类 artifact：

| Artifact      | 作用                                         |
| ------------- | -------------------------------------------- |
| `proposal.md` | 问题动机、目标、不在范围内的内容             |
| `design.md`   | 设计决策、考虑过但否决的方案、关键 trade-off |
| `tasks.md`    | 落实拆解（phase + 任务）                     |
| `specs/...`   | 规格 spec（新增或 delta）                    |

新建变更的方式：通过 `openspec` 系列命令（详见仓库 `openspec/config.yaml` 与命令使用说明）或直接在 `openspec/changes/<change-id>/` 下手动创建。完成后通过 `openspec archive` 把变更归档到 `openspec/changes/archive/`。

::: tip OpenSpec 不是必选门槛
小范围 bugfix、文档补齐、依赖升级、零散重构等并不需要走 OpenSpec。判断依据：「半小时内能讲清楚的改动」一般不需要。开 OpenSpec 反而拖慢。
:::

## 文档变更约定

仓库的 `docs/` 目录采用 VitePress 站点（详见 [GitHub Actions CI 部署](../deployment/github-actions) 中 `docs.yml` 的部分）。新增 / 修改文档要点：

- 文件使用 `.md` 扩展名，frontmatter 至少包含 `title` 与 `outline: deep`。
- 链接到其他文档使用相对路径（例如 `[环境变量参考](./env-reference)`），不要用绝对路径。
- 新增页面同时更新 `docs/.vitepress/config.ts` 中对应 sidebar，否则页面只能通过直链访问。
- 不要在 commit 里添加自动生成的 `docs/.vitepress/dist/` 产物。
- 涉及多语言时同步 `docs/en/`；目前 `docs/en/` 仅有 placeholder，新增中文文档时不强制要求同步英文版本。

文档类 PR 与代码类 PR 走相同的 CI 门禁；`docs.yml` 会校验 VitePress 构建本身是否通过。

## 提交内容的边界

CLAUDE.md 写得很清楚：

- 只修改与任务相关的文件。
- 避免引入无关的结构调整、命名变动和样式漂移。
- 保留与当前任务无关的已有改动。
- 未经明确授权，不执行破坏性操作。

实际操作上的几个判定：

| 情形                                       | 处理                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| 顺手发现旁边一段代码不规范                 | 单独开 PR 修；本 PR 不混入                                                      |
| 升级一个依赖时发现 lockfile 大幅变化       | 用 `pnpm install --frozen-lockfile` 验证；diff 中确认确实是该依赖的传递依赖变化 |
| 改 schema 想顺手清理一张「看起来没用的表」 | 不要。这种表往往在某个角落仍被引用；先确认引用情况再单独 PR                     |
| 改 UI 顺手把一个组件目录重命名             | 把重命名与功能改动分两个 PR                                                     |

每个 PR 越窄，被合入的概率越高，回滚的成本越低。

## 来源对照

- `.pre-commit-config.yaml`：钩子定义与排除规则
- `eslint.config.mjs`：ESLint 规则集与文件作用域
- `.prettierrc`：格式化口径
- `tsconfig.json`：TypeScript 严格模式约束
- `.github/workflows/verify.yml`：CI 门禁的实际命令
- `cliff.toml`：commit 前缀到 release notes 分组的映射
- `openspec/config.yaml`、`openspec/changes/`、`openspec/specs/`：OpenSpec 工作流的事实来源
- `CLAUDE.md`：项目协作口径

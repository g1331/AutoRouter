# Code-Argus 设计文档

> AI Code Review Bot 设计方案
>
> 日期: 2025-12-18

## 项目概述

**Code-Argus** 是一个基于 OpenAI Codex 的 AI Code Review Bot，为 PR 提供高质量的自动化代码审查。

### 核心理念

- 只发布可能影响合并决策的评论
- 关注正确性、安全、架构、测试，不做风格检查
- 理解完整代码库上下文
- 高信噪比：宁缺毋滥

### 核心特性

- GitHub 原生 Suggested Changes，一键应用修复
- 支持自定义 API endpoint（兼容 Azure、代理、本地部署）
- 完全开源，可自托管

### 技术栈

- GitHub Actions + `openai/codex-action`
- OpenAI Codex（GPT-5.x 系列）
- 支持自定义 base URL 和 API key

---

## 触发机制与工作流程

### 触发方式

| 场景 | 触发条件 |
|------|----------|
| PR 创建 | `pull_request: [opened, reopened]` 自动触发 |
| 手动触发 | 评论 `code-argus review` / `argus review` / `code-argus 审查` |

### 权限控制

所有触发（自动/手动）都会检查权限，仅 collaborators (admin/write) 可执行 review

### 工作流程

```
1. PR 创建 / 评论触发
        ↓
2. [prepare] 检查权限 + 获取 PR 元信息
        ↓
3. [agent] Checkout 代码 + 准备 prompt
        ↓
4. [agent] Codex 深度分析（可探索代码库上下文）
        ↓
5. [publish] 发布 PR Review（总结 + 行内评论）
```

---

## 输出格式

### 行内评论结构

```markdown
## 🔴 [严重性] 问题标题

问题描述：简洁说明问题是什么、为什么有风险。

\`\`\`suggestion
// 修复后的代码
const sanitized = DOMPurify.sanitize(html);
\`\`\`
```

### 严重性级别

| 级别 | 标识 | 含义 |
|------|------|------|
| High | 🔴 | 必须修复（安全漏洞、严重 bug） |
| Medium | 🟡 | 建议修复（潜在问题、边界情况） |
| Low | 🟢 | 可选优化（代码质量提升） |

### 总结评论结构

```markdown
## Code-Argus Review

Review completed. **3** suggestions posted.

| 严重性 | 数量 |
|--------|------|
| 🔴 High | 1 |
| 🟡 Medium | 2 |

**关注领域**: 安全性、错误处理

---
评论 `code-argus review` 可重新触发审查
```

---

## 配置文件

### 配置文件位置

`.github/reviewbot.yaml`

### 当前支持的配置

```yaml
# Code-Argus 配置文件
# 位置: .github/reviewbot.yaml

language: auto          # auto | zh-CN | en-US（默认跟随 PR）
max_comments: 10        # 软上限，超过只保留最重要的
min_severity: low       # 最低显示级别: high | medium | low
```

> **注意**：配置文件解析依赖 `yq` 工具。若 runner 没有安装 `yq`，将使用默认值。

### 未来计划支持的配置（v1.1+）

```yaml
# 触发设置
triggers:
  on_pr_open: true
  keywords: ["code-argus review", "argus review"]

# Review 重点
focus:
  correctness: true
  security: true
  architecture: true
  testing: true

# 自定义规则
areas:
  api:
    globs: ["src/api/**"]
    rules:
      - id: auth_required
        description: "所有 API 端点必须有身份验证"
        severity: high
```

---

## GitHub Action Workflow

### 实现方式

直接使用 `openai/codex-action` + 自定义 prompt，无需编写额外代码。

### 所需 Secrets/Variables

| 名称 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `CODEX_API_KEY` | Secret | 是 | API 密钥 |
| `CODEX_BASE_URL` | Secret | 是 | API 端点（格式：`https://api.example.com/v1`） |
| `CODEX_MODEL` | Variable | 否 | 模型名称（默认：`gpt-5.2-codex`） |

### Workflow 结构

当前实现采用 3 个 jobs 的架构：

```yaml
name: Code-Argus Review

on:
  pull_request:
    types: [opened, reopened]
  issue_comment:
    types: [created]

concurrency:
  group: code-argus-${{ github.event.pull_request.number || github.event.issue.number || github.run_id }}
  cancel-in-progress: true

jobs:
  # Job 1: 权限检查 + PR 元信息
  prepare:
    runs-on: ubuntu-latest
    outputs:
      allowed: ${{ steps.check_perm.outputs.allowed }}
      pr_number: ${{ steps.prmeta.outputs.number }}
      base_ref: ${{ steps.prmeta.outputs.base_ref }}
    steps:
      - name: Check permissions
        # 检查是否为 collaborator (admin/write)
      - name: Get PR metadata
        # 获取 PR 号和 base 分支

  # Job 2: Codex 分析
  agent:
    needs: prepare
    if: needs.prepare.outputs.allowed == 'true'
    timeout-minutes: 45
    outputs:
      review_output: ${{ steps.review.outputs.final-message }}
    steps:
      - name: Checkout
      - name: Load config
        # 读取 .github/reviewbot.yaml
      - name: Prepare prompt file
        # 生成包含 diff 的 prompt
      - name: Run Code-Argus
        uses: openai/codex-action@v1
        with:
          openai-api-key: ${{ secrets.CODEX_API_KEY }}
          responses-api-endpoint: ${{ secrets.CODEX_BASE_URL }}/responses
          model: ${{ steps.config.outputs.model }}
          effort: xhigh
          sandbox: read-only
          prompt-file: .github/codex/prompts/review.md
          output-schema: |
            { ... }  # 结构化 JSON schema

  # Job 3: 发布评论
  publish:
    needs: [prepare, agent]
    if: needs.prepare.outputs.allowed == 'true' && always()
    steps:
      - name: Post review comments
        # 使用 pulls.createReview 发布总结 + 行内评论
```

### 文件结构

```
.github/
├── workflows/
│   └── code-argus.yml       # 主 workflow（核心文件）
└── reviewbot.yaml           # 可选配置
```

---

## Prompt 设计

### 核心 Prompt

```markdown
# Code-Argus Review Instructions

You are Code-Argus, an expert code reviewer focused on high-impact issues.

## Core Principles

1. **High signal-to-noise**: Only comment if it would likely change a merge decision
2. **No style nits**: Never comment on formatting, naming conventions, or subjective preferences
3. **Actionable feedback**: Every comment must include a concrete fix

## Review Focus Areas

- **Correctness**: Logic errors, edge cases, null handling, race conditions
- **Security**: XSS, injection, auth bypass, sensitive data exposure
- **Architecture**: Breaking changes, API compatibility, cross-system impact
- **Testing**: Missing tests for critical paths, inadequate coverage

Do NOT comment on:
- Code style, formatting, or naming conventions
- Minor optimizations that don't affect functionality
- Personal preferences or "nice to have" suggestions

## Instructions

1. You MAY read any file in the repository and run searches to understand context
2. Review ONLY the changes in this PR (diff provided below); use other files only for context and impact verification
3. Sort issues by severity (high first), then limit to max_comments
4. If language is 'auto', respond in the same language as the PR title/description
5. If no significant issues found, return empty comments array
6. Output ONLY the JSON object, no other text
```

> **关键设计**：通过 `You MAY read any file in the repository` 授权 Agent 探索代码库，
> 即使使用 `output-schema` 约束最终输出格式，Agent 内部仍可多轮调用工具读取文件、搜索代码。

---

## 错误处理与边界情况

### 当前实现的错误处理

| 场景 | 处理方式 |
|------|----------|
| 无权限触发 | 静默忽略，不执行 review |
| Agent 执行失败 | 发评论提示失败，附带 workflow logs 链接 |
| 输出为空 | 发评论提示无输出，可重试 |
| JSON 解析失败 | 发评论提示解析失败，可重试 |
| 无问题发现 | 发总结："No significant issues found." |

### 未来计划的错误处理（v1.1+）

| 场景 | 计划处理方式 |
|------|----------|
| API 超时/限流 | 重试 3 次，间隔指数退避 |
| PR 过大（>500 文件） | 只审查前 100 个变更文件 |
| 跳过特定文件类型 | `*.lock`, `*.min.js`, `dist/**` 等 |

---

## 实施计划

### v1.0 - MVP（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| PR 创建自动触发 | ✅ | `pull_request: [opened, reopened]` |
| 评论关键词触发 | ✅ | `code-argus review` / `argus review` / `code-argus 审查` |
| 行内评论 + Suggested Changes | ✅ | GitHub 原生 suggestion 代码块 |
| 总结评论 | ✅ | 统计 + 关注领域 |
| 自定义 API endpoint | ✅ | 通过 `CODEX_BASE_URL` Secret |
| 模型可配置 | ✅ | 通过 `CODEX_MODEL` Variable |
| 代码库上下文探索 | ✅ | Agent 可读取仓库任意文件 |
| 基础配置文件支持 | ⚠️ | 仅支持 `language`, `max_comments`, `min_severity` |
| 仅 collaborators 权限 | ✅ | admin/write 权限检查 |
| 并发控制 | ✅ | `cancel-in-progress` 避免重复 review |

#### 技术发现：output-schema 与 Agent 探索

在开发过程中，我们最初误以为 `output-schema` 会限制 Agent 的探索能力（只能单轮返回）。
经过测试验证：

```
误解: output-schema = 单轮，无法探索代码库
实际: output-schema 只约束最终输出格式，Agent 内部仍可多轮调用工具
```

**解决方案**：在 prompt 中明确授权 `You MAY read any file in the repository`，
Agent 就会在需要时读取相关文件、搜索代码，最终输出符合 schema 的 JSON。

这意味着**不需要两阶段设计**，单次 Codex 调用即可实现：
- Agent 自由探索代码库上下文
- 结构化 JSON 输出

### v1.1 - 配置增强（计划中）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 自定义 review 关注点 | P1 | 配置文件中定义 focus areas |
| 自定义触发关键词 | P2 | 配置文件中定义 triggers |
| 自定义规则（areas + rules） | P2 | 按文件路径定义特定规则 |

### v2.0 - 进阶

- 升级为 GitHub App（支持 @code-argus 提及）
- PR Summary 自动生成
- 增量 Review（仅审查新增 commits）
- Review 结果缓存（避免重复分析）

---

## 设计决策汇总

| 项目 | 决策 |
|------|------|
| 名称 | Code-Argus |
| 技术栈 | GitHub Action + openai/codex-action |
| 架构 | 3 jobs: prepare → agent → publish |
| 模型 | 可配置（默认 `gpt-5.2-codex`） |
| 触发 | PR 创建自动 + 手动（`code-argus review` / `argus review` / `code-argus 审查`） |
| 输出 | PR Review（总结 + 行内 Suggested Changes） |
| 重点 | 正确性/安全/架构/测试，不做风格 |
| 上下文 | Agent 可探索完整代码库 |
| 配置 | `.github/reviewbot.yaml`（3 项） |
| 语言 | 默认跟随 PR，可配置 |
| 权限 | 仅 collaborators (admin/write) |

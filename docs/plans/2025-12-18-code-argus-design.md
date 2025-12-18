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

仅 collaborators 可触发手动 review

### 工作流程

```
1. PR 创建 / 评论触发
        ↓
2. 检查权限（是否 collaborator）
        ↓
3. 获取 PR diff + 代码库上下文
        ↓
4. 读取配置（.github/reviewbot.yaml + CLAUDE.md）
        ↓
5. 调用 Codex 进行深度分析
        ↓
6. 按严重性排序，筛选最重要的问题
        ↓
7. 发布行内评论（带 Suggested Changes）
        ↓
8. 发布总结评论
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

### 完整配置示例

```yaml
# Code-Argus 配置文件

# 基础设置
language: auto          # auto | zh-CN | en-US（默认跟随 PR）
max_comments: 10        # 软上限，超过只保留最重要的
min_severity: low       # 最低显示级别: high | medium | low

# 触发设置
triggers:
  on_pr_open: true      # PR 创建时自动触发
  keywords:             # 手动触发关键词
    - "code-argus review"
    - "argus review"
    - "code-argus 审查"

# 权限控制
permissions:
  allowed_users:
    - collaborators     # collaborators | contributors | everyone

# Review 重点
focus:
  correctness: true     # 正确性/Bug
  security: true        # 安全问题
  architecture: true    # 架构/设计
  testing: true         # 测试覆盖
  performance: false    # 性能问题（默认关闭）
  style: false          # 代码风格（永远关闭）

# 自定义规则
areas:
  api:
    globs: ["src/api/**", "routes/**"]
    rules:
      - id: auth_required
        description: "所有 API 端点必须有身份验证"
        severity: high
  database:
    globs: ["src/db/**", "models/**"]
    rules:
      - id: no_raw_sql
        description: "禁止拼接 SQL，使用参数化查询"
        severity: high
```

### 配置优先级

```
.github/reviewbot.yaml > CLAUDE.md / AGENTS.md > 默认配置
```

---

## GitHub Action Workflow

### 实现方式

直接使用 `openai/codex-action` + 自定义 prompt，无需编写额外代码。

### 所需 Secrets/Variables

| 名称 | 类型 | 说明 |
|------|------|------|
| `CODEX_API_KEY` | Secret | API 密钥 |
| `CODEX_BASE_URL` | Variable | 可选，自定义 endpoint（默认 OpenAI 官方） |

### Workflow 示例

```yaml
name: Code-Argus Review

on:
  pull_request:
    types: [opened, reopened]
  issue_comment:
    types: [created]

jobs:
  review:
    runs-on: ubuntu-latest
    if: |
      github.event_name == 'pull_request' ||
      (github.event.issue.pull_request &&
       contains(github.event.comment.body, 'argus review'))

    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Check permissions
        id: check_perm
        uses: actions/github-script@v7
        with:
          script: |
            const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
              owner: context.repo.owner,
              repo: context.repo.repo,
              username: context.actor
            });
            return ['admin', 'write'].includes(data.permission);

      - name: Checkout
        if: steps.check_perm.outputs.result == 'true'
        uses: actions/checkout@v4
        with:
          ref: refs/pull/${{ github.event.pull_request.number || github.event.issue.number }}/merge

      - name: Fetch PR refs
        run: |
          git fetch --no-tags origin \
            ${{ github.event.pull_request.base.ref }} \
            +refs/pull/${{ github.event.pull_request.number }}/head

      - name: Run Code-Argus
        id: review
        uses: openai/codex-action@v1
        with:
          openai-api-key: ${{ secrets.CODEX_API_KEY }}
          responses-api-endpoint: ${{ vars.CODEX_BASE_URL }}
          prompt: |
            You are Code-Argus, an expert code reviewer...
            (自定义 prompt)

      - name: Post review comments
        uses: actions/github-script@v7
        with:
          script: |
            // 解析 steps.review.outputs.final-message
            // 发布评论到 PR
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
3. **Actionable feedback**: Every comment must include a concrete fix using GitHub suggested changes format

## Review Focus Areas

Analyze the PR for:
- **Correctness**: Logic errors, edge cases, null handling, race conditions
- **Security**: XSS, injection, auth bypass, sensitive data exposure
- **Architecture**: Breaking changes, API compatibility, cross-system impact
- **Testing**: Missing tests for critical paths, inadequate coverage

## Output Format

For each issue, output in this exact format:

{
  "file": "path/to/file.ts",
  "line_start": 42,
  "line_end": 45,
  "severity": "high|medium|low",
  "title": "Brief issue title",
  "description": "Why this is a problem",
  "suggestion": "// Fixed code here"
}

## Instructions

1. Review ONLY the changes in this PR (diff between base and head)
2. Limit to most important issues
3. Respond in the same language as the PR description
4. If no significant issues found, respond with empty array
```

---

## 错误处理与边界情况

### 错误处理策略

| 场景 | 处理方式 |
|------|----------|
| API Key 无效 | 发评论提示配置错误，workflow 失败 |
| API 超时/限流 | 重试 3 次，间隔指数退避 |
| PR 过大（>500 文件） | 只审查前 100 个变更文件，总结中说明 |
| 无权限触发 | 静默忽略，不发任何评论 |
| 配置文件格式错误 | 使用默认配置，发评论警告 |
| Codex 返回空结果 | 发总结："Review completed. No issues found." |

### 跳过的文件类型

```yaml
skip_patterns:
  - "*.lock"
  - "*.min.js"
  - "dist/**"
  - "vendor/**"
  - "**/*.generated.*"
```

---

## 实施计划

### v1.0 - MVP（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| PR 创建自动触发 | ✅ | `pull_request: [opened, reopened]` |
| 评论关键词触发 | ✅ | `code-argus review` / `argus review` / `code-argus 审查` |
| 行内评论 + Suggested Changes | ✅ | GitHub 原生 suggestion 代码块 |
| 总结评论 | ✅ | 统计 + 关注领域 |
| 自定义 API endpoint | ✅ | 通过 `CODEX_BASE_URL` secret |
| 基础配置文件支持 | ⚠️ | 仅支持 `language`, `max_comments`, `min_severity` |
| 仅 collaborators 权限 | ✅ | admin/write 权限检查 |

#### v1.0 已知限制

当前实现使用 `output-schema` 强制 Codex 返回结构化 JSON，这导致：

1. **单轮分析**：Codex 无法进行多轮 Agent 探索
2. **缺乏代码库上下文**：只能分析 diff，无法读取相关文件、追踪依赖
3. **可能遗漏问题**：
   - 破坏性变更（修改被其他地方调用的函数签名）
   - API 兼容性问题（修改公共接口）
   - 跨文件影响（修改共享状态、配置）

### v1.1 - 两阶段 Review（设计中）

#### 问题背景

`output-schema` 参数强制 Codex 在单次调用中返回符合 schema 的 JSON，这限制了 Agent 的探索能力。对于真正高质量的代码审查，需要：

- 读取被修改函数的调用方
- 检查类型定义和接口兼容性
- 分析配置文件和环境变量影响
- 理解业务逻辑上下文

#### 解决方案：两阶段 Review

```
┌─────────────────────────────────────────────────────────────────┐
│                     阶段 1: Agent 深度分析                       │
│                                                                 │
│  输入: PR diff + 完整代码库访问                                   │
│  模式: 无 output-schema，允许多轮工具调用                         │
│  能力:                                                          │
│    - 读取相关文件 (imports, dependencies)                        │
│    - 搜索函数调用方 (grep, codebase search)                      │
│    - 分析类型定义和接口                                          │
│    - 检查测试覆盖                                                │
│  输出: 自由格式的深度分析报告                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   阶段 2: 结构化格式输出                          │
│                                                                 │
│  输入: 阶段 1 的分析报告                                         │
│  模式: 使用 output-schema 强制 JSON 格式                         │
│  能力:                                                          │
│    - 提取关键问题                                                │
│    - 按严重性排序                                                │
│    - 生成 suggestion 代码块                                      │
│  输出: 结构化 JSON (summary + comments)                          │
└─────────────────────────────────────────────────────────────────┘
```

#### 实现方案

**方案 A: 双 Codex 调用（推荐）**

```yaml
# 阶段 1: Agent 探索
- name: Deep Analysis
  id: analysis
  uses: openai/codex-action@v1
  with:
    prompt: |
      Analyze this PR deeply. You can read any file in the codebase.
      Focus on: breaking changes, security, cross-file impact.
      Output a detailed analysis report.
    # 注意: 不使用 output-schema

# 阶段 2: 结构化输出
- name: Format Results
  uses: openai/codex-action@v1
  with:
    prompt: |
      Based on this analysis, extract issues in JSON format:
      ${{ steps.analysis.outputs.final-message }}
    output-schema: |
      { "type": "object", "properties": { ... } }
```

**方案 B: 单 Codex + 后处理**

使用单次 Agent 调用，在 workflow 中用 JavaScript 解析输出并提取 JSON。

#### v1.1 功能清单

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 两阶段 Review | P0 | 解决代码库上下文缺失问题 |
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
| 模型 | OpenAI Codex（支持自定义 endpoint） |
| 触发 | PR 创建自动 + `argus review` 手动 |
| 输出 | 行内评论（Suggested Changes）+ 总结 |
| 重点 | 正确性/安全/架构/测试，不做风格 |
| 配置 | `.github/reviewbot.yaml` + CLAUDE.md |
| 语言 | 默认跟随 PR，可配置 |
| 权限 | 仅 collaborators |

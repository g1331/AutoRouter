# Code-Argus 使用文档

> AI Code Review Bot - 基于 OpenAI Codex 的自动化代码审查工具

## 概述

Code-Argus 是一个高质量的 AI 代码审查机器人，专注于发现真正影响代码质量的问题：

- **正确性**：逻辑错误、边界情况、空值处理、竞态条件
- **安全性**：XSS、注入攻击、认证绕过、敏感数据泄露
- **架构**：破坏性变更、API 兼容性、跨系统影响
- **测试**：关键路径缺失测试、覆盖率不足

**不会评论**：代码风格、格式、命名约定等主观偏好。

---

## 快速开始

### 1. 配置 Secrets / Variables

在仓库的 **Settings → Secrets and variables → Actions** 中添加：

| Secret 名称 | 说明 |
|-------------|------|
| `CODEX_API_KEY` | OpenAI API 密钥 |
| `CODEX_BASE_URL` | API 端点（格式：`https://api.example.com/v1`） |

（可选）Variables：

| Variable 名称 | 默认值 | 说明 |
|--------------|--------|------|
| `CODEX_MODEL` | `gpt-5.2-codex` | 使用的模型 |

### 2. 触发 Review

Code-Argus 会在以下情况自动触发：

| 触发方式 | 说明 |
|----------|------|
| PR 创建 | 自动触发（`opened`, `reopened`） |
| 评论 `code-argus review` | 手动触发 |
| 评论 `argus review` | 手动触发 |
| 评论 `code-argus 审查` | 手动触发（中文） |

> **注意**：仅仓库 collaborators（admin/write 权限）可触发 review。

---

## 输出格式

### 行内评论

每个问题会在对应代码行添加评论：

```markdown
## 🔴 [HIGH] SQL injection in get_user_by_id

Building SQL with f-strings allows SQL injection via `user_id`.
Use parameterized queries and never interpolate user input into SQL.

```suggestion
def get_user_by_id(user_id: str, db_connection) -> dict:
    query = "SELECT * FROM users WHERE id = ?"
    result = db_connection.execute(query, (user_id,))
    return result.fetchone()
```
```

点击 **"Commit suggestion"** 即可一键应用修复。

### 严重性级别

| 级别 | 标识 | 含义 |
|------|------|------|
| High | 🔴 | 必须修复（安全漏洞、严重 bug） |
| Medium | 🟡 | 建议修复（潜在问题、边界情况） |
| Low | 🟢 | 可选优化（代码质量提升） |

### 总结评论

Review 完成后会发布总结：

```markdown
## Code-Argus Review

Review completed. **6** suggestion(s) posted.

| Severity | Count |
|----------|-------|
| 🔴 High | 4 |
| 🟡 Medium | 2 |

**Focus areas**: Security, Error Handling

---
Comment `code-argus review` to re-trigger review
```

---

## 配置文件（可选）

创建 `.github/reviewbot.yaml` 自定义行为：

```yaml
# Code-Argus 配置文件

# 响应语言
# auto: 跟随 PR 标题/描述的语言
# zh-CN: 中文
# en-US: 英文
language: auto

# 最大评论数量（超过只保留最重要的）
max_comments: 10

# 最低显示级别: high | medium | low
min_severity: low
```

### 配置项说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `language` | `auto` | 响应语言，`auto` 跟随 PR 语言 |
| `max_comments` | `10` | 最多发布的评论数量 |
| `min_severity` | `low` | 最低显示的严重性级别 |

---

## 工作流程

```
1. PR 创建 / 评论触发
        ↓
2. 检查权限（是否 collaborator）
        ↓
3. 获取 PR diff
        ↓
4. 读取配置（.github/reviewbot.yaml）
        ↓
5. 调用 Codex 进行深度分析
        ↓
6. 发布行内评论（带 Suggested Changes）
        ↓
7. 发布总结评论
```

---

## 错误处理

| 场景 | 表现 |
|------|------|
| 无权限触发 | 静默忽略，不发任何评论 |
| API 错误 | 发评论提示错误，附带 workflow logs 链接 |
| 解析失败 | 发评论提示解析失败，可重试 |
| 无问题发现 | 发总结："No significant issues found." |

遇到错误时，可以评论 `code-argus review` 重新触发。

---

## 技术规格

| 项目 | 值 |
|------|-----|
| Action | `openai/codex-action@v1` |
| Model | `gpt-5.2-codex` |
| Reasoning Effort | `xhigh` |
| Sandbox | `read-only` |

---

## 常见问题

### Q: 为什么我的评论没有触发 review？

确保你是仓库的 collaborator（有 admin 或 write 权限）。

### Q: 如何更改 review 的关注点？

当前版本关注点是硬编码的（正确性、安全、架构、测试）。自定义关注点将在 v1.1 支持。

### Q: 支持哪些编程语言？

Code-Argus 基于 OpenAI Codex，支持所有主流编程语言。

### Q: 如何使用自定义 API 端点？

设置 `CODEX_BASE_URL` secret，格式为 `https://your-api.com/v1`（不带 `/responses` 后缀）。

---

## 版本历史

### v1.0 (当前)

- PR 创建自动触发
- 评论关键词手动触发
- 行内评论 + GitHub Suggested Changes
- 总结评论 + 统计
- 基础配置文件支持（3 项）
- 自定义 API 端点支持

### v1.1 (计划中)

- 自定义 review 关注点
- 自定义触发关键词
- 自定义规则（areas + rules）

---

## 反馈与贡献

如有问题或建议，请提交 Issue 或 PR。

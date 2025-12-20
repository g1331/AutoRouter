# Code-Argus: AI-Powered Code Review & Auto-Fix

Code-Argus 是一个基于 AI 的代码审查系统，能够自动发现代码问题并提供修复建议。支持自动修复模式，可在多轮循环中自动修复发现的问题。

## 功能特性

- **智能代码审查**: 使用 AI 模型分析 PR 变更，识别潜在问题
- **自动修复循环**: 发现问题后自动修复，然后重新审查，直到无问题或达到最大轮次
- **多语言支持**: 自动适配 PR 描述的语言（中文/英文）
- **行内建议**: 提供 GitHub 原生的 suggestion 格式，一键应用修复

## 触发方式

### 1. 自动触发（仅审查）

- PR 创建时自动触发审查
- PR 重新打开时自动触发审查

### 2. 手动触发（评论命令）

在 PR 评论中使用以下命令：

| 命令 | 功能 |
|------|------|
| `code-argus review` | 仅审查，不自动修复 |
| `argus review` | 同上（简写） |
| `code-argus 审查` | 同上（中文） |
| `code-argus fix` | 审查 + 自动修复循环 |
| `argus fix` | 同上（简写） |
| `code-argus 修复` | 同上（中文） |

### 3. 手动触发（GitHub Actions UI）

1. 进入 Actions → Code-Argus Review
2. 点击 "Run workflow"
3. 填写参数：
   - `pr_number`: PR 编号（必填）
   - `current_round`: 当前轮次（默认 1）
   - `auto_fix`: 是否启用自动修复（默认 true）

## 配置

### 环境变量

在 GitHub 仓库设置中配置：

**Secrets（必需）**:
- `CODEX_API_KEY`: OpenAI/Codex API 密钥
- `CODEX_BASE_URL`: API 基础 URL（格式: `https://xxx.com/v1`）
- `ANTHROPIC_API_KEY`: Anthropic API 密钥（用于自动修复）

**Variables（可选）**:
- `CODEX_MODEL`: 审查使用的模型（默认: `gpt-5.2`）
- `MAX_FIX_ROUNDS`: 最大自动修复轮次（默认: `3`）

### 仓库配置文件

创建 `.github/reviewbot.yaml` 自定义审查行为：

```yaml
# 最大评论数量
max_comments: 10

# 最低严重级别 (low, medium, high)
min_severity: low

# 输出语言 (auto, en, zh)
language: auto
```

## 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                      触发 (PR/评论/手动)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Prepare Job                                                 │
│  - 权限检查（仅 collaborators 可触发）                         │
│  - 获取 PR 元数据                                             │
│  - 确定审查轮次和模式                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Review Job (Round N)                                        │
│  - Checkout PR 代码                                          │
│  - 生成 diff 并调用 Codex 审查                                 │
│  - 解析审查结果                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Publish Job                                                 │
│  - 发布审查评论到 PR                                          │
│  - 判断是否需要自动修复                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
            无问题/达上限          有问题且启用自动修复
                    │                   │
                    ▼                   ▼
              ┌─────────┐    ┌─────────────────────────┐
              │  结束   │    │  Auto-Fix Job            │
              └─────────┘    │  - Claude 自动修复代码    │
                             │  - 提交并推送修复         │
                             │  - 触发下一轮审查         │
                             └─────────────────────────┘
                                        │
                                        │ (轮次 < MAX_FIX_ROUNDS)
                                        ▼
                              ┌─────────────────┐
                              │  Review Job     │
                              │  (Round N+1)    │
                              └─────────────────┘
```

## 审查重点

Code-Argus 专注于高影响力的问题：

**会审查的内容**:
- **正确性**: 逻辑错误、边界情况、空值处理、竞态条件
- **安全性**: XSS、注入、认证绕过、敏感数据暴露
- **架构**: 破坏性变更、API 兼容性、跨系统影响
- **测试**: 关键路径缺少测试、覆盖率不足

**不会审查的内容**:
- 代码风格、格式、命名规范
- 不影响功能的小优化
- 个人偏好或"锦上添花"的建议

## 严重级别

| 级别 | 标识 | 说明 |
|------|------|------|
| High | 🔴 | 必须修复，可能导致严重问题 |
| Medium | 🟡 | 建议修复，存在潜在风险 |
| Low | 🟢 | 可选修复，改进建议 |

## 示例

### 审查结果示例

```
## Code-Argus Review (Round 1/3)

Review completed. **3** issue(s) found.

| Severity | Count |
|----------|-------|
| 🔴 High | 1 |
| 🟡 Medium | 2 |

**Focus areas**: security, correctness

🔧 **Auto-fix enabled**: Starting fix in next job...

---
Comment `code-argus review` to re-review | `code-argus fix` to auto-fix
```

### 自动修复完成示例

```
## Code-Argus Review (Round 2/3)

✅ Review completed. **No significant issues found.**

The changes look good from a correctness, security, and architecture perspective.

---
Comment `code-argus review` to re-review | `code-argus fix` to auto-fix
```

## 故障排除

### 常见问题

1. **"Review failed"**
   - 检查 `CODEX_API_KEY` 和 `CODEX_BASE_URL` 是否正确配置
   - 查看 workflow 日志获取详细错误信息

2. **"No output received"**
   - API 调用可能超时，尝试重新触发
   - 检查 API 配额是否充足

3. **自动修复未触发**
   - 确认使用了 `code-argus fix` 而不是 `code-argus review`
   - 检查当前轮次是否已达到 `MAX_FIX_ROUNDS`

4. **权限被拒绝**
   - 仅仓库 collaborators（write 权限以上）可触发审查
   - 检查触发用户的权限级别

## 相关文件

- Workflow 定义: `.github/workflows/code-argus.yml`
- 配置文件: `.github/reviewbot.yaml`（可选）

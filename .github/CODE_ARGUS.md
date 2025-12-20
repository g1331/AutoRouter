# Code-Argus: AI-Powered Code Review

Code-Argus 是一个基于 AI 的代码审查系统，能够自动发现代码问题并提供修复建议。与 `@autorouter-bot` 配合使用可实现问题的自动修复。

## 功能特性

- **智能代码审查**: 使用 AI 模型分析 PR 变更，识别潜在问题
- **多语言支持**: 自动适配 PR 描述的语言（中文/英文）
- **行内建议**: 提供 GitHub 原生的 suggestion 格式，一键应用修复
- **Bot 集成**: 审查发现问题时提供 `@autorouter-bot` 触发提示

## 触发方式

### 1. 自动触发

- PR 创建时自动触发审查
- PR 重新打开时自动触发审查

### 2. 手动触发（评论命令）

在 PR 评论中使用以下命令：

| 命令 | 功能 |
|------|------|
| `code-argus review` | 触发代码审查 |
| `argus review` | 同上（简写） |
| `code-argus 审查` | 同上（中文） |

### 3. 自动修复

| 命令 | 功能 |
|------|------|
| `code-argus fix` | 审查 + 自动修复循环 |
| `code-argus fix-now` | 跳过审查，直接触发修复（需要先有审查结果） |
| `argus fix` / `argus fix-now` | 同上（简写） |
| `code-argus 修复` / `code-argus 立即修复` | 同上（中文） |

**流程说明**：

- **fix**: 先审查，发现问题后自动触发修复，循环直到无问题或达到最大轮次
- **fix-now**: 跳过审查，直接根据上次审查结果触发修复（适用于刚审查完的情况）

**手动模式**：使用 `code-argus review` 仅审查不自动修复，审查结果会提供手动触发提示。

## 配置

### 环境变量

在 GitHub 仓库设置中配置：

**Secrets（必需）**:
- `CODEX_API_KEY`: OpenAI/Codex API 密钥
- `CODEX_BASE_URL`: API 基础 URL（格式: `https://xxx.com/v1`）

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

### Review 模式 (`code-argus review`)

```
触发: PR 创建/重开 或 评论 "code-argus review"
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Code-Argus 审查                                             │
│  - Checkout PR 代码                                          │
│  - Codex 分析 diff                                           │
│  - 发布行内评论                                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    发现问题时提供手动触发提示
                    💡 Tip: @autorouter-bot ...
```

### Fix 模式 (`code-argus fix`)

```
触发: 评论 "code-argus fix"
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  自动迭代循环 (最多 MAX_FIX_ROUNDS 轮)                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────────────────────────┐  │
│  │ Code-Argus   │────▶│ 发现问题 → 自动触发               │  │
│  │ 审查 (Codex) │     │ @autorouter-bot                  │  │
│  └──────────────┘     └───────────────┬──────────────────┘  │
│         ▲                             │                      │
│         │                             ▼                      │
│         │             ┌──────────────────────────────────┐  │
│         │             │ claude-codex-agent 修复          │  │
│         │             │ (完整 MCP: auggie, codex, etc.)  │  │
│         │             └───────────────┬──────────────────┘  │
│         │                             │                      │
│         │                             ▼                      │
│         │             ┌──────────────────────────────────┐  │
│         └─────────────│ 评论 "code-argus fix"             │  │
│                       │ 触发下一轮审查                     │  │
│                       └──────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              无问题 或 达到最大轮次 → 结束
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

### Review 模式输出

```
## Code-Argus Review

Review completed. **3** issue(s) found.

| Severity | Count |
|----------|-------|
| 🔴 High | 1 |
| 🟡 Medium | 2 |

**Focus areas**: security, correctness

---
💡 **Tip**: Comment the following to trigger auto-fix:
@autorouter-bot 请根据上方 Code-Argus review 反馈修复代码问题

---
Comment `code-argus review` to re-trigger review | `code-argus fix` for auto-fix loop
```

### Fix 模式输出（自动迭代）

```
## Code-Argus Review (Round 1/3)

Review completed. **2** issue(s) found.

| Severity | Count |
|----------|-------|
| 🔴 High | 1 |
| 🟡 Medium | 1 |

🔧 **Auto-fix mode**: Triggering @autorouter-bot to fix issues...

---
Comment `code-argus review` to re-trigger review | `code-argus fix` for auto-fix loop
```

随后 Code-Argus 自动发送：

```
[Code-Argus Auto-Fix Round 1/3]

@autorouter-bot 请根据上方 Code-Argus review 反馈修复代码问题。

修复完成后，请评论 `code-argus fix` 触发下一轮审查。
```

### 审查通过

```
## Code-Argus Review (Round 2/3)

✅ Review completed. **No significant issues found.**

The changes look good from a correctness, security, and architecture perspective.

---
Comment `code-argus review` to re-trigger review | `code-argus fix` for auto-fix loop
```

## 故障排除

### 常见问题

1. **"Review failed"**
   - 检查 `CODEX_API_KEY` 和 `CODEX_BASE_URL` 是否正确配置
   - 查看 workflow 日志获取详细错误信息

2. **"No output received"**
   - API 调用可能超时，尝试重新触发
   - 检查 API 配额是否充足

3. **权限被拒绝**
   - 仅仓库 collaborators（write 权限以上）可触发审查
   - 检查触发用户的权限级别

4. **自动修复未生效**
   - 确认已在 PR 评论中正确触发 `@autorouter-bot`
   - 检查 `claude-codex-agent` workflow 是否正常运行

## 相关文件

- Code-Argus Workflow: `.github/workflows/code-argus.yml`
- Auto-Fix Agent: `.github/workflows/claude-codex-agent.yml`
- 审查配置: `.github/reviewbot.yaml`（可选）

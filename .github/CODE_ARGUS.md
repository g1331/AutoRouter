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

当 Code-Argus 发现问题时，会在审查评论中提供提示：

```
💡 Tip: Comment the following to trigger auto-fix:
@autorouter-bot 请根据上方 Code-Argus review 反馈修复代码问题
```

复制该命令到 PR 评论即可触发 `@autorouter-bot` 进行自动修复。

## 配置

### 环境变量

在 GitHub 仓库设置中配置：

**Secrets（必需）**:
- `CODEX_API_KEY`: OpenAI/Codex API 密钥
- `CODEX_BASE_URL`: API 基础 URL（格式: `https://xxx.com/v1`）

**Variables（可选）**:
- `CODEX_MODEL`: 审查使用的模型（默认: `gpt-5.2`）

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
│                      触发 (PR 创建/重开/评论)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Prepare Job                                                 │
│  - 权限检查（仅 collaborators 可触发）                         │
│  - 获取 PR 元数据                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Review Job                                                  │
│  - Checkout PR 代码（确保读取 PR head 而非 base）              │
│  - 生成 diff 并调用 Codex 审查                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Publish Job                                                 │
│  - 发布审查评论到 PR（行内 suggestion）                        │
│  - 如有问题，提供 @autorouter-bot 触发提示                     │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                无问题               有问题
                    │                   │
                    ▼                   ▼
              ┌─────────┐    ┌─────────────────────────┐
              │  结束   │    │  用户选择是否触发修复      │
              └─────────┘    │  @autorouter-bot ...     │
                             └─────────────────────────┘
                                        │
                                        ▼
                             ┌─────────────────────────┐
                             │  claude-codex-agent     │
                             │  自动修复并创建 PR       │
                             └─────────────────────────┘
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

### 审查结果示例（有问题）

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
```
@autorouter-bot 请根据上方 Code-Argus review 反馈修复代码问题
```

---
Comment `code-argus review` to re-trigger review
```

### 审查结果示例（无问题）

```
## Code-Argus Review

✅ Review completed. **No significant issues found.**

The changes look good from a correctness, security, and architecture perspective.

---
Comment `code-argus review` to re-trigger review
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

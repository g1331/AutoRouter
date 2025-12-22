# Issue 自动化工作流

本文档描述 `claude-codex-agent.yml` 工作流的设计和使用方式。

## 触发事件

| 事件 | 说明 |
|------|------|
| `issues: opened` | 新 issue 创建时 |
| `issues: reopened` | issue 重新打开时 |
| `issue_comment: created` | issue/PR 下有新评论时 |

## Jobs 概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRIGGER EVENTS                           │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   issues:opened         issues:reopened      issue_comment:created
        │                     │                     │
        └──────────┬──────────┘                     │
                   │                                │
                   ▼                                ▼
            ┌─────────────┐              ┌─────────────────────┐
            │   triage    │              │   评论内容判断       │
            │  (深度分析)  │              └─────────────────────┘
            └─────────────┘                        │
                                    ┌──────────────┼──────────────┐
                                    │              │              │
                              含/approve?    含@autorouter-bot?   都不含?
                                    │              │              │
                                    ▼              ▼              ▼
                            ┌────────────┐ ┌────────────┐ ┌────────────────┐
                            │auto-approve│ │   manual   │ │handle-info-reply│
                            │ (实施修复)  │ │  (交互式)  │ │  (重新分析)     │
                            └────────────┘ └────────────┘ └────────────────┘
```

## Job 详细说明

### 1. triage (深度分析)

**触发条件**: issue 创建或重新打开

**职责**: 深度分析 issue，**不自动修复**

#### Bug 处理流程

1. **尝试复现**: 使用 MCP 工具（auggie、code-index、codex）分析代码库，定位相关代码
2. **输出诊断结果**:
   - **成功定位** → 添加 `awaiting-approval` 标签，输出：
     - 问题复现路径
     - 根因分析
     - 建议的修复方案（概述）
   - **无法复现/信息不足** → 添加 `needs-info` 标签，说明需要补充的信息

#### Feature 处理流程

1. **检查是否已实现**: 搜索代码库中是否已有类似功能
2. **如果已实现**: 说明功能位置和使用方法
3. **如果未实现**: 添加 `awaiting-approval` 标签，输出可行性分析：
   - 技术可行性
   - 必要性评估
   - 是否与现有功能重复
   - 实施难度（简单/中等/复杂）
   - 大致实现方案

#### Question/Documentation 处理

- 直接回答问题或说明文档改进建议
- 如需代码修改，添加 `awaiting-approval` 标签

### 2. handle-info-reply

**触发条件**: 评论不含 `/approve` 也不含 `@autorouter-bot`

**职责**: 跟进补充信息

- 仅当 issue 有 `needs-info` 标签且评论者是 issue 作者时执行
- 重新分析信息是否充足
- 信息充足 → 移除 `needs-info`，添加 `awaiting-approval`

### 3. auto-approve (实施修复)

**触发条件**: 评论含 `/approve`

**职责**: 审批后执行实际修复工作

- 验证评论者是否为仓库协作者（非协作者的命令会被忽略）
- 更新标签：移除 `awaiting-approval`/`needs-info`，添加 `approved` + `in-progress`
- 执行修复流程：
  1. 阅读 issue 和之前的分析结论
  2. 定位代码
  3. 创建分支
  4. 实现修复/功能
  5. 运行测试和静态检查
  6. 创建 PR
  7. 移除 `in-progress` 标签

### 4. manual (交互式)

**触发条件**: 评论含 `@autorouter-bot`（但不含 `/approve`）

**职责**: 手动触发的交互式助手

- 先理解需求，输出需求摘要和不确定点
- 在获得明确同意前只做分析，不修改代码
- 获得确认后才执行代码修改

## 状态标签

| 标签 | 颜色 | 含义 |
|------|------|------|
| `bug` | 红色 | 问题报告 |
| `feature` | 青色 | 功能请求 |
| `question` | 紫色 | 疑问讨论 |
| `documentation` | 蓝色 | 文档相关 |
| `needs-info` | 黄色 | 信息不足，等待用户补充 |
| `awaiting-approval` | 浅红 | 分析完成，等待 `/approve` 批准 |
| `approved` | 绿色 | 已审批，正在或即将处理 |
| `in-progress` | 蓝色 | 正在处理中 |

## 典型流程

### Bug 报告（信息充足）

```
1. 用户创建 issue（包含复现步骤）
2. triage → 深度分析 → 复现成功 → 打 bug + awaiting-approval
   输出：复现路径、根因分析、修复方案
3. 维护者评论 /approve
4. auto-approve → 创建分支，修复，提 PR
```

### Bug 报告（信息不足）

```
1. 用户创建 issue（缺少复现步骤）
2. triage → 尝试复现 → 失败 → 打 bug + needs-info
   输出：已尝试的步骤，需要补充的信息
3. 用户补充信息
4. handle-info-reply → 分析充足 → 移除 needs-info，打 awaiting-approval
5. 维护者评论 /approve
6. auto-approve → 创建分支，修复，提 PR
```

### Feature 请求

```
1. 用户创建 issue
2. triage → 检查未实现 → 打 feature + awaiting-approval
   输出：可行性、必要性、难度、大致方案
3. 维护者评论 /approve
4. auto-approve → 创建分支，实现功能，提 PR
```

### 交互式处理

```
1. 任何人在 issue/PR 下评论 @autorouter-bot + 具体需求
2. manual → 输出需求摘要和待确认清单
3. 用户确认
4. manual → 执行修改，创建 PR
```

## 分支命名规范

基于 issue 内容自动生成，格式：`{type}/{slug}`

| 类型 | 示例 |
|------|------|
| bug 修复 | `fix/api-timeout-handling` |
| 新功能 | `feat/export-csv-support` |
| 文档 | `docs/update-readme-install` |

## 设计理念

1. **人在回路 (Human-in-the-loop)**: 所有修复都需要 `/approve` 命令批准，避免 AI 自作主张
2. **分析先行**: 在动手之前先充分理解问题
   - Bug：尝试复现，定位根因
   - Feature：检查是否已实现，评估可行性
3. **最小权限**: triage job 只需要读权限，降低风险

## 注意事项

1. `/approve` 命令才会触发实际修复工作，`approved` 标签只是状态标记
2. 非协作者的 `/approve` 命令会被忽略
3. `@autorouter-bot` 触发的 manual job 是交互式的，会先确认再执行
4. triage 阶段只分析不修改代码，超时时间为 30 分钟

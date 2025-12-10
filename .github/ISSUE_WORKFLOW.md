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
            └─────────────┘              └─────────────────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    │              │              │
                              含/approve?    含@autorouter-bot?   都不含?
                                    │              │              │
                                    ▼              ▼              ▼
                            ┌────────────┐ ┌────────────┐ ┌────────────────┐
                            │auto-approve│ │   manual   │ │handle-info-reply│
                            └────────────┘ └────────────┘ └────────────────┘
```

## Job 详细说明

### 1. triage

**触发条件**: issue 创建或重新打开

**职责**: 自动分类和初筛
- 分析 issue 内容，添加分类标签（只选一个）：
  - `bug`: 报告问题/错误
  - `feature`: 功能请求
  - `question`: 疑问/讨论
  - `documentation`: 文档相关
- 判断信息是否充足
- 根据情况添加状态标签：
  - 信息不足 → `needs-info`
  - 信息充足且是协作者 → `approved`
  - 信息充足但非协作者 → `awaiting-approval`

### 2. handle-info-reply

**触发条件**: 评论不含 `/approve` 也不含 `@autorouter-bot`

**职责**: 跟进补充信息
- 仅当 issue 有 `needs-info` 标签且评论者是 issue 作者时执行
- 重新分析信息是否充足
- 更新状态标签

### 3. auto-approve

**触发条件**: 评论含 `/approve`

**职责**: 审批后执行实际工作
- 验证评论者是否为仓库协作者
- 如果是协作者：
  - 更新标签（移除 `awaiting-approval`/`needs-info`，添加 `approved` + `in-progress`）
  - 分析问题，创建修复分支
  - 实现修复/功能
  - 运行测试和静态检查
  - 提交 PR

### 4. manual

**触发条件**: 评论含 `@autorouter-bot`（但不含 `/approve`）

**职责**: 手动触发的万能助手
- 可以回答问题、分析代码、修复 bug 等
- 需要先确认需求，获得同意后才执行修改

## 状态标签

| 标签 | 颜色 | 含义 |
|------|------|------|
| `bug` | 红色 | 问题报告 |
| `feature` | 青色 | 功能请求 |
| `question` | 紫色 | 疑问讨论 |
| `documentation` | 蓝色 | 文档相关 |
| `needs-info` | 黄色 | 信息不足，等待用户补充 |
| `awaiting-approval` | 浅红 | 等待维护者审批 |
| `approved` | 绿色 | 已审批，可以开始处理 |
| `in-progress` | 蓝色 | 正在处理中 |

## 典型流程

### 外部用户报告 Bug

```
1. 用户创建 issue
2. triage → 打 bug 标签，判断信息不足 → 打 needs-info，要求补充
3. 用户补充信息
4. handle-info-reply → 信息充足 → 打 awaiting-approval
5. 维护者评论 /approve
6. auto-approve → 创建分支，修复，提 PR
```

### 协作者创建 Issue

```
1. 协作者创建 issue
2. triage → 打分类标签，信息充足 → 直接打 approved
3. 协作者评论 /approve（触发实际工作）
4. auto-approve → 创建分支，修复，提 PR
```

### 手动触发

```
1. 任何人在 issue/PR 下评论 @autorouter-bot + 具体需求
2. manual → agent 分析需求，确认后执行
```

## 分支命名规范

基于 issue 内容自动生成，格式：`{type}/{slug}`

| 类型 | 示例 |
|------|------|
| bug 修复 | `fix/api-timeout-handling` |
| 新功能 | `feat/export-csv-support` |
| 文档 | `docs/update-readme-install` |

## 注意事项

1. `approved` 标签只是状态标记，**不会自动触发工作**，需要 `/approve` 命令
2. 非协作者的 `/approve` 命令会被忽略
3. `@autorouter-bot` 触发的 manual job 功能最全，但需要人工确认后才会修改代码

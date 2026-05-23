---
layout: home

hero:
  name: AutoRouter
  text: AI API Gateway
  tagline: 面向多上游治理的 API 网关：密钥分发、模型路由、失败转移与请求观测。
  actions:
    - theme: brand
      text: 部署指南
      link: /guide/deployment/overview
    - theme: alt
      text: 使用指南
      link: /guide/usage/admin-overview
    - theme: alt
      text: 架构介绍
      link: /guide/architecture/overview
    - theme: alt
      text: GitHub
      link: https://github.com/g1331/AutoRouter

features:
  - title: 多上游路由
    details: 按模型前缀自动路由到 openai / anthropic / gemini 组，结合权重、优先级、熔断器与故障转移完成上游选路。
  - title: 安全双层防护
    details: 客户端 API Key 使用 bcrypt 哈希存储，上游凭据使用 Fernet 加密；SSRF 校验阻断私网与回环地址。
  - title: CLIProxyAPI 集成
    details: 内建对 CLIProxyAPI 的池上游支持，可承接 Codex、Claude、Gemini 的 OAuth 上游账号。
  - title: 可观测请求链路
    details: 记录候选集、路由决策、故障转移历史与计费快照，便于排障与成本分析。
---

## 文档进度

文档体系当前处于 Phase 1 脚手架阶段：导航与 sidebar 已铺好，正文按主题分批撰写。具体进度参见 [issue #167](https://github.com/g1331/AutoRouter/issues/167)。

第一批优先撰写 10 篇，确保陌生访客可以独立完成「部署 → 登记 CPA 实例 → OAuth 登录 → 客户端调用」全流程：

1. [部署形态总览](/guide/deployment/overview)
2. [快速开始（源码 docker compose）](/guide/deployment/quickstart)
3. [CI 部署后追加 CLIProxyAPI sidecar](/guide/deployment/cliproxy-sidecar)
4. [环境变量参考](/guide/deployment/env-reference)
5. [添加第一个上游](/guide/usage/first-upstream)
6. [创建客户端 API Key](/guide/usage/client-keys)
7. [通过 AutoRouter 调用模型](/guide/usage/invoke-models)
8. [CLIProxyAPI 首次使用指南](/guide/usage/cliproxy-first-time)
9. [整体架构总览](/guide/architecture/overview)
10. [请求生命周期](/guide/architecture/request-lifecycle)

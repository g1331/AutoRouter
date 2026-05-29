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

## 从哪里开始

按读者所处的部署阶段提供三条入口路径，每条路径按建议顺序串起最小可用文档集，访客可按需读完即跑通。

### 路径 A · 部署上线

适合「拿到项目准备搭起来」的访客，目标是把 AutoRouter 跑到能登录管理后台。

1. [部署形态总览](/guide/deployment/overview)
2. [快速开始（源码 docker compose）](/guide/deployment/quickstart)
3. [环境变量参考](/guide/deployment/env-reference)
4. [CI 部署后追加 CLIProxyAPI sidecar](/guide/deployment/cliproxy-sidecar)

### 路径 B · 接入第一次调用

适合「部署完成，准备第一次发起请求」的访客，目标是从管理后台配置到客户端拿到响应。

1. [管理后台导览](/guide/usage/admin-overview)
2. [添加第一个上游](/guide/usage/first-upstream)
3. [创建客户端 API Key](/guide/usage/client-keys)
4. [通过 AutoRouter 调用模型](/guide/usage/invoke-models)
5. [CLIProxyAPI 首次使用指南](/guide/usage/cliproxy-first-time)

### 路径 C · 理解架构与贡献

适合「想了解内部实现或评估架构」的开发者。

1. [整体架构总览](/guide/architecture/overview)
2. [请求生命周期](/guide/architecture/request-lifecycle)
3. [安全模型](/guide/architecture/security)
4. [贡献指南与代码规范](/guide/architecture/contributing)

完整文档清单按部署、使用、架构三大类组织，另含 CLIProxyAPI 部署与熔断器两篇深度参考长篇，均通过顶部导航与左侧 sidebar 访问。

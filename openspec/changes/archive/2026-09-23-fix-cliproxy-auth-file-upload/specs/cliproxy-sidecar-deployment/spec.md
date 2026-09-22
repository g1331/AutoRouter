## ADDED Requirements

### Requirement: 主应用升级保留可选 sidecar

个人部署工作流 MUST 保留已经运行的 CLIProxyAPI sidecar，不得因仅加载主 Compose 文件而删除该容器。

#### Scenario: 发布部署时已启用 sidecar

- **WHEN** 管理员部署新的 AutoRouter 发布版本，且同一 Compose 项目中已运行 CLIProxyAPI
- **THEN** 工作流更新主应用并保留 CLIProxyAPI 容器及其数据卷

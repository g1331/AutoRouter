---
title: GitHub Actions CI 部署
outline: deep
---

# GitHub Actions CI 部署

::: warning 撰写中
此文档目前为占位，正文尚未填充。完整撰写进度跟踪见 [issue #167](https://github.com/g1331/AutoRouter/issues/167)。
:::

## 计划覆盖的内容

`release.yml`（打 tag → 构建镜像 → ghcr）与 `deploy-personal.yml`（workflow_dispatch SSH 部署）两个流程的触发方式、Secrets 清单、首次配置步骤。

## 在正文就绪前的临时建议

在该文档正文上线之前，可以参考以下材料获取等价信息：

- 项目仓库根目录的 [README.md](https://github.com/g1331/AutoRouter/blob/master/README.md)
- 现有长篇 [`docs/cliproxy-deployment.md`](/cliproxy-deployment)
- 现有长篇 [`docs/circuit-breaker.md`](/circuit-breaker)
- 项目 [Issue 列表](https://github.com/g1331/AutoRouter/issues) 与 [OpenSpec 提案](https://github.com/g1331/AutoRouter/tree/master/openspec)

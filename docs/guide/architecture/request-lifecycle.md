---
title: 请求生命周期
outline: deep
---

# 请求生命周期

::: warning 撰写中
此文档目前为占位，正文尚未填充。完整撰写进度跟踪见 [issue #167](https://github.com/g1331/AutoRouter/issues/167)。
:::

## 计划覆盖的内容

一次客户端请求从 `/api/proxy/v1/*` 进入到上游返回的完整流转：鉴权、模型解析、上游选择、转发、日志、计费。

## 在正文就绪前的临时建议

在该文档正文上线之前，可以参考以下材料获取等价信息：

- 项目仓库根目录的 [README.md](https://github.com/g1331/AutoRouter/blob/master/README.md)
- 现有长篇 [`docs/cliproxy-deployment.md`](/cliproxy-deployment)
- 现有长篇 [`docs/circuit-breaker.md`](/circuit-breaker)
- 项目 [Issue 列表](https://github.com/g1331/AutoRouter/issues) 与 [OpenSpec 提案](https://github.com/g1331/AutoRouter/tree/master/openspec)

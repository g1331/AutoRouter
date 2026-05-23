---
title: 安全模型
outline: deep
---

# 安全模型

::: warning 撰写中
此文档目前为占位，正文尚未填充。完整撰写进度跟踪见 [issue #167](https://github.com/g1331/AutoRouter/issues/167)。
:::

## 计划覆盖的内容

Admin Bearer Token、客户端 API Key bcrypt 哈希、上游 Key Fernet 加密、SSRF 防护（IP / URL / DNS 三重校验）。

## 在正文就绪前的临时建议

在该文档正文上线之前，可以参考以下材料获取等价信息：

- 项目仓库根目录的 [README.md](https://github.com/g1331/AutoRouter/blob/master/README.md)
- 现有长篇 [`docs/cliproxy-deployment.md`](/cliproxy-deployment)
- 现有长篇 [`docs/circuit-breaker.md`](/circuit-breaker)
- 项目 [Issue 列表](https://github.com/g1331/AutoRouter/issues) 与 [OpenSpec 提案](https://github.com/g1331/AutoRouter/tree/master/openspec)

# Proposal: Migrate to Next.js Fullstack Architecture

## Summary

将 AutoRouter 从当前的 Monorepo 双应用架构（FastAPI 后端 + Next.js 前端）迁移到纯 Next.js 全栈架构，实现单一 Docker 镜像部署，简化用户使用体验。

## Motivation

### 问题现状

1. **部署复杂** - 当前架构需要分别部署前端和后端，用户需要配置反向代理才能获得统一入口
2. **双端口问题** - 开发环境下前端 3000 端口、后端 8000 端口，AI 工具用户需要记住两个地址
3. **双技术栈维护** - 同时维护 Python 和 TypeScript 两套代码，增加维护成本
4. **流式传输顾虑** - 通过 Next.js rewrites 代理 SSE 可能存在兼容性问题

### 行业对标

| 项目                  | Stars | 架构              | 部署方式     |
| --------------------- | ----- | ----------------- | ------------ |
| One API               | 28.6k | Go 单体           | 单镜像单端口 |
| LiteLLM               | 32.9k | Python 单体       | 单镜像单端口 |
| claude-code-hub       | 137   | Next.js 全栈      | 单镜像单端口 |
| **AutoRouter (当前)** | -     | FastAPI + Next.js | 双进程双端口 |

### 预期收益

- **一键部署** - `docker compose up -d` 即可完成部署
- **统一入口** - 单一端口提供管理界面和代理服务
- **技术栈统一** - 纯 TypeScript，降低维护成本
- **用户体验提升** - AI 工具配置只需一个 Base URL

## Scope

### In Scope

1. 将 FastAPI 后端所有功能迁移到 Next.js API Routes
2. 从 SQLAlchemy 迁移到 Drizzle ORM（仅支持 PostgreSQL）
3. 项目结构扁平化（移除 `apps/` 目录）
4. 创建优化的 Docker 部署配置
5. 更新项目文档和配置

### Out of Scope

1. 新功能开发（仅迁移现有功能）
2. UI/UX 变更（前端页面保持不变）
3. API 接口变更（保持向后兼容）
4. SQLite 支持（仅保留 PostgreSQL）

## Impact Analysis

### Breaking Changes

1. **数据库** - 从 SQLite 迁移到 PostgreSQL，需要数据迁移脚本
2. **项目结构** - 从 `apps/web/` 移动到根目录 `src/`
3. **环境变量** - 部分环境变量命名可能变更

### Migration Path

1. 现有用户需要导出数据并在 PostgreSQL 中重新导入
2. 提供数据迁移脚本辅助迁移
3. 更新部署文档

### Risk Assessment

| 风险               | 影响 | 缓解措施                                |
| ------------------ | ---- | --------------------------------------- |
| SSE 流式传输兼容性 | 高   | Next.js API Routes 原生支持 SSE，已验证 |
| 数据丢失           | 高   | 提供迁移脚本，测试环境先验证            |
| 功能遗漏           | 中   | 完整的功能映射清单，逐项验证            |
| 性能差异           | 低   | 压测对比，必要时优化                    |

## Success Criteria

1. 所有现有功能正常工作（管理面板、代理路由、统计等）
2. SSE 流式传输正常（核心验收项）
3. 单一 Docker 镜像部署成功
4. 现有测试迁移并通过
5. 文档更新完成

## Dependencies

- Drizzle ORM（替代 SQLAlchemy）
- PostgreSQL 16+（替代 SQLite）
- Next.js standalone 输出模式

## Stakeholders

- 项目维护者
- 现有用户（需要数据迁移）

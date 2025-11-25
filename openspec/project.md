# Project Context

## Purpose
搭建基于 FastAPI（后端）与 Next.js（前端）的全栈脚手架，提供健康检查示例，支持在 monorepo 中快速扩展业务 API 与前端页面。

## Tech Stack
- 后端：Python 3.12.x、FastAPI、Uvicorn、SQLAlchemy（预置依赖）、Alembic（迁移）
- 前端：Next.js 16（App Router）、React 19、TypeScript 5
- 构建与依赖：后端 hatchling + uv（虚拟环境与依赖管理）；前端 pnpm（workspace）
- 质量工具：后端 Ruff（lint/format）、Pyright（strict 类型检查）；前端 ESLint（with @typescript-eslint、next/core-web-vitals）、Prettier

## Project Conventions

### Code Style
- Python：Ruff 配置见 `apps/api/ruff.toml`，行宽 100，double quotes，target Python 3.12，isort 首方包 `app`。
- TypeScript/React：ESLint 结合 `eslint-config-next` + `@typescript-eslint`，限制深层相对路径；Prettier 统一格式（printWidth 100，arrowParens=always，LF）。
- 默认 UTF-8；禁止使用 Emoji。

### Architecture Patterns
- Monorepo：`apps/api`（FastAPI 服务）、`apps/web`（Next.js 前端），`packages/` 预留复用包。
- 配置集中：工作区定义 `pnpm-workspace.yaml`，后端配置集中在 `app/core/config.py`；环境变量通过 `.env`（示例待补充）。
- 接口约定：后端 API 前缀 `/api`，示例路由 `/api/health`；前端通过 `NEXT_PUBLIC_API_BASE_URL` 与后端联调。

### Testing Strategy
- 后端：`pytest`（示例 `apps/api/tests/test_health.py`），`uv run ruff check`，`uv run pyright`。
- 前端：`pnpm --filter web lint`，`pnpm --filter web format:check`。端到端或组件测试可后续引入 Vitest/Playwright（当前未加入）。

### Git Workflow
- 采用 trunk/主干开发：建议功能分支 -> PR -> 合并；提交信息遵循 Conventional Commits（已用 `chore: ...` 作为首个提交）。
- 行尾换行：默认 LF（当前仓库在 Windows，如需保持 LF 可配置 `.gitattributes`）。

## Domain Context
- 目前为通用脚手架，尚未绑定具体业务域；需根据后续产品需求补充领域模型与用例。

## Important Constraints
- 后端依赖增删必须使用 `uv add/remove` 或 `uv lock`，不要手动编辑 `pyproject.toml` 依赖段。
- Python 版本固定 3.12.x；前端依赖使用 pnpm 管理。
- `.env`/密钥不提交；遵守 UTF-8，无 Emoji。

## External Dependencies
- 开源库：FastAPI、Uvicorn、SQLAlchemy、Alembic、Pydantic Settings、Next.js、React、ESLint、Prettier。
- 目前无外部第三方服务；若接入数据库/云服务需在此补充连接方式、认证方式与最小权限要求。

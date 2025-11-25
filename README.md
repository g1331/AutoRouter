# AutoRouter 全栈脚手架

基于 FastAPI (Python) 与 Next.js (React) 的最小可运行全栈骨架，后端依赖由 `uv` 管理，前端依赖由 `pnpm` 管理。

## 目录结构
- `apps/api`：FastAPI 服务，含示例 `/api/health`，测试位于 `apps/api/tests/`。
- `apps/web`：Next.js 前端（App Router），入口 `src/app/page.tsx`，基础样式 `src/styles/globals.css`。
- `packages/`：预留复用包（UI、SDK、配置等）。
- `pnpm-workspace.yaml`：工作区定义，根脚本在 `package.json`。

## 环境要求
- Python 3.12.x（`uv` 会自动下载并创建虚拟环境；若已有 3.14 虚拟环境，可删除 `.venv` 后重建）。
- Node.js 18+ / 20+，`pnpm` 9+。

## 安装与运行
1. 后端依赖（一次即可）  
   ```powershell
   cd apps/api
   uv venv .venv --python 3.12
   uv pip install -e .[dev]
   ```
2. 前端依赖  
   ```powershell
   cd ..\..   # 仓库根目录
   pnpm install --filter web
   ```
3. 本地开发  
   - 后端：`cd apps/api && uv run uvicorn app.main:app --reload --port 8000`
   - 前端：`pnpm dev:web`（默认 3000 端口，页面内链接指向后端 `/api/health`）

## 配置
- 环境变量示例请在根目录添加 `.env.example`（如 `DATABASE_URL`、`JWT_SECRET`、`NEXT_PUBLIC_API_BASE_URL`）；实际密钥不要提交。
- CORS 初始允许 `http://localhost:3000`，可在 `apps/api/app/core/config.py` 中调整。

## 测试
- 后端：`cd apps/api && uv run pytest`
- 前端（预置 Vitest）：`pnpm --filter web test`

## 下一步建议
- 增加数据库迁移（Alembic）配置与 README 说明。
- 在 `packages/` 下添加共享 UI 组件或 OpenAPI 生成的 SDK。
- 添加 CI 流程（lint → test → build）以及 `docker-compose.yml` 聚合前后端。

# Design: Migrate to Next.js Fullstack Architecture

## Overview

本文档记录从 FastAPI + Next.js 双应用架构迁移到纯 Next.js 全栈架构的技术决策。

## Architecture Comparison

### Current Architecture (Before)

```
AutoRouter/
├── apps/
│   ├── api/                    # FastAPI 后端 (Python)
│   │   ├── app/
│   │   │   ├── api/routes/     # 路由处理
│   │   │   ├── services/       # 业务逻辑
│   │   │   ├── models/         # 数据模型
│   │   │   ├── core/           # 核心工具
│   │   │   └── db/             # 数据库
│   │   └── alembic/            # 迁移脚本
│   │
│   └── web/                    # Next.js 前端 (TypeScript)
│       └── src/
│           ├── app/            # 页面
│           ├── components/     # 组件
│           └── lib/            # 工具

部署: 双进程 (uvicorn + node) + 反向代理
端口: 8000 (API) + 3000 (Web)
```

### Target Architecture (After)

```
AutoRouter/
├── src/
│   ├── app/
│   │   ├── (auth)/             # 认证页面
│   │   ├── (dashboard)/        # 管理面板页面
│   │   ├── api/                # API Routes (后端逻辑)
│   │   │   ├── proxy/v1/       # 代理路由
│   │   │   ├── admin/          # 管理 API
│   │   │   └── health/         # 健康检查
│   │   └── layout.tsx
│   │
│   ├── components/             # UI 组件
│   ├── hooks/                  # React Hooks
│   ├── lib/
│   │   ├── db/                 # 数据库层 (Drizzle)
│   │   ├── services/           # 业务逻辑
│   │   └── utils/              # 工具函数
│   ├── types/                  # 类型定义
│   └── messages/               # i18n

部署: 单进程 (node server.js)
端口: 3000 (统一入口)
```

## Key Technical Decisions

### Decision 1: Database Layer (Drizzle ORM)

**选择**: Drizzle ORM

**理由**:

- TypeScript 原生，类型安全
- 支持 PostgreSQL
- 迁移工具内置
- 性能优秀，无运行时开销
- 社区活跃，与 Next.js 生态契合

**替代方案考虑**:

- Prisma: 更成熟但有运行时开销，类型生成需要额外步骤
- Knex: 灵活但类型支持较弱
- TypeORM: 装饰器风格与 Next.js 不太契合

### Decision 2: PostgreSQL Only

**选择**: 仅支持 PostgreSQL，移除 SQLite 支持

**理由**:

- 简化数据库适配层
- PostgreSQL 在生产环境更可靠
- 与 claude-code-hub 保持一致
- Docker Compose 内置 PostgreSQL 容器

**影响**:

- 开发环境需要 PostgreSQL（可用 Docker 容器）
- 现有 SQLite 数据需迁移

### Decision 3: Project Structure (Flat)

**选择**: 扁平化项目结构，使用 `src/` 目录

**理由**:

- 符合 Next.js 官方推荐
- 简化配置和路径
- 与 Vercel 部署最佳实践一致

**结构规范**:

```
src/
├── app/              # Next.js App Router
├── components/       # 共享组件
├── hooks/            # React Hooks
├── lib/              # 核心逻辑
│   ├── db/           # 数据库
│   ├── services/     # 业务服务
│   └── utils/        # 工具函数
├── types/            # TypeScript 类型
├── providers/        # React Context
├── messages/         # i18n
└── i18n/             # next-intl 配置
```

### Decision 4: SSE Streaming Implementation

**选择**: Next.js API Routes + Web Streams API

**实现模式**:

```typescript
// src/app/api/proxy/v1/[...path]/route.ts
export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const upstream = await fetch(upstreamUrl, { ... });
      const reader = upstream.body?.getReader();

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        controller.enqueue(value);
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

**关键配置**:

```typescript
// next.config.ts
export default {
  output: "standalone",
  experimental: {
    serverActions: true,
  },
};
```

### Decision 5: Authentication

**选择**: 保持现有认证模式

- Admin 认证: Bearer Token (ADMIN_TOKEN)
- API Key 认证: 自定义 API Key 验证

**实现**:

```typescript
// src/lib/utils/auth.ts
export async function verifyAdminToken(request: Request) {
  const auth = request.headers.get("Authorization");
  const token = auth?.replace("Bearer ", "");
  return token === process.env.ADMIN_TOKEN;
}

export async function verifyApiKey(request: Request, db: DB) {
  const auth = request.headers.get("Authorization");
  const key = auth?.replace("Bearer ", "");
  // bcrypt 验证逻辑
}
```

### Decision 6: Encryption

**选择**: Node.js crypto 模块

**映射**:
| Python (Fernet) | TypeScript |
|-----------------|------------|
| `Fernet.encrypt()` | `crypto.createCipheriv()` |
| `Fernet.decrypt()` | `crypto.createDecipheriv()` |

**注意**: 需要保持加密格式兼容，以支持数据迁移。

### Decision 7: Docker Deployment

**选择**: Next.js Standalone + PostgreSQL

**docker-compose.yaml**:

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/autorouter
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=autorouter
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**Dockerfile**:

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

## Code Migration Mapping

### Routes

| Python Route               | TypeScript Route                          |
| -------------------------- | ----------------------------------------- |
| `app/api/routes/proxy.py`  | `src/app/api/proxy/v1/[...path]/route.ts` |
| `app/api/routes/admin.py`  | `src/app/api/admin/*/route.ts`            |
| `app/api/routes/health.py` | `src/app/api/health/route.ts`             |

### Services

| Python Service                     | TypeScript Service                     |
| ---------------------------------- | -------------------------------------- |
| `app/services/proxy_client.py`     | `src/lib/services/proxy-client.ts`     |
| `app/services/key_manager.py`      | `src/lib/services/key-manager.ts`      |
| `app/services/upstream_service.py` | `src/lib/services/upstream-service.ts` |
| `app/services/stats_service.py`    | `src/lib/services/stats-service.ts`    |
| `app/services/request_logger.py`   | `src/lib/services/request-logger.ts`   |

### Models

| Python Model              | TypeScript Model                 |
| ------------------------- | -------------------------------- |
| `app/models/db_models.py` | `src/lib/db/schema.ts`           |
| `app/models/schemas.py`   | `src/types/api.ts` + Zod schemas |
| `app/models/upstream.py`  | `src/types/upstream.ts`          |

### Core Utils

| Python Util              | TypeScript Util               |
| ------------------------ | ----------------------------- |
| `app/core/config.py`     | `src/lib/utils/config.ts`     |
| `app/core/encryption.py` | `src/lib/utils/encryption.ts` |
| `app/core/deps.py`       | `src/lib/utils/auth.ts`       |
| `app/core/logging.py`    | Next.js 内置 + pino (可选)    |

## API Compatibility

保持 API 路径兼容:

| 原路径        | 新路径            | 备注     |
| ------------- | ----------------- | -------- |
| `/proxy/v1/*` | `/api/proxy/v1/*` | 路径变更 |
| `/admin/*`    | `/api/admin/*`    | 路径变更 |
| `/api/health` | `/api/health`     | 保持不变 |

**注意**: 代理路径从 `/proxy/v1/` 变更为 `/api/proxy/v1/`，需要更新用户文档。

## Testing Strategy

1. **单元测试**: Vitest 替代 pytest
2. **API 测试**: 使用 Vitest + supertest 或 Playwright API testing
3. **E2E 测试**: Playwright (可选)

## Rollback Plan

1. 保留原 `apps/` 目录代码直到验证完成
2. 使用 Git 分支管理迁移
3. 如迁移失败可回退到主分支

## Open Questions

1. ~~是否保留 SQLite 支持?~~ **决定: 仅 PostgreSQL**
2. ~~是否分阶段迁移?~~ **决定: 一次性完整迁移**
3. 加密密钥格式兼容性需要验证
4. 性能基准测试需要在迁移完成后执行

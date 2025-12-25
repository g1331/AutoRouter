# Capability: Database

数据库层实现，使用 Drizzle ORM 和 PostgreSQL。

## MODIFIED Requirements

### Requirement: ORM Layer

系统 SHALL 使用 Drizzle ORM 替代 SQLAlchemy。

#### Scenario: Database Schema Definition

- Given 项目使用 TypeScript
- When 定义数据库表结构
- Then 使用 Drizzle schema 定义 (`src/lib/db/schema.ts`)
- And 类型自动从 schema 推导
- And 支持关系定义和查询

#### Scenario: Database Migration

- Given 数据库 schema 发生变更
- When 运行迁移命令
- Then 使用 `drizzle-kit generate` 生成迁移
- And 使用 `drizzle-kit migrate` 应用迁移
- And 迁移文件存储在 `drizzle/` 目录

### Requirement: PostgreSQL Database

系统 MUST 仅支持 PostgreSQL 数据库。

#### Scenario: Database Connection

- Given 用户部署 AutoRouter
- When 配置数据库连接
- Then 使用 DATABASE_URL 环境变量
- And 格式为 `postgresql://user:password@host:port/database`
- And 使用连接池管理连接

#### Scenario: Docker PostgreSQL

- Given 用户使用 Docker Compose 部署
- When 启动服务
- Then 自动创建 PostgreSQL 容器
- And 数据持久化到 Docker volume
- And 应用等待数据库就绪后启动

## REMOVED Requirements

### Requirement: SQLite Support

SQLite 数据库支持已移除。

#### Scenario: No SQLite Option

- Given 用户想使用 SQLite
- When 尝试配置 SQLite 连接
- Then 系统不支持此选项
- And 必须使用 PostgreSQL

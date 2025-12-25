# Capability: Architecture

项目整体架构和技术栈定义。

## MODIFIED Requirements

### Requirement: Tech Stack

项目 SHALL 采用统一的技术栈构建。

#### Scenario: Next.js Fullstack Application

- Given 项目需要前端界面和后端 API
- When 用户部署 AutoRouter
- Then 使用单一 Next.js 应用提供所有功能
- And 前端使用 React 19 + TypeScript
- And 后端使用 Next.js API Routes
- And 数据库使用 PostgreSQL + Drizzle ORM

### Requirement: Project Structure

项目 SHALL 采用扁平化目录结构。

#### Scenario: Source Code Organization

- Given 项目使用 Next.js App Router
- When 开发者查看项目结构
- Then 所有源代码位于 `src/` 目录
- And 页面和 API 路由位于 `src/app/`
- And 共享组件位于 `src/components/`
- And 业务逻辑位于 `src/lib/`
- And 类型定义位于 `src/types/`

### Requirement: Single Port Deployment

项目 MUST 支持单端口部署。

#### Scenario: Docker Deployment

- Given 用户使用 Docker 部署 AutoRouter
- When 运行 `docker compose up -d`
- Then 只需要暴露一个端口 (3000)
- And 管理界面和代理 API 使用同一端口
- And 用户只需配置一个 Base URL

## REMOVED Requirements

### Requirement: Python Backend

FastAPI 后端已移除。

#### Scenario: No Python Dependencies

- Given 项目已迁移到 Next.js 全栈
- When 用户部署 AutoRouter
- Then 不需要 Python 运行时
- And 不需要 FastAPI 或 Uvicorn
- And 所有后端逻辑由 Next.js API Routes 处理

### Requirement: SQLite Support

SQLite 数据库支持已移除。

#### Scenario: PostgreSQL Only

- Given 项目使用 Drizzle ORM
- When 用户部署 AutoRouter
- Then 必须配置 PostgreSQL 数据库
- And 不再支持 SQLite 作为数据库选项

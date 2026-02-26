# Shared Skills & Context System

**Date**: 2026-02-27
**Commit**: `d0d71df2`
**Branch**: `main`

## 功能描述

团队管理和共享资源系统。支持 Skills（技能）和 Context（上下文）两种共享项，具有三级可见性：私有（private）、团队（team）、公开（public）。可将共享项附加到会话中使用。

## 架构

```
App → REST API → Server (Prisma DB) → EventRouter → Wire → App 实时同步
```

## 修改文件

### Server (`packages/happy-server/`)

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | 新增 5 个模型：Team, TeamMember, SharedItem, SharedItemVersion, SessionSharedItem |
| `prisma/migrations/*/migration.sql` | 数据库迁移脚本 |
| `sources/app/api/api.ts` | 注册新路由 |
| `sources/app/api/routes/teamRoutes.ts` | 团队 CRUD API（创建、邀请、移除成员等） |
| `sources/app/api/routes/sharedItemRoutes.ts` | 共享项 CRUD API（创建、更新、发布版本、可见性控制） |
| `sources/app/api/routes/sessionSharedItemRoutes.ts` | 会话关联共享项 API（附加/移除/列表） |
| `sources/app/events/eventRouter.ts` | 实时事件广播（新增 8 种事件类型） |
| `sources/app/shared-item/sharedItemAccess.ts` | 访问控制辅助函数 |

### Wire (`packages/happy-wire/`)

| 文件 | 改动 |
|------|------|
| `src/messages.ts` | 新增 8 种 update body 类型用于实时同步 |

### App (`packages/happy-app/`)

| 文件 | 改动 |
|------|------|
| `sources/sync/apiSharedItems.ts` | 共享项 API 客户端模块 |
| `sources/sync/apiTeams.ts` | 团队 API 客户端模块 |
| `sources/sync/apiTypes.ts` | API 类型定义扩展 |
| `sources/sync/sharedItemTypes.ts` | 共享项类型定义 |
| `sources/sync/storage.ts` | 本地状态管理（Zustand store） |
| `sources/sync/sync.ts` | 实时同步 handler |
| `sources/-session/SessionView.tsx` | 会话视图集成 |
| `sources/text/translations/*.ts` | 9 个语言文件添加翻译 |

## 关键设计决策

1. **三级可见性**：private（仅创建者）、team（团队成员）、public（所有用户）
2. **版本管理**：共享项支持版本发布（SharedItemVersion）
3. **实时同步**：通过 EventRouter + Wire 消息实时推送变更
4. **会话关联**：通过 SessionSharedItem 将共享项附加到特定会话

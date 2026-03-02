# Happy Coder 项目上下文

## 概述
Happy Coder 是开源的 Claude Code / Codex 移动端和 Web 端客户端，支持端到端加密的远程控制。用户可以在手机或浏览器实时监控和控制在计算机上运行的 AI coding agents。

**仓库**: https://github.com/y804508275/happy
**许可证**: MIT | **部署版本**: 2026.03.02.2 | **App Store 版本**: 1.6.2

## Monorepo 结构 (Yarn Workspaces)

| Package | 用途 | 技术栈 |
|---------|------|--------|
| **happy-app** | Web/Mobile 客户端 | React Native 0.81, Expo 54, React 19, Unistyles 3, Socket.io |
| **happy-cli** | CLI 包装器 (Claude/Codex/Gemini) | TypeScript, Ink 6.5, tweetnacl, Fastify |
| **happy-server** | 后端 API + WebSocket | Fastify 5, Prisma 6.11, PostgreSQL, Socket.io, Redis |
| **happy-wire** | 共享协议/类型 | TypeScript, Zod schemas |
| **happy-agent** | 远程 Agent 控制 | TypeScript, commander, socket.io-client |

## 关键文件路径

### happy-app (前端)
- `sources/sync/sync.ts` — 核心同步引擎，消息发送 (`sendMessage`)，加密管理
- `sources/components/AgentInput.tsx` — 输入框组件 (1300+ 行)，action buttons, autocomplete
- `sources/-session/SessionView.tsx` — 会话主视图，连接所有 hooks 和组件
- `sources/auth/AuthContext.tsx` — 认证状态管理
- `sources/sync/encryption/encryption.ts` — 密钥派生 (HMAC-SHA512)
- `sources/encryption/libsodium.ts` — encryptBox/decryptBox 实现
- `sources/sync/storage.ts` — Zustand + MMKV 状态存储
- `sources/hooks/useMdReferences.ts` — MD 引用文件管理 hook
- `sources/sync/apiSharedItems.ts` — SharedItems CRUD API 客户端
- `sources/sync/prompt/systemPrompt.ts` — 附加到 Claude 的系统提示
- `sources/text/translations/*.ts` — 9 种语言翻译 (en, zh-Hans, zh-Hant, ja, ru, es, pt, it, pl, ca)
- `sources/version.ts` — 部署版本号 `APP_DEPLOY_VERSION`
- `app.config.js` — Expo 配置，3 个变体 (dev/preview/production)

### happy-cli (CLI)
- `src/index.ts` — 主入口，命令解析
- `src/claude/runClaude.ts` — Claude 运行器，模式切换，消息队列
- `src/claude/loop.ts` — EnhancedMode 接口 (permissionMode, model, appendSystemPrompt)
- `src/claude/claudeRemote.ts` — 远程模式，连接 happy-server
- `src/claude/sdk/query.ts` — 构建 Claude Code 参数 (`--append-system-prompt`)
- `src/api/apiSession.ts` — WebSocket 会话客户端
- `src/api/encryption.ts` — tweetnacl 加密
- `src/daemon/run.ts` — 守护进程主循环

### happy-server (后端)
- `sources/main.ts` — 服务器引导
- `sources/app/api/api.ts` — Fastify 配置，路由注册
- `sources/app/api/routes/authRoutes.ts` — 认证端点
- `sources/app/api/routes/v3SessionRoutes.ts` — 消息端点
- `sources/app/api/routes/sharedItemRoutes.ts` — SharedItems API
- `prisma/schema.prisma` — 30+ 数据库模型

## 消息发送流程

```
用户输入 → AgentInput.onSend → SessionView.onSend
  → sync.sendMessage(sessionId, text, displayText, images, mdReferences)
    → 构建 meta.appendSystemPrompt (systemPrompt + MD引用内容)
    → encryption.encryptRawRecord(content)
    → Socket.io 发送到 happy-server
      → happy-server 转发到 happy-cli
        → CLI 通过 --append-system-prompt 传给 Claude Code
```

## 加密架构

- **密钥派生**: secret → HMAC-SHA512 → sessionKey/machineKey
- **加密格式**: ephemeralPK(32) + nonce(24) + crypto_box_easy(ciphertext)
- **App**: libsodium (@more-tech/react-native-libsodium)
- **CLI**: tweetnacl (兼容 libsodium)
- **所有消息端到端加密**，服务器只转发密文

## SharedItems 系统 (知识库/MD引用)

```
类型: 'context' | 'skill'
可见性: 'private' | 'team' | 'public'
元数据区分:
  - meta.memoryType = 'memory'        → 知识库记忆 (Knowledge Base 页面)
  - meta.memoryType = 'md-reference'  → MD 引用文件 (输入框快速选择)
  - meta.scope = 'global' | 'project'
```

API: `GET/POST /v1/shared-items`, `GET/POST/DELETE /v1/shared-items/:id`

## 构建命令

```bash
yarn web                    # Web 开发服务器
yarn ios / yarn android     # 模拟器
yarn typecheck              # TypeScript 检查
yarn ota                    # OTA 更新 (preview)
yarn ota:production         # OTA 更新 (production)
yarn stamp-version          # 更新部署版本号
yarn release:build:appstore # EAS Build + Submit
```

## 环境变量

- `EXPO_PUBLIC_HAPPY_SERVER_URL` — 服务器地址 (App)
- `DATABASE_URL` — PostgreSQL 连接 (Server)
- `HANDY_MASTER_SECRET` — 主密钥 (Server)
- `HAPPY_SERVER_URL` — 开发服务器地址 (CLI)

## 重要模式

- **状态管理**: Zustand + MMKV (持久化) + React hooks
- **同步**: InvalidateSync 类 (永不放弃的指数退避重试)
- **乐观更新**: 消息发送后立即显示 UI，后台同步
- **i18n**: `t('key')` 函数，9 种语言，每种语言单独文件
- **Modal**: `Modal.show()` / `Modal.alert()` / `Modal.confirm()` 统一系统
- **Theme**: Unistyles 主题系统，支持亮/暗模式

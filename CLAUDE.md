# Happy Coder 项目上下文

> 部署在 colin-cvm 服务器上的 Happy Coder 自托管实例

## 服务器信息

- **主机名**: colin-cvm
- **公网 IP**: 43.130.14.15
- **内网 IP**: 10.0.0.34
- **OS**: Rocky Linux 9.5
- **账号**: root
- **密码**: WXedHn5KR2NGjus7zBTD
- **SSH**: `ssh root@43.130.14.15`（连接不太稳定，可能需要多试几次）
- **内存**: 7.4GB / **磁盘**: 99GB

## 项目概述

Happy Coder 是一个 Claude Code / Codex 的移动端和 Web 端客户端，支持端到端加密的远程控制。

- **本地源码路径**: `/Users/colinyu/Projects/happy-coder`
- **远程部署路径**: `/opt/happy-coder`（源码）、`/opt/happy-web`（Web 前端静态文件）
- **域名**: `https://happy.superlinear.studio`
- **monorepo 结构**（yarn workspaces）：
  - `packages/happy-server` — Fastify + Socket.IO 后端（TypeScript, Prisma ORM）
  - `packages/happy-app` — Web/Mobile 客户端（React Native + Expo）
  - `packages/happy-cli` — CLI 包装器（Claude Code 远程控制，Ink 终端 UI）
  - `packages/happy-wire` — 共享协议定义
  - `packages/happy-agent` — 远程 Agent 控制 CLI

## 服务器架构

```
[用户浏览器/手机] → Nginx(:443 HTTPS) → happy-server(:3000) → PostgreSQL(:5432, Docker)
                       ↓
                  /opt/happy-web (静态前端)

happy-daemon (systemd) → happy-server(:3000)
```

### 运行的服务

| 服务 | 类型 | 端口 | 说明 |
|------|------|------|------|
| Nginx | systemd | 80/443 | 反向代理 + 静态文件（HTTPS, Let's Encrypt） |
| happy-server | systemd | 3000 | API + WebSocket 后端 |
| happy-daemon | systemd | - | CLI 守护进程 |
| PostgreSQL 16 | Docker | 5432 | 数据库 |

### Nginx 配置

- 配置文件: `/etc/nginx/conf.d/happy-web.conf`
- 域名: `happy.superlinear.studio`
- `/v1/updates/` → WebSocket 代理到 `:3000`（带 upgrade 头）
- `/v1/`, `/v3/` → API 代理到 `:3000`
- `/` → 静态文件 `/opt/happy-web/`
- HTTP 自动 301 跳转到 HTTPS
- 另有 `stripe-dashboard.conf` 配置指向 gunicorn(:5050)

### Systemd 服务文件

- **happy-server**: `/etc/systemd/system/happy-server.service`
  - WorkingDirectory: `/opt/happy-coder/packages/happy-server`
  - ExecStart: `yarn start`
  - 依赖 docker.service

- **happy-daemon**: `/etc/systemd/system/happy-daemon.service`
  - ExecStart: `happy daemon start-sync`
  - 环境变量: `HAPPY_SERVER_URL=http://localhost:3000`, `HOME=/root`
  - 依赖 happy-server.service

### 环境变量（happy-server）

文件: `/opt/happy-coder/packages/happy-server/.env`
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handy
HANDY_MASTER_SECRET=S6wvq9CypeZhVVxYdPkX/icXGLswPoeGL+hA3jY1d+Y=
PORT=3000
NODE_ENV=production
METRICS_ENABLED=false
```

**注意**: 没有配置 Redis（REDIS_URL 缺失）和 S3 存储，这可能导致部分功能受限。

## 关键模块和数据流

### 认证流程（Web 创建账号）

```
用户点击"创建账户"
→ getRandomBytesAsync(32) 生成 secret
→ authGetToken(secret): POST /v1/auth 带 challenge/signature/publicKey
→ 服务端返回 JWT token
→ auth.login(token, secret): 存 localStorage + syncCreate()
→ syncCreate() → syncInit() → Encryption.create(secretKey) → apiSocket.initialize()
→ 同步 settings/profile/sessions 数据
```

**关键文件**:
- `happy-app/sources/app/(app)/index.tsx` — 创建账号入口
- `happy-app/sources/auth/authGetToken.ts` — 认证 API 调用
- `happy-app/sources/auth/AuthContext.tsx` — 认证状态管理，`login()` 方法
- `happy-app/sources/auth/tokenStorage.ts` — Web 用 localStorage，Native 用 expo-secure-store

### 认证流程（CLI 链接 Web 账号）

```
CLI 生成临时 tweetnacl keypair
→ POST /v1/auth/request { publicKey, supportsV2: true }
→ 生成 URL: https://happy.superlinear.studio/terminal/connect#key=<base64url_publicKey>
→ 用户在 Web 打开 URL，点击"接受连接"
→ Web 端 encryptBox(credentials, cliPublicKey) → POST /v1/auth/response
→ CLI 轮询 /v1/auth/request 获取加密后的 response
→ 解密: ephemeralPK(32) + nonce(24) + ciphertext → tweetnacl.box.open
→ V2 格式: decrypted[0]=0x00, publicKey=decrypted[1:33], machineKey=random(32)
→ 保存到 ~/.happy/access.key (JSON格式)
```

**关键文件**:
- `happy-cli/src/ui/auth.ts` — CLI 认证流程，`doWebAuth()`, `decryptWithEphemeralKey()`
- `happy-cli/src/api/webAuth.ts` — Web 认证 URL 生成
- `happy-cli/src/persistence.ts` — 凭证存储，`writeCredentialsDataKey()`
- `happy-app/sources/hooks/useConnectTerminal.ts` — Web 端处理 terminal/connect
- `happy-app/sources/auth/authApprove.ts` — Web 端发送加密凭证

### 加密模块

**Web 端** (`happy-app/sources/encryption/`):
- `libsodium.ts` — `encryptBox()`: ephemeralPK(32) + nonce(24) + crypto_box_easy
- `hmac_sha512.ts` — 使用 `expo-crypto` 的 `Crypto.digest(SHA512)`（**需要 crypto.subtle，即 HTTPS**）
- `base64.ts` — base64/base64url 编解码

**CLI 端** (`happy-cli/src/api/encryption.ts`):
- 使用 tweetnacl（与 libsodium 兼容）
- `encodeBase64Url()` — base64url 编码

**凭证格式** (`~/.happy/access.key`):
```json
// Legacy 格式
{ "secret": "<base64>", "token": "<jwt>" }
// V2 DataKey 格式
{ "encryption": { "publicKey": "<base64>", "machineKey": "<base64>" }, "token": "<jwt>" }
```

### 同步模块

**核心文件**:
- `happy-app/sources/sync/sync.ts` — `syncCreate()`/`syncRestore()`/`syncInit()`
  - `syncCreate`: 新账号，设 `isInitialized=true`，初始化加密 + Socket.IO
  - `syncRestore`: 恢复账号，不阻塞等 settingsSync/profileSync
- `happy-app/sources/sync/encryption/encryption.ts` — `Encryption.create()` 使用 `deriveKey()` → `hmac_sha512`
- `happy-app/sources/sync/serverConfig.ts` — API URL 解析: MMKV 自定义 → env var → 默认
- `happy-app/sources/sync/apiSocket.ts` — Socket.IO 客户端, `transports: ['websocket']`
- `happy-app/sources/utils/sync.ts` — `InvalidateSync`: 同步失败时无限重试 backoff
- `happy-app/sources/utils/time.ts` — `backoff()`: 指数退避重试，永不放弃，错误仅 `console.warn`

### 服务端关键文件

- `happy-server/sources/main.ts` — 入口，Redis 可选
- `happy-server/sources/app/api/api.ts` — Fastify, CORS `origin: '*'`
- `happy-server/sources/app/api/socket.ts` — Socket.IO 服务端

## 调试指南

### 查看服务状态
```bash
systemctl status happy-server
systemctl status happy-daemon
docker ps  # 查看 PostgreSQL
happy auth status  # CLI 认证状态
```

### 查看日志
```bash
journalctl -u happy-server -f --no-pager    # 实时日志
journalctl -u happy-daemon -f --no-pager
journalctl -u nginx -f --no-pager
```

### 重启服务
```bash
systemctl restart happy-server
systemctl restart happy-daemon
systemctl restart nginx
```

### 数据库操作
```bash
docker exec -it postgres psql -U postgres -d handy
```

### CLI 重新认证
```bash
# 交互式（需要 TTY）:
happy auth login --force

# 非交互式脚本方式（见踩坑记录）:
# 需要编写 Node.js 脚本模拟 auth 流程
```

### 常见端口
- 80/443: Nginx（HTTP/HTTPS）
- 3000: happy-server（API + WebSocket）
- 5432: PostgreSQL（Docker）
- 5050: gunicorn（另一个项目 stripe_dashboard）

## 部署更新流程

### 更新后端（happy-server）
```bash
cd /opt/happy-coder
git pull
yarn install
systemctl restart happy-server
```

### 更新前端（happy-app Web）
```bash
cd /Users/colinyu/Projects/happy-coder  # 本地
# 注意：.env 文件在 packages/happy-app/.env 中定义了 EXPO_PUBLIC_HAPPY_SERVER_URL=https://happy.superlinear.studio
# 必须先删除旧的 dist 目录，否则 expo export 不会覆盖已存在的文件
rm -rf packages/happy-app/dist
yarn workspace happy-app expo export --platform web --output-dir dist
# 打包上传（scp 单文件比散文件更稳定）
tar czf /tmp/happy-web.tar.gz -C packages/happy-app/dist .
sshpass -p 'WXedHn5KR2NGjus7zBTD' scp /tmp/happy-web.tar.gz root@43.130.14.15:/tmp/
sshpass -p 'WXedHn5KR2NGjus7zBTD' ssh root@43.130.14.15 "rm -rf /opt/happy-web/* && tar xzf /tmp/happy-web.tar.gz -C /opt/happy-web/ && rm /tmp/happy-web.tar.gz"
```

### 更新 CLI daemon
```bash
# 在服务器上
systemctl restart happy-daemon
```

## HTTPS 配置

- 使用 **Let's Encrypt (certbot)** 为 `happy.superlinear.studio` 配置了 HTTPS 证书
- 证书路径: `/etc/letsencrypt/live/happy.superlinear.studio/`
- HTTP 自动 301 跳转到 HTTPS
- 证书自动续期（certbot 定时任务）
- **重要**: Web 前端必须通过 HTTPS 访问，否则 `crypto.subtle`（Web Crypto API）不可用，导致加密功能静默失败

## 已知问题

- SSH 连接不稳定，偶尔出现 `banner exchange: invalid format` 错误，多试几次即可
- 没有配置 Redis（某些功能如 eventbus 可能降级为本地模式）
- 没有配置 S3 存储（头像等上传功能不可用）
- `happy auth login` 等 CLI 命令使用 Ink（React 终端 UI），需要 TTY raw mode，无法通过非交互式 SSH 运行
- `happy-daemon` systemd 服务偶尔因 raw mode 问题崩溃重启

## 踩坑记录

1. **Web Crypto API 需要 HTTPS**: `crypto.subtle` 只在安全上下文（HTTPS/localhost）下可用。HTTP 部署时 `Encryption.create()` → `Crypto.digest(SHA512)` 会静默挂起，导致创建账号后整个同步流程卡死，无任何错误提示。本地开发不受影响因为 localhost 被视为安全上下文。backoff 无限重试机制会吞掉所有错误（仅 console.warn），所以浏览器控制台也看不到明显报错。
2. **expo export 不覆盖已存在的文件**: 构建前必须 `rm -rf dist`，否则旧文件不会被更新，导致部署的是旧代码。
3. **yarn workspace 不透传环境变量**: `EXPO_PUBLIC_*` 变量需要写在 `packages/happy-app/.env` 文件中，在命令行前缀 `EXPO_PUBLIC_XXX=yyy yarn workspace ...` 的方式不可靠，Expo Metro bundler 不一定读到。
4. **SCP 大量小文件不稳定**: SSH 连接不稳定时 scp 传大量散文件容易中断，优先用 `tar` 打包后传单个文件。
5. **CLI 认证需要 TTY**: `happy auth login` 使用 Ink 终端 UI，必须在有 TTY 的终端中运行。非交互式 SSH 场景需要编写 Node.js 脚本直接调用 API + tweetnacl 解密来完成认证。
6. **混合内容阻止**: HTTPS 页面中如果 API URL 编译为 `http://`，浏览器会阻止请求（Mixed Content），XHR 直接报错，且不会触发 `console.error`，只能通过拦截 fetch/XHR 才能看到。
7. **加密 bundle 格式**: encryptBox 的输出是 `ephemeralPK(32) + nonce(24) + ciphertext`，CLI 解密时需要用 `tweetnacl.box.open(ciphertext, nonce, ephemeralPK, recipientSecretKey)`，不是 sealed box。

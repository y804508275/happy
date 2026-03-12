# Happy Agent Platform — 技术方案

> 让用户将自己的 AI Coding Agent（Claude Code, OpenCode, Cursor, Droid 等）接入 Happy 平台，获得统一的客户端体验和平台能力（云浏览器、沙箱等）。

## 一、目标

1. 用户可以通过 Happy 客户端（Web / 桌面）连接和管理自己本地的 AI Coding Agent
2. 接入过程极简——Web 端引导下载安装，桌面端开箱即用
3. 接入后自动继承平台所有能力（Browserbase 浏览器、沙箱等），平台新增能力时用户零配置
4. 连接稳定——关机重启不断，网络波动自动恢复

## 二、现有架构基础

```
┌─────────────────────────────────────┐
│ happy-app (React Native + Expo)     │
│ ├── Web (Expo Web)                  │
│ ├── iOS / Android (Expo Native)     │
│ └── macOS (Tauri 2.x, 已有骨架)     │
└──────────┬──────────────────────────┘
           │ Socket.io WebSocket (E2EE 加密)
           ↓
┌──────────┴──────────────────────────┐
│ happy-server (Fastify + Prisma)     │
│ ├── REST API (认证, SharedItems)     │
│ ├── WebSocket 中继 (Socket.io)      │
│ └── PostgreSQL + Redis              │
└──────────┬──────────────────────────┘
           │ Socket.io WebSocket
           ↓
┌──────────┴──────────────────────────┐
│ happy-cli / Daemon                  │
│ ├── Daemon 主进程 (PM2 / launchd)   │
│ ├── HTTP Control Server (本地)      │
│ ├── Agent 子进程管理                 │
│ │   ├── Claude (native-claude)      │
│ │   ├── Codex (mcp-codex)           │
│ │   ├── Droid (droid exec)          │
│ │   └── OpenCode / Gemini (ACP)     │
│ └── MCP Server (per session)        │
│     └── Capability Tools            │
│         ├── browser_navigate        │
│         └── browser_screenshot      │
└─────────────────────────────────────┘
```

**核心优势（已有）**：
- 端到端加密（E2EE）的消息传输
- 多 Agent 后端抽象（`AgentBackend` 接口）
- Session Protocol 标准化（`happy-wire`）
- MCP 工具注入机制（`startHappyServer`）
- Tauri 桌面端骨架已存在

## 三、方案设计

### 3.1 两阶段路线

| 阶段 | 形态 | 连接方式 | 用户体验 |
|------|------|---------|---------|
| **Phase A** | Web App + Happy Agent Service（轻量本地服务） | WebSocket 中继 | Web 引导安装，5 分钟搞定 |
| **Phase B** | Happy Desktop App（Tauri，已有骨架） | 本地进程间通信 | 一个 App 搞定一切 |

两个阶段共享：Agent 管理逻辑、MCP 工具注入、Session Protocol、E2EE 加密。

---

### 3.2 Phase A：Web App + Happy Agent Service

#### 3.2.1 架构

```
Happy Web App (happycopy.ai)
    ↕ Socket.io WebSocket (E2EE, 现有链路)
Happy Server (云端中继)
    ↕ Socket.io WebSocket (E2EE, 现有链路)
Happy Agent Service (用户本地，轻量常驻服务)
    ↕ stdio / MCP / ACP
本地 Agent (Claude Code / OpenCode / Droid / ...)
```

Happy Agent Service = 当前 Daemon 的产品化包装。

#### 3.2.2 用户安装流程

```
Step 1: 用户在 Web App 点击 "Connect Local Agent"
         ↓
Step 2: 根据 OS 下载安装器
        ├── macOS: .dmg (内含 .app，拖到 Applications)
        ├── Windows: .msi 安装包
        └── Linux: .deb / .AppImage
         ↓
Step 3: 首次启动 → 浏览器弹出 OAuth 授权页
        → 用户登录 Happy 账号 → 自动获取 token
        → Token 写入 ~/.happy/access.key（现有机制）
         ↓
Step 4: 服务自动注册开机启动
        ├── macOS: launchd plist (~//Library/LaunchAgents/)
        ├── Windows: Windows Service / Task Scheduler
        └── Linux: systemd user service
         ↓
Step 5: 服务连接到 Happy Server（复用现有 Daemon Socket.io 连接）
        → Web App 自动检测到 machine online
        → 显示 "Local Agent Service Connected ✓"
```

#### 3.2.3 Agent 发现与连接

服务启动后自动扫描本地已安装的 Agent：

```typescript
// packages/happy-cli/src/agent/discovery.ts

interface DiscoveredAgent {
  type: 'claude-code' | 'opencode' | 'cursor' | 'droid' | 'codex';
  name: string;
  version: string;
  path: string;           // 可执行文件路径
  status: 'available' | 'running' | 'connected';
}

async function discoverLocalAgents(): Promise<DiscoveredAgent[]> {
  const agents: DiscoveredAgent[] = [];

  // Claude Code
  const claudePath = await which('claude').catch(() => null);
  if (claudePath) {
    const version = await exec('claude --version');
    agents.push({ type: 'claude-code', name: 'Claude Code', version, path: claudePath, status: 'available' });
  }

  // OpenCode
  const opencodePath = await which('opencode').catch(() => null);
  if (opencodePath) { ... }

  // Droid (Factory)
  const droidPath = await which('droid').catch(() => null);
  if (droidPath) { ... }

  // Codex
  const codexPath = await which('codex').catch(() => null);
  if (codexPath) { ... }

  return agents;
}
```

Web App 展示扫描结果，用户点击 "Connect" 即可开始使用：

```
┌─────────────────────────────────────┐
│  Local Agents                       │
│                                     │
│  ✅ Claude Code v4.2    [Connected] │
│  ⚪ OpenCode v1.3       [Connect]   │
│  ⚪ Droid v0.14         [Connect]   │
│                                     │
│  [Scan Again]                       │
└─────────────────────────────────────┘
```

#### 3.2.4 打包方案

将 happy-cli 的 Daemon 核心打包为独立可执行文件：

| 方案 | 工具 | 优缺点 |
|------|------|--------|
| **推荐: pkg** | `@yao-pkg/pkg` | 将 Node.js + 代码打包成单文件可执行，用户不需要装 Node.js |
| nexe | `nexe` | 类似 pkg，社区活跃度稍低 |
| Electron (no window) | `electron-builder` | 体积大（~100MB），但生态成熟，支持 auto-updater |

**推荐方案**：用 `pkg` 打包 Daemon 核心为单文件（~50MB），配合平台原生安装器（macOS .dmg / Windows .msi）。

#### 3.2.5 连接稳定性保障

```
1. Socket.io 自动重连（现有能力）
   - 指数退避 + 永不放弃（InvalidateSync 模式）
   - 网络恢复后自动重连 + 重新同步消息

2. Agent 进程看护
   - Daemon 监控 agent 子进程健康状态
   - 进程异常退出 → 自动重启 + 通知 App
   - 用户主动关闭 agent（如退出 Claude Code）→ App 显示 offline

3. 服务常驻
   - macOS launchd: KeepAlive=true, 崩溃自动重启
   - Windows Service: Recovery = Restart
   - 开机自启，用户无感

4. 状态持久化（现有能力）
   - daemon.state.json 记录活跃 session
   - 服务重启后 re-adopt 未结束的 session
```

---

### 3.3 Phase B：Happy Desktop App（Tauri）

#### 3.3.1 架构

```
Happy Desktop App (Tauri 2.x)
├── Frontend (React Native Web → WebView)
│   └── 复用 happy-app 现有代码 (100%)
├── Rust Backend (Tauri Core)
│   ├── 窗口管理、系统托盘、通知
│   ├── Auto-updater (Tauri 内置)
│   └── 开机自启 (autostart plugin)
└── Node.js Sidecar (happy-cli daemon 逻辑)
    ├── Agent 进程管理 (spawn, stdio)
    ├── MCP Server (per session)
    ├── Socket.io → Happy Server
    └── Agent Discovery
```

**关键点**：
- **Frontend 100% 复用** — happy-app 已经支持 Tauri target（`tauri/` 目录已存在）
- **Agent 管理本地化** — 不需要 WebSocket 中继，直接进程间通信，延迟最低
- **单一安装** — 一个 .dmg 包含 UI + Agent Service + 所有能力
- **Auto-update** — Tauri 内置 updater，平台新增能力自动推送

#### 3.3.2 与 Phase A 的关系

Phase B 本质上是把 Phase A 的"Web App + Agent Service"合二为一：

| 组件 | Phase A | Phase B |
|------|---------|---------|
| UI | Web App (浏览器) | Tauri WebView (桌面窗口) |
| Agent Service | 独立安装的后台服务 | 内置在 App 进程中 |
| 与 Server 通信 | Socket.io (中继) | Socket.io (同步 + 备份) |
| Agent 管理 | Service → stdio → Agent | App → stdio → Agent (直连) |
| 安装 | 两步（Web + 下载服务） | 一步（装 App） |

---

### 3.3.3 单实例保证与多形态共存

同一台机器上可能存在多种 Daemon 形态（PM2 开发模式、Agent Service、桌面客户端），需要保证**永远只有一个实例在运行**。

**现有机制（已实现）**：
- `acquireDaemonLock()` — 文件锁（`~/.happy/daemon.lock`），同一时刻只有一个进程能持有
- `daemon.state.json` — 记录运行中的 PID、端口、版本
- 版本检查 — 新版本启动时自动 kill 旧版本，再接管

**冲突解决策略**：

| 场景 | 行为 |
|------|------|
| 已有 PM2 Daemon，又装了 Agent Service | Agent Service 检测到锁 → 提示已有服务 → 可选择接管或复用 |
| Agent Service 在跑，装了桌面客户端 | 桌面客户端优先级更高 → 自动接管 → Agent Service 退让 |
| 桌面客户端在跑，Web 端点"Connect" | Web 检测到 Machine 已 online → 直接复用，不重复启动 |
| 关机重启后 | 最后安装的形态（launchd/Service）自动启动，拿到锁 |

**优先级**：Desktop App > Agent Service > PM2 Dev Mode

---

### 3.4 平台能力自动注入

这是三层问题中的第三层：接入后如何自动获得平台能力。

#### 3.4.1 MCP 动态注入（已有基础）

当前 `startHappyServer.ts` 已经支持动态注册 capability tools：

```typescript
// 现有代码 - 每个 session 的 MCP server 自动注册 capability tools
const capabilityToolNames = registerCapabilityTools(mcp, previewEmitter);
```

**核心机制**：
- Happy MCP Server 在每个 session 启动时创建
- 通过 `--mcp-servers` (Claude) / `addDroidMcpServer` (Droid) / ACP config 注入到 agent
- Agent 启动时自动发现并可调用这些工具
- **平台新增能力** → 修改 `registerCapabilityTools` → 重新构建 → 用户侧 Agent Service 更新后自动生效

#### 3.4.2 能力注册表（未来扩展）

```typescript
// packages/happy-cli/src/capabilities/registry.ts

interface CapabilityProvider {
  name: string;
  description: string;
  enabled: (config: UserConfig) => boolean;  // 根据用户配置决定是否启用
  register: (mcp: McpServer, emitter: PreviewEmitter) => string[];  // 返回注册的 tool names
  cleanup: () => Promise<void>;
}

class CapabilityRegistry {
  private providers: CapabilityProvider[] = [];

  register(provider: CapabilityProvider) {
    this.providers.push(provider);
  }

  // 在 MCP server 启动时调用
  registerAll(mcp: McpServer, emitter: PreviewEmitter, config: UserConfig): string[] {
    return this.providers
      .filter(p => p.enabled(config))
      .flatMap(p => p.register(mcp, emitter));
  }
}

// 使用示例
const registry = new CapabilityRegistry();
registry.register(new BrowserbaseProvider());   // 云浏览器
registry.register(new E2BSandboxProvider());    // 代码沙箱
registry.register(new DatabaseProvider());      // 未来: 数据库
registry.register(new FileStorageProvider());   // 未来: 文件存储
```

#### 3.4.3 能力更新机制

| 场景 | 更新方式 |
|------|---------|
| Phase A (Agent Service) | Agent Service 的 auto-updater 推送新版本，包含新 capability |
| Phase B (Desktop App) | Tauri auto-updater 推送新版本 |
| MCP tools/list | Agent 每次启动 session 时调用 `tools/list`，自动发现最新工具 |

**关键设计**：capability 实现在 Happy 侧（Agent Service / Desktop App），不在用户的 Agent 里。所以更新 Happy 侧就行，用户的 Agent 不需要任何改动。

---

## 四、通信协议与消息流

### 4.1 消息流（用户发消息给 Agent）

```
Web/Desktop App
  → E2EE 加密
  → Socket.io → Happy Server → Socket.io → Agent Service (Daemon)
  → 解密
  → MessageQueue2 → agent spawn (如 droid exec)
  → stdin 写入 prompt
  → stdout 逐行读取 agent 输出
  → 转换为 SessionEnvelope (SessionProtocol)
  → E2EE 加密
  → Socket.io → Happy Server → Socket.io → App
  → 解密 → UI 渲染
```

### 4.2 Capability 调用流（Agent 调用 browser_navigate）

```
Agent (如 Claude Code)
  → MCP tool call: browser_navigate({ url })
  → Happy MCP Server (本地, per-session)
  → BrowserbaseSandbox.navigate(url)
  → Browserbase Cloud API
  → 返回结果 + Live View URL
  → MCP tool response → Agent
  同时:
  → PreviewEmitter.sendPreview({ kind: 'url', url: liveViewUrl })
  → SessionProtocol preview event
  → E2EE → Socket.io → Server → App
  → PreviewPanel iframe 展示实时浏览器画面
```

---

## 五、数据模型扩展

### 5.1 Machine 模型增强

现有 `Machine` 模型 + 新增字段：

```prisma
model Machine {
  // 现有字段 ...
  
  // 新增: Agent Service 信息
  serviceVersion    String?      // Agent Service 版本
  discoveredAgents  Json?        // 已发现的本地 agent 列表
  capabilities      Json?        // 已启用的平台能力
  lastHeartbeat     DateTime?    // 最后心跳时间
}
```

### 5.2 Session 模型增强

```prisma
model Session {
  // 现有字段 ...
  
  // 新增: Agent 类型标识
  agentType         String?      // 'claude-code' | 'opencode' | 'droid' | 'codex' | ...
  agentVersion      String?      // agent 版本
}
```

---

## 六、安全考虑

| 风险 | 缓解措施 |
|------|---------|
| Agent Service 被恶意控制 | E2EE: Server 无法解密消息，只做中继 |
| API Key 泄露 (Browserbase 等) | Key 存储在 Agent Service 本地（`~/.happy-dev/capabilities.env`），不上传到 Server |
| 未授权的 Agent 操作 | 现有 permissionMode 机制（default/auto-approve），App 端可控制 |
| Agent Service 网络暴露 | Control Server 仅监听 127.0.0.1，不对外暴露 |
| 服务更新供应链攻击 | 代码签名 + 校验和验证 |

---

## 七、实施计划

### Phase A: Web + Agent Service（预计 4-6 周）

| 周 | 任务 |
|----|------|
| W1 | Agent Discovery 模块 + Daemon 新增 agent 管理 API |
| W2 | Web App "Connect Local Agent" 页面 + Agent 列表 UI |
| W3 | Agent Service 打包（pkg）+ macOS 安装器（.dmg）|
| W4 | OAuth 自动登录流程 + launchd 开机自启 |
| W5 | CapabilityRegistry 框架 + 自动注入 |
| W6 | E2E 测试 + 文档 + Windows 安装器 |

### Phase B: Desktop App（预计 3-4 周，可与 Phase A 并行后段启动）

| 周 | 任务 |
|----|------|
| W1 | Tauri 骨架完善 + Node.js sidecar 集成 |
| W2 | Agent 管理逻辑迁入 Tauri + 系统托盘 |
| W3 | Auto-updater + 开机自启 |
| W4 | 测试 + 发布 |

---

## 八、开放问题

1. **是否需要支持远程 Agent？** 比如用户的 Agent 跑在远程服务器上，通过 SSH 隧道连入。
2. **多 Agent 并行** — 用户是否需要同时运行多个 Agent（比如 Claude Code + OpenCode），在 App 里切换？
3. **平台能力的计费模式** — Browserbase 等第三方服务的成本，是平台统一承担还是按量计费给用户？
4. **Agent Service 的最低系统要求** — 需要支持多旧的 macOS / Windows 版本？

# Happy Capabilities 平台 — 分步实施方案

## 一、项目背景

### Happy Coder 现状

Happy Coder 是开源的 Coding Agent 移动端和 Web 端客户端（仓库：https://github.com/y804508275/happy），支持端到端加密的远程控制。用户可以在手机或浏览器实时监控和控制在计算机上运行的 AI Coding Agent（Claude Code / Codex / Droid / Gemini）。

现有 Monorepo 结构：

| Package | 用途 | 技术栈 |
|---------|------|--------|
| **happy-app** | Web/Mobile 客户端 | React Native, Expo, React 19, Socket.io |
| **happy-cli** | CLI 包装器 (Claude/Codex/Droid/Gemini) | TypeScript, Ink, tweetnacl, Fastify |
| **happy-server** | 后端 API + WebSocket | Fastify 5, Prisma, PostgreSQL, Socket.io, Redis |
| **happy-wire** | 共享协议/类型 | TypeScript, Zod schemas |
| **happy-agent** | 远程 Agent 控制 | TypeScript, socket.io-client |

现有消息流：
```
用户 App → happy-server (WebSocket) → happy-cli (用户本地) → Agent (Claude Code/Droid/...)
  → Agent 回复 → 归一化为 SessionProtocol events → happy-server → App 显示
```

目前 Happy 是一个纯对话界面——左侧消息流，Agent 的能力仅限于 Coding（读写文件、执行命令），所有操作发生在用户本地机器上。

---

## 二、原始需求

### 目标

将 Happy 从"Coding Agent 远程控制器"升级为 **通用 AI Agent 运行时平台**，形成"左边对话、右边展示"的产品形态（类似 Manus）。

### 需求 1：基础能力（Capabilities）

(a) 无论启动哪种 Coding Agent（或连接用户自己的 Agent），系统都能为其加载一套统一的基础能力。

(b) 基础能力包括：操作文件、文档（Markdown/Word）、Excel、PPT，并能在右侧窗口展示出来。

(c) 浏览器也是一种基础能力——Coding Agent 可以操作浏览器并看到内容，类似 Computer Use。

(d) 基础能力未来可以扩充，不管扩充什么，所有 Coding Agent 都能直接调用。

### 需求 2：扩展技能（Skills）

(a) Skills 是额外安装的技能或应用。

(b) 这些技能可以通过 Coding Agent 唤起。

(c) 它们可以利用基础能力，将输出结果展示在右侧面板。

### 需求 3：云端执行

(a) 文件系统、浏览器、文档操作等基础能力在云端服务器执行，而非用户本地。

(b) Agent 默认在用户本地运行（保持现有架构），通过 API 调用云端能力。

(c) 未来支持三种模式：Agent 本地 + 能力云端（优先）；Agent 和能力都在云端；Agent 和能力都在本地。

### 需求 4：安全隔离

(a) 不能影响现有生产环境和本地开发环境。

(b) 在本地开发环境的 feature 分支上开发，通过环境变量开关隔离，不影响现有功能。

(c) 初期只接入 Droid（Factory CLI），成本低、安装简单；验证完毕后再接入 Claude Code 等。

---

## 三、核心架构决策

### 决策 1：Agent 和 Capabilities 的位置解耦，两种模式都支持

Agent 在哪里运行和 Capabilities 在哪里运行是两个独立的问题。**两种主要模式都要支持**，先 A 后 B：

| 模式 | Agent 位置 | Capabilities 位置 | 场景 | 实施顺序 |
|------|-----------|-------------------|------|---------|
| **模式 A** | 用户本地 | 云端沙箱 (E2B) | 本地 Coding + 云端能力加持 | **先做 (Phase 0-3)** |
| **模式 B** | 云端沙箱 (E2B) | 同一个云端沙箱 | 纯云端，手机就能用，用户间完全隔离 | **后做 (Phase 4)** |
| **模式 C** | 用户本地 | 用户本地 | 离线/隐私场景，自建沙箱 | 未来 |

**模式 A**：用户本地跑 Agent（Droid/Claude Code），Agent 通过 tool call 远程调用 E2B 沙箱里的浏览器/文件系统。happy-cli 的 `capabilities/proxy.ts` 拦截 tool call 并转发到 E2B。

**模式 B**：Agent 也跑在 E2B 沙箱里（沙箱内预装 Droid CLI + happy-cli-lite），Agent 的原生 Read/Write/Bash 天然操作沙箱内的文件系统和浏览器。不需要 tool call 拦截，不需要 proxy 层。用户不需要本地装任何东西，手机打开 App 就能用。每个用户独立沙箱，API Key 隔离。

**两种模式复用同一套代码**：preview 协议、App PreviewPanel、tool 定义全部共用。区别只在 Agent 的启动位置和 Capability 的调用方式。

三种模式对 App 侧完全透明——左侧对话 + 右侧 preview 面板不变。

### 决策 2：Capability 触发策略

#### 问题背景

最初的设计是在用户消息到达 Agent 之前，用 LLM Intent Router（Haiku / GPT-4o-mini）做意图分类并预执行 Capability。但这个方案有严重的延迟问题：

- LLM 意图分类实际需要 500-1500ms（不是理想的 200-500ms）
- 加上浏览器预执行（导航 + 截图）3-10s
- **用户总等待 5-15s 后 Agent 才开始响应**，体验很差

此外还有成本问题（每条消息都需要一次额外 LLM 调用）和准确性问题（意图分类可能误判）。

#### 方案对比

| 方案 | 延迟 | 复杂度 | 可靠性 | 成本 |
|------|------|--------|--------|------|
| ~~LLM Intent Router 串行~~ | 5-15s | 高 | 中 | 每条消息一次 LLM |
| **A. 纯 Agent 工具** | 0 额外 | **最低** | 高 | 0 |
| B. 规则预热 + Agent 工具 | 0~秒回 | 中 | 高 | 0 |

#### 推荐方案 A（初期）：纯 Agent 工具

现代 LLM（Claude / Droid）的 tool use 能力已经很强，直接把 Capability 作为 tool 注入 Agent，让 Agent 自己决定何时调用：

```
用户消息 → Agent 直接推理（带 browser/filesystem/slides 等 tool 定义）
         → Agent 自己决定调 browser.navigate()
         → 系统执行 Capability → 结果返回 Agent 继续推理
         → 同时 preview 推送到 App 右侧面板
```

**优点**：零额外延迟，架构最简单，无需维护 Intent Router 服务，零额外成本。
**缺点**：Agent 偶尔可能不用工具（实际概率很低，tool 定义写好即可）。

#### 可选方案 B（后期优化）：规则预热 + Agent 工具

在方案 A 基础上，加一层轻量规则引擎做"预热加速"（不阻塞 Agent）：

```
用户消息 → 规则引擎快速检测（<1ms，纯正则，无 LLM）
         ├── 检测到 URL → 后台并行预执行浏览器（不阻塞 Agent）
         └── Agent 立即开始推理（带 tool 定义）
               → Agent 调 browser.navigate("competitor.com")
               → 如果预执行已完成 → 缓存命中，秒回
               → 如果未完成 → 正常等待
```

规则引擎示例（覆盖 90% 的浏览器场景）：

```typescript
function quickIntentDetect(message: string) {
  const urls = message.match(/https?:\/\/[^\s]+|[\w-]+\.(com|org|io|net)\b/g);
  if (urls) return { preheat: [{ capability: 'browser', action: 'navigate', url: urls[0] }] };
  return { preheat: [] };
}
```

#### 实施建议

1. **Phase 0-3 使用方案 A**：先验证 Agent 工具调用的可靠性
2. **如果发现 Agent 经常不用工具**：加方案 B 的规则预热
3. **不建议上 LLM Intent Router**：成本和延迟不划算

### 决策 3：右侧面板数据驱动

Capability 执行后产生的预览数据（截图、文件内容等）通过 SessionProtocol 推送到 App。驱动方式分两层：

**主动推送（可靠）**：每次 Capability tool call 执行完毕后，happy-cli 主动构造一个 `preview` event，通过现有的 SessionProtocol 加密通道发送到 App。这是主要的驱动方式。

**沙箱监控（补充，后期）**：对于 Agent 在沙箱内直接操作（不通过 tool call）的场景，通过 E2B SDK 提供的能力做补充监控：

| 监控对象 | E2B 实现方式 | 触发条件 |
|---|---|---|
| 文件变更 | `sandbox.files.list()` 定期轮询 或 `sandbox.commands.run('inotifywait ...')` | Agent 通过 bash 创建/修改文件 |
| 浏览器状态 | Playwright CDP 远程连接 `sandbox.getHost(port)` | Agent 自己启动浏览器 |

初期优先做"主动推送"，沙箱监控作为后续优化。

---

## 四、整体架构

### 模式 A：本地 Agent + 云端 Capabilities（先做）

```
┌───────────────────┐
│  用户本地           │
│                    │
│  happy-cli         │   WebSocket/API    ┌─────────────────────────┐
│  + Agent           │◄─────────────────►│     happy-server         │
│  (Droid/Claude     │                    │     (现有，不改核心逻辑)   │
│   Code/...)        │                    └─────────────────────────┘
│                    │                              ▲
│  ┌────────────────┐│                              │ WebSocket
│  │ capabilities/  ││                              │
│  │ ├ e2b.ts       ││  E2B SDK (HTTP)   ┌─────────┴─────────────┐
│  │ ├ tools.ts     ││─────────────────►│      E2B Cloud          │
│  │ ├ proxy.ts     ││◄────────────────│  (沙箱: 只有能力)        │
│  │ └ preheat.ts   ││  结果+截图       │  ├ Chromium (浏览器)     │
│  │   (可选)        ││                  │  ├ 文件系统              │
│  └────────────────┘│                  │  ├ Python / Node         │
│                    │                  │  └ 启动 <200ms           │
└───────────────────┘                  └─────────────────────────┘
         ▲
         │ preview event (经 happy-server 中转)
         ▼
┌──────────────────┐
│  happy-app        │
│  ┌──────┬───────┐│
│  │ Chat │Preview││
│  │      │ Panel ││
│  └──────┴───────┘│
└──────────────────┘
```

### 模式 B：全部在云端（后做）

```
                              ┌─────────────────────────┐
                              │     happy-server         │
                              │     (新增: 云端 session   │
                              │      启动/管理 E2B 沙箱)  │
                              └────────┬────────────────┘
                                       │ WebSocket
                                       ▼
                              ┌─────────────────────────┐
                              │      E2B Cloud           │
                              │  (沙箱: Agent + 能力)     │
                              │  ├ Droid CLI (Agent)     │
                              │  ├ happy-cli-lite        │
                              │  │  (连回 happy-server)   │
                              │  ├ Chromium (浏览器)      │
                              │  ├ 文件系统               │
                              │  └ Python / Node          │
                              └─────────────────────────┘
                                       ▲
                                       │ preview event
                                       ▼
                              ┌──────────────────┐
                              │  happy-app        │
                              │  ┌──────┬───────┐│
                              │  │ Chat │Preview││
                              │  │      │ Panel ││
                              │  └──────┴───────┘│
                              └──────────────────┘

用户不需要本地装任何东西，手机/浏览器打开 App 即可使用。
```

**核心原则：**
- 模式 A：Agent 在用户本地，通过 `capabilities/proxy.ts` 远程调用 E2B 沙箱
- 模式 B：Agent 也在 E2B 沙箱内，原生操作沙箱环境，不需要 proxy 层
- **沙箱使用 [E2B](https://e2b.dev/) 托管服务**（npm 包：`e2b`），不自建 Docker 容器
- E2B 提供浏览器、文件系统、代码执行等完整能力，per-session 隔离，启动 <200ms
- App 双面板：左侧对话，右侧展示 Capability 产出的 preview，两种模式完全一致
- 未来可切换为自托管沙箱（E2B 开源）实现离线/私有化部署

---

## 五、Preview 数据链路（从 E2B 到 App 右侧面板）

> **命名说明**：Happy 现有的 `Artifact` 是加密笔记系统（`artifactTypes.ts`、`artifactsRoutes.ts`），
> 为避免混淆，Capability 输出的展示数据统一命名为 **Preview**。

### 5.1 完整链路

```
Agent tool call: browser_navigate("example.com")
  │
  ▼
happy-cli/src/capabilities/proxy.ts 拦截
  │
  ▼
E2B SDK 执行：沙箱内 Chromium 导航 + 截图
  │
  ├─→ 结果（文本）返回给 Agent 继续推理
  │
  └─→ preview 数据（截图 PNG）处理：
        │
        ▼
      happy-cli 构造 SessionProtocol preview event
        │
        ├─→ 小数据 (<256KB)：base64 编码，直接放在 event.data 字段
        │     → 加密 → WebSocket → happy-server → App
        │
        └─→ 大数据 (>256KB, 如高清截图)：
              → POST /v1/sessions/{id}/files 上传到 happy-server
              → 获得 fileRef
              → event.data = fileRef (URL 引用)
              → 加密 → WebSocket → happy-server → App
```

### 5.2 为什么复用 SessionProtocol 而不是新建 API

- 现有的 SessionProtocol 已经有完整的加密、WebSocket 推送、消息排序机制
- Preview event 只是一种新的 event type，加入 discriminated union 即可
- App 端的消息接收管道不需要改，只需要加一个新的 event renderer
- 文件上传复用现有的 session file 机制（`sessionFileEventSchema` 已经存在）

### 5.3 SessionProtocol 扩展（happy-wire）

新增 preview 事件类型，纳入现有 `sessionEventSchema` 的 discriminated union：

```typescript
export const sessionPreviewEventSchema = z.object({
  t: z.literal('preview'),
  previewId: z.string(),
  previewType: z.enum([
    'browser-screenshot',   // 浏览器截图
    'browser-frame',        // 浏览器实时画面（URL 引用 noVNC 流，后期）
    'file-content',         // 文件内容预览
    'html',                 // HTML 渲染
    'spreadsheet',          // 表格数据
    'slides',               // 幻灯片
    'pdf',                  // PDF 预览
    'image',                // 图片
  ]),
  title: z.string(),
  data: z.string(),         // base64 内容或 fileRef URL
  mimeType: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),  // 额外信息（如浏览器 URL、文件路径等）
});
```

---

## 六、开发隔离策略

### 6.1 分支隔离 + 环境变量开关

由于 E2B 沙箱完全托管在云端，**不需要新服务器**。所有开发在本地完成，通过 git 分支和环境变量隔离：

```
main 分支（不动，生产稳定）
│
└── feat/capabilities 分支（所有 Capabilities 改动在这里）
      ├── happy-cli/src/capabilities/   ← 纯新增目录
      ├── happy-cli/src/droid/          ← 小改动（注入 tool，受 E2B_API_KEY 守护）
      ├── happy-wire/                   ← 新增 preview event type
      └── happy-app/                    ← 新增右侧面板组件
```

**安全保证：**

1. **分支隔离** — main 分支零影响，所有改动在 feature 分支
2. **环境变量开关** — `E2B_API_KEY` 未设置时，Capability 代码完全不执行：
   ```typescript
   // droidRemote.ts 里唯一的改动：
   if (process.env.E2B_API_KEY) {
     // 注入 capability tools + 拦截 tool call
   }
   // 没设 E2B_API_KEY → 完全走原来的逻辑，跟改动前一模一样
   ```
3. **新增为主** — `src/capabilities/` 是纯新增目录，不改现有文件的核心逻辑

### 6.2 本地开发环境

```
本地 Mac（现有开发环境，不需要额外服务器）
├── happy-server          (localhost:3005)
├── happy-app / web       (localhost:8082)
├── happy-cli + daemon    (本地)
│   └── E2B SDK → 调 E2B Cloud API（互联网）
│
└── 测试时：E2B_API_KEY=e2b_xxx happy daemon start   ← 带 E2B
    正常时：happy daemon start                        ← 不带，跟之前一模一样
```

### 6.3 生产环境不受影响

- 生产服务器上的 main 分支不含 Capabilities 代码
- 合并到 main 后，生产环境没设 `E2B_API_KEY` → Capabilities 功能不激活
- 需要上线时，只需在生产环境配置 `E2B_API_KEY` 即可开启

---

## 七、分步实施计划

### Phase 0：创建 feature 分支 + 配置 E2B

**目标**：在本地开发环境创建隔离分支，注册 E2B 账号，确认本地 Happy 环境正常。

**做的事：**

1. 创建 feature 分支：
   ```bash
   cd /Users/colinyu/happy
   git checkout -b feat/capabilities
   ```

2. 注册 E2B 账号，获取 API Key：
   - 访问 https://e2b.dev/ 注册（免费，含 $100 额度）
   - 获取 `E2B_API_KEY`

3. 确认本地 Happy 开发环境正常运行：
   ```bash
   # happy-server (localhost:3005)
   # happy-app (localhost:8082)
   # happy-cli daemon
   ```

4. 验证：本地 App 能正常对话，确认改动前的基线正常。

**改动范围：** 零代码改动。
**风险：** 零。

---

### Phase 1：E2B 沙箱集成 + Capability Tool 定义

> **架构变更**：原计划自建 Docker 沙箱 + 分别实现 Browser/FileSystem Capability，
> 现改为直接接入 E2B 托管沙箱，浏览器 + 文件系统 + 代码执行一步到位。

**目标**：happy-cli 能通过 E2B SDK 创建沙箱，执行浏览器操作、文件读写、代码运行，并定义好 Agent 可用的 tool。

**为什么用 E2B 而不是自建：**
- E2B 沙箱启动 <200ms，自建 Docker 容器需要数秒
- 浏览器、文件系统、代码执行全部内置
- 安全隔离已做好（per-session 隔离，基于 Firecracker microVM）
- 免费 $100 额度，之后 ~$0.05/h/沙箱
- TypeScript SDK 直接可用（npm 包：`e2b`）
- 未来可切换为自托管（E2B 开源）

**做的事：**

1. 安装 E2B SDK：
   ```bash
   cd packages/happy-cli
   yarn add e2b
   ```

2. 在 happy-cli 新增 `src/capabilities/e2b.ts`，封装 E2B 操作：
   ```typescript
   import { Sandbox } from 'e2b'

   // 创建沙箱（per-session，启动 <200ms）
   const sandbox = await Sandbox.create({ apiKey: process.env.E2B_API_KEY })

   // 浏览器操作（沙箱内 Playwright）
   await sandbox.commands.run('npx playwright install chromium')
   const result = await sandbox.commands.run('node browse.js --url="https://example.com"')

   // 文件系统操作
   await sandbox.files.write('/workspace/report.md', content)
   const files = await sandbox.files.list('/workspace')
   const data = await sandbox.files.read('/workspace/output.csv')

   // 代码执行
   const output = await sandbox.commands.run('python3 analyze.py')

   // 销毁沙箱
   await sandbox.close()
   ```

3. 定义 Capability tools（`src/capabilities/tools.ts`）：
   ```typescript
   const capabilityTools = [
     {
       name: 'browser_navigate',
       description: '在云端浏览器中打开指定 URL，返回页面截图和文本内容。用于查看网页、分析竞品、获取在线信息。',
       parameters: { url: { type: 'string', description: '要打开的 URL' } }
     },
     {
       name: 'browser_click',
       description: '在当前浏览器页面上点击指定元素',
       parameters: { selector: { type: 'string' } }
     },
     {
       name: 'browser_screenshot',
       description: '对当前浏览器页面截图',
       parameters: {}
     },
     {
       name: 'sandbox_file_write',
       description: '在云端沙箱中写入文件（用于生成报告、文档等需要展示的文件）',
       parameters: { path: { type: 'string' }, content: { type: 'string' } }
     },
     {
       name: 'sandbox_file_read',
       description: '读取云端沙箱中的文件',
       parameters: { path: { type: 'string' } }
     },
     {
       name: 'sandbox_run_code',
       description: '在云端沙箱中执行代码（Python/Node/Bash）',
       parameters: { command: { type: 'string' } }
     },
   ]
   ```

**验证（独立测试脚本）：**
```bash
E2B_API_KEY=e2b_xxx npx tsx src/capabilities/__tests__/e2b-smoke.ts
# 应输出：沙箱创建成功、命令执行成功、文件读写成功、沙箱销毁成功
```

**改动范围：** 只在 `happy-cli/src/capabilities/` 新增文件。
**风险：** 零。纯新增，不影响现有代码。

---

### Phase 2：接入 Agent 链路（Droid → E2B Capabilities）

**目标**：Droid 在对话过程中能通过 tool call 调用 E2B 沙箱能力，结果返回给 Droid 继续推理。

**做的事：**

1. 新增 `src/capabilities/proxy.ts` — tool call 拦截与路由：
   ```typescript
   // 检查 tool call 是否是 capability tool
   function isCapabilityTool(toolName: string): boolean {
     return toolName.startsWith('browser_') || toolName.startsWith('sandbox_');
   }

   // 执行 capability tool call，返回结果 + preview event
   async function executeCapabilityTool(sandbox: Sandbox, toolName: string, input: unknown) {
     // ... 根据 toolName 调用对应的 E2B 操作
     // ... 返回 { result: string, preview?: PreviewEvent }
   }
   ```

2. 修改 `src/droid/droidRemote.ts`（最小改动）：
   ```typescript
   // 在消息处理循环中，拦截 capability tool call：
   if (process.env.E2B_API_KEY && isCapabilityTool(msg.name)) {
     const { result, preview } = await executeCapabilityTool(sandbox, msg.name, msg.input);
     // 把 result 作为 tool_result 返回给 Agent
     // 把 preview 作为 SessionProtocol event 推送到 App
   }
   ```

3. 沙箱生命周期管理：
   - Lazy init：首次 capability tool call 时创建 E2B 沙箱
   - Session 结束时自动 `sandbox.close()`
   - 沙箱超时处理（E2B Hobby 计划最长 1 小时）

4. System prompt 注入 capability tool 说明：
   ```
   你有以下云端能力可以使用：
   - browser_navigate: 在云端浏览器中打开网页，获取截图和内容
   - browser_click / browser_screenshot: 操作浏览器
   - sandbox_file_write / sandbox_file_read: 在云端文件系统中读写文件
   - sandbox_run_code: 在云端执行 Python/Node/Bash 代码

   当用户需要浏览网页、生成文档、或执行代码时，优先使用这些云端工具。
   ```

**验证：** 在 App 上发消息 "帮我看看 example.com 的页面内容"，Droid 应调用 `browser_navigate`，返回页面分析。

**改动范围：** 新增 `proxy.ts`，小改 `droidRemote.ts`（受 E2B_API_KEY 守护）。
**风险：** 低。不设 E2B_API_KEY 则完全不执行新代码。

---

### Phase 3：接入 happy-app（右侧 Preview 面板）

**目标**：App 右侧能展示浏览器截图、文件预览等 preview 数据。

**做的事：**

1. 扩展 happy-wire 协议（`sessionProtocol.ts`）：
   - 新增 `preview` event type（见第五章 5.3 的 schema 定义）
   - 加入 `sessionEventSchema` 的 discriminated union

2. happy-cli 发送 preview event：
   - 在 `proxy.ts` 中，capability 执行完毕后构造 preview event
   - 通过现有的 `sdkToLogConverter` → `messageQueue` → session 发送链路推送
   - 大文件走 session file upload API，小文件 base64 内联

3. 在 happy-app 新增组件：
   ```
   sources/components/PreviewPanel/
   ├── PreviewPanel.tsx         ← 右侧面板容器
   ├── BrowserPreview.tsx       ← 浏览器截图展示
   ├── FilePreview.tsx          ← 文件内容预览 (Markdown/代码/文本)
   ├── ImagePreview.tsx         ← 图片预览
   └── index.ts
   ```

4. 修改 SessionView，加入双面板布局（左对话 + 右 preview），仅在 Web 端生效（移动端暂不改）

**验证：** 发消息触发浏览器 capability 后，右侧面板自动显示截图；触发文件 capability 后显示文件内容。

**改动范围：** happy-wire（新增 event type）、happy-app（新增组件 + SessionView 布局）。
**风险：** 低。preview event 是 additive（向后兼容），旧版 App 忽略不认识的 event。

---

### Phase 4：云端 Agent 模式（模式 B）

**目标**：Agent（Droid）也运行在 E2B 沙箱内，用户不需要本地装任何东西，手机/浏览器打开 App 即可使用。每个用户独立沙箱，完全隔离。

**前提**：Phase 0-3（模式 A）已完成，preview 协议和 App PreviewPanel 已可用。

**与模式 A 的关键区别：**

| | 模式 A (Phase 0-3) | 模式 B (本 Phase) |
|---|---|---|
| Agent 位置 | 用户本地 | E2B 沙箱内 |
| Capability 调用方式 | proxy.ts 拦截 tool call → 远程 E2B | Agent 直接操作本地文件/浏览器 |
| 需要本地安装 | happy-cli + Agent CLI | 不需要 |
| 用户隔离 | Agent 共用本地环境 | 每用户独立沙箱 |

**做的事：**

1. **创建自定义 E2B 沙箱模板**，预装：
   - Droid CLI（Factory CLI，Agent 进程）
   - happy-cli-lite（精简版，只保留 WebSocket 连回 happy-server 的能力 + Droid 启动逻辑）
   - Chromium + Playwright（浏览器能力）
   - Node.js + Python（代码执行）
   ```bash
   # E2B 自定义模板 Dockerfile
   FROM e2b/base
   RUN npm install -g @anthropic-ai/droid
   RUN npx playwright install chromium
   COPY happy-cli-lite /opt/happy-cli-lite
   ```

2. **happy-server 新增云端 session 管理**：
   - 新增 API：`POST /v1/sessions/{id}/start-cloud` — 创建 E2B 沙箱，在其中启动 Agent
   - 沙箱内的 happy-cli-lite 通过 WebSocket 连回 happy-server，注册为 session 的 Agent 端
   - 沙箱生命周期与 session 绑定（session 结束 → 沙箱销毁）

3. **沙箱内 Agent 的消息流**：
   ```
   App → happy-server → WebSocket → 沙箱内 happy-cli-lite
     → Droid Agent (沙箱内)
       → Agent 的 Read/Write/Bash 操作沙箱文件系统 (天然)
       → Agent 调用 Playwright 操作浏览器 (天然, 同一环境)
       → 文件变更/浏览器截图 → preview event → happy-server → App
   ```

4. **App 侧新增 session 模式选择**：
   - 用户创建 session 时可选"本地模式"（模式 A）或"云端模式"（模式 B）
   - 云端模式下 App 直接和 happy-server 通信，不需要本地 happy-cli
   - 两种模式的对话界面和 PreviewPanel 完全一致

5. **API Key 安全传入沙箱**：
   - Droid 的 API Key 通过 E2B SDK 的环境变量注入，不落盘
   - 沙箱内 Agent 通过环境变量读取 Key 调用模型 API

**验证：** 在 App 上选择"云端模式"创建 session，发消息，Agent 在 E2B 沙箱内推理和操作，右侧面板正常展示 preview。

**改动范围：** happy-server（新增云端 session API）、happy-app（session 模式选择 UI）、新建 E2B 模板。
**风险：** 中。涉及 happy-server 改动，但通过 feature flag 保护（`E2B_CLOUD_MODE_ENABLED`）。

---

### Phase 5：规则预热引擎（可选，后期优化）

**目标**：对明确意图（如消息中包含 URL）做后台预热，加速 E2B Capability 调用。

> 此 Phase 不阻塞其他 Phase，可在 Phase 2-3 完成后按需实施。仅适用于模式 A。

**做的事：**

1. 新增 `happy-cli/src/capabilities/preheat.ts`：
   ```typescript
   function quickIntentDetect(message: string) {
     const urls = message.match(/https?:\/\/[^\s]+|[\w-]+\.(com|org|io|net)\b/g);
     if (urls) return { preheat: [{ capability: 'browser', action: 'navigate', url: urls[0] }] };
     return { preheat: [] };
   }
   ```
2. 预热与 Agent 推理并行执行，Agent 的 tool call 命中缓存时秒回
3. 误预热只浪费少量 E2B 资源，不影响用户体验

---

### Phase 6：Document / Spreadsheet / Slides

**目标**：沙箱支持文档、表格、PPT 的创建和预览。

**做的事：**

1. 扩展 E2B 沙箱模板，预装 LibreOffice / python-pptx / Pandoc
2. 新增对应的 capability tools（`document_create`、`spreadsheet_create`、`slides_create` 等）
3. 在 App 的 PreviewPanel 中新增渲染器：
   - `DocumentPreview.tsx` — 文档预览
   - `SpreadsheetPreview.tsx` — 表格渲染
   - `SlidesPreview.tsx` — 幻灯片翻页预览

---

### Phase 7：合并回主线

**目标**：功能在 feature 分支上验证稳定后，合并回 main，部署到生产。

**做的事：**

1. 整理 feat/capabilities 分支的改动，拆分为小 PR：
   - PR 1: `happy-wire` 新增 preview event type（additive，向后兼容）
   - PR 2: `happy-cli` E2B capabilities + proxy（feature flag: `E2B_API_KEY`）
   - PR 3: `happy-server` 云端 session 管理（feature flag: `E2B_CLOUD_MODE_ENABLED`）
   - PR 4: `happy-app` 右侧 PreviewPanel + session 模式选择
2. 配置生产环境的 E2B API Key
3. 通过 feature flag 逐步灰度开放

---

## 八、Capabilities 与 Skills 定义

### 8.1 Capabilities（基础能力）

平台内置，所有 Agent 自动可用：

| Capability | E2B 沙箱实现 | Agent 调用方式 | 右侧 Preview 展示 |
|---|---|---|---|
| **File System** | `sandbox.files.*` API | tool call → E2B SDK | 文件树 + 文件预览 |
| **Browser** | 沙箱内 Chromium + Playwright | tool call → E2B SDK | 浏览器截图 |
| **Code Execution** | `sandbox.commands.run()` | tool call → E2B SDK | 执行输出 |
| **Document** | 沙箱内 Pandoc + LibreOffice | tool call → E2B SDK | 文档预览 |
| **Spreadsheet** | 沙箱内 LibreOffice Calc / xlsx 库 | tool call → E2B SDK | 表格渲染 |
| **Slides** | 沙箱内 python-pptx | tool call → E2B SDK | 幻灯片预览 |

未来可扩展更多 Capability（如数据库、邮件等），Agent 无需改动。

### 8.2 Capability 内部协议

```typescript
// Capability 执行的统一返回格式（内部使用，不暴露给 Agent）
interface CapabilityResult {
  textResult: string;            // 返回给 Agent 的文本结果（Agent 用于继续推理）
  preview?: {                    // 需要在 App 侧展示的预览数据（可选）
    previewType: string;
    title: string;
    data: string;                // base64 或 fileRef
    mimeType: string;
    metadata?: Record<string, unknown>;
  };
}
```

### 8.3 Skills（扩展技能）

Skills 是可安装的插件，暴露为 Tool，可以组合调用多个 Capabilities：

```typescript
interface SkillDefinition {
  id: string;
  name: string;                        // "SEO Report Generator"
  version: string;
  description: string;
  requiredCapabilities: string[];       // ["browser", "spreadsheet"]
  entrypoint: string;                   // 可执行脚本/模块
  tools: ToolDefinition[];              // 暴露给 Agent 的 tool 接口
  renderer?: string;                    // App 侧自定义渲染组件 (可选)
}
```

Capability 是平台内置的原子能力，Skill 是用户/社区安装的复合功能。

---

## 九、完整数据流

### 模式 A：本地 Agent + 云端 Capabilities

```
用户浏览器 → happy-app
  │
  ▼
happy-server
  │ WebSocket
  ▼
happy-cli daemon (本地)
  │
  ├─→ [可选，并行] 规则预热引擎 (preheat.ts)
  │     → 检测到 URL → 后台创建 E2B 沙箱 + 浏览器导航
  │     → 截图 + 内容 → 缓存等待 Agent 调用
  │
  ├─→ Agent (本地, 带 Capability tool 定义)
  │     → 用户消息直接到达 Agent，Agent 立即开始推理
  │     → Agent 决定需要浏览器 → tool call: browser_navigate("example.com")
  │     │
  │     ▼
  │   capabilities/proxy.ts 拦截
  │     → 检查预热缓存 → 命中则秒回 / 未命中则调 E2B SDK
  │     → E2B 云端沙箱执行 Chromium 导航 + 截图
  │     │
  │     ├─→ textResult 返回 Agent 继续推理 → 最终回复
  │     │
  │     └─→ preview event → 加密 → happy-server → happy-app 右侧 PreviewPanel
  │
  └─→ Agent 最终回复 → SessionProtocol → happy-server → happy-app 左侧 Chat
```

### 模式 B：全部在云端

```
用户浏览器/手机 → happy-app
  │
  ▼
happy-server
  │ 用户选择"云端模式"创建 session
  │ → happy-server 调 E2B SDK 创建沙箱
  │ → 沙箱内启动 happy-cli-lite + Droid Agent
  │ → 沙箱内 happy-cli-lite 通过 WebSocket 连回 happy-server
  │
  │ WebSocket (双向)
  ▼
E2B 沙箱 { Droid Agent + Chromium + 文件系统 }
  │
  ├─→ Agent 收到用户消息，直接推理
  │     → Agent 操作文件 → 沙箱本地文件系统（天然，无需 proxy）
  │     → Agent 打开浏览器 → 沙箱本地 Chromium（天然，无需 proxy）
  │     → Agent 执行代码 → 沙箱本地环境（天然）
  │
  ├─→ preview event → happy-cli-lite → WebSocket → happy-server → App 右侧 PreviewPanel
  │
  └─→ Agent 最终回复 → SessionProtocol → happy-server → App 左侧 Chat
```

---

## 十、每个 Phase 的验证清单

每个 Phase 完成前确认：

- [ ] 不带 `E2B_API_KEY` 时，本地 Happy 全部功能正常（登录、对话、Droid/Claude）
- [ ] 带 `E2B_API_KEY` 时，新 Capability 功能正常
- [ ] `yarn typecheck` 通过
- [ ] 现有生产环境不受影响（main 分支未改动 / feature flag 保护）

---

## 十一、开发环境要求

**不需要额外服务器。** 沙箱完全托管在 E2B 云端，本地 Mac 开发环境即可：

```
本地开发机（现有即可）:
  Node 20, Yarn, Git（已有）
  E2B API Key（从 e2b.dev 免费获取，含 $100 额度）

生产部署时:
  额外配置 E2B_API_KEY 环境变量即可，无需升级硬件
```

---

## 十二、时间线估算

| Phase | 内容 | 预计工时 | 依赖 |
|-------|------|---------|------|
| Phase 0 | 创建分支 + 配置 E2B | 0.5 天 | 本地环境就绪 |
| Phase 1 | E2B 沙箱集成 + Tool 定义 | 1-2 天 | Phase 0 |
| Phase 2 | 接入 Agent 链路 - 模式 A (Droid → E2B) | 2-3 天 | Phase 1 |
| Phase 3 | 接入 App (右侧 Preview 面板) | 3-5 天 | Phase 2 |
| Phase 4 | 云端 Agent 模式 - 模式 B | 3-5 天 | Phase 3 |
| Phase 5 | 规则预热引擎（可选） | 1 天 | Phase 1, 不阻塞 |
| Phase 6 | Document / Spreadsheet / Slides | 3-5 天 | Phase 3 |
| Phase 7 | 合并回主线 | 2-3 天 | Phase 4+6 稳定后 |

---

## 十三、滚动上下文约定

> **重要**：本节是项目协作的核心约定。每次对话涉及 Capabilities 功能的改动，**必须**同步更新本节内容。

### 13.1 更新规则

1. **每次改动必须更新**：架构设计、代码实现、问题修复、决策变更都在下方记录
2. **更新时机**：改动完成后、对话结束前
3. **新对话启动**：处理 Capabilities 相关任务时，先读取本文档了解当前进度

### 13.2 当前状态

**阶段：架构设计完成，准备开始编码**

最后更新：2026-03-05

### 13.3 已完成事项

- [x] 架构文档初版编写
- [x] 决策：~~LLM Intent Router~~ → Pure Agent Tools（零额外延迟）
- [x] 决策：~~自建 Docker 沙箱~~ → E2B 云沙箱（npm 包 `e2b`，启动 <200ms）
- [x] 决策：~~独立新服务器~~ → 分支隔离 + 环境变量开关
- [x] 决策：Capability 输出命名为 **Preview**（避免与现有 Artifact 加密笔记冲突）
- [x] 决策：**两种模式都支持** — 模式 A（本地 Agent + 云端能力）先做，模式 B（全部云端）后做
- [x] 补充 Preview 数据链路（E2B → happy-cli → SessionProtocol → App）
- [x] 可选优化方案设计：Rule-based Preheat Engine
- [x] 文档 Phase 编号修正（连续 0-7）
- [x] 架构图修正（规则预热引擎在 happy-cli 侧）
- [x] 决策 3 修正（沙箱监控方式适配 E2B 远程沙箱）
- [x] 新增 Phase 4（云端 Agent 模式），含 E2B 自定义模板、happy-server 云端 session API、App 模式选择

### 13.4 待解决问题

| # | 问题 | 状态 | 说明 |
|---|------|------|------|
| 1 | E2EE 与云能力的矛盾 | 未讨论 | E2B 沙箱能看到明文数据，与 Happy 的 E2EE 卖点矛盾，需设计用户知情同意流程 |
| 2 | 错误处理/降级策略 | 未设计 | E2B 不可用时的降级方案（如超时、API 限流、$100 额度用完） |
| 3 | 安全边界 | 未设计 | 浏览器沙箱的安全边界（SSRF、恶意 JS 执行等） |

### 13.5 关键文件索引

| 文件 | 用途 | 状态 |
|------|------|------|
| `docs/architecture-phased-plan.md` | 主架构设计文档（本文件） | 已修改，未提交 |
| `packages/happy-wire/src/sessionProtocol.ts` | 会话协议，需新增 `preview` 事件 | 未改动 |
| `packages/happy-cli/src/droid/droidRemote.ts` | Droid 远程模式，需接入 capability proxy | 未改动 |
| `packages/happy-app/sources/-session/SessionView.tsx` | 会话主视图，需加入双面板布局 | 未改动 |

### 13.6 变更日志

| 日期 | 变更内容 |
|------|----------|
| 2026-03-05 | 初始创建文档。决策：Intent Router→Agent Tools、Docker→E2B、新服务器→分支隔离。 |
| 2026-03-05 | 文档审查修复：Phase 编号连续化；E2B 包名修正为 `e2b`；架构图修正；决策 3 适配 E2B 远程沙箱；补充 Preview 完整数据链路；Capability 输出统一命名为 Preview。 |
| 2026-03-05 | 新增模式 B（云端 Agent）：两种模式都支持，先 A 后 B。新增 Phase 4（云端 Agent 模式），含 E2B 自定义模板、happy-server 云端 session API、App 模式选择 UI。更新架构图（双模式）、数据流（双模式）、时间线（Phase 0-7）。 |

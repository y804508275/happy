# 自动确认三态切换功能实现计划

## 概述

将当前的 `autoConfirm: boolean` 改为三态循环切换：
1. **手动确认** (`off`) — 所有操作手动
2. **仅自动确认** (`confirm`) — 工具权限自动批准，AskUserQuestion 和 Options 手动
3. **自动确认+回答** (`all`) — 全自动：权限自动批准 + AskUserQuestion 自动选第一个 + Options 自动选第一个

点击按钮依次循环：off → confirm → all → off → ...

---

## 修改文件清单

### 1. CLI 端 — RPC 接口升级 + AskUserQuestion 排除

**`packages/happy-cli/src/api/types.ts`**
- `AgentState.autoConfirm` 保留 boolean（向后兼容）
- 新增 `AgentState.autoConfirmMode?: 'off' | 'confirm' | 'all'`

**`packages/happy-cli/src/utils/BasePermissionHandler.ts`**
- RPC handler `autoConfirm` 接收新参数：`{ enabled: boolean, mode?: 'confirm' | 'all' }`
- 存储 `autoConfirmMode` 字段
- 更新 `agentState.autoConfirmMode`
- 在 auto-approve pending requests 时，如果 mode='confirm'，跳过 tool name 为 `AskUserQuestion` 的请求

**`packages/happy-cli/src/claude/utils/permissionHandler.ts`**
- 同样存储 `autoConfirmMode`
- 在 `checkPermission()` 中 `if (this.autoConfirm)` 处增加判断：如果 mode='confirm' 且 toolName 是 `AskUserQuestion`，则不自动批准，走正常审批流程
- setupClientHandler 中同步更新

**`packages/happy-cli/src/codex/utils/permissionHandler.ts`** 和 **`packages/happy-cli/src/gemini/utils/permissionHandler.ts`**
- `handleToolCall()` 中同样增加 AskUserQuestion 排除逻辑

### 2. App 端 — 类型和状态

**`packages/happy-app/sources/sync/storageTypes.ts`**
- `AgentStateSchema` 新增 `autoConfirmMode: z.enum(['off', 'confirm', 'all']).nullish()`
- 保留 `autoConfirm: boolean` 向后兼容

**`packages/happy-app/sources/sync/ops.ts`**
- `sessionAutoConfirm()` 改签名：`(sessionId: string, mode: 'off' | 'confirm' | 'all')`
- RPC 发送 `{ enabled: mode !== 'off', mode }`

### 3. App 端 — AgentInput 三态按钮

**`packages/happy-app/sources/components/AgentInput.tsx`**
- Props: `autoConfirm?: boolean` → `autoConfirmMode?: 'off' | 'confirm' | 'all'`
- Props: `onAutoConfirmChange?: (enabled: boolean)` → `onAutoConfirmModeChange?: (mode: 'off' | 'confirm' | 'all')`
- 点击按钮循环：off → confirm → all → off
- 三种视觉状态：
  - `off`: 空心圆圈，灰色文字 "Auto"
  - `confirm`: 实心勾，主题色，文字 "Auto"
  - `all`: 双勾/闪电，主题色更亮，文字 "Auto+"

### 4. App 端 — SessionView 状态管理

**`packages/happy-app/sources/-session/SessionView.tsx`**
- 从 `session.agentState?.autoConfirmMode` 读取模式（兼容旧的 autoConfirm boolean）
- `handleAutoConfirmModeChange` 调用更新后的 `sessionAutoConfirm(sessionId, mode)`
- 将 `autoConfirmMode` 传递给 FixedAskUserQuestionBar 和 FixedOptionsBar

### 5. App 端 — FixedAskUserQuestionBar 自动回答

**`packages/happy-app/sources/components/tools/FixedAskUserQuestionBar.tsx`**
- 新增 prop: `autoConfirmMode?: 'off' | 'confirm' | 'all'`
- 当 `mode === 'all'` 且有 pending question 时：
  - 自动选中第一个选项（UI 可见）
  - 延迟 ~300ms 后自动提交（让用户看到选了什么）
  - 显示 "Auto-selected" 标记

### 6. App 端 — FixedOptionsBar 自动选择

**`packages/happy-app/sources/components/tools/FixedOptionsBar.tsx`**
- 新增 prop: `autoConfirmMode?: 'off' | 'confirm' | 'all'`
- 当 `mode === 'all'` 且有 active options 时：
  - 自动选中第一个选项（UI 可见）
  - 延迟 ~300ms 后自动发送
- 在 SessionView 中引入 FixedOptionsBar（目前未连接）

### 7. App 端 — 新建会话页面

**`packages/happy-app/sources/app/(app)/new/index.tsx`**
- `autoConfirm: boolean` → `autoConfirmMode: 'off' | 'confirm' | 'all'`
- 创建会话时调用 `sessionAutoConfirm(sessionId, mode)`
- AgentInput props 同步更新

### 8. 翻译文件（11 个语言文件 + _default.ts）

更新 `agentInput.autoConfirm` 结构：
```typescript
autoConfirm: {
    off: 'Auto',        // 手动模式按钮文字
    confirm: 'Auto',    // 仅确认模式按钮文字
    all: 'Auto+',       // 全自动模式按钮文字
    descOff: 'Manual confirmation',
    descConfirm: 'Auto-confirm tool calls',
    descAll: 'Auto-confirm + auto-answer',
},
```

---

## 关键实现细节

### 按钮视觉设计
```
off:      [○ Auto]     灰色，无背景
confirm:  [✓ Auto]     主题色，浅背景
all:      [⚡Auto+]    主题色，深背景
```

### 向后兼容
- `agentState.autoConfirm: boolean` 保留，CLI 旧版本仍可读取
- `agentState.autoConfirmMode` 新增，新版本优先读取
- App 读取逻辑：`autoConfirmMode ?? (autoConfirm ? 'all' : 'off')`

### 自动回答时序
1. 检测到新的 AskUserQuestion (state='running', permission='pending')
2. 立即高亮第一个选项（视觉反馈）
3. 300ms 后自动提交（approve + sendMessage）
4. AskUserQuestionView 通过 cache 显示已选择的选项

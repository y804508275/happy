# Auto-Confirm Mode

**Date**: 2026-02-27
**Commit**: `628da6f2` (App) + changes in `40b46037` (CLI)
**Branch**: `main`

## 功能描述

在 Remote 模式下（通过手机 App 远程控制 Claude Code），每次工具调用都需要用户手动确认。Auto-Confirm 模式开启后，自动批准所有工具调用的权限请求，无需用户逐个确认。用户消息输入（如回答 Claude 的提问）不受影响。

## 工作流程

```
App 齿轮菜单 → 打开 Auto-Confirm 开关
    ↓
App 发送 RPC: { method: "autoConfirm", params: { enabled: true } }
    ↓
Server 转发 → CLI PermissionHandler 收到
    ↓
设置 autoConfirm = true + 更新 AgentState
    ↓
自动批准所有当前 pending 的请求
    ↓
后续工具调用 → handleToolCall 直接返回 allow
```

## 修改文件

### CLI (`packages/happy-cli/`)

| 文件 | 改动 |
|------|------|
| `src/api/types.ts` | `AgentState` 类型添加 `autoConfirm?: boolean` 字段 |
| `src/claude/utils/permissionHandler.ts` | 添加 `autoConfirm` 属性、RPC handler、auto-approve 逻辑 |
| `src/utils/BasePermissionHandler.ts` | 基类添加 `autoConfirm` 属性和 RPC handler（Codex/Gemini 共用） |
| `src/codex/utils/permissionHandler.ts` | `handleToolCall()` 开头添加 autoConfirm 检查 |
| `src/gemini/utils/permissionHandler.ts` | `handleToolCall()` 开头添加 autoConfirm 检查 |

### App (`packages/happy-app/`)

| 文件 | 改动 |
|------|------|
| `sources/sync/storageTypes.ts` | `AgentStateSchema` 添加 `autoConfirm` 字段 |
| `sources/sync/ops.ts` | 添加 `sessionAutoConfirm()` RPC 封装函数 |
| `sources/components/AgentInput.tsx` | 齿轮菜单添加 Auto-Confirm 开关 UI |
| `sources/-session/SessionView.tsx` | 从 agentState 读取状态，传递给 AgentInput |
| `sources/text/_default.ts` | 添加默认翻译文本 |
| `sources/text/translations/*.ts` | 11 个语言文件添加翻译（en, zh-Hans, zh-Hant, ja, ru, es, pt, it, pl, ca） |

## 关键设计决策

1. **仅 Remote 模式**：Auto-Confirm 仅在远程会话中生效，本地终端模式不受影响
2. **持久化**：`reset()` 不重置 autoConfirm，一旦开启在当前 CLI 进程中持续生效
3. **RPC 通信**：使用 `autoConfirm` RPC 方法，而非 message meta，可在任意时刻切换
4. **Claude 独立实现**：Claude 的 `PermissionHandler` 未继承 `BasePermissionHandler`，需要单独实现
5. **即时生效**：开启时自动批准所有当前 pending 的权限请求

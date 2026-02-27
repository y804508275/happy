# Session Graceful Restart

**Date**: 2026-02-27
**Branch**: `main`

## 功能描述

允许在 App 上重启 CLI session 进程以加载新代码，同时保留：
- 同一个 Happy session（消息历史、agentState 不丢失）
- Claude 对话上下文（通过 `--resume` 恢复）

用户在 Session Info 页面点击 "Restart Session"，session 短暂离线后自动恢复。

## 工作流程

```
App "Restart Session" 按钮
    ↓
App → sessionRPC('restartSession') → Server → CLI
    ↓
CLI: 写 /tmp/happy-restart-<pid>.json（sessionId + encryptionKey）
CLI: cleanup → process.exit(42)
    ↓
Daemon: 检测 exit code 42
Daemon: 从 TrackedSession 获取 directory + claudeSessionId
Daemon: spawnSession({ directory, resumeClaudeSessionId, restartFilePath })
    ↓
新 CLI 进程:
  - 读 HAPPY_RESTART_FILE → 获取 sessionId + encryptionKey → 直接连接已有 session
  - --resume → 恢复 Claude 对话
    ↓
App: 短暂离线 → 重新上线，消息和状态完整保留
```

## 修改文件

### CLI (`packages/happy-cli/`)

| 文件 | 改动 |
|------|------|
| `src/claude/registerRestartSessionHandler.ts` | **新文件**：`restartSession` RPC handler，写状态文件并 exit(42) |
| `src/claude/runClaude.ts` | 注册 restart handler；添加 `HAPPY_RESTART_FILE` 支持跳过 session 创建 |
| `src/daemon/run.ts` | `onChildExited` 检测 exit code 42 并触发 respawn；`spawnSession` 传递 `--resume` 和 `HAPPY_RESTART_FILE` |
| `src/modules/common/registerCommonHandlers.ts` | `SpawnSessionOptions` 添加 `resumeClaudeSessionId` 和 `restartFilePath` |

### App (`packages/happy-app/`)

| 文件 | 改动 |
|------|------|
| `sources/sync/ops.ts` | 添加 `sessionRestart()` RPC 函数 |
| `sources/app/(app)/session/[id]/info.tsx` | Quick Actions 添加 "Restart Session" 按钮（蓝色 refresh 图标） |
| `sources/text/_default.ts` | 添加 4 个翻译 key |
| `sources/text/translations/*.ts` | 10 个语言文件添加翻译 |

## 关键设计决策

1. **Exit code 42 信号**：CLI 退出时用特殊 exit code 通知 daemon 需要 respawn，避免新增 daemon RPC
2. **临时文件传递加密密钥**：写 `/tmp/happy-restart-<pid>.json`（0600 权限），新进程读后删除
3. **同一 Happy session**：新进程复用 sessionId + encryptionKey，不创建新 session，App 看到同一个 session 恢复上线
4. **Claude `--resume`**：利用 Claude SDK 的 resume 功能恢复对话上下文
5. **Session-scoped RPC**：使用现有的 session RPC 通道，无需新增 daemon/machine RPC

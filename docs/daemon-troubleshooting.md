# Happy Daemon 排障记录 (2026-03-03)

## 症状

- 新会话创建失败：`Failed to start session. Make sure the daemon is running on the target machine.`
- 老会话无反应，无法 reactivate

## 排查过程中发现的三层问题

### 第一层：Daemon 进程已死 — 401 认证失败

**现象：** `daemon.state.json` 记录的 PID 已不存在，端口无监听。

**原因：** Daemon 默认连接远程服务器 `https://api.cluster-fluster.com`（`happy-cli/src/configuration.ts` 中的默认值），但本地 token 是 `localhost:3005` 生成的，两边 `HANDY_MASTER_SECRET` 不同，远程返回 401，daemon 立即退出。

**修复：** 指定 `HAPPY_SERVER_URL=http://localhost:3005`

### 第二层：Claude Code 找不到 — PATH 被清理

**现象：** Daemon 启动成功，但创建会话后 `[remote]: launch error {}`。

**原因：** Happy SDK 的 `getCleanEnv()` 会从 PATH 中移除所有以工作目录 (`cwd`) 开头的路径。当工作目录为 `/Users/colinyu` 时，`~/.local/bin`（Claude Code 安装位置）被移除，导致找不到 `claude` 命令，回退到不存在的 bundled SDK。

**修复：** 指定 `HAPPY_CLAUDE_PATH=/Users/colinyu/.local/bin/claude`

### 第三层（真正的根因）：CLAUDECODE 环境变量阻止嵌套启动

**现象：** 上述两项修复后仍然 `Process exited unexpectedly`，日志中 `launch error {}` 无明显错误。

**原因：** 在 Claude Code 终端会话中执行 `happy daemon start`，daemon 继承了 `CLAUDECODE=1` 环境变量。当 daemon 的子进程尝试启动 Claude Code 时，Claude Code 检测到该变量并拒绝启动：

```
Error: Claude Code cannot be launched inside another Claude Code session.
```

这个错误被 happy 捕获后序列化为 `{}`（Error 对象的属性不可枚举，`JSON.stringify(new Error(...))` 输出 `{}`），导致日志中只看到空对象，极难定位。

**修复：** 启动 daemon 前 unset 该变量。

## 正确的 Daemon 启动命令

```bash
(unset CLAUDECODE; unset CLAUDE_CODE_ENTRYPOINT; HAPPY_SERVER_URL=http://localhost:3005 happy daemon start)
```

> **注意：** 用括号 `()` 包裹，在子 shell 中 unset，不影响当前终端。

## 排查要点

| 检查项 | 命令 |
|--------|------|
| Daemon 是否存活 | `ps -p $(cat ~/.happy/daemon.state.json \| python3 -c "import json,sys; print(json.load(sys.stdin)['pid'])")` |
| Daemon 日志 | `cat ~/.happy/daemon.state.json` 查看 `daemonLogPath` |
| 会话进程日志 | `ls -lt ~/.happy/logs/ \| head` 找最新的非 daemon 日志 |
| Daemon 环境变量 | `ps eww -p <PID> \| tr ' ' '\n' \| grep <VAR>` |
| Claude Code 认证 | `claude auth status` |

## 教训

1. **`launch error {}` 不是"没有错误"** — 是 Error 对象序列化为空 JSON。遇到时开启 `DEBUG=1` 重启 daemon，查看子进程 stderr 中的真实错误信息。
2. **在 Claude Code 会话中启动 daemon 会污染环境** — `CLAUDECODE=1` 和 `CLAUDE_CODE_ENTRYPOINT=cli` 会被继承，阻止子进程启动新的 Claude Code 实例。
3. **多层问题会互相遮挡** — 第一层问题（401）修掉后才暴露第二层（PATH），第二层修掉后才暴露第三层（CLAUDECODE）。每次只解决一层时现象一样（`launch error {}`），容易误判为没修好。

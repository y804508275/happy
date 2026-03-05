# Happy x Droid Integration - Context Summary

## Project Overview
Happy Coder (monorepo at `/Users/colinyu/happy`) is integrating Factory's Droid CLI as a parallel agent backend, alongside Claude Code. Users can choose between Claude Code and Droid in the web UI (localhost:8082).

## Architecture

### Normalization Layer (core design)
```
Droid stream-json → normalizeDroidMessage() → Claude SDK format → Happy 全部功能链路
Claude stream-json → (native SDK format)                       → Happy 全部功能链路
```
All Happy features (message rendering, tool calls, session management, permissions, knowledge base, push notifications) are shared. The only Droid-specific code is the normalization function (~30 lines).

### Format Mapping
| Droid Output | → Claude SDK Format |
|---|---|
| `{type:"message", role:"assistant", text:"..."}` | `{type:"assistant", message:{role:"assistant", content:[{type:"text", text:"..."}]}}` |
| `{type:"message", role:"user", text:"..."}` | `{type:"user", message:{role:"user", content:"..."}}` |
| `{type:"completion", ...}` | `{type:"result", subtype:"success", ...}` |
| `{type:"system", subtype:"init", ...}` | No change (already compatible) |

## Created Files
- `packages/happy-cli/src/droid/runDroid.ts` - Main entry, session management
- `packages/happy-cli/src/droid/droidRemote.ts` - Per-message spawn via `droid exec`, format normalization, system prompt injection via stdin
- `packages/happy-cli/src/droid/droidRemoteLauncher.ts` - Remote launcher (Ink UI + message queue → onMessage → sdkToLogConverter → server)
- `packages/happy-cli/src/droid/droidLocal.ts` - Local interactive mode
- `packages/happy-cli/src/droid/session.ts` - DroidSession class, DroidEnhancedMode type
- `packages/happy-cli/src/droid/utils/permissionMode.ts` - Happy → Droid permission mapping
- `packages/happy-cli/src/droid/utils/systemPrompt.ts` - System prompt builder

## Modified Files
- `packages/happy-cli/src/index.ts` - Added `happy droid` subcommand
- `packages/happy-cli/src/daemon/run.ts` - Added droid spawn logic
- `packages/happy-app/sources/app/(app)/new/index.tsx` - Agent cycling (Claude → Codex → Droid → Gemini), CLI detection, auto-correction exclusion
- `packages/happy-app/sources/components/NewSessionWizard.tsx` - Droid agent option
- `packages/happy-app/sources/components/AgentInput.tsx` - Droid display label
- `packages/happy-app/sources/sync/persistence.ts` - Extended NewSessionAgentType with 'droid'
- `packages/happy-app/sources/sync/settings.ts` - Profile validation for droid

## How It Works

### Message Flow
1. User sends message in web UI → App encrypts & sends to server
2. Daemon receives via WebSocket → decrypts → pushes to MessageQueue2
3. `droidRemote.ts` picks up message from queue
4. First message: wraps `appendSystemPrompt` (Options system) + `projectContext` (knowledge base rules) in `<system_instructions>` tags, prepends to user message
5. Spawns `droid exec --output-format stream-json --model <model>` with prompt via **stdin pipe**
6. Reads Droid's stream-json output line by line via `Query` class
7. `normalizeDroidMessage()` converts each message to Claude SDK format
8. `onMessage()` callback → `sdkToLogConverter.convert()` → `messageQueue.enqueue()` → `session.client.sendClaudeSessionMessage()` → server → web UI

### System Prompt Injection (Key Difference from Claude)
- **Claude path**: Uses `--append-system-prompt` flag (true system prompt, highest priority)
- **Droid path**: No such flag available. Workaround: wraps in `<system_instructions>` XML tags, prepends to first user message via stdin
- This is a compromise — works but not as strong as a real system prompt

### Per-message Spawn (not persistent process)
- Each user message spawns a new `droid exec` process
- Multi-turn context preserved via `--session-id <id>` (Droid manages internally)
- Session ID captured from first `system.init` message

## Current Status (2026-03-04)
- ✅ Droid responds to messages in web UI
- ✅ Format normalization working (assistant messages display correctly)
- ✅ Knowledge base rules injected (appendSystemPrompt + projectContext)
- ✅ Multi-turn via --session-id
- ✅ Agent switching in UI (Claude ↔ Droid)
- ✅ TypeScript compiles clean, build succeeds

## Known Issues / Pending
1. **System prompt priority** — Rules injected via `<system_instructions>` in user message, not true system prompt. Droid CLI needs `--append-system-prompt` flag for parity with Claude
2. **Tool call normalization** — Not yet tested. Droid's tool_use/tool_result format in stream-json may differ from Claude SDK format. Need to verify and potentially extend `normalizeDroidMessage()`
3. **Options system** — Droid outputs `<options>` XML per Happy's instruction, but rendering in web UI not verified
4. **Session resumption** — `--session-id` passes context but no message replay in output. Need to verify multi-turn works correctly
5. **Model display** — Bottom bar shows "Claude Opus 4.6" even for Droid sessions (model string passthrough)

## Dev Environment
```bash
# Build CLI
cd /Users/colinyu/happy/packages/happy-cli && npm run build

# Start dev daemon
HAPPY_HOME_DIR="$HOME/.happy-dev" HAPPY_SERVER_URL="http://localhost:3005" HAPPY_WEBAPP_URL="http://localhost:8082" DEBUG=1 npx tsx --env-file .env.dev-local-server src/index.ts daemon start

# Stop daemon
HAPPY_HOME_DIR="$HOME/.happy-dev" HAPPY_SERVER_URL="http://localhost:3005" npx tsx --env-file .env.dev-local-server src/index.ts daemon stop

# Test droid exec directly
echo "your prompt" | droid exec -o stream-json

# Logs
ls -lt ~/.happy-dev/logs/ | head -5
```

## Key Code References
- Normalization: `packages/happy-cli/src/droid/droidRemote.ts` → `normalizeDroidMessage()`
- Claude equivalent: `packages/happy-cli/src/claude/claudeRemote.ts` (line 126-135 for system prompt assembly)
- System prompt assembly: `packages/happy-cli/src/claude/utils/systemPrompt.ts` → `buildSystemPrompt()`
- App system prompt: `packages/happy-app/sources/sync/prompt/systemPrompt.ts`
- SDK message types: `packages/happy-cli/src/claude/sdk/types.ts`
- SDK-to-log converter: `packages/happy-cli/src/claude/utils/sdkToLogConverter.ts` (switch on message.type)

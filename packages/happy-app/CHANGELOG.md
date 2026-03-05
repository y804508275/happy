# Changelog

## Version 24 (2026.03.04.7) - 2026-03-04

更新 Auto Confirm 功能描述，修复归档 session 被 daemon 重启的问题。

- 更新 Auto Confirm 三态模式的标签和描述：Confirm 模式明确为"自动批准工具权限，不自动回答问题"；Auto 模式明确为"自动批准工具权限，也自动回答问题"
- 更新全部 11 种语言的翻译
- 修复 session 归档/退出后 daemon 仍会重启已结束 session 的问题（退出时删除 session info 文件）
- 修复 Droid abort 后 session 卡死的问题（重置 binary session ID，确保下次消息使用全新 session）
- 修复 Droid 中断的 tool calls 未正确关闭 turn 的问题

发布方式：需要 OTA 部署（App 翻译）+ CLI 构建重启 Daemon（CLI 修复）生效。

## Version 23 (2026.03.04.6) - 2026-03-04

修复队列消息功能中消息排队后未实际发送的 bug。

- 修复 useMessageQueue 中的竞态条件：当 handleQueueMessage 的异步操作（await mdRefs.getSelectedContents()）与 AI 状态转换（thinking→waiting）产生竞争时，消息入队晚于 auto-flush 触发，导致消息永远卡在队列中
- 新增 catch-up flush effect：当队列中有消息且状态已为 waiting 时立即触发发送

发布方式：OTA 部署生效。

## Version 22 (2026.03.04.5) - 2026-03-04

修复切换 Agent 时新 Agent 识别到旧会话历史消息的 bug。

- 修复 switchSessionAgent 调用 stopSession 导致 session info 文件被删除的问题
- 切换 Agent 时保留 session info 文件，让旧进程在 SIGTERM 时写入 lastSeq
- Daemon 创建 restart 文件时包含正确的 seq，新 Agent 进程只接收切换后的新消息
- 同时修复 Claude 和 Droid 的 restart 路径，使用 restartData.seq 而非硬编码 0

发布方式：CLI 构建 + 重启 Daemon 生效。

## Version 21 (2026.03.04.4) - 2026-03-04

修复 Droid 连续多问题选项只显示第一个问题的 bug。

- 修复 AskUserQuestion 多问题场景：之前只展示第一个问题的选项，选择后剩余问题自动填充"-"发送
- 改为逐步展示每个问题的选项，用户依次选择后才统一提交所有答案
- 新增问题进度指示器（如 1/3、2/3），显示当前是第几个问题
- 新增已选答案面包屑，方便用户查看之前的选择
- Auto 模式也改为逐个问题自动选择，而非只选第一个

发布方式：OTA 部署生效。

## Version 20 (2026.03.04.3) - 2026-03-04

优化 auto-confirm 模式选择交互，改为弹窗选择器并添加清晰的功能描述。

- 重构 auto-confirm 按钮为弹窗选择器（与模型切换一致的 FloatingOverlay 样式）
- 默认模式按钮文案从"自动"改为"手动确认"，更直观
- 按钮样式统一：去掉蓝色选中背景，添加向上箭头图标
- 每个模式添加描述文案，说明 AI 会做什么（如"自动读取和搜索，编辑需确认"）
- 输入框右上角显示当前 auto-confirm 模式描述
- 支持 11 种语言翻译

发布方式：OTA 部署生效。

## Version 19 (2026.03.04.2) - 2026-03-04

新增 Droid agent 集成、会话内切换 agent、auto-confirm 模式优化及多项 bug 修复。

- 新增 Droid agent 类型：支持 Factory Droid 作为第四个 AI agent（贯穿 app、CLI、daemon）
- 新增会话内切换 agent：在已有会话中点击 agent 名称可切换到不同 AI agent，对话历史自动传递
- 优化 auto-confirm 模式：confirm 模式不再自动批准工具权限（仅 all 模式才会），修复权限误批准问题
- 修复 stale pending requests：CLI 重启时自动清理上一个进程遗留的过期权限请求
- 修复 session badge：只对 online 会话显示 action badge，避免已断开会话显示误导性提示
- 修复 SPA fallback：将路由 fallback 移到 error handler，解决 fastify 注册顺序冲突
- 修复 save_memory 错误信息：API 失败时显示详细错误原因
- 修复 todos 类型检查：使用 Array.isArray 防止非数组值导致崩溃

发布方式：OTA 部署生效（app 端），daemon 和 CLI 需要更新 happy-cli。

## Version 18 (2026.03.04.1) - 2026-03-04

修复归档和删除会话后 UI 不更新的问题。

- 修复删除会话后列表不刷新：sessionDelete 成功后立即从本地状态移除 session，不再依赖 WebSocket 通知
- 修复归档会话后仍显示在 Active 列表：sessionKill 成功后立即将 session 标记为 inactive

发布方式：OTA 部署生效。

## Version 17 (2026.03.03.6) - 2026-03-03

修复跨机器 session 恢复失败的问题，改善 RPC 错误透传。

- 修复 session reactivation 在切换机器后失败的问题：当 session 创建在旧机器上时，reactivation RPC 会发送到已离线的旧机器导致超时。现在优先尝试活跃机器，跳过离线机器避免 15s 超时
- 修复 machineRPC 错误信息丢失：服务端返回的错误信息（如 "RPC method not available"）现在会正确透传到客户端
- 修复 daemon 端 RPC handler 错误被静默吞掉的问题：RpcHandlerManager 捕获的错误会被加密后以 `{ ok: true }` 返回，客户端现在能检测并重新抛出这些错误
- 新增 dataKey 传递：app 将 session 的数据加密密钥传给 daemon，支持在没有 session info 文件的情况下恢复 session（跨机器场景）

发布方式：OTA 部署生效（app 端），daemon 需要更新 CLI。

## Version 16 (2026.03.03.5) - 2026-03-03

修复自动模式（Auto✓/Auto+）不生效的 bug。

- 修复「自动」(confirm) 模式下 markdown 选项（如"是/否"）不自动选择的问题：confirm 模式现在会自动选择 markdown 选项
- 修复「自动+」(all) 模式下选项不自动选择的问题：hasAnyUserMessage 扫描逻辑在找到选项后提前返回，导致始终为 false
- FixedPermissionBar 排除 AskUserQuestion，避免与 FixedAskUserQuestionBar 显示重复的权限按钮

发布方式：OTA 部署生效。

## Version 15 (2026.03.03.4) - 2026-03-03

在 Knowledge Base 规则页面新增"新建规则"功能。

- 在规则列表页面顶部添加 "+ New Rule" 按钮，支持直接创建新规则
- 创建弹窗支持填写标题、内容，并选择作用域（Global / Project）
- 空状态页面也提供创建入口按钮
- EditRuleModal 组件扩展为同时支持创建和编辑双模式
- useKnowledgeBase hook 新增 createItem 方法
- 更新全部 11 种语言的翻译

发布方式：OTA 部署生效。

## Version 14 (2026.03.03.3) - 2026-03-03

修复 autoConfirmMode=all 时新 session 初始问候自动选择选项的 bug。

- 当用户在 session 中从未发过消息时（初始问候），即使 autoConfirmMode 为 all 也不自动选择第一个选项
- 确保用户可以手动选择初始选项后，后续选项才会自动选择

发布方式：OTA 部署生效。

## Version 13 (2026.03.03.2) - 2026-03-03

修复选项栏重复显示和宽度问题。

- 修复 FixedOptionsBar 在宽屏上撑满全宽的问题，添加 maxWidth 约束与其他 bar 组件保持一致
- 修复当 AskUserQuestion 和 markdown options 同时存在时选项重复显示的问题，AskUserQuestion 优先展示

发布方式：OTA 部署生效。

## Version 12 (2026.03.03.1) - 2026-03-03

自动确认功能升级为三态模式，支持更精细的权限控制。

- 自动确认从开/关两态改为三态循环：手动确认（Auto）→ 仅自动确认权限（Auto✓）→ 自动确认+自动回答（Auto+）
- 「仅自动确认」模式：自动批准工具权限请求，但不自动回答 AskUserQuestion 和 options 选择
- 「自动确认+回答」模式：额外自动选择 AskUserQuestion 第一项和 markdown options 第一项（300ms 延迟，带视觉反馈）
- CLI 端所有模式均跳过 AskUserQuestion 自动批准，由 App 端统一处理
- FixedOptionsBar 组件接入 SessionView，支持 autoConfirmMode 传递
- 更新全部 11 种语言的翻译

发布方式：需要 `npm run build`（happy-cli）重新编译后重启 daemon 生效；App 端需 OTA 部署或重新构建。

## Version 11 (2026.03.02.7) - 2026-03-02

修复 auto-continue 在 AI 展示选项时不等待用户选择就自动继续的 bug。

- 当 assistant 消息包含 `<options>` 时，跳过 `error_max_turns` 自动继续，等待用户选择
- 用户手动发送消息后重置 options 标记

发布方式：需要 `npm run build`（happy-cli）重新编译后重启 daemon 生效。

## Version 10 (2026.03.02.6) - 2026-03-02

支持通过 daemon control server 接口恢复 Claude 对话上下文。

- `/spawn-session` 接口新增 `resumeClaudeSessionId` 参数，支持会话恢复时传递 Claude 对话 ID
- 配合 daemon auto-respawn 机制，确保外部 kill CLI 进程后自动恢复时保留完整对话上下文

发布方式：需要 `npm run build`（happy-cli）重新编译后重启 daemon 生效。

## Version 9 (2026.03.02.5) - 2026-03-02

修复会话断开后无法重新激活的问题，提升休眠唤醒后的会话恢复可靠性。

- 修复 daemon 崩溃重启达到上限后删除 session info 文件的问题，保留文件以支持用户触发的重新激活
- 前端重新激活 RPC 增加重试机制（最多 3 次，间隔递增），应对休眠唤醒后 daemon socket 重连延迟
- 失败时缩短 dedup 守卫时间（30s → 5s），允许用户快速重试

## Version 8 (2026.03.02.4) - 2026-03-02

新增 MD 引用文件和文件附件功能，支持更丰富的上下文注入。

- 新增 MD 引用功能：创建、编辑和附加 Markdown 引用文件到消息中，快速注入上下文
- 新增 Web 端文件附件支持：可直接在输入框中附加文本文件和 PDF
- 更新同步协议以支持文件附件和 MD 引用元数据
- 新增项目上下文文档 (HAPPY_CONTEXT.md)
- 更新全部 11 种语言的翻译

## Version 7 (2026.03.02.3) - 2026-03-02

Fixed session time not updating when messages are sent.

- Server: Update session lastActiveAt when messages are created via WebSocket and REST API
- Server: Session updatedAt now auto-updates via Prisma @updatedAt on message creation
- Client: Fix sortTimestamp merge priority so new values take effect
- Client: Pass sortTimestamp on new-message events so conversations move to top of list

## Version 6 (2026.03.02.2) - 2026-03-02

Added clickable version badge with version history panel on web.

- Version badge in bottom-right corner is now clickable with hover effect
- Clicking opens a floating panel showing all version history
- Each version entry displays deploy version number, date, summary, and changes
- Panel closes when clicking outside or clicking the badge again
- Changelog now uses deploy version format (YYYY.MM.DD.N)

## Version 5 (2025.12.22.1) - 2025-12-22

This release expands AI agent support and refines the voice experience, while improving markdown rendering for a better chat experience.

- We are working on adding Gemini support using ACP and hopefully fixing codex stability issues using the same approach soon! Stay tuned.
- Removed model configurations from agents. We were not able to keep up with the models so for now we are removing the configuration from the mobile app. You can still configure it through your CLIs, happy will simply use defaults.
- Elevenlabs ... is epxensive. Voice conversations will soon require a subscription after 3 free trials - we'll soon allow connecting your own ElevenLabs agent if you want to manage your own spendings.
- Improved markdown table rendering in chat - no more ASCII pipes `|--|`, actual formatted tables (layout still needs work, but much better!)

## Version 4 (2025.09.12.1) - 2025-09-12

This release revolutionizes remote development with Codex integration and Daemon Mode, enabling instant AI assistance from anywhere. Start coding sessions with a single tap while maintaining complete control over your development environment.

- Introduced Codex support for advanced AI-powered code completion and generation capabilities.
- Implemented Daemon Mode as the new default, enabling instant remote session initiation without manual CLI startup.
- Added one-click session launch from mobile devices, automatically connecting to your development machine.
- Added ability to connect anthropic and gpt accounts to account

## Version 3 (2025.08.29.1) - 2025-08-29

This update introduces seamless GitHub integration, bringing your developer identity directly into Happy while maintaining our commitment to privacy and security.

- Added GitHub account connection through secure OAuth authentication flow
- Integrated profile synchronization displaying your GitHub avatar, name, and bio
- Implemented encrypted token storage on our backend for additional security protection
- Enhanced settings interface with personalized profile display when connected
- Added one-tap GitHub disconnect functionality with confirmation protection
- Improved account management with clear connection status indicators

## Version 2 (2025.06.26.1) - 2025-06-26

This update focuses on seamless device connectivity, visual refinements, and intelligent voice interactions for an enhanced user experience.

- Added QR code authentication for instant and secure device linking across platforms
- Introduced comprehensive dark theme with automatic system preference detection
- Improved voice assistant performance with faster response times and reduced latency
- Added visual indicators for modified files directly in the session list
- Implemented preferred language selection for voice assistant supporting 15+ languages

## Version 1 (2025.05.12.1) - 2025-05-12

Welcome to Happy - your secure, encrypted mobile companion for Claude Code. This inaugural release establishes the foundation for private, powerful AI interactions on the go.

- Implemented end-to-end encrypted session management ensuring complete privacy
- Integrated intelligent voice assistant with natural conversation capabilities
- Added experimental file manager with syntax highlighting and tree navigation
- Built seamless real-time synchronization across all your devices
- Established native support for iOS, Android, and responsive web interfaces
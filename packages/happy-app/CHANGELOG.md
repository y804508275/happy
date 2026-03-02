# Changelog

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
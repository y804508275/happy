import { render } from "ink";
import { DroidSession, DroidEnhancedMode } from "./session";
import { MessageBuffer } from "@/ui/ink/messageBuffer";
import { RemoteModeDisplay } from "@/ui/ink/RemoteModeDisplay";
import React from "react";
import { droidRemote } from "./droidRemote";
import { Future } from "@/utils/future";
import { SDKMessage, SDKAssistantMessage, SDKUserMessage } from "@/claude/sdk";
import { formatClaudeMessageForInk } from "@/ui/messageFormatterInk";
import { logger } from "@/ui/logger";
import { SDKToLogConverter } from "@/claude/utils/sdkToLogConverter";
import { OutgoingMessageQueue } from "@/claude/utils/OutgoingMessageQueue";

export async function droidRemoteLauncher(session: DroidSession): Promise<'switch' | 'exit'> {
    logger.debug('[droidRemoteLauncher] Starting remote launcher');

    const hasTTY = process.stdout.isTTY && process.stdin.isTTY;

    let messageBuffer = new MessageBuffer();
    let inkInstance: any = null;

    if (hasTTY) {
        console.clear();
        inkInstance = render(React.createElement(RemoteModeDisplay, {
            messageBuffer,
            logPath: process.env.DEBUG ? session.logPath : undefined,
            onExit: async () => {
                logger.debug('[droid-remote]: Exiting via Ctrl-C');
                if (!exitReason) {
                    exitReason = 'exit';
                }
                await abort();
            },
            onSwitchToLocal: () => {
                logger.debug('[droid-remote]: Switching to local mode');
                doSwitch();
            }
        }), {
            exitOnCtrlC: false,
            patchConsole: false
        });
    }

    if (hasTTY) {
        process.stdin.resume();
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.setEncoding("utf8");
    }

    let exitReason: 'switch' | 'exit' | null = null;
    let abortController: AbortController | null = null;
    let abortFuture: Future<void> | null = null;

    async function abort() {
        if (abortController && !abortController.signal.aborted) {
            abortController.abort();
        }
        await abortFuture?.promise;
    }

    async function doAbort() {
        logger.debug('[droid-remote]: doAbort');
        await abort();
    }

    async function doSwitch() {
        logger.debug('[droid-remote]: doSwitch');
        if (!exitReason) {
            exitReason = 'switch';
        }
        await abort();
    }

    session.client.rpcHandlerManager.registerHandler('abort', doAbort);
    session.client.rpcHandlerManager.registerHandler('switch', doSwitch);

    // Track autoConfirmMode — escalates Droid's --auto level at next spawn
    let autoConfirmMode: 'off' | 'confirm' | 'all' = 'off';
    session.client.rpcHandlerManager.registerHandler<{ enabled: boolean, mode?: 'off' | 'confirm' | 'all' }, void>(
        'autoConfirm',
        async (message) => {
            autoConfirmMode = message.mode || (message.enabled ? 'all' : 'off');
            logger.debug(`[droid-remote] autoConfirmMode changed to: ${autoConfirmMode}`);
            session.client.updateAgentState((state) => ({
                ...state,
                autoConfirm: message.enabled,
                autoConfirmMode,
            }));
        }
    );

    const messageQueue = new OutgoingMessageQueue(
        (logMessage) => session.client.sendClaudeSessionMessage(logMessage)
    );

    const sdkToLogConverter = new SDKToLogConverter({
        sessionId: session.sessionId || 'unknown',
        cwd: session.path,
        version: process.env.npm_package_version
    }, new Map());

    let ongoingToolCalls = new Map<string, { parentToolCallId: string | null }>();

    function onMessage(message: SDKMessage) {
        formatClaudeMessageForInk(message, messageBuffer);

        if (message.type === 'assistant') {
            let umessage = message as SDKAssistantMessage;
            if (umessage.message.content && Array.isArray(umessage.message.content)) {
                for (let c of umessage.message.content) {
                    if (c.type === 'tool_use') {
                        ongoingToolCalls.set(c.id!, { parentToolCallId: umessage.parent_tool_use_id ?? null });
                    }
                }
            }
        }
        if (message.type === 'user') {
            let umessage = message as SDKUserMessage;
            if (umessage.message.content && Array.isArray(umessage.message.content)) {
                for (let c of umessage.message.content) {
                    if (c.type === 'tool_result' && c.tool_use_id) {
                        ongoingToolCalls.delete(c.tool_use_id);
                        messageQueue.releaseToolCall(c.tool_use_id);
                    }
                }
            }
        }

        const logMessage = sdkToLogConverter.convert(message);
        if (logMessage) {
            if (logMessage.type === 'assistant' && message.type === 'assistant') {
                const assistantMsg = message as SDKAssistantMessage;
                const toolCallIds: string[] = [];
                if (assistantMsg.message.content && Array.isArray(assistantMsg.message.content)) {
                    for (const block of assistantMsg.message.content) {
                        if (block.type === 'tool_use' && block.id) {
                            toolCallIds.push(block.id);
                        }
                    }
                }
                if (toolCallIds.length > 0) {
                    const isSidechain = assistantMsg.parent_tool_use_id !== undefined;
                    if (!isSidechain) {
                        messageQueue.enqueue(logMessage, { delay: 250, toolCallIds });
                        return;
                    }
                }
            }
            messageQueue.enqueue(logMessage);
        }

        // Insert fake sidechain message for Task tool
        if (message.type === 'assistant') {
            let umessage = message as SDKAssistantMessage;
            if (umessage.message.content && Array.isArray(umessage.message.content)) {
                for (let c of umessage.message.content) {
                    if (c.type === 'tool_use' && c.name === 'Task' && c.input && typeof (c.input as any).prompt === 'string') {
                        const logMessage2 = sdkToLogConverter.convertSidechainUserMessage(c.id!, (c.input as any).prompt);
                        if (logMessage2) {
                            messageQueue.enqueue(logMessage2);
                        }
                    }
                }
            }
        }
    }

    try {
        let pending: { message: string | Array<unknown>; mode: DroidEnhancedMode } | null = null;

        while (!exitReason) {
            await session.reloadProjectContext();

            logger.debug('[droid-remote]: launch');
            messageBuffer.addMessage('Starting Droid session...', 'status');

            const controller = new AbortController();
            abortController = controller;
            abortFuture = new Future<void>();
            let modeHash: string | null = null;

            try {
                await droidRemote({
                    sessionId: session.sessionId,
                    path: session.path,
                    projects: session.projects,
                    projectContext: session.projectContext,
                    nextMessage: async () => {
                        if (pending) {
                            let p = pending;
                            pending = null;
                            return { ...p, mode: { ...p.mode, autoConfirmMode } };
                        }
                        let msg = await session.queue.waitForMessagesAndGetAsString(controller.signal);
                        if (msg) {
                            if ((modeHash && msg.hash !== modeHash) || msg.isolate) {
                                pending = msg;
                                return null;
                            }
                            modeHash = msg.hash;
                            return { message: msg.message, mode: { ...msg.mode, autoConfirmMode } };
                        }
                        return null;
                    },
                    onSessionFound: (sessionId) => {
                        sdkToLogConverter.updateSessionId(sessionId);
                        session.onSessionFound(sessionId);
                    },
                    onThinkingChange: session.onThinkingChange,
                    onMessage,
                    onCompletionEvent: (message: string) => {
                        logger.debug(`[droid-remote]: Completion event: ${message}`);
                        session.client.sendSessionEvent({ type: 'message', message });
                    },
                    onReady: () => {
                        session.client.closeClaudeSessionTurn('completed');
                        if (!pending && session.queue.size() === 0) {
                            session.api.push().sendToAllDevices(
                                'Ready!',
                                `Droid is waiting for your command`,
                                { sessionId: session.client.sessionId }
                            );
                        }
                    },
                    signal: abortController.signal,
                });

                if (!exitReason && abortController.signal.aborted) {
                    session.client.closeClaudeSessionTurn('cancelled');
                    session.client.sendSessionEvent({ type: 'message', message: 'Aborted by user' });
                }
            } catch (e) {
                logger.debug('[droid-remote]: launch error', e);
                if (!exitReason) {
                    if (abortController?.signal.aborted) {
                        session.client.closeClaudeSessionTurn('cancelled');
                        session.client.sendSessionEvent({ type: 'message', message: 'Aborted by user' });
                    } else {
                        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
                        session.client.closeClaudeSessionTurn('failed');
                        session.client.sendSessionEvent({ type: 'message', message: `Error: ${errorMsg}. Try sending your message again.` });
                    }
                    continue;
                }
            } finally {
                for (let [toolCallId, { parentToolCallId }] of ongoingToolCalls) {
                    const converted = sdkToLogConverter.generateInterruptedToolResult(toolCallId, parentToolCallId);
                    if (converted) {
                        session.client.sendClaudeSessionMessage(converted);
                    }
                }
                ongoingToolCalls.clear();
                await messageQueue.flush();
                messageQueue.destroy();
                abortController = null;
                abortFuture?.resolve(undefined);
                abortFuture = null;
                modeHash = null;
            }
        }
    } finally {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }
        if (inkInstance) {
            inkInstance.unmount();
        }
        messageBuffer.clear();
        if (abortFuture) {
            abortFuture.resolve(undefined);
        }
    }

    return exitReason || 'exit';
}

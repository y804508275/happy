import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Query } from '@/claude/sdk/query';
import type { SDKMessage, SDKSystemMessage, SDKResultMessage } from '@/claude/sdk/types';
import { AbortError } from '@/claude/sdk/types';
import { logger } from "@/lib";
import { DroidEnhancedMode } from './session';
import { mapToDroidAutoLevel, buildDroidAutoArgs } from './utils/permissionMode';
import type { ScannedProject } from '@/claude/utils/projectScanner';

let tmpImageCounter = 0;
const DROID_TMP_DIR = join(tmpdir(), 'happy-droid-images');

// Convert multimodal array content to a text prompt.
// Images are saved as temp files and referenced by path so Droid can read them.
function flattenMultimodalToText(content: Array<unknown>): string {
    const parts: string[] = [];
    for (const block of content) {
        const b = block as any;
        if (b.type === 'text' && b.text) {
            parts.push(b.text);
        } else if (b.type === 'image' && b.source?.type === 'base64' && b.source?.data) {
            try {
                mkdirSync(DROID_TMP_DIR, { recursive: true });
                const ext = (b.source.media_type || 'image/png').split('/')[1] || 'png';
                const filename = `image_${Date.now()}_${++tmpImageCounter}.${ext}`;
                const filepath = join(DROID_TMP_DIR, filename);
                writeFileSync(filepath, Buffer.from(b.source.data, 'base64'));
                parts.push(`[Image attached: ${filepath}]`);
                logger.debug(`[droidRemote] Saved temp image: ${filepath}`);
            } catch (e) {
                parts.push('[Image: failed to save]');
                logger.debug(`[droidRemote] Failed to save temp image: ${e}`);
            }
        } else if (b.type === 'image' && b.source?.type === 'url' && b.source?.url) {
            parts.push(`[Image URL: ${b.source.url}]`);
        }
    }
    return parts.join('\n\n');
}

// Droid stream-json → Claude SDK format normalization
// Handles: message, tool_call, tool_result, completion
function normalizeDroidMessage(msg: SDKMessage): SDKMessage {
    const raw = msg as any;
    if (raw.type === 'message' && raw.role === 'assistant') {
        return {
            type: 'assistant',
            message: {
                role: 'assistant',
                content: [{ type: 'text', text: raw.text || '' }],
            },
        } as any;
    }
    if (raw.type === 'message' && raw.role === 'user') {
        return {
            type: 'user',
            message: {
                role: 'user',
                content: raw.text || '',
            },
        } as any;
    }
    // Droid tool_call → Claude SDK assistant message with tool_use content block
    if (raw.type === 'tool_call') {
        return {
            type: 'assistant',
            message: {
                role: 'assistant',
                content: [{
                    type: 'tool_use',
                    id: raw.id,
                    name: raw.toolName,
                    input: raw.parameters ?? {},
                }],
            },
        } as any;
    }
    // Droid tool_result → Claude SDK user message with tool_result content block
    if (raw.type === 'tool_result') {
        return {
            type: 'user',
            message: {
                role: 'user',
                content: [{
                    type: 'tool_result',
                    tool_use_id: raw.id,
                    content: raw.value ?? '',
                    is_error: raw.isError ?? false,
                }],
            },
        } as any;
    }
    if (raw.type === 'completion') {
        return {
            type: 'result',
            subtype: 'success',
            session_id: raw.session_id,
            ...raw,
        } as any;
    }
    return msg;
}

// Run a single droid exec invocation with a prompt, returning when it completes.
// For multi-turn, pass droidSessionId to resume the same droid session.
async function runDroidExec(opts: {
    prompt: string,
    path: string,
    mode: DroidEnhancedMode,
    droidSessionId: string | null,
    signal?: AbortSignal,
    onSessionFound: (id: string) => void,
    onThinkingChange?: (thinking: boolean) => void,
    onMessage: (message: SDKMessage) => void,
}): Promise<{ droidSessionId: string | null, resultSubtype: string | null }> {
    const autoLevel = mapToDroidAutoLevel(opts.mode.permissionMode as any, opts.mode.autoConfirmMode);
    const autoArgs = buildDroidAutoArgs(autoLevel);

    const args: string[] = [
        'exec',
        '--output-format', 'stream-json',
        ...autoArgs,
    ];

    if (opts.mode.model) {
        args.push('--model', opts.mode.model);
    }

    if (opts.droidSessionId) {
        args.push('--session-id', opts.droidSessionId);
    }

    if (opts.mode.allowedTools && opts.mode.allowedTools.length > 0) {
        args.push('--enabled-tools', opts.mode.allowedTools.join(','));
    }

    if (opts.mode.disallowedTools && opts.mode.disallowedTools.length > 0) {
        args.push('--disabled-tools', opts.mode.disallowedTools.join(','));
    }

    logger.debug(`[droidRemote] Spawning: droid ${args.join(' ')}`);

    const child = spawn('droid', args, {
        cwd: opts.path,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: opts.signal,
        env: process.env,
        shell: process.platform === 'win32',
    }) as ChildProcessWithoutNullStreams;

    // Send prompt via stdin (supports long content like knowledge base rules)
    child.stdin.write(opts.prompt);
    child.stdin.end();

    if (process.env.DEBUG) {
        child.stderr.on('data', (data: Buffer) => {
            logger.debug('Droid stderr:', data.toString());
        });
    }

    const cleanup = () => {
        if (!child.killed) child.kill('SIGTERM');
    };
    opts.signal?.addEventListener('abort', cleanup);

    const processExitPromise = new Promise<void>((resolve) => {
        child.on('close', () => resolve());
    });

    const queryInstance = new Query(child.stdin, child.stdout, processExitPromise);

    child.on('error', (error) => {
        if (opts.signal?.aborted) {
            queryInstance.setError(new AbortError('Droid process aborted by user'));
        } else {
            queryInstance.setError(new Error(`Failed to spawn Droid process: ${error.message}`));
        }
    });

    processExitPromise.finally(() => {
        cleanup();
        opts.signal?.removeEventListener('abort', cleanup);
    });

    let droidSessionId = opts.droidSessionId;
    let resultSubtype: string | null = null;
    let messageCount = 0;

    opts.onThinkingChange?.(true);
    try {
        for await (const rawMessage of queryInstance) {
            messageCount++;
            const message = normalizeDroidMessage(rawMessage);
            logger.debugLargeJson(`[droidRemote] Message ${message.type}`, message);
            opts.onMessage(message);

            if (message.type === 'system' && (message as SDKSystemMessage).subtype === 'init') {
                const systemInit = message as SDKSystemMessage;
                if (systemInit.session_id) {
                    droidSessionId = systemInit.session_id;
                    opts.onSessionFound(systemInit.session_id);
                }
            }

            if (message.type === 'result') {
                resultSubtype = (message as SDKResultMessage).subtype ?? null;
            }
        }
    } catch (e) {
        if (e instanceof AbortError) {
            logger.debug(`[droidRemote] Aborted`);
        } else {
            throw e;
        }
    } finally {
        opts.onThinkingChange?.(false);
    }

    // If exec produced no messages and we had a session ID, the session is likely
    // broken (e.g. after abort). Clear it so the caller can retry with a fresh session.
    if (messageCount === 0 && droidSessionId) {
        logger.debug(`[droidRemote] Empty exec with session ${droidSessionId}, clearing session ID`);
        droidSessionId = null;
    }

    return { droidSessionId, resultSubtype };
}

export async function droidRemote(opts: {
    sessionId: string | null,
    path: string,
    signal?: AbortSignal,

    projects?: ScannedProject[],
    projectContext?: string | null,

    nextMessage: () => Promise<{ message: string | Array<unknown>, mode: DroidEnhancedMode } | null>,
    onReady: () => void,

    onSessionFound: (id: string) => void,
    onThinkingChange?: (thinking: boolean) => void,
    onMessage: (message: SDKMessage) => void,
    onCompletionEvent?: (message: string) => void,
}) {
    let droidSessionId: string | null = opts.sessionId;
    let autoResumeCount = 0;
    const MAX_AUTO_RESUMES = 5;

    const initial = await opts.nextMessage();
    if (!initial) return;

    let currentMessage = typeof initial.message === 'string'
        ? initial.message
        : flattenMultimodalToText(initial.message as Array<unknown>);
    let mode = initial.mode;
    let isFirstMessage = true;

    while (true) {
        if (opts.signal?.aborted) return;

        // For the first message, prepend system instructions (knowledge base rules + options system)
        // so Droid has the same context as Claude sessions.
        let prompt = currentMessage;
        if (isFirstMessage) {
            const parts: string[] = [];
            if (mode.appendSystemPrompt) parts.push(mode.appendSystemPrompt);
            if (opts.projectContext) parts.push(opts.projectContext);
            if (parts.length > 0) {
                prompt = `<system_instructions>\n${parts.join('\n\n')}\n</system_instructions>\n\n<user_message>\n${currentMessage}\n</user_message>`;
            }
            isFirstMessage = false;
        }

        const result = await runDroidExec({
            prompt,
            path: opts.path,
            mode,
            droidSessionId,
            signal: opts.signal,
            onSessionFound: (id) => {
                droidSessionId = id;
                opts.onSessionFound(id);
            },
            onThinkingChange: opts.onThinkingChange,
            onMessage: opts.onMessage,
        });

        droidSessionId = result.droidSessionId;

        // Handle auto-resume on max turns
        if (result.resultSubtype === 'error_max_turns' && autoResumeCount < MAX_AUTO_RESUMES) {
            autoResumeCount++;
            logger.debug(`[droidRemote] Auto-resuming (${autoResumeCount}/${MAX_AUTO_RESUMES})`);
            opts.onCompletionEvent?.(`Auto-continuing (${autoResumeCount}/${MAX_AUTO_RESUMES})...`);
            currentMessage = 'Continue';
            continue;
        }

        if (result.resultSubtype === 'error_max_turns') {
            opts.onCompletionEvent?.('Reached auto-continue limit. Please send a message to continue.');
        }

        autoResumeCount = 0;

        if (opts.signal?.aborted) return;

        opts.onReady();

        // Wait for next user message
        const next = await opts.nextMessage();
        if (!next) return;

        mode = next.mode;
        currentMessage = typeof next.message === 'string'
            ? next.message
            : flattenMultimodalToText(next.message as Array<unknown>);
    }
}

import { logger } from "@/ui/logger";
import { droidLocal, ExitCodeError } from "./droidLocal";
import { DroidSession } from "./session";
import { Future } from "@/utils/future";

export type LauncherResult = { type: 'switch' } | { type: 'exit', code: number };

export async function droidLocalLauncher(session: DroidSession): Promise<LauncherResult> {
    let exitReason: LauncherResult | null = null;
    const processAbortController = new AbortController();
    let exitFuture = new Future<void>();

    try {
        async function abort() {
            if (!processAbortController.signal.aborted) {
                processAbortController.abort();
            }
            await exitFuture.promise;
        }

        async function doAbort() {
            logger.debug('[droid-local]: doAbort');
            if (!exitReason) {
                exitReason = { type: 'switch' };
            }
            session.client.closeClaudeSessionTurn('cancelled');
            session.queue.reset();
            await abort();
        }

        async function doSwitch() {
            logger.debug('[droid-local]: doSwitch');
            if (!exitReason) {
                exitReason = { type: 'switch' };
            }
            session.client.closeClaudeSessionTurn('cancelled');
            await abort();
        }

        session.client.rpcHandlerManager.registerHandler('abort', doAbort);
        session.client.rpcHandlerManager.registerHandler('switch', doSwitch);
        session.queue.setOnMessage(() => { doSwitch(); });

        if (session.queue.size() > 0) {
            return { type: 'switch' };
        }

        while (true) {
            if (exitReason) {
                return exitReason;
            }

            await session.reloadProjectContext();

            logger.debug('[droid-local]: launch');
            try {
                await droidLocal({
                    path: session.path,
                    sessionId: session.sessionId,
                    onSessionFound: (id) => session.onSessionFound(id),
                    onThinkingChange: session.onThinkingChange,
                    abort: processAbortController.signal,
                });

                if (!exitReason) {
                    session.client.closeClaudeSessionTurn('completed');
                    exitReason = { type: 'exit', code: 0 };
                    break;
                }
            } catch (e) {
                logger.debug('[droid-local]: launch error', e);
                if (e instanceof ExitCodeError) {
                    session.client.closeClaudeSessionTurn('failed');
                    exitReason = { type: 'exit', code: e.exitCode };
                    break;
                }
                if (!exitReason) {
                    session.client.sendSessionEvent({ type: 'message', message: 'Droid process exited unexpectedly' });
                    continue;
                } else {
                    break;
                }
            }
            logger.debug('[droid-local]: launch done');
        }
    } finally {
        exitFuture.resolve(undefined);
        session.client.rpcHandlerManager.registerHandler('abort', async () => { });
        session.client.rpcHandlerManager.registerHandler('switch', async () => { });
        session.queue.setOnMessage(null);
    }

    return exitReason || { type: 'exit', code: 0 };
}

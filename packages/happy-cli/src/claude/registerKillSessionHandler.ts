import { RpcHandlerManager } from "@/api/rpc/RpcHandlerManager";
import { logger } from "@/lib";

interface KillSessionRequest {
    // No parameters needed
}

interface KillSessionResponse {
    success: boolean;
    message: string;
}


export function registerKillSessionHandler(
    rpcHandlerManager: RpcHandlerManager,
    killThisHappy: () => Promise<void>
) {
    const startTime = Date.now();
    const GRACE_PERIOD_MS = 5000;

    rpcHandlerManager.registerHandler<KillSessionRequest, KillSessionResponse>('killSession', async () => {
        // Ignore kill requests that arrive shortly after process start.
        // These are stale RPCs from a previous archive/kill that race with reactivation.
        if (Date.now() - startTime < GRACE_PERIOD_MS) {
            logger.debug(`Kill session request ignored (process started ${Date.now() - startTime}ms ago, within ${GRACE_PERIOD_MS}ms grace period)`);
            return {
                success: false,
                message: 'Ignored stale kill request during startup grace period'
            };
        }

        logger.debug('Kill session request received');

        // This will start the cleanup process
        void killThisHappy();

        // We should still be able to respond the the client, though they
        // should optimistically assume the session is dead.
        return {
            success: true,
            message: 'Killing happy-cli process'
        };
    });
}

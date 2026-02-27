import { writeFileSync } from 'node:fs';
import { RpcHandlerManager } from "@/api/rpc/RpcHandlerManager";
import { logger } from "@/lib";

const RESTART_EXIT_CODE = 42;

interface RestartSessionRequest {
    // No parameters needed
}

interface RestartSessionResponse {
    success: boolean;
    message: string;
}

interface RestartSessionInfo {
    sessionId: string;
    encryptionKey: string; // base64 encoded
    encryptionVariant: 'legacy' | 'dataKey';
}

export function registerRestartSessionHandler(
    rpcHandlerManager: RpcHandlerManager,
    sessionInfo: RestartSessionInfo,
    cleanupForRestart: () => Promise<void>
) {
    rpcHandlerManager.registerHandler<RestartSessionRequest, RestartSessionResponse>('restartSession', async () => {
        logger.debug('[RESTART] Restart session request received');

        // Write restart state file before exiting
        const restartFilePath = `/tmp/happy-restart-${process.pid}.json`;
        try {
            writeFileSync(restartFilePath, JSON.stringify({
                sessionId: sessionInfo.sessionId,
                encryptionKey: sessionInfo.encryptionKey,
                encryptionVariant: sessionInfo.encryptionVariant,
            }), { mode: 0o600 });
            logger.debug(`[RESTART] Wrote restart state to ${restartFilePath}`);
        } catch (error) {
            logger.debug('[RESTART] Failed to write restart state file:', error);
            return {
                success: false,
                message: 'Failed to write restart state file'
            };
        }

        // Start cleanup and exit with code 42 (signals daemon to respawn)
        void (async () => {
            try {
                await cleanupForRestart();
            } catch (e) {
                logger.debug('[RESTART] Error during restart cleanup:', e);
            }
            process.exit(RESTART_EXIT_CODE);
        })();

        return {
            success: true,
            message: 'Restarting session process'
        };
    });
}

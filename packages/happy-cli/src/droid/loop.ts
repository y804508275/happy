import { ApiSessionClient } from "@/api/apiSession";
import { MessageQueue2 } from "@/utils/MessageQueue2";
import { logger } from "@/ui/logger";
import { DroidSession, DroidEnhancedMode } from "./session";
import { droidLocalLauncher, LauncherResult } from "./droidLocalLauncher";
import { droidRemoteLauncher } from "./droidRemoteLauncher";
import { ApiClient } from "@/lib";
import type { ScannedProject } from "@/claude/utils/projectScanner";

interface DroidLoopOptions {
    path: string;
    startingMode?: 'local' | 'remote';
    resumeDroidSessionId?: string;
    onModeChange: (mode: 'local' | 'remote') => void;
    session: ApiSessionClient;
    api: ApiClient;
    messageQueue: MessageQueue2<DroidEnhancedMode>;
    onSessionReady?: (session: DroidSession) => void;
    projects?: ScannedProject[];
    projectContext?: string | null;
}

export async function droidLoop(opts: DroidLoopOptions): Promise<number> {
    const logPath = logger.logFilePath;
    let session = new DroidSession({
        api: opts.api,
        client: opts.session,
        path: opts.path,
        logPath: logPath,
        sessionId: opts.resumeDroidSessionId ?? null,
        messageQueue: opts.messageQueue,
        onModeChange: opts.onModeChange,
        projects: opts.projects,
        projectContext: opts.projectContext,
    });

    opts.onSessionReady?.(session);

    let mode: 'local' | 'remote' = opts.startingMode ?? 'local';
    while (true) {
        logger.debug(`[droid-loop] Iteration with mode: ${mode}`);

        switch (mode) {
            case 'local': {
                const result = await droidLocalLauncher(session);
                switch (result.type) {
                    case 'switch':
                        mode = 'remote';
                        opts.onModeChange?.(mode);
                        break;
                    case 'exit':
                        return result.code;
                    default:
                        const _: never = result satisfies never;
                }
                break;
            }
            case 'remote': {
                const reason = await droidRemoteLauncher(session);
                switch (reason) {
                    case 'exit':
                        return 0;
                    case 'switch':
                        mode = 'local';
                        opts.onModeChange?.(mode);
                        break;
                    default:
                        const _: never = reason satisfies never;
                }
                break;
            }
            default: {
                const _: never = mode satisfies never;
            }
        }
    }
}

import { ApiClient, ApiSessionClient } from "@/lib";
import { MessageQueue2 } from "@/utils/MessageQueue2";
import { logger } from "@/ui/logger";
import type { ScannedProject } from "@/claude/utils/projectScanner";

export type DroidPermissionMode = 'default' | 'low' | 'medium' | 'high' | 'skip-permissions-unsafe';

export interface DroidEnhancedMode {
    permissionMode: string;
    model?: string;
    appendSystemPrompt?: string;
    allowedTools?: string[];
    disallowedTools?: string[];
    autoConfirmMode?: 'off' | 'confirm' | 'all';
}

export class DroidSession {
    readonly path: string;
    readonly logPath: string;
    readonly api: ApiClient;
    readonly client: ApiSessionClient;
    readonly queue: MessageQueue2<DroidEnhancedMode>;
    readonly _onModeChange: (mode: 'local' | 'remote') => void;
    readonly projects: ScannedProject[];

    sessionId: string | null;
    projectContext?: string | null;
    mode: 'local' | 'remote' = 'local';
    thinking: boolean = false;

    private keepAliveInterval: NodeJS.Timeout;

    constructor(opts: {
        api: ApiClient,
        client: ApiSessionClient,
        path: string,
        logPath: string,
        sessionId: string | null,
        messageQueue: MessageQueue2<DroidEnhancedMode>,
        onModeChange: (mode: 'local' | 'remote') => void,
        projects?: ScannedProject[],
        projectContext?: string | null,
    }) {
        this.path = opts.path;
        this.api = opts.api;
        this.client = opts.client;
        this.logPath = opts.logPath;
        this.sessionId = opts.sessionId;
        this.queue = opts.messageQueue;
        this._onModeChange = opts.onModeChange;
        this.projects = opts.projects ?? [];
        this.projectContext = opts.projectContext;

        this.client.keepAlive(this.thinking, this.mode);
        this.keepAliveInterval = setInterval(() => {
            this.client.keepAlive(this.thinking, this.mode);
        }, 2000);
    }

    reloadProjectContext = async (): Promise<void> => {
        try {
            const { loadContextForInjection } = await import('@/claude/utils/projectContext');
            const { contextPrompt, rulesCount, refsCount } = await loadContextForInjection(
                this.client.getAuthToken(), this.path, this.projects
            );
            this.projectContext = contextPrompt;
            logger.debug(`[DroidSession] Reloaded project context: ${contextPrompt ? `${contextPrompt.length} chars` : 'none'}`);

            if (rulesCount > 0 || refsCount > 0) {
                const parts: string[] = [];
                if (rulesCount > 0) parts.push(`${rulesCount} rules`);
                if (refsCount > 0) parts.push(`${refsCount} refs`);
                this.client.sendSessionEvent({
                    type: 'message',
                    message: `Loaded ${parts.join(' + ')} from knowledge base`,
                });
            }
        } catch (error) {
            logger.debug('[DroidSession] Failed to reload project context:', error);
        }
    }

    cleanup = (): void => {
        clearInterval(this.keepAliveInterval);
        logger.debug('[DroidSession] Cleaned up resources');
    }

    onThinkingChange = (thinking: boolean) => {
        this.thinking = thinking;
        this.client.keepAlive(thinking, this.mode);
    }

    onModeChange = (mode: 'local' | 'remote') => {
        this.mode = mode;
        this.client.keepAlive(this.thinking, mode);
        this._onModeChange(mode);
    }

    onSessionFound = (sessionId: string) => {
        this.sessionId = sessionId;
        this.client.updateMetadata((metadata) => ({
            ...metadata,
            droidSessionId: sessionId
        }));
        logger.debug(`[DroidSession] Droid session ID ${sessionId} set in metadata`);
    }
}

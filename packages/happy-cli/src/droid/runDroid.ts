import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';

import { ApiClient } from '@/api/api';
import { encodeBase64, decodeBase64 } from '@/api/encryption';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { startCaffeinate, stopCaffeinate } from '@/utils/caffeinate';
import { getEnvironmentInfo } from '@/ui/doctor';
import { configuration } from '@/configuration';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { initialMachineMetadata } from '@/daemon/run';
import { getProjects } from '@/claude/utils/projectScanner';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { connectionState } from '@/utils/serverConnectionErrors';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { addDroidMcpServer, removeDroidMcpServer } from './utils/mcpConfig';
import { droidLoop } from './loop';
import { DroidSession, DroidEnhancedMode } from './session';
import packageJson from '../../package.json';

export interface DroidStartOptions {
    model?: string;
    startingMode?: 'local' | 'remote';
    shouldStartDaemon?: boolean;
    startedBy?: 'daemon' | 'terminal';
    resumeDroidSessionId?: string;
}

export async function runDroid(credentials: Credentials, options: DroidStartOptions = {}): Promise<void> {
    logger.debug(`[DROID] ===== DROID MODE STARTING =====`);

    const workingDirectory = process.cwd();
    const sessionTag = randomUUID();

    logger.debugLargeJson('[DROID-START] Happy process started', getEnvironmentInfo());
    logger.debug(`[DROID-START] Options: startedBy=${options.startedBy}, startingMode=${options.startingMode}`);

    if (options.startedBy === 'daemon' && options.startingMode === 'local') {
        throw new Error('Daemon-spawned sessions cannot use local/interactive mode.');
    }

    connectionState.setBackend('Droid');

    const api = await ApiClient.create(credentials);

    const settings = await readSettings();
    let machineId = settings?.machineId;
    if (!machineId) {
        console.error(`[DROID-START] No machine ID found in settings.`);
        process.exit(1);
    }
    logger.debug(`Using machineId: ${machineId}`);

    await api.getOrCreateMachine({
        machineId,
        metadata: initialMachineMetadata
    });

    const { state, metadata } = createSessionMetadata({
        flavor: 'droid',
        machineId,
        startedBy: options.startedBy,
    });

    // Check for restart: if HAPPY_RESTART_FILE is set, reconnect to existing session
    const restartFilePath = process.env.HAPPY_RESTART_FILE;
    let response: Awaited<ReturnType<typeof api.getOrCreateSession>>;
    if (restartFilePath) {
        try {
            const restartData = JSON.parse(readFileSync(restartFilePath, 'utf-8'));
            logger.debug(`[DROID-RESTART] Reconnecting to existing session ${restartData.sessionId}`);
            response = {
                id: restartData.sessionId,
                seq: restartData.seq || 0,
                encryptionKey: decodeBase64(restartData.encryptionKey),
                encryptionVariant: restartData.encryptionVariant,
                metadata,
                metadataVersion: 0,
                agentState: state,
                agentStateVersion: 0,
            };
            try { unlinkSync(restartFilePath); } catch {}
        } catch (error) {
            logger.debug('[DROID-RESTART] Failed to read restart file, creating new session:', error);
            response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
        }
    } else {
        response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
    }

    if (!response) {
        // Server unreachable — run Droid locally without relay
        logger.debug('[DROID-START] Server unreachable, running Droid locally');
        const { spawn } = await import('node:child_process');
        const child = spawn('droid', [], {
            stdio: 'inherit',
            cwd: workingDirectory,
            env: process.env,
        });
        await new Promise<void>((resolve) => child.on('exit', () => resolve()));
        process.exit(0);
    }

    logger.debug(`Session created: ${response.id}`);

    // Write session info file for daemon
    const sessionsDir = pathJoin(configuration.happyHomeDir, 'sessions');
    const sessionInfoFilePath = pathJoin(sessionsDir, `${response.id}.json`);
    try {
        if (!existsSync(sessionsDir)) {
            mkdirSync(sessionsDir, { recursive: true });
        }
        writeFileSync(sessionInfoFilePath, JSON.stringify({
            sessionId: response.id,
            encryptionKey: encodeBase64(response.encryptionKey),
            encryptionVariant: response.encryptionVariant,
            directory: process.cwd(),
            pid: process.pid,
            startedAt: Date.now(),
            agent: 'droid',
        }), { mode: 0o600 });
    } catch (error) {
        logger.debug('[DROID-START] Failed to write session info file:', error);
    }

    // Report to daemon
    try {
        await notifyDaemonSessionStarted(response.id, metadata);
    } catch (error) {
        logger.debug('[DROID-START] Failed to report to daemon:', error);
    }

    const session = api.sessionSyncClient(response);

    const projects = await getProjects();
    logger.debug(`[DROID-START] Loaded ${projects.length} local projects`);

    // Start Happy MCP server (provides knowledge base tools: notify_rule_applied, load_context, save_memory, etc.)
    const happyServer = await startHappyServer(session, projects, workingDirectory);
    logger.debug(`[DROID-START] Happy MCP server started at ${happyServer.url}`);

    // Register Happy MCP server with Droid's config so `droid exec` can discover it
    addDroidMcpServer('happy', happyServer.url);

    // Load knowledge base context
    const { loadContextForInjection } = await import('@/claude/utils/projectContext');
    const { contextPrompt: projectContext } = await loadContextForInjection(session.getAuthToken(), workingDirectory, projects);
    logger.debug(`[DROID-START] Knowledge base context: ${projectContext ? `${projectContext.length} chars loaded` : 'none'}`);

    logger.infoDeveloper(`Session: ${response.id}`);
    logger.infoDeveloper(`Logs: ${logger.logFilePath}`);

    session.updateAgentState((currentState) => ({
        ...currentState,
        controlledByUser: options.startingMode !== 'remote'
    }));

    const caffeinateStarted = startCaffeinate();
    if (caffeinateStarted) {
        logger.infoDeveloper('Sleep prevention enabled (macOS)');
    }

    const messageQueue = new MessageQueue2<DroidEnhancedMode>(mode => hashObject({
        model: mode.model,
        appendSystemPrompt: mode.appendSystemPrompt,
        permissionMode: mode.permissionMode,
        allowedTools: mode.allowedTools,
        disallowedTools: mode.disallowedTools,
    }));

    let currentPermissionMode: string | undefined = 'default';
    let currentModel = options.model;
    let currentAppendSystemPrompt: string | undefined = undefined;
    let currentAllowedTools: string[] | undefined = undefined;
    let currentDisallowedTools: string[] | undefined = undefined;

    session.onUserMessage((message) => {
        let messagePermissionMode = currentPermissionMode;
        if (message.meta?.permissionMode) {
            messagePermissionMode = message.meta.permissionMode;
            currentPermissionMode = messagePermissionMode;
        }

        let messageModel = currentModel;
        if (message.meta?.hasOwnProperty('model')) {
            messageModel = message.meta.model || undefined;
            currentModel = messageModel;
        }

        let messageAppendSystemPrompt = currentAppendSystemPrompt;
        if (message.meta?.hasOwnProperty('appendSystemPrompt')) {
            messageAppendSystemPrompt = message.meta.appendSystemPrompt || undefined;
            currentAppendSystemPrompt = messageAppendSystemPrompt;
        }

        let messageAllowedTools = currentAllowedTools;
        if (message.meta?.hasOwnProperty('allowedTools')) {
            messageAllowedTools = message.meta.allowedTools || undefined;
            currentAllowedTools = messageAllowedTools;
        }

        let messageDisallowedTools = currentDisallowedTools;
        if (message.meta?.hasOwnProperty('disallowedTools')) {
            messageDisallowedTools = message.meta.disallowedTools || undefined;
            currentDisallowedTools = messageDisallowedTools;
        }

        const messageText = Array.isArray(message.content)
            ? message.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
            : message.content.text;

        const queueContent = Array.isArray(message.content) ? message.content : messageText;

        const enhancedMode: DroidEnhancedMode = {
            permissionMode: messagePermissionMode || 'default',
            model: messageModel,
            appendSystemPrompt: messageAppendSystemPrompt,
            allowedTools: messageAllowedTools,
            disallowedTools: messageDisallowedTools,
        };

        messageQueue.push(queueContent, enhancedMode);
        logger.debugLargeJson('Droid user message pushed to queue:', message);
    });

    // Cleanup handler
    let currentDroidSession: DroidSession | null = null;
    const cleanup = async () => {
        logger.debug('[DROID-START] Cleaning up...');

        // Write lastSeq to session info file so daemon can use it for restart/agent-switch
        try {
            if (existsSync(sessionInfoFilePath)) {
                const existing = JSON.parse(readFileSync(sessionInfoFilePath, 'utf-8'));
                existing.lastSeq = session.getLastSeq();
                writeFileSync(sessionInfoFilePath, JSON.stringify(existing), { mode: 0o600 });
                logger.debug(`[DROID-START] Wrote lastSeq=${existing.lastSeq} to session info file`);
            }
        } catch (err) {
            logger.debug('[DROID-START] Failed to write lastSeq to session info file:', err);
        }

        try {
            if (session) {
                session.updateMetadata((currentMetadata) => ({
                    ...currentMetadata,
                    lifecycleState: 'archived',
                    lifecycleStateSince: Date.now(),
                    archivedBy: 'cli',
                    archiveReason: 'User terminated'
                }));
                currentDroidSession?.cleanup();
                session.sendSessionDeath();
                await session.flush();
                await session.close();
            }
            stopCaffeinate();

            // Stop Happy MCP server and remove from Droid config
            happyServer.stop();
            removeDroidMcpServer('happy');

            logger.debug('[DROID-START] Cleanup complete');
            process.exit(0);
        } catch (error) {
            logger.debug('[DROID-START] Error during cleanup:', error);
            process.exit(1);
        }
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('uncaughtException', (error) => {
        logger.debug('[DROID-START] Uncaught exception:', error);
        cleanup();
    });
    process.on('unhandledRejection', (reason) => {
        logger.debug('[DROID-START] Unhandled rejection:', reason);
        cleanup();
    });

    registerKillSessionHandler(session.rpcHandlerManager, cleanup);

    const exitCode = await droidLoop({
        path: workingDirectory,
        startingMode: options.startingMode,
        resumeDroidSessionId: options.resumeDroidSessionId,
        messageQueue,
        api,
        onModeChange: (newMode) => {
            session.sendSessionEvent({ type: 'switch', mode: newMode });
            session.updateAgentState((currentState) => ({
                ...currentState,
                controlledByUser: newMode === 'local'
            }));
        },
        onSessionReady: (droidSession) => {
            currentDroidSession = droidSession;
            // Persist droidSessionId to session info file for reactivation support
            const originalOnSessionFound = droidSession.onSessionFound;
            droidSession.onSessionFound = (sessionId: string) => {
                originalOnSessionFound(sessionId);
                try {
                    const existing = JSON.parse(readFileSync(sessionInfoFilePath, 'utf-8'));
                    existing.claudeSessionId = sessionId;
                    writeFileSync(sessionInfoFilePath, JSON.stringify(existing), { mode: 0o600 });
                    logger.debug(`[DROID-START] Updated session info with droidSessionId: ${sessionId}`);
                } catch (err) {
                    logger.debug('[DROID-START] Failed to update session info with droidSessionId:', err);
                }
            };
        },
        session,
        projects,
        projectContext,
    });

    (currentDroidSession as DroidSession | null)?.cleanup();
    session.sendSessionDeath();

    logger.debug('Waiting for socket to flush...');
    await session.flush();
    await session.close();
    stopCaffeinate();

    // Stop Happy MCP server and remove from Droid config
    happyServer.stop();
    removeDroidMcpServer('happy');
    logger.debug('Stopped Happy MCP server');

    process.exit(exitCode);
}

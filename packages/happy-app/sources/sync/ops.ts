/**
 * Session operations for remote procedure calls
 * Provides strictly typed functions for all session-related RPC operations
 */

import { apiSocket } from './apiSocket';
import { sync } from './sync';
import { storage } from './storage';
import { TokenStorage } from '@/auth/tokenStorage';
import type { MachineMetadata, Metadata, AutoConfirmMode } from './storageTypes';

// Strict type definitions for all operations

// Permission operation types
interface SessionPermissionRequest {
    id: string;
    approved: boolean;
    reason?: string;
    mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
    allowTools?: string[];
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
}

// Mode change operation types
interface SessionModeChangeRequest {
    to: 'remote' | 'local';
}

// Bash operation types
interface SessionBashRequest {
    command: string;
    cwd?: string;
    timeout?: number;
}

interface SessionBashResponse {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
}

// Read file operation types
interface SessionReadFileRequest {
    path: string;
}

interface SessionReadFileResponse {
    success: boolean;
    content?: string; // base64 encoded
    error?: string;
}

// Write file operation types
interface SessionWriteFileRequest {
    path: string;
    content: string; // base64 encoded
    expectedHash?: string | null;
}

interface SessionWriteFileResponse {
    success: boolean;
    hash?: string;
    error?: string;
}

// List directory operation types
interface SessionListDirectoryRequest {
    path: string;
}

interface DirectoryEntry {
    name: string;
    type: 'file' | 'directory' | 'other';
    size?: number;
    modified?: number;
}

interface SessionListDirectoryResponse {
    success: boolean;
    entries?: DirectoryEntry[];
    error?: string;
}

// Directory tree operation types
interface SessionGetDirectoryTreeRequest {
    path: string;
    maxDepth: number;
}

interface TreeNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    modified?: number;
    children?: TreeNode[];
}

interface SessionGetDirectoryTreeResponse {
    success: boolean;
    tree?: TreeNode;
    error?: string;
}

// Ripgrep operation types
interface SessionRipgrepRequest {
    args: string[];
    cwd?: string;
}

interface SessionRipgrepResponse {
    success: boolean;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
}

// Kill session operation types
interface SessionKillRequest {
    // No parameters needed
}

interface SessionKillResponse {
    success: boolean;
    message: string;
}

// Response types for spawn session
export type SpawnSessionResult =
    | { type: 'success'; sessionId: string }
    | { type: 'requestToApproveDirectoryCreation'; directory: string }
    | { type: 'error'; errorMessage: string };

// Options for spawning a session
export interface SpawnSessionOptions {
    machineId: string;
    directory: string;
    approvedNewDirectoryCreation?: boolean;
    token?: string;
    agent?: 'codex' | 'claude' | 'gemini' | 'droid' | 'opencode';
    // Environment variables from AI backend profile
    // Accepts any environment variables - daemon will pass them to the agent process
    // Common variables include:
    // - ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_MODEL, ANTHROPIC_SMALL_FAST_MODEL
    // - OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_API_TIMEOUT_MS
    // - AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_VERSION, AZURE_OPENAI_DEPLOYMENT_NAME
    // - TOGETHER_API_KEY, TOGETHER_MODEL
    // - FACTORY_API_KEY
    // - TMUX_SESSION_NAME, TMUX_TMPDIR, TMUX_UPDATE_ENVIRONMENT
    // - API_TIMEOUT_MS, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
    // - Custom variables (DEEPSEEK_*, Z_AI_*, etc.)
    environmentVariables?: Record<string, string>;
}

// Exported session operation functions

/**
 * Spawn a new remote session on a specific machine
 */
export async function machineSpawnNewSession(options: SpawnSessionOptions): Promise<SpawnSessionResult> {

    const { machineId, directory, approvedNewDirectoryCreation = false, token, agent, environmentVariables } = options;

    try {
        // Check if this is a shared machine - if so, include user credentials
        const machine = storage.getState().machines[machineId];
        let happyAuthToken: string | undefined;
        let happyAuthSecret: string | undefined;
        if (machine && !machine.isOwned) {
            const credentials = await TokenStorage.getCredentials();
            if (credentials) {
                happyAuthToken = credentials.token;
                happyAuthSecret = credentials.secret;
            }
        }

        const result = await apiSocket.machineRPC<SpawnSessionResult, {
            type: 'spawn-in-directory'
            directory: string
            approvedNewDirectoryCreation?: boolean,
            token?: string,
            agent?: 'codex' | 'claude' | 'gemini' | 'droid' | 'opencode',
            environmentVariables?: Record<string, string>;
            happyAuthToken?: string;
            happyAuthSecret?: string;
        }>(
            machineId,
            'spawn-happy-session',
            { type: 'spawn-in-directory', directory, approvedNewDirectoryCreation, token, agent, environmentVariables, happyAuthToken, happyAuthSecret }
        );
        return result;
    } catch (error) {
        // Handle RPC errors
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to spawn session'
        };
    }
}

/**
 * Reactivate a stopped session on a specific machine
 * When a user sends a message to an inactive session, this triggers the daemon
 * to spawn a new CLI process that reconnects to the same Happy session with --resume
 */
export async function machineReactivateSession(options: {
    machineId: string;
    happySessionId: string;
    directory: string;
    claudeSessionId?: string;
    agent?: 'codex' | 'claude' | 'gemini' | 'droid' | 'opencode';
}): Promise<SpawnSessionResult> {
    const { machineId, ...params } = options;
    try {
        const result = await apiSocket.machineRPC<SpawnSessionResult, typeof params>(
            machineId,
            'reactivate-session',
            params
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to reactivate session'
        };
    }
}

/**
 * Switch the agent type for an existing session.
 * Stops the current CLI process and spawns a new one with the new agent type,
 * reconnecting to the same Happy session so the UI thread is seamless.
 */
export async function machineSwitchSessionAgent(options: {
    machineId: string;
    happySessionId: string;
    directory: string;
    newAgent: 'claude' | 'codex' | 'gemini' | 'droid' | 'opencode';
    dataKey?: string;
}): Promise<SpawnSessionResult> {
    const { machineId, ...params } = options;
    try {
        const result = await apiSocket.machineRPC<SpawnSessionResult, typeof params>(
            machineId,
            'switch-session-agent',
            params
        );
        return result;
    } catch (error) {
        return {
            type: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to switch session agent'
        };
    }
}

/**
 * Stop the daemon on a specific machine
 */
export async function machineStopDaemon(machineId: string): Promise<{ message: string }> {
    const result = await apiSocket.machineRPC<{ message: string }, {}>(
        machineId,
        'stop-daemon',
        {}
    );
    return result;
}

/**
 * Execute a bash command on a specific machine
 */
export async function machineBash(
    machineId: string,
    command: string,
    cwd: string
): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}> {
    try {
        const result = await apiSocket.machineRPC<{
            success: boolean;
            stdout: string;
            stderr: string;
            exitCode: number;
        }, {
            command: string;
            cwd: string;
        }>(
            machineId,
            'bash',
            { command, cwd }
        );
        return result;
    } catch (error) {
        return {
            success: false,
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            exitCode: -1
        };
    }
}

/**
 * Update machine metadata with optimistic concurrency control and automatic retry
 */
export async function machineUpdateMetadata(
    machineId: string,
    metadata: MachineMetadata,
    expectedVersion: number,
    maxRetries: number = 3
): Promise<{ version: number; metadata: string }> {
    let currentVersion = expectedVersion;
    let currentMetadata = { ...metadata };
    let retryCount = 0;

    const machineEncryption = sync.encryption.getMachineEncryption(machineId);
    if (!machineEncryption) {
        throw new Error(`Machine encryption not found for ${machineId}`);
    }

    while (retryCount < maxRetries) {
        const encryptedMetadata = await machineEncryption.encryptRaw(currentMetadata);

        const result = await apiSocket.emitWithAck<{
            result: 'success' | 'version-mismatch' | 'error';
            version?: number;
            metadata?: string;
            message?: string;
        }>('machine-update-metadata', {
            machineId,
            metadata: encryptedMetadata,
            expectedVersion: currentVersion
        });

        if (result.result === 'success') {
            return {
                version: result.version!,
                metadata: result.metadata!
            };
        } else if (result.result === 'version-mismatch') {
            // Get the latest version and metadata from the response
            currentVersion = result.version!;
            const latestMetadata = await machineEncryption.decryptRaw(result.metadata!) as MachineMetadata;

            // Merge our changes with the latest metadata
            // Preserve the displayName we're trying to set, but use latest values for other fields
            currentMetadata = {
                ...latestMetadata,
                displayName: metadata.displayName // Keep our intended displayName change
            };

            retryCount++;

            // If we've exhausted retries, throw error
            if (retryCount >= maxRetries) {
                throw new Error(`Failed to update after ${maxRetries} retries due to version conflicts`);
            }

            // Otherwise, loop will retry with updated version and merged metadata
        } else {
            throw new Error(result.message || 'Failed to update machine metadata');
        }
    }

    throw new Error('Unexpected error in machineUpdateMetadata');
}

/**
 * Update session summary (name) with optimistic concurrency control and automatic retry
 */
export async function sessionUpdateSummary(
    sessionId: string,
    newName: string,
    maxRetries: number = 3
): Promise<{ success: boolean; message?: string }> {
    const session = storage.getState().sessions[sessionId];
    if (!session) {
        return { success: false, message: 'Session not found' };
    }

    const sessionEncryption = sync.encryption.getSessionEncryption(sessionId);
    if (!sessionEncryption) {
        return { success: false, message: 'Session encryption not found' };
    }

    let currentVersion = session.metadataVersion;
    let currentMetadata: Metadata = session.metadata || {} as Metadata;
    let retryCount = 0;

    while (retryCount < maxRetries) {
        const updatedMetadata: Metadata = {
            ...currentMetadata,
            summary: {
                text: newName,
                updatedAt: Date.now()
            }
        };

        const encryptedMetadata = await sessionEncryption.encryptMetadata(updatedMetadata);

        const result = await apiSocket.emitWithAck<{
            result: 'success' | 'version-mismatch' | 'error';
            version?: number;
            metadata?: string;
            message?: string;
        }>('update-metadata', {
            sid: sessionId,
            metadata: encryptedMetadata,
            expectedVersion: currentVersion
        });

        if (result.result === 'success') {
            return { success: true };
        } else if (result.result === 'version-mismatch') {
            currentVersion = result.version!;
            if (result.metadata) {
                const latestMetadata = await sessionEncryption.decryptMetadata(currentVersion, result.metadata);
                if (latestMetadata) {
                    currentMetadata = latestMetadata;
                }
            }
            retryCount++;
            if (retryCount >= maxRetries) {
                return { success: false, message: 'Failed to update after retries due to version conflicts' };
            }
        } else {
            return { success: false, message: result.message || 'Failed to update session name' };
        }
    }

    return { success: false, message: 'Unexpected error' };
}

/**
 * Set auto-confirm mode for a session
 * - 'off': manual confirmation required
 * - 'confirm': auto-confirm tool permissions only (AskUserQuestion stays manual)
 * - 'all': auto-confirm everything + auto-answer questions
 */
export async function sessionAutoConfirm(sessionId: string, mode: AutoConfirmMode): Promise<void> {
    await apiSocket.sessionRPC(sessionId, 'autoConfirm', { enabled: mode !== 'off', mode });
}

/**
 * Abort the current session operation
 */
export async function sessionAbort(sessionId: string): Promise<void> {
    await apiSocket.sessionRPC(sessionId, 'abort', {
        reason: `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.`
    });
}

/**
 * Allow a permission request
 */
export async function sessionAllow(sessionId: string, id: string, mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan', allowedTools?: string[], decision?: 'approved' | 'approved_for_session'): Promise<void> {
    const request: SessionPermissionRequest = { id, approved: true, mode, allowTools: allowedTools, decision };
    await apiSocket.sessionRPC(sessionId, 'permission', request);
}

/**
 * Deny a permission request
 */
export async function sessionDeny(sessionId: string, id: string, mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan', allowedTools?: string[], decision?: 'denied' | 'abort'): Promise<void> {
    const request: SessionPermissionRequest = { id, approved: false, mode, allowTools: allowedTools, decision };
    await apiSocket.sessionRPC(sessionId, 'permission', request);
}

/**
 * Request mode change for a session
 */
export async function sessionSwitch(sessionId: string, to: 'remote' | 'local'): Promise<boolean> {
    const request: SessionModeChangeRequest = { to };
    const response = await apiSocket.sessionRPC<boolean, SessionModeChangeRequest>(
        sessionId,
        'switch',
        request,
    );
    return response;
}

/**
 * Execute a bash command in the session
 */
export async function sessionBash(sessionId: string, request: SessionBashRequest): Promise<SessionBashResponse> {
    try {
        const response = await apiSocket.sessionRPC<SessionBashResponse, SessionBashRequest>(
            sessionId,
            'bash',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            stdout: '',
            stderr: error instanceof Error ? error.message : 'Unknown error',
            exitCode: -1,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Read a file from the session
 */
export async function sessionReadFile(sessionId: string, path: string): Promise<SessionReadFileResponse> {
    try {
        const request: SessionReadFileRequest = { path };
        const response = await apiSocket.sessionRPC<SessionReadFileResponse, SessionReadFileRequest>(
            sessionId,
            'readFile',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Write a file to the session
 */
export async function sessionWriteFile(
    sessionId: string,
    path: string,
    content: string,
    expectedHash?: string | null
): Promise<SessionWriteFileResponse> {
    try {
        const request: SessionWriteFileRequest = { path, content, expectedHash };
        const response = await apiSocket.sessionRPC<SessionWriteFileResponse, SessionWriteFileRequest>(
            sessionId,
            'writeFile',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * List directory contents in the session
 */
export async function sessionListDirectory(sessionId: string, path: string): Promise<SessionListDirectoryResponse> {
    try {
        const request: SessionListDirectoryRequest = { path };
        const response = await apiSocket.sessionRPC<SessionListDirectoryResponse, SessionListDirectoryRequest>(
            sessionId,
            'listDirectory',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Get directory tree from the session
 */
export async function sessionGetDirectoryTree(
    sessionId: string,
    path: string,
    maxDepth: number
): Promise<SessionGetDirectoryTreeResponse> {
    try {
        const request: SessionGetDirectoryTreeRequest = { path, maxDepth };
        const response = await apiSocket.sessionRPC<SessionGetDirectoryTreeResponse, SessionGetDirectoryTreeRequest>(
            sessionId,
            'getDirectoryTree',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Run ripgrep in the session
 */
export async function sessionRipgrep(
    sessionId: string,
    args: string[],
    cwd?: string
): Promise<SessionRipgrepResponse> {
    try {
        const request: SessionRipgrepRequest = { args, cwd };
        const response = await apiSocket.sessionRPC<SessionRipgrepResponse, SessionRipgrepRequest>(
            sessionId,
            'ripgrep',
            request
        );
        return response;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Kill the session process immediately.
 * Prefers stopping via the daemon's stopSession (which properly removes the process
 * from tracking to prevent auto-respawn). Falls back to direct sessionRPC killSession.
 */
export async function sessionKill(sessionId: string): Promise<SessionKillResponse> {
    // Try daemon route first — this properly removes the session from tracking
    // so the daemon won't auto-respawn it after it exits
    const session = storage.getState().sessions[sessionId];
    const machineId = session?.metadata?.machineId;
    if (machineId) {
        try {
            await apiSocket.machineRPC<{ success: boolean }, { sessionId: string }>(
                machineId,
                'stop-session',
                { sessionId }
            );
            return { success: true, message: 'Session stopped via daemon' };
        } catch {
            // Daemon route failed (e.g. daemon offline), fall through to direct RPC
        }
    }

    // Fallback: send killSession directly to the CLI process
    try {
        const response = await apiSocket.sessionRPC<SessionKillResponse, {}>(
            sessionId,
            'killSession',
            {}
        );
        return response;
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Archive a session: kill the process AND mark it as archived on the server.
 * Archived sessions cannot be reactivated by daemon keepalives.
 */
export async function sessionArchive(sessionId: string): Promise<{ success: boolean; message?: string }> {
    // Kill the process first (best-effort)
    try {
        await Promise.race([
            sessionKill(sessionId),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error('kill timeout')), 3000))
        ]);
    } catch {
        // Ignore - session might already be offline
    }

    // Mark as archived on the server so it won't be reactivated
    try {
        const response = await apiSocket.request(`/v1/sessions/${sessionId}/archive`, {
            method: 'POST'
        });

        if (response.ok) {
            // Optimistic update: mark session as inactive locally
            const session = storage.getState().sessions[sessionId];
            if (session) {
                storage.getState().applySessions([{ ...session, active: false }]);
            }
            return { success: true };
        } else {
            const error = await response.text();
            return {
                success: false,
                message: error || 'Failed to archive session'
            };
        }
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

interface SessionRestartResponse {
    success: boolean;
    message: string;
}

/**
 * Restart the session process to pick up new code.
 * The conversation continues from where it left off.
 */
export async function sessionRestart(sessionId: string): Promise<SessionRestartResponse> {
    try {
        const response = await apiSocket.sessionRPC<SessionRestartResponse, {}>(
            sessionId,
            'restartSession',
            {}
        );
        return response;
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Permanently delete a session from the server
 * This will remove the session and all its associated data (messages, usage reports, access keys)
 * Also attempts to kill the running CLI process first (best-effort) so it stops occupying memory
 */
export async function sessionDelete(sessionId: string): Promise<{ success: boolean; message?: string }> {
    // Best-effort: try to kill the running process first.
    // Use a short timeout since the session may already be offline.
    try {
        await Promise.race([
            sessionKill(sessionId),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error('kill timeout')), 3000))
        ]);
    } catch {
        // Ignore - session might already be offline or unresponsive
    }

    // Then delete the DB record
    try {
        const response = await apiSocket.request(`/v1/sessions/${sessionId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            const result = await response.json();
            // Optimistic update: immediately remove from local state
            // instead of waiting for WebSocket notification
            storage.getState().deleteSession(sessionId);
            return { success: true };
        } else {
            const error = await response.text();
            return {
                success: false,
                message: error || 'Failed to delete session'
            };
        }
    } catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// Export types for external use
export type {
    SessionBashRequest,
    SessionBashResponse,
    SessionReadFileResponse,
    SessionWriteFileResponse,
    SessionListDirectoryResponse,
    DirectoryEntry,
    SessionGetDirectoryTreeResponse,
    TreeNode,
    SessionRipgrepResponse,
    SessionKillResponse,
    SessionRestartResponse
};
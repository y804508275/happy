/**
 * `happy local` command - Run Happy in fully local standalone mode.
 *
 * Starts a local Happy server (with PGlite embedded DB) + daemon,
 * allowing users to access Happy via http://localhost:3005 in their browser.
 * All data stays on the user's machine.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { logger } from '@/ui/logger';
import { isBun } from '@/utils/runtime';
import { projectPath } from '@/projectPath';

const LOCAL_PORT = 3005;
const LOCAL_DATA_DIR = join(homedir(), '.happy', 'local-server');
const LOCAL_STATE_FILE = join(LOCAL_DATA_DIR, 'local.state.json');

interface LocalState {
    serverPid: number;
    startedAt: string;
    port: number;
}

function readLocalState(): LocalState | null {
    try {
        if (existsSync(LOCAL_STATE_FILE)) {
            return JSON.parse(readFileSync(LOCAL_STATE_FILE, 'utf-8'));
        }
    } catch {
        // Corrupted state file
    }
    return null;
}

function writeLocalState(state: LocalState): void {
    mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    writeFileSync(LOCAL_STATE_FILE, JSON.stringify(state, null, 2));
}

function clearLocalState(): void {
    try {
        if (existsSync(LOCAL_STATE_FILE)) {
            unlinkSync(LOCAL_STATE_FILE);
        }
    } catch {
        // Ignore
    }
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/**
 * Find the happy-server standalone.ts entry point.
 * Uses projectPath() (happy-cli root) to navigate to sibling packages.
 */
function findServerEntrypoint(): string | null {
    const root = projectPath(); // happy-cli package root
    const candidates = [
        // Monorepo sibling: packages/happy-server/sources/standalone.ts
        resolve(root, '..', 'happy-server', 'sources', 'standalone.ts'),
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

/**
 * Find the web app dist directory.
 */
function findWebAppDist(): string | null {
    const root = projectPath();
    const candidates = [
        resolve(root, '..', 'happy-app', 'dist'),
    ];
    for (const candidate of candidates) {
        if (existsSync(join(candidate, 'index.html'))) {
            return candidate;
        }
    }
    return null;
}

async function waitForServer(port: number, timeoutMs: number = 15000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`http://localhost:${port}/`, {
                signal: AbortSignal.timeout(2000)
            });
            if (response.ok || response.status === 401) {
                return true;
            }
        } catch {
            // Not ready yet
        }
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

export async function handleLocalCommand(subcommand: string | undefined): Promise<void> {
    switch (subcommand) {
        case 'start':
            await startLocal();
            break;
        case 'stop':
            await stopLocal();
            break;
        case 'status':
            await statusLocal();
            break;
        default:
            printLocalHelp();
            break;
    }
}

async function startLocal(): Promise<void> {
    // Check if already running
    const state = readLocalState();
    if (state && isProcessAlive(state.serverPid)) {
        console.log(chalk.yellow('Local Happy server is already running.'));
        console.log(`  ${chalk.cyan(`http://localhost:${state.port}`)}`);
        return;
    }

    // Clean up stale state
    if (state) {
        clearLocalState();
    }

    // Find server entrypoint
    const serverEntry = findServerEntrypoint();
    if (!serverEntry) {
        console.error(chalk.red('Could not find happy-server. Make sure you are running from the Happy monorepo or install the standalone binary.'));
        process.exit(1);
    }

    // Find web app dist
    const webAppDist = findWebAppDist();
    if (!webAppDist) {
        console.log(chalk.yellow('Web app dist not found. The server will start without the web UI.'));
        console.log(chalk.gray('  To build the web app: cd packages/happy-app && yarn web:export'));
    }

    // Ensure data directory exists
    mkdirSync(LOCAL_DATA_DIR, { recursive: true });

    console.log(chalk.blue('Starting local Happy server...'));

    // Prepare environment
    const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        DATA_DIR: LOCAL_DATA_DIR,
        PORT: String(LOCAL_PORT),
    };

    // Set static dir if web app is available
    if (webAppDist) {
        env.HAPPY_STATIC_DIR = webAppDist;
    }

    // Spawn standalone server
    const runtime = isBun() ? 'bun' : 'tsx';
    const serverProcess = spawn(runtime, [serverEntry, 'serve'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
    });

    serverProcess.unref();

    if (!serverProcess.pid) {
        console.error(chalk.red('Failed to start server process.'));
        process.exit(1);
    }

    // Capture early output for debugging
    let serverOutput = '';
    serverProcess.stdout?.on('data', (data: Buffer) => {
        serverOutput += data.toString();
    });
    serverProcess.stderr?.on('data', (data: Buffer) => {
        serverOutput += data.toString();
    });

    // Wait for server to be ready
    console.log(chalk.gray('  Waiting for server to be ready...'));
    const ready = await waitForServer(LOCAL_PORT);

    if (!ready) {
        console.error(chalk.red('Server failed to start within timeout.'));
        if (serverOutput) {
            console.error(chalk.gray('Server output:'));
            console.error(serverOutput);
        }
        try {
            serverProcess.kill('SIGTERM');
        } catch {}
        process.exit(1);
    }

    // Write state
    writeLocalState({
        serverPid: serverProcess.pid,
        startedAt: new Date().toISOString(),
        port: LOCAL_PORT,
    });

    // Detach stdout/stderr handlers after startup
    serverProcess.stdout?.removeAllListeners('data');
    serverProcess.stderr?.removeAllListeners('data');

    console.log('');
    console.log(chalk.green('  Local Happy server is running!'));
    console.log('');
    if (webAppDist) {
        console.log(`  ${chalk.bold('Open in browser:')} ${chalk.cyan(`http://localhost:${LOCAL_PORT}`)}`);
    } else {
        console.log(`  ${chalk.bold('API endpoint:')} ${chalk.cyan(`http://localhost:${LOCAL_PORT}`)}`);
        console.log(chalk.gray('  (Web UI not available — build happy-app first)'));
    }
    console.log('');
    console.log(chalk.gray(`  To connect daemon: HAPPY_SERVER_URL=http://localhost:${LOCAL_PORT} happy daemon start`));
    console.log(chalk.gray('  To stop:           happy local stop'));
    console.log('');
}

async function stopLocal(): Promise<void> {
    const state = readLocalState();

    if (!state) {
        console.log(chalk.gray('No local server state found.'));
        return;
    }

    if (!isProcessAlive(state.serverPid)) {
        console.log(chalk.gray('Local server process is not running (stale state). Cleaning up.'));
        clearLocalState();
        return;
    }

    console.log(chalk.blue(`Stopping local Happy server (PID ${state.serverPid})...`));

    try {
        process.kill(state.serverPid, 'SIGTERM');

        // Wait for graceful exit
        for (let i = 0; i < 20; i++) {
            if (!isProcessAlive(state.serverPid)) {
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }

        // Force kill if still alive
        if (isProcessAlive(state.serverPid)) {
            process.kill(state.serverPid, 'SIGKILL');
        }
    } catch {
        // Already dead
    }

    clearLocalState();
    console.log(chalk.green('Local Happy server stopped.'));
}

async function statusLocal(): Promise<void> {
    const state = readLocalState();

    if (!state) {
        console.log(chalk.gray('Local Happy server is not running.'));
        return;
    }

    if (!isProcessAlive(state.serverPid)) {
        console.log(chalk.yellow('Local Happy server is not running (stale state).'));
        clearLocalState();
        return;
    }

    console.log(chalk.green('Local Happy server is running'));
    console.log(`  PID:        ${state.serverPid}`);
    console.log(`  Port:       ${state.port}`);
    console.log(`  Started:    ${state.startedAt}`);
    console.log(`  URL:        ${chalk.cyan(`http://localhost:${state.port}`)}`);
    console.log(`  Data:       ${LOCAL_DATA_DIR}`);
}

function printLocalHelp(): void {
    console.log(`
${chalk.bold('happy local')} - Run Happy in local standalone mode

${chalk.bold('Usage:')}
  happy local start             Start local Happy server (localhost:${LOCAL_PORT})
  happy local stop              Stop local Happy server
  happy local status            Show local server status

${chalk.bold('Description:')}
  Runs a fully local Happy server with embedded database.
  Access the web UI at ${chalk.cyan(`http://localhost:${LOCAL_PORT}`)}
  All data stays on your machine — no cloud connection needed.

${chalk.bold('To connect your Claude Code daemon:')}
  ${chalk.cyan(`HAPPY_SERVER_URL=http://localhost:${LOCAL_PORT} happy daemon start`)}
`);
}

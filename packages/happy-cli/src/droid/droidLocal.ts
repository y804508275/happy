import { spawn } from "node:child_process";
import { logger } from "@/ui/logger";

export class ExitCodeError extends Error {
    public readonly exitCode: number;
    constructor(exitCode: number) {
        super(`Process exited with code: ${exitCode}`);
        this.name = 'ExitCodeError';
        this.exitCode = exitCode;
    }
}

export async function droidLocal(opts: {
    abort: AbortSignal,
    sessionId: string | null,
    path: string,
    onSessionFound: (id: string) => void,
    onThinkingChange?: (thinking: boolean) => void,
}) {
    try {
        process.stdin.pause();
        await new Promise<void>((resolve, reject) => {
            const args: string[] = [];

            // Resume existing session if we have one
            if (opts.sessionId) {
                args.push('--resume', opts.sessionId);
            }

            logger.debug(`[DroidLocal] Spawning droid: droid ${args.join(' ')}`);

            const child = spawn('droid', args, {
                stdio: 'inherit',
                signal: opts.abort,
                cwd: opts.path,
                env: process.env,
            });

            child.on('error', (error) => {
                logger.debug('[DroidLocal] Spawn error:', error);
            });

            child.on('exit', (code, signal) => {
                if (signal === 'SIGTERM' && opts.abort.aborted) {
                    resolve();
                } else if (signal) {
                    reject(new Error(`Process terminated with signal: ${signal}`));
                } else if (code !== 0 && code !== null) {
                    reject(new ExitCodeError(code));
                } else {
                    resolve();
                }
            });
        });
    } finally {
        process.stdin.resume();
    }
}

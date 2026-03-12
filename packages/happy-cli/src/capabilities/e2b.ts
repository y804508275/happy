import { Sandbox } from '@e2b/desktop';
import { logger } from '@/lib';

const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

export interface SandboxOptions {
    apiKey?: string;
    timeoutMs?: number;
}

export class E2BSandbox {
    private sandbox: Sandbox | null = null;
    private apiKey: string;
    private timeoutMs: number;
    private streamUrl: string | null = null;

    constructor(options: SandboxOptions = {}) {
        const key = options.apiKey ?? process.env.E2B_API_KEY;
        if (!key) {
            throw new Error('E2B_API_KEY is required. Set it as an environment variable or pass it in options.');
        }
        this.apiKey = key;
        this.timeoutMs = options.timeoutMs ?? SANDBOX_TIMEOUT_MS;
    }

    async init(): Promise<void> {
        if (this.sandbox) return;
        logger.debug('[E2B] Creating desktop sandbox...');
        this.sandbox = await Sandbox.create({
            apiKey: this.apiKey,
            timeoutMs: this.timeoutMs,
            resolution: [1280, 720],
            dpi: 96,
        });
        logger.debug(`[E2B] Desktop sandbox created: ${this.sandbox.sandboxId}`);

        // Start VNC stream
        await this.sandbox.stream.start();
        this.streamUrl = this.sandbox.stream.getUrl();
        logger.debug(`[E2B] Stream URL: ${this.streamUrl}`);
    }

    private ensureSandbox(): Sandbox {
        if (!this.sandbox) {
            throw new Error('Sandbox not initialized. Call init() first.');
        }
        return this.sandbox;
    }

    getStreamUrl(): string | null {
        return this.streamUrl;
    }

    // --- Browser operations (using desktop sandbox's built-in browser) ---

    async browserNavigate(url: string): Promise<{ title: string; text: string; screenshotBase64: string | null }> {
        const sb = this.ensureSandbox();
        logger.debug(`[E2B] browserNavigate: ${url}`);

        await sb.open(url);
        return { title: url, text: '', screenshotBase64: null };
    }

    async browserScreenshot(): Promise<string> {
        const sb = this.ensureSandbox();
        const screenshot = await sb.screenshot();
        return Buffer.from(screenshot).toString('base64');
    }

    // --- File system operations ---

    async fileRead(path: string): Promise<string> {
        const sb = this.ensureSandbox();
        return await sb.files.read(path);
    }

    async fileWrite(path: string, content: string): Promise<void> {
        const sb = this.ensureSandbox();
        await sb.files.write(path, content);
    }

    async fileList(path: string): Promise<string[]> {
        const sb = this.ensureSandbox();
        const entries = await sb.files.list(path);
        return entries.map(e => e.name);
    }

    // --- Code execution ---

    async runCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
        const sb = this.ensureSandbox();
        const result = await sb.commands.run(command, { timeoutMs: 60_000 });
        return {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
        };
    }

    // --- Lifecycle ---

    async close(): Promise<void> {
        if (this.sandbox) {
            logger.debug(`[E2B] Killing sandbox: ${this.sandbox.sandboxId}`);
            try {
                await this.sandbox.kill();
            } catch (e) {
                logger.debug(`[E2B] Sandbox kill error (ignored): ${e}`);
            }
            this.sandbox = null;
            this.streamUrl = null;
        }
    }

    get isInitialized(): boolean {
        return this.sandbox !== null;
    }

    get sandboxId(): string | null {
        return this.sandbox?.sandboxId ?? null;
    }
}

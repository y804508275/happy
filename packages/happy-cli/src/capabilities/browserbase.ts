import Browserbase from '@browserbasehq/sdk';
import { chromium, type Browser, type Page } from 'playwright';
import { logger } from '@/lib';

export interface BrowserbaseOptions {
    apiKey?: string;
    projectId?: string;
}

export class BrowserbaseSandbox {
    private bb: Browserbase;
    private projectId: string;
    private sessionId: string | null = null;
    private connectUrl: string | null = null;
    private liveViewUrl: string | null = null;
    private browser: Browser | null = null;
    private page: Page | null = null;

    constructor(options: BrowserbaseOptions = {}) {
        const apiKey = options.apiKey ?? process.env.BROWSERBASE_API_KEY;
        if (!apiKey) {
            throw new Error('BROWSERBASE_API_KEY is required.');
        }
        this.projectId = options.projectId ?? process.env.BROWSERBASE_PROJECT_ID ?? '';
        if (!this.projectId) {
            throw new Error('BROWSERBASE_PROJECT_ID is required.');
        }
        this.bb = new Browserbase({ apiKey });
    }

    async init(): Promise<void> {
        if (this.browser) return;
        logger.debug('[Browserbase] Creating session...');

        const session = await this.bb.sessions.create({
            projectId: this.projectId,
            keepAlive: true,
            timeout: 600, // 10 minutes
        });
        this.sessionId = session.id;
        this.connectUrl = session.connectUrl;
        logger.debug(`[Browserbase] Session created: ${this.sessionId}`);

        // Get live view URL
        const debug = await this.bb.sessions.debug(this.sessionId);
        this.liveViewUrl = `${debug.debuggerFullscreenUrl}&navbar=false`;
        logger.debug(`[Browserbase] Live View URL: ${this.liveViewUrl}`);

        // Connect Playwright
        this.browser = await chromium.connectOverCDP(this.connectUrl);
        const contexts = this.browser.contexts();
        const context = contexts[0] ?? await this.browser.newContext();
        this.page = context.pages()[0] ?? await context.newPage();
        logger.debug('[Browserbase] Playwright connected');
    }

    getLiveViewUrl(): string | null {
        return this.liveViewUrl;
    }

    private ensurePage(): Page {
        if (!this.page) throw new Error('Not initialized. Call init() first.');
        return this.page;
    }

    async navigate(url: string): Promise<{ title: string }> {
        const page = this.ensurePage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        return { title };
    }

    async screenshot(): Promise<string> {
        const page = this.ensurePage();
        const buf = await page.screenshot({ type: 'png' });
        return buf.toString('base64');
    }

    async close(): Promise<void> {
        if (this.browser) {
            logger.debug(`[Browserbase] Closing session: ${this.sessionId}`);
            try { await this.browser.close(); } catch {}
            this.browser = null;
            this.page = null;
        }
        if (this.sessionId) {
            try {
                await this.bb.sessions.update(this.sessionId, { status: 'REQUEST_RELEASE' });
            } catch {}
            this.sessionId = null;
        }
    }

    get isInitialized(): boolean {
        return this.browser !== null;
    }
}

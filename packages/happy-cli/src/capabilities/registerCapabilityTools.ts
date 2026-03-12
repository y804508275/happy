import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@/ui/logger";
import { BrowserbaseSandbox } from "./browserbase";
import { configuration } from "@/configuration";

function resolveEnvKey(name: string): string | undefined {
    if (process.env[name]) return process.env[name];
    try {
        const envFile = join(configuration.happyHomeDir, 'capabilities.env');
        const content = readFileSync(envFile, 'utf-8');
        const match = content.match(new RegExp(`^${name}=(.+)$`, 'm'));
        if (match?.[1]) {
            process.env[name] = match[1].trim();
            return process.env[name];
        }
    } catch {}
    return undefined;
}

export interface PreviewEmitter {
    sendPreview(preview: { kind: 'screenshot' | 'url' | 'html' | 'text'; url?: string; title?: string; body?: string }): void;
}

let bbSandbox: BrowserbaseSandbox | null = null;
let liveViewSent = false;

async function getBrowser(emitter?: PreviewEmitter): Promise<BrowserbaseSandbox> {
    if (bbSandbox?.isInitialized) return bbSandbox;

    liveViewSent = false;
    bbSandbox = new BrowserbaseSandbox({
        apiKey: resolveEnvKey('BROWSERBASE_API_KEY'),
        projectId: resolveEnvKey('BROWSERBASE_PROJECT_ID'),
    });
    await bbSandbox.init();

    // Send live view URL to App immediately
    const liveUrl = bbSandbox.getLiveViewUrl();
    if (liveUrl && emitter && !liveViewSent) {
        logger.debug(`[capabilities] Sending Live View URL: ${liveUrl}`);
        emitter.sendPreview({ kind: 'url', url: liveUrl, title: 'Live Browser' });
        liveViewSent = true;
    }

    return bbSandbox;
}

export async function cleanupCapabilitySandbox(): Promise<void> {
    if (bbSandbox) {
        await bbSandbox.close();
        bbSandbox = null;
    }
}

export function registerCapabilityTools(mcp: McpServer, emitter?: PreviewEmitter): string[] {
    const apiKey = resolveEnvKey('BROWSERBASE_API_KEY');
    const projectId = resolveEnvKey('BROWSERBASE_PROJECT_ID');
    if (!apiKey || !projectId) {
        logger.debug('[capabilities] BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID not set, skipping');
        return [];
    }

    mcp.registerTool('browser_navigate', {
        description: 'Open a URL in a cloud browser and return the page title, text content, and a screenshot. Use this when you need to view web pages, analyze websites, or gather online information.',
        title: 'Browser Navigate',
        inputSchema: {
            url: z.string().describe('The URL to navigate to'),
        },
    }, async (args) => {
        try {
            logger.debug(`[capabilities] browser_navigate: ${args.url}`);
            const bb = await getBrowser(emitter);
            const result = await bb.navigate(args.url);
            return {
                content: [{ type: 'text' as const, text: `Navigated to ${args.url}\nTitle: ${result.title}` }],
                isError: false,
            };
        } catch (error: any) {
            logger.debug(`[capabilities] browser_navigate error: ${error.message}`);
            return {
                content: [{ type: 'text' as const, text: `Navigation failed: ${error.message}` }],
                isError: true,
            };
        }
    });

    mcp.registerTool('browser_screenshot', {
        description: 'Take a screenshot of the current browser page. Requires a previous browser_navigate call.',
        title: 'Browser Screenshot',
        inputSchema: {},
    }, async () => {
        try {
            const bb = await getBrowser(emitter);
            const screenshot = await bb.screenshot();
            return {
                content: [
                    { type: 'text' as const, text: 'Screenshot captured.' },
                    { type: 'image' as const, data: screenshot, mimeType: 'image/png' },
                ],
                isError: false,
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text' as const, text: `Screenshot failed: ${error.message}` }],
                isError: true,
            };
        }
    });

    const toolNames = ['browser_navigate', 'browser_screenshot'];
    logger.debug(`[capabilities] Registered ${toolNames.length} capability tools (Browserbase)`);
    return toolNames;
}

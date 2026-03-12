/**
 * Standalone Happy Capabilities MCP Server
 *
 * A persistent MCP server that exposes browser capability tools (Browserbase)
 * over stdio. Can be used by any MCP-compatible client: Claude Code, OpenCode, etc.
 *
 * Usage:
 *   node dist/capabilities/standaloneServer.mjs
 *   # or via happy CLI:
 *   happy mcp-capabilities
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { BrowserbaseSandbox } from './browserbase';

const CAPABILITIES_ENV = join(homedir(), '.happy-dev', 'capabilities.env');

function resolveEnvKey(name: string): string | undefined {
    if (process.env[name]) return process.env[name];
    try {
        const content = readFileSync(CAPABILITIES_ENV, 'utf-8');
        const match = content.match(new RegExp(`^${name}=(.+)$`, 'm'));
        if (match?.[1]) {
            process.env[name] = match[1].trim();
            return process.env[name];
        }
    } catch {}
    return undefined;
}

let bbSandbox: BrowserbaseSandbox | null = null;

async function getBrowser(): Promise<BrowserbaseSandbox> {
    if (bbSandbox?.isInitialized) return bbSandbox;
    bbSandbox = new BrowserbaseSandbox({
        apiKey: resolveEnvKey('BROWSERBASE_API_KEY'),
        projectId: resolveEnvKey('BROWSERBASE_PROJECT_ID'),
    });
    await bbSandbox.init();
    return bbSandbox;
}

async function main() {
    const server = new McpServer({
        name: 'Happy Capabilities',
        version: '1.0.0',
    });

    server.registerTool('browser_navigate', {
        description: 'Open a URL in a cloud browser (Browserbase). Returns page title. The browser session has a live view URL for real-time monitoring.',
        title: 'Browser Navigate',
        inputSchema: {
            url: z.string().describe('The URL to navigate to'),
        },
    }, async (args) => {
        try {
            const bb = await getBrowser();
            const result = await bb.navigate(args.url);
            const liveUrl = bb.getLiveViewUrl();
            const text = [`Navigated to ${args.url}`, `Title: ${result.title}`];
            if (liveUrl) text.push(`Live View: ${liveUrl}`);
            return {
                content: [{ type: 'text' as const, text: text.join('\n') }],
                isError: false,
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text' as const, text: `Navigation failed: ${error.message}` }],
                isError: true,
            };
        }
    });

    server.registerTool('browser_screenshot', {
        description: 'Take a screenshot of the current browser page.',
        title: 'Browser Screenshot',
        inputSchema: {},
    }, async () => {
        try {
            const bb = await getBrowser();
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

    server.registerTool('browser_get_live_url', {
        description: 'Get the live view URL of the current browser session. Open this URL in a browser to watch the session in real-time.',
        title: 'Browser Live URL',
        inputSchema: {},
    }, async () => {
        try {
            const bb = await getBrowser();
            const liveUrl = bb.getLiveViewUrl();
            return {
                content: [{ type: 'text' as const, text: liveUrl || 'No active session' }],
                isError: false,
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text' as const, text: `Failed: ${error.message}` }],
                isError: true,
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    process.stderr.write(`[happy-capabilities] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});

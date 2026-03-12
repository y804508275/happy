/**
 * Integration test: Docmost app through Happy App Protocol
 * 
 * Tests the full flow: load manifest -> register tools -> call Docmost API
 * Requires network access to docs.superlinear.studio
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllAppTools, type InstalledApp } from '..';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Skip if not in integration test mode
const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';

function loadDocmostApp(): InstalledApp {
    // Always load from the real ~/.happy/apps/ regardless of HAPPY_HOME_DIR
    const realAppsDir = join(homedir(), '.happy', 'apps');
    const content = readFileSync(join(realAppsDir, 'docmost.json'), 'utf-8');
    return JSON.parse(content) as InstalledApp;
}

describe.skipIf(!RUN_INTEGRATION)('Docmost Integration', () => {
    let mcp: McpServer;
    let toolNames: string[];
    let toolHandlers: Map<string, any>;

    beforeAll(() => {
        mcp = new McpServer({ name: 'Test', version: '1.0.0' });
        toolHandlers = new Map();

        const original = mcp.registerTool.bind(mcp);
        mcp.registerTool = ((name: string, opts: any, handler: any) => {
            toolHandlers.set(name, handler);
            return original(name, opts, handler);
        }) as any;

        const docmost = loadDocmostApp();
        toolNames = registerAllAppTools(mcp, [docmost]);
    });

    it('should register docmost tools', () => {
        expect(toolNames).toContain('app__docmost__list_spaces');
        expect(toolNames).toContain('app__docmost__get_page');
        expect(toolNames).toContain('app__docmost__search_pages');
        expect(toolNames).toContain('app__docmost__create_page');
        expect(toolNames).toContain('app__docmost__update_page');
    });

    it('should list spaces', async () => {
        const handler = toolHandlers.get('app__docmost__list_spaces');
        const result = await handler({});
        expect(result.isError).toBe(false);
        const data = JSON.parse(result.content[0].text);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].name).toBe('General');
    });

    it('should search pages', async () => {
        const handler = toolHandlers.get('app__docmost__search_pages');
        const result = await handler({ query: 'Protocol' });
        expect(result.isError).toBe(false);
        const data = JSON.parse(result.content[0].text);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBeGreaterThan(0);
    });

    it('should get page content', async () => {
        const handler = toolHandlers.get('app__docmost__get_page');
        const result = await handler({ pageId: '019cd09b-1e59-7537-b09b-cefcd50801d8' });
        expect(result.isError).toBe(false);
        const data = JSON.parse(result.content[0].text);
        expect(data.title).toContain('Happy App Protocol');
    });

    it('should list pages in a space', async () => {
        const handler = toolHandlers.get('app__docmost__list_pages');
        const result = await handler({ spaceId: '019ccfcb-7ead-79be-a85a-1c35a05aa436' });
        expect(result.isError).toBe(false);
    });
});

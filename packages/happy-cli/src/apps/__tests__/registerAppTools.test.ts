import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type InstalledApp } from '../types';
import { registerAppTools, registerAllAppTools } from '../registerAppTools';

const mockManifest = {
    id: 'test-app',
    name: 'Test App',
    description: 'A test application',
    version: '1.0.0',
    baseUrl: 'https://test.example.com',
    tools: [
        {
            name: 'read_item',
            description: 'Read an item',
            parameters: [
                { name: 'itemId', type: 'string' as const, description: 'Item ID', required: true },
            ],
            confirmation: 'auto' as const,
            api: {
                method: 'GET' as const,
                path: '/api/items/:itemId',
                responseField: 'data',
            },
        },
        {
            name: 'create_item',
            description: 'Create a new item',
            parameters: [
                { name: 'title', type: 'string' as const, description: 'Item title', required: true },
                { name: 'content', type: 'string' as const, description: 'Item content', required: false },
            ],
            confirmation: 'confirm' as const,
            api: {
                method: 'POST' as const,
                path: '/api/items',
            },
        },
    ],
    events: [],
};

const mockApp: InstalledApp = {
    manifest: mockManifest,
    credentials: {},
    confirmationOverrides: {},
    installedAt: Date.now(),
};

describe('registerAppTools', () => {
    let mcp: McpServer;
    let registeredTools: Map<string, any>;

    beforeEach(() => {
        mcp = new McpServer({ name: 'Test', version: '1.0.0' });
        registeredTools = new Map();

        // Spy on registerTool to capture registrations
        const originalRegisterTool = mcp.registerTool.bind(mcp);
        vi.spyOn(mcp, 'registerTool').mockImplementation((name: string, opts: any, handler: any) => {
            registeredTools.set(name, { opts, handler });
            return originalRegisterTool(name, opts, handler);
        });
    });

    it('should register tools with correct prefix', () => {
        const names = registerAppTools(mcp, mockApp);
        expect(names).toEqual(['app__test-app__read_item', 'app__test-app__create_item']);
    });

    it('should include app name in tool description', () => {
        registerAppTools(mcp, mockApp);
        const readTool = registeredTools.get('app__test-app__read_item');
        expect(readTool.opts.description).toContain('[Test App]');
        expect(readTool.opts.description).toContain('Read an item');
    });

    it('should respect confirmation overrides', () => {
        const appWithOverride: InstalledApp = {
            ...mockApp,
            confirmationOverrides: { read_item: 'confirm' },
        };
        // This should work without errors - confirmation is checked at call time
        const names = registerAppTools(mcp, appWithOverride);
        expect(names).toHaveLength(2);
    });
});

describe('registerAllAppTools', () => {
    let mcp: McpServer;

    beforeEach(() => {
        mcp = new McpServer({ name: 'Test', version: '1.0.0' });
    });

    it('should register tools from multiple apps', () => {
        const app1: InstalledApp = { ...mockApp };
        const app2: InstalledApp = {
            manifest: {
                ...mockManifest,
                id: 'test-app-2',
                name: 'Test App 2',
                tools: [{
                    name: 'ping',
                    description: 'Ping the service',
                    parameters: [],
                    confirmation: 'auto' as const,
                    api: { method: 'GET' as const, path: '/api/ping' },
                }],
            },
            credentials: {},
            confirmationOverrides: {},
            installedAt: Date.now(),
        };

        const names = registerAllAppTools(mcp, [app1, app2]);
        expect(names).toContain('app__test-app__read_item');
        expect(names).toContain('app__test-app__create_item');
        expect(names).toContain('app__test-app-2__ping');
        expect(names).toHaveLength(3);
    });

    it('should return empty array for no apps', () => {
        const names = registerAllAppTools(mcp, []);
        expect(names).toEqual([]);
    });
});

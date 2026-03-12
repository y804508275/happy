import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppManifestSchema, InstalledAppSchema, type AppManifest, type InstalledApp } from '../types';
import { listInstalledApps, saveInstalledApp, getInstalledApp, removeInstalledApp, updateAppCredentials, updateConfirmationOverride } from '../appStore';
import { buildAppSystemPrompt } from '../appSystemPrompt';

// Use a temp dir for tests (override via HAPPY_HOME_DIR)
const TEST_APPS_DIR = join(process.env.HAPPY_HOME_DIR || join(require('os').homedir(), '.happy'), 'apps');

const sampleManifest: AppManifest = {
    id: 'test-docmost',
    name: 'Docmost',
    description: 'Team wiki and documentation',
    version: '1.0.0',
    baseUrl: 'https://docs.example.com',
    tools: [
        {
            name: 'get_page',
            description: 'Get a page by ID',
            parameters: [
                { name: 'pageId', type: 'string', description: 'The page ID', required: true },
            ],
            confirmation: 'auto',
            api: {
                method: 'GET',
                path: '/api/pages/:pageId',
                responseField: 'data',
            },
        },
        {
            name: 'update_page',
            description: 'Update page content',
            parameters: [
                { name: 'pageId', type: 'string', description: 'The page ID', required: true },
                { name: 'content', type: 'string', description: 'New content (markdown)', required: true },
            ],
            confirmation: 'confirm',
            api: {
                method: 'POST',
                path: '/api/pages/update',
            },
        },
        {
            name: 'add_comment',
            description: 'Add a comment to a page',
            parameters: [
                { name: 'pageId', type: 'string', description: 'The page ID', required: true },
                { name: 'content', type: 'string', description: 'Comment text', required: true },
            ],
            confirmation: 'once',
            api: {
                method: 'POST',
                path: '/api/comments/create',
            },
        },
    ],
    events: [
        { name: 'page_updated', description: 'A page was updated' },
        { name: 'comment_added', description: 'A comment was added' },
    ],
    embed: {
        url: 'https://docs.example.com',
        defaultPath: '/',
        width: 600,
    },
    auth: {
        type: 'cookie',
        fields: ['authToken'],
    },
};

describe('AppManifestSchema', () => {
    it('should validate a correct manifest', () => {
        const result = AppManifestSchema.safeParse(sampleManifest);
        expect(result.success).toBe(true);
    });

    it('should validate a minimal manifest (service with no embed)', () => {
        const minimal = {
            id: 'test-service',
            name: 'Translation Service',
            baseUrl: 'https://translate.example.com',
            tools: [{
                name: 'translate',
                description: 'Translate text',
                parameters: [
                    { name: 'text', type: 'string', description: 'Text to translate', required: true },
                    { name: 'targetLang', type: 'string', description: 'Target language', required: true },
                ],
                api: { method: 'POST', path: '/api/translate' },
            }],
        };
        const result = AppManifestSchema.safeParse(minimal);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.tools).toHaveLength(1);
            expect(result.data.embed).toBeUndefined();
            expect(result.data.events).toEqual([]);
        }
    });

    it('should reject manifest without required fields', () => {
        const invalid = { name: 'bad' };
        const result = AppManifestSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

describe('InstalledAppSchema', () => {
    it('should validate installed app with defaults', () => {
        const result = InstalledAppSchema.safeParse({
            manifest: sampleManifest,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.credentials).toEqual({});
            expect(result.data.confirmationOverrides).toEqual({});
            expect(result.data.installedAt).toBeGreaterThan(0);
        }
    });
});

describe('App Store (persistence)', () => {
    const testApp: InstalledApp = {
        manifest: sampleManifest,
        credentials: { authToken: 'test-token-123' },
        confirmationOverrides: {},
        installedAt: Date.now(),
    };

    beforeEach(() => {
        // Clean up test app if exists
        removeInstalledApp('test-docmost');
    });

    afterEach(() => {
        removeInstalledApp('test-docmost');
    });

    it('should save and load an app', () => {
        saveInstalledApp(testApp);
        const loaded = getInstalledApp('test-docmost');
        expect(loaded).not.toBeNull();
        expect(loaded!.manifest.id).toBe('test-docmost');
        expect(loaded!.manifest.name).toBe('Docmost');
        expect(loaded!.credentials.authToken).toBe('test-token-123');
    });

    it('should list installed apps', () => {
        saveInstalledApp(testApp);
        const apps = listInstalledApps();
        const found = apps.find(a => a.manifest.id === 'test-docmost');
        expect(found).toBeDefined();
    });

    it('should remove an app', () => {
        saveInstalledApp(testApp);
        expect(getInstalledApp('test-docmost')).not.toBeNull();
        removeInstalledApp('test-docmost');
        expect(getInstalledApp('test-docmost')).toBeNull();
    });

    it('should update credentials', () => {
        saveInstalledApp(testApp);
        updateAppCredentials('test-docmost', { authToken: 'new-token' });
        const loaded = getInstalledApp('test-docmost');
        expect(loaded!.credentials.authToken).toBe('new-token');
    });

    it('should update confirmation override', () => {
        saveInstalledApp(testApp);
        updateConfirmationOverride('test-docmost', 'get_page', 'confirm');
        const loaded = getInstalledApp('test-docmost');
        expect(loaded!.confirmationOverrides.get_page).toBe('confirm');
    });
});

describe('buildAppSystemPrompt', () => {
    it('should return null for empty apps', () => {
        expect(buildAppSystemPrompt([])).toBeNull();
    });

    it('should generate prompt with app description and tools', () => {
        const app: InstalledApp = {
            manifest: sampleManifest,
            credentials: {},
            confirmationOverrides: {},
            installedAt: Date.now(),
        };
        const prompt = buildAppSystemPrompt([app]);
        expect(prompt).not.toBeNull();
        expect(prompt).toContain('Docmost');
        expect(prompt).toContain('get_page');
        expect(prompt).toContain('update_page');
        expect(prompt).toContain('add_comment');
        expect(prompt).toContain('[requires confirm confirmation]');
        expect(prompt).toContain('[requires once confirmation]');
    });
});

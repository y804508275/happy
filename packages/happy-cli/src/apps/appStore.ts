/**
 * Happy App Protocol - App Store (persistence layer)
 * 
 * Manages installed apps in ~/.happy/apps/
 * Each app is stored as {appId}.json containing manifest + credentials + overrides
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';
import { InstalledAppSchema, AppManifestSchema, type InstalledApp, type AppManifest, type ConfirmationStrategy } from './types';
import axios from 'axios';

const APPS_DIR = join(configuration.happyHomeDir, 'apps');

function ensureAppsDir(): void {
    if (!existsSync(APPS_DIR)) {
        mkdirSync(APPS_DIR, { recursive: true });
    }
}

function appFilePath(appId: string): string {
    return join(APPS_DIR, `${appId}.json`);
}

export function listInstalledApps(): InstalledApp[] {
    ensureAppsDir();
    const apps: InstalledApp[] = [];
    try {
        const files = readdirSync(APPS_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const content = readFileSync(join(APPS_DIR, file), 'utf-8');
                const parsed = InstalledAppSchema.parse(JSON.parse(content));
                apps.push(parsed);
            } catch (err) {
                logger.warn(`[apps] Failed to load app from ${file}: ${err}`);
            }
        }
    } catch (err) {
        logger.warn(`[apps] Failed to read apps directory: ${err}`);
    }
    return apps;
}

export function getInstalledApp(appId: string): InstalledApp | null {
    const filePath = appFilePath(appId);
    if (!existsSync(filePath)) return null;
    try {
        const content = readFileSync(filePath, 'utf-8');
        return InstalledAppSchema.parse(JSON.parse(content));
    } catch (err) {
        logger.warn(`[apps] Failed to load app ${appId}: ${err}`);
        return null;
    }
}

export function saveInstalledApp(app: InstalledApp): void {
    ensureAppsDir();
    writeFileSync(appFilePath(app.manifest.id), JSON.stringify(app, null, 2));
}

export function removeInstalledApp(appId: string): boolean {
    const filePath = appFilePath(appId);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    return true;
}

export function updateAppCredentials(appId: string, credentials: Record<string, string>): boolean {
    const app = getInstalledApp(appId);
    if (!app) return false;
    app.credentials = credentials;
    saveInstalledApp(app);
    return true;
}

export function updateConfirmationOverride(appId: string, toolName: string, strategy: ConfirmationStrategy): boolean {
    const app = getInstalledApp(appId);
    if (!app) return false;
    app.confirmationOverrides[toolName] = strategy;
    saveInstalledApp(app);
    return true;
}

/**
 * Fetch manifest from an app's well-known URL and install it
 */
export async function installAppFromUrl(appUrl: string, credentials?: Record<string, string>): Promise<InstalledApp> {
    // Normalize URL
    const baseUrl = appUrl.replace(/\/+$/, '');
    const manifestUrl = `${baseUrl}/.well-known/happy-app.json`;

    logger.debug(`[apps] Fetching manifest from ${manifestUrl}`);

    const response = await axios.get(manifestUrl, { timeout: 10000 });
    const manifest = AppManifestSchema.parse(response.data);

    // Override baseUrl with the one user provided (in case manifest has a different one)
    manifest.baseUrl = baseUrl;

    const app: InstalledApp = {
        manifest,
        credentials: credentials || {},
        confirmationOverrides: {},
        installedAt: Date.now(),
    };

    saveInstalledApp(app);
    logger.debug(`[apps] Installed app: ${manifest.name} (${manifest.id})`);
    return app;
}

import { MMKV } from 'react-native-mmkv';

// Separate MMKV instance for server config that persists across logouts
const serverConfigStorage = new MMKV({ id: 'server-config' });

const SERVER_KEY = 'custom-server-url';
const DEFAULT_SERVER_URL = 'https://api.cluster-fluster.com';

// Cached runtime origin, evaluated lazily to avoid metro static analysis
let _runtimeOrigin: string | undefined;

export function getServerUrl(): string {
    const custom = serverConfigStorage.getString(SERVER_KEY);
    if (custom) return custom;
    // On web: use browser origin so the app works on any domain without build-time config.
    // Indirect eval prevents metro/terser from statically evaluating at build time.
    if (_runtimeOrigin === undefined) {
        try {
            const indirect = eval;
            _runtimeOrigin = indirect('window.location.origin') as string;
        } catch {
            _runtimeOrigin = '';
        }
    }
    if (_runtimeOrigin && _runtimeOrigin !== 'null' && !_runtimeOrigin.includes('localhost')) {
        return _runtimeOrigin;
    }
    return DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(SERVER_KEY);
    }
}

export function isUsingCustomServer(): boolean {
    return getServerUrl() !== DEFAULT_SERVER_URL;
}

export function getServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const url = getServerUrl();
    const isCustom = isUsingCustomServer();
    
    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom
        };
    } catch {
        // Fallback if URL parsing fails
        return {
            hostname: url,
            port: undefined,
            isCustom
        };
    }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'Server URL cannot be empty' };
    }
    
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Server URL must use HTTP or HTTPS protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}
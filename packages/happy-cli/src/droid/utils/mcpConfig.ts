import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@/ui/logger';

const FACTORY_DIR = join(homedir(), '.factory');
const MCP_CONFIG_PATH = join(FACTORY_DIR, 'mcp.json');

interface McpServerEntry {
    type: 'http' | 'stdio';
    url?: string;
    disabled?: boolean;
    [key: string]: unknown;
}

interface McpConfig {
    mcpServers: Record<string, McpServerEntry>;
}

function readMcpConfig(): McpConfig {
    try {
        if (existsSync(MCP_CONFIG_PATH)) {
            const raw = readFileSync(MCP_CONFIG_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            return {
                mcpServers: parsed.mcpServers || {},
            };
        }
    } catch (error) {
        logger.debug('[mcpConfig] Failed to read existing config, starting fresh:', error);
    }
    return { mcpServers: {} };
}

function writeMcpConfig(config: McpConfig): void {
    if (!existsSync(FACTORY_DIR)) {
        mkdirSync(FACTORY_DIR, { recursive: true });
    }
    writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
}

/**
 * Add or update an HTTP MCP server entry in ~/.factory/mcp.json.
 * Merges with existing config, preserving other servers.
 */
export function addDroidMcpServer(name: string, url: string): void {
    const config = readMcpConfig();
    config.mcpServers[name] = {
        type: 'http',
        url,
        disabled: false,
    };
    writeMcpConfig(config);
    logger.debug(`[mcpConfig] Added MCP server "${name}" at ${url}`);
}

/**
 * Remove an MCP server entry from ~/.factory/mcp.json.
 * Preserves other servers.
 */
export function removeDroidMcpServer(name: string): void {
    const config = readMcpConfig();
    if (config.mcpServers[name]) {
        delete config.mcpServers[name];
        writeMcpConfig(config);
        logger.debug(`[mcpConfig] Removed MCP server "${name}"`);
    }
}

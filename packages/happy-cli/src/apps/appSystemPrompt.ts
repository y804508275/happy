/**
 * Happy App Protocol - System prompt injection
 * 
 * Builds system prompt text describing installed apps and their tools,
 * so the AI knows what apps are available and when to use them.
 */

import { type InstalledApp } from './types';

export function buildAppSystemPrompt(apps: InstalledApp[]): string | null {
    if (apps.length === 0) return null;

    const sections: string[] = [];

    sections.push('# Installed Apps\n');
    sections.push('You have access to external apps via Happy App Protocol. Each app\'s tools are registered as MCP tools with the prefix `mcp__happy__app__{appId}__{toolName}`.');
    sections.push('For apps with UI, use `mcp__happy__open_app` to open them in the side panel.\n');

    for (const app of apps) {
        const { manifest } = app;
        const lines: string[] = [];
        lines.push(`## ${manifest.name}`);
        if (manifest.description) {
            lines.push(manifest.description);
        }
        lines.push('');

        if (manifest.embed) {
            lines.push(`This app has a UI that can be opened in the side panel via \`open_app(appId: "${manifest.id}")\`.`);
        }

        if (manifest.tools.length > 0) {
            lines.push('Available operations:');
            for (const tool of manifest.tools) {
                const params = tool.parameters.map(p => `${p.name}: ${p.description}`).join(', ');
                const confirm = tool.confirmation !== 'auto' ? ` [requires ${tool.confirmation} confirmation]` : '';
                lines.push(`- **${tool.name}**(${params}): ${tool.description}${confirm}`);
            }
        }

        sections.push(lines.join('\n'));
    }

    return sections.join('\n\n');
}

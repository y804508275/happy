import axios from 'axios';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';

/**
 * Load project-specific and global knowledge base contexts from the Happy API.
 * Called once at session start; the result is injected into the system prompt.
 * Fails silently on error so it never blocks session startup.
 */
export async function loadProjectContext(
    authToken: string,
    workingDirectory: string
): Promise<string | null> {
    try {
        const response = await axios.get(`${configuration.serverUrl}/v1/shared-items`, {
            params: { type: 'context', visibility: 'private', limit: 100 },
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 5000,
        });

        // Filter to memory items matching this project or global scope
        const matchingItems = (response.data.items || []).filter((item: any) => {
            const meta = item.meta as any;
            if (!meta || meta.memoryType !== 'memory') return false;
            if (meta.scope === 'global') return true;
            if (meta.scope === 'project' && meta.projectPath === workingDirectory) return true;
            return false;
        });

        if (matchingItems.length === 0) return null;

        // Fetch full content for each matching item (list API returns summaries only)
        const fullItems = await Promise.all(
            matchingItems.map((item: any) =>
                axios.get(`${configuration.serverUrl}/v1/shared-items/${item.id}`, {
                    headers: { 'Authorization': `Bearer ${authToken}` },
                    timeout: 5000,
                }).then(r => r.data).catch(() => null)
            )
        );

        const validItems = fullItems.filter(Boolean);
        if (validItems.length === 0) return null;

        const globalItems = validItems.filter((i: any) => i.meta?.scope === 'global');
        const projectItems = validItems.filter((i: any) => i.meta?.scope === 'project');

        let result = '# Project Knowledge Base\n\n';
        result += 'The following context was saved from previous sessions. Use it to inform your responses.\n\n';

        if (globalItems.length > 0) {
            result += '## Global Context\n\n';
            for (const item of globalItems) {
                result += `### ${item.name}\n${item.content}\n\n`;
            }
        }

        if (projectItems.length > 0) {
            result += '## Project Context\n\n';
            for (const item of projectItems) {
                result += `### ${item.name}\n${item.content}\n\n`;
            }
        }

        return result.trim();
    } catch (error) {
        logger.debug('[projectContext] Failed to load project context:', error);
        return null;
    }
}

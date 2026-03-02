import axios from 'axios';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';

/**
 * Load knowledge base items and build a context prompt for system prompt injection.
 *
 * Uses conditional injection:
 * - alwaysApply=true (default): full content injected as rules
 * - alwaysApply=false: only title/tags/description listed as on-demand reference
 *
 * Called once at session start. Fails silently so it never blocks startup.
 */
export async function loadContextForInjection(
    authToken: string,
    workingDirectory: string
): Promise<{ contextPrompt: string | null }> {
    try {
        const headers = {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        };

        // Fetch all memory items (summary only — no content)
        const response = await axios.get(`${configuration.serverUrl}/v1/shared-items`, {
            params: { type: 'context', visibility: 'private', limit: 100 },
            headers,
            timeout: 5000,
        });

        // Filter to matching items: global or matching project
        const matchingItems = (response.data.items || []).filter((item: any) => {
            const meta = item.meta as any;
            if (!meta || meta.memoryType !== 'memory') return false;
            if (meta.scope === 'global') return true;
            if (meta.scope === 'project' && meta.projectPath === workingDirectory) return true;
            return false;
        });

        if (matchingItems.length === 0) {
            return { contextPrompt: null };
        }

        // Split into always-inject vs on-demand
        const alwaysItems = matchingItems.filter((item: any) =>
            item.meta?.alwaysApply !== false // default true for backward compatibility
        );
        const onDemandItems = matchingItems.filter((item: any) =>
            item.meta?.alwaysApply === false
        );

        // Fetch full content for always-inject items (parallel)
        const alwaysWithContent = await Promise.all(
            alwaysItems.map(async (item: any) => {
                try {
                    const resp = await axios.get(
                        `${configuration.serverUrl}/v1/shared-items/${item.id}`,
                        { headers, timeout: 10000 }
                    );
                    return resp.data;
                } catch {
                    return item; // fallback to summary if fetch fails
                }
            })
        );

        // Build prompt
        let prompt = '# Knowledge Base\n';

        // Always-inject section: full content
        if (alwaysWithContent.length > 0) {
            prompt += '\n## Rules (always active — follow these)\n';
            for (const item of alwaysWithContent) {
                const scope = item.meta?.scope === 'global' ? 'global' : 'project';
                prompt += `\n### ${item.name} [${scope}]\n`;
                if (item.content) {
                    prompt += `${item.content}\n`;
                } else if (item.description) {
                    prompt += `${item.description}\n`;
                }
            }
        }

        // On-demand section: directory only
        if (onDemandItems.length > 0) {
            prompt += '\n## Reference (use mcp__happy__load_context to load when relevant)\n';
            for (const item of onDemandItems) {
                const tags = (item.meta?.tags as string[]) || [];
                const tagsStr = tags.length > 0 ? ` (tags: ${tags.join(', ')})` : '';
                const descStr = item.description ? ` — ${item.description}` : '';
                const scope = item.meta?.scope === 'global' ? 'global' : 'project';
                prompt += `- [${item.id}] "${item.name}"${tagsStr}${descStr} [${scope}]\n`;
            }
        }

        return { contextPrompt: prompt.trim() };
    } catch (error) {
        logger.debug('[projectContext] Failed to load context:', error);
        return { contextPrompt: null };
    }
}

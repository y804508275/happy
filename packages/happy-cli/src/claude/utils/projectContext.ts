import axios from 'axios';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';
import { type ScannedProject } from './projectScanner';

/**
 * Load knowledge base items and build a context prompt for system prompt injection.
 *
 * Uses conditional injection:
 * - alwaysApply=true (default): full content injected as rules
 * - alwaysApply=false: only title/tags/description listed as on-demand reference
 *
 * Called at session start and on each new query to pick up newly saved rules.
 * Fails silently so it never blocks startup.
 */
export async function loadContextForInjection(
    authToken: string,
    workingDirectory: string,
    projects: ScannedProject[] = []
): Promise<{ contextPrompt: string | null; rulesCount: number; refsCount: number }> {
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

        // Include all memory items (global + all project-scoped).
        // Project rules are labeled with their project name so Claude can
        // decide relevance based on conversation context.
        const matchingItems = (response.data.items || []).filter((item: any) => {
            const meta = item.meta as any;
            if (!meta || meta.memoryType !== 'memory') return false;
            return true;
        });

        if (matchingItems.length === 0) {
            return { contextPrompt: null, rulesCount: 0, refsCount: 0 };
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
            prompt += '\nIMPORTANT: When a rule below influences your response, call `mcp__happy__notify_rule_applied` with the rule title and a brief description of how it was applied. This notifies the user which rules are active.\n';
            prompt += '\nProject-scoped rules should only be applied when the conversation is relevant to that project.\n';
            for (const item of alwaysWithContent) {
                const meta = item.meta || {};
                let scopeLabel = 'global';
                if (meta.scope === 'project' && meta.projectPath) {
                    const projectName = meta.projectPath.split('/').filter(Boolean).pop() || 'unknown';
                    scopeLabel = `project: ${projectName}`;
                }
                prompt += `\n### ${item.name} [${scopeLabel}]\n`;
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
                const meta = item.meta || {};
                const tags = (meta.tags as string[]) || [];
                const tagsStr = tags.length > 0 ? ` (tags: ${tags.join(', ')})` : '';
                const descStr = item.description ? ` — ${item.description}` : '';
                let scopeLabel = 'global';
                if (meta.scope === 'project' && meta.projectPath) {
                    const projectName = meta.projectPath.split('/').filter(Boolean).pop() || 'unknown';
                    scopeLabel = `project: ${projectName}`;
                }
                prompt += `- [${item.id}] "${item.name}"${tagsStr}${descStr} [${scopeLabel}]\n`;
            }
        }

        return { contextPrompt: prompt.trim(), rulesCount: alwaysWithContent.length, refsCount: onDemandItems.length };
    } catch (error) {
        logger.debug('[projectContext] Failed to load context:', error);
        return { contextPrompt: null, rulesCount: 0, refsCount: 0 };
    }
}

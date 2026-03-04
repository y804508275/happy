import * as React from 'react';
import type { AuthCredentials } from '@/auth/tokenStorage';
import type { SharedItemSummary, SharedItemFull } from '@/sync/sharedItemTypes';
import { getServerUrl } from '@/sync/serverConfig';

/**
 * Hook to fetch and manage knowledge base items (memories) for a session.
 *
 * Uses direct fetch (no backoff) to avoid infinite retries blocking the UI.
 * Fetches all private context shared items, filters by meta.memoryType === 'memory',
 * splits into global vs project-scoped items matching the working directory.
 */

async function fetchKBItems(credentials: AuthCredentials, params: Record<string, string>): Promise<{ items: SharedItemSummary[] }> {
    const searchParams = new URLSearchParams(params);
    const response = await fetch(`${getServerUrl()}/v1/shared-items?${searchParams}`, {
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
    return await response.json();
}

async function fetchKBItem(credentials: AuthCredentials, id: string): Promise<SharedItemFull> {
    const response = await fetch(`${getServerUrl()}/v1/shared-items/${id}`, {
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
    return await response.json();
}

async function updateKBItem(
    credentials: AuthCredentials,
    id: string,
    data: { name?: string; content?: string; expectedContentVersion?: number; meta?: any },
): Promise<{ success: boolean; contentVersion?: number }> {
    const response = await fetch(`${getServerUrl()}/v1/shared-items/${id}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
    return await response.json();
}

async function createKBItem(
    credentials: AuthCredentials,
    data: { type: string; visibility: string; name: string; content: string; meta?: any },
): Promise<SharedItemFull> {
    const response = await fetch(`${getServerUrl()}/v1/shared-items`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
    return await response.json();
}

async function deleteKBItem(credentials: AuthCredentials, id: string): Promise<void> {
    const response = await fetch(`${getServerUrl()}/v1/shared-items/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
}

export function useKnowledgeBase(credentials: AuthCredentials | null, workingDirectory: string) {
    const [globalItems, setGlobalItems] = React.useState<SharedItemSummary[]>([]);
    const [projectItems, setProjectItems] = React.useState<SharedItemSummary[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [contentCache, setContentCache] = React.useState<Record<string, SharedItemFull>>({});

    const fetchItems = React.useCallback(async () => {
        if (!credentials) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const result = await fetchKBItems(credentials, {
                type: 'context',
                visibility: 'private',
                limit: '100',
            });

            const memories = (result.items || []).filter((item) => {
                const meta = item.meta;
                if (!meta) return false;
                if (meta.memoryType === 'memory') return true;
                if (meta.memoryType === 'md-reference') return true;
                return false;
            });

            setGlobalItems(memories.filter((item) => !item.meta?.scope || item.meta?.scope === 'global'));
            setProjectItems(memories.filter((item) => item.meta?.scope === 'project'));
        } catch {
            // Silent failure - show empty state
        } finally {
            setLoading(false);
        }
    }, [credentials, workingDirectory]);

    React.useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const fetchItemContent = React.useCallback(
        async (itemId: string): Promise<SharedItemFull | null> => {
            if (contentCache[itemId]) return contentCache[itemId];
            if (!credentials) return null;
            try {
                const full = await fetchKBItem(credentials, itemId);
                setContentCache((prev) => ({ ...prev, [itemId]: full }));
                return full;
            } catch {
                return null;
            }
        },
        [credentials, contentCache],
    );

    const deleteItem = React.useCallback(
        async (itemId: string) => {
            if (!credentials) return;
            try {
                await deleteKBItem(credentials, itemId);
                setGlobalItems((prev) => prev.filter((i) => i.id !== itemId));
                setProjectItems((prev) => prev.filter((i) => i.id !== itemId));
                setContentCache((prev) => {
                    const next = { ...prev };
                    delete next[itemId];
                    return next;
                });
            } catch {
                // Error handled silently
            }
        },
        [credentials],
    );

    const createItem = React.useCallback(
        async (data: { name: string; content: string; scope: 'global' | 'project' }) => {
            if (!credentials) return;
            try {
                await createKBItem(credentials, {
                    type: 'context',
                    visibility: 'private',
                    name: data.name,
                    content: data.content,
                    meta: {
                        memoryType: 'memory',
                        scope: data.scope,
                        alwaysApply: true,
                        ...(data.scope === 'project' ? { projectPath: workingDirectory } : {}),
                    },
                });
                await fetchItems();
            } catch {
                // Error handled silently
            }
        },
        [credentials, workingDirectory, fetchItems],
    );

    const updateItem = React.useCallback(
        async (itemId: string, data: { name?: string; content?: string; expectedContentVersion?: number; meta?: any }) => {
            if (!credentials) return;
            try {
                await updateKBItem(credentials, itemId, data);
                // Clear content cache for this item so it's re-fetched
                setContentCache((prev) => {
                    const next = { ...prev };
                    delete next[itemId];
                    return next;
                });
                // Refresh the full list
                await fetchItems();
            } catch {
                // Error handled silently
            }
        },
        [credentials, fetchItems],
    );

    return { globalItems, projectItems, loading, fetchItemContent, createItem, deleteItem, updateItem, refresh: fetchItems };
}

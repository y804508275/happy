import * as React from 'react';
import type { AuthCredentials } from '@/auth/tokenStorage';
import type { SharedItemSummary, SharedItemFull } from '@/sync/sharedItemTypes';
import { getServerUrl } from '@/sync/serverConfig';

/**
 * Hook to fetch and manage MD reference files for quick context injection.
 *
 * Uses SharedItems with meta.memoryType === 'md-reference' to distinguish
 * from regular knowledge base memories (meta.memoryType === 'memory').
 */

async function fetchMdItems(credentials: AuthCredentials, params: Record<string, string>): Promise<{ items: SharedItemSummary[] }> {
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

async function fetchMdItem(credentials: AuthCredentials, id: string): Promise<SharedItemFull> {
    const response = await fetch(`${getServerUrl()}/v1/shared-items/${id}`, {
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
    return await response.json();
}

async function createMdItem(
    credentials: AuthCredentials,
    data: { name: string; description?: string; content: string; meta: any },
): Promise<SharedItemFull> {
    const response = await fetch(`${getServerUrl()}/v1/shared-items`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            type: 'context',
            visibility: 'private',
            ...data,
        }),
    });
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
    return await response.json();
}

async function updateMdItem(
    credentials: AuthCredentials,
    id: string,
    data: { name?: string; description?: string; content?: string; expectedContentVersion?: number; meta?: any },
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

async function deleteMdItem(credentials: AuthCredentials, id: string): Promise<void> {
    const response = await fetch(`${getServerUrl()}/v1/shared-items/${id}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
        },
    });
    if (!response.ok) throw new Error(`Failed: ${response.status}`);
}

export function useMdReferences(credentials: AuthCredentials | null, workingDirectory: string) {
    const [globalItems, setGlobalItems] = React.useState<SharedItemSummary[]>([]);
    const [projectItems, setProjectItems] = React.useState<SharedItemSummary[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [contentCache, setContentCache] = React.useState<Record<string, SharedItemFull>>({});
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

    const fetchItems = React.useCallback(async () => {
        if (!credentials) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const result = await fetchMdItems(credentials, {
                type: 'context',
                visibility: 'private',
                limit: '100',
            });

            const mdRefs = (result.items || []).filter((item) => {
                const meta = item.meta;
                if (!meta || meta.memoryType !== 'md-reference') return false;
                return true;
            });

            setGlobalItems(mdRefs.filter((item) => item.meta?.scope === 'global'));
            setProjectItems(mdRefs.filter((item) => item.meta?.scope === 'project'));
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
                const full = await fetchMdItem(credentials, itemId);
                setContentCache((prev) => ({ ...prev, [itemId]: full }));
                return full;
            } catch {
                return null;
            }
        },
        [credentials, contentCache],
    );

    const toggleSelection = React.useCallback((itemId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    }, []);

    const removeSelection = React.useCallback((itemId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
        });
    }, []);

    const clearSelection = React.useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    const getSelectedContents = React.useCallback(
        async (): Promise<Array<{ name: string; content: string }>> => {
            if (!credentials || selectedIds.size === 0) return [];
            const results: Array<{ name: string; content: string }> = [];
            for (const id of selectedIds) {
                const full = await fetchItemContent(id);
                if (full) {
                    results.push({ name: full.name, content: full.content });
                }
            }
            return results;
        },
        [credentials, selectedIds, fetchItemContent],
    );

    const getSelectedSummaries = React.useCallback((): Array<{ id: string; name: string }> => {
        const allItems = [...globalItems, ...projectItems];
        return allItems.filter((item) => selectedIds.has(item.id)).map((item) => ({ id: item.id, name: item.name }));
    }, [globalItems, projectItems, selectedIds]);

    const createItem = React.useCallback(
        async (data: { name: string; description?: string; content: string; scope: 'global' | 'project' }) => {
            if (!credentials) return;
            try {
                await createMdItem(credentials, {
                    name: data.name,
                    description: data.description,
                    content: data.content,
                    meta: {
                        memoryType: 'md-reference',
                        scope: data.scope,
                        ...(data.scope === 'project' && workingDirectory ? { projectPath: workingDirectory } : {}),
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
        async (itemId: string, data: { name?: string; description?: string; content?: string; expectedContentVersion?: number; meta?: any }) => {
            if (!credentials) return;
            try {
                await updateMdItem(credentials, itemId, data);
                setContentCache((prev) => {
                    const next = { ...prev };
                    delete next[itemId];
                    return next;
                });
                await fetchItems();
            } catch {
                // Error handled silently
            }
        },
        [credentials, fetchItems],
    );

    const deleteItem = React.useCallback(
        async (itemId: string) => {
            if (!credentials) return;
            try {
                await deleteMdItem(credentials, itemId);
                setGlobalItems((prev) => prev.filter((i) => i.id !== itemId));
                setProjectItems((prev) => prev.filter((i) => i.id !== itemId));
                setContentCache((prev) => {
                    const next = { ...prev };
                    delete next[itemId];
                    return next;
                });
                removeSelection(itemId);
            } catch {
                // Error handled silently
            }
        },
        [credentials, removeSelection],
    );

    return {
        globalItems,
        projectItems,
        loading,
        selectedIds,
        toggleSelection,
        removeSelection,
        clearSelection,
        getSelectedContents,
        getSelectedSummaries,
        fetchItemContent,
        createItem,
        updateItem,
        deleteItem,
        refresh: fetchItems,
    };
}

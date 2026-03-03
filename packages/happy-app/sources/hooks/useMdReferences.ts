import * as React from 'react';
import type { AuthCredentials } from '@/auth/tokenStorage';
import type { SharedItemSummary, SharedItemFull } from '@/sync/sharedItemTypes';
import { getServerUrl } from '@/sync/serverConfig';

/**
 * Hook to fetch and manage on-demand rules for active context injection.
 *
 * Loads SharedItems with meta.memoryType === 'memory' and meta.alwaysApply === false,
 * which represent rules the user can actively select per-message.
 * (alwaysApply === true rules are already passively injected via system prompt.)
 *
 * Also supports legacy meta.memoryType === 'md-reference' items for backward compatibility.
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
    const [instructions, setInstructions] = React.useState<Record<string, string>>({});

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

            // Include all rules (memory type) and legacy md-references
            const selectableItems = (result.items || []).filter((item) => {
                const meta = item.meta;
                if (!meta) return false;
                if (meta.memoryType === 'md-reference') return true;
                if (meta.memoryType === 'memory') return true;
                return false;
            });

            setGlobalItems(selectableItems.filter((item) => !item.meta?.scope || item.meta?.scope === 'global'));
            setProjectItems(selectableItems.filter((item) => item.meta?.scope === 'project'));
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
        setInstructions((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
        });
    }, []);

    const clearSelection = React.useCallback(() => {
        setSelectedIds(new Set());
        setInstructions({});
    }, []);

    const setInstruction = React.useCallback((itemId: string, instruction: string) => {
        setInstructions((prev) => {
            if (!instruction.trim()) {
                const next = { ...prev };
                delete next[itemId];
                return next;
            }
            return { ...prev, [itemId]: instruction };
        });
    }, []);

    const getSelectedContents = React.useCallback(
        async (): Promise<Array<{ name: string; content: string; instruction?: string }>> => {
            if (!credentials || selectedIds.size === 0) return [];
            const results: Array<{ name: string; content: string; instruction?: string }> = [];
            for (const id of selectedIds) {
                const full = await fetchItemContent(id);
                if (full) {
                    const instruction = instructions[id];
                    results.push({
                        name: full.name,
                        content: full.content,
                        ...(instruction ? { instruction } : {}),
                    });
                }
            }
            return results;
        },
        [credentials, selectedIds, fetchItemContent, instructions],
    );

    const getSelectedSummaries = React.useCallback((): Array<{ id: string; name: string; instruction?: string }> => {
        const allItems = [...globalItems, ...projectItems];
        return allItems
            .filter((item) => selectedIds.has(item.id))
            .map((item) => ({
                id: item.id,
                name: item.name,
                ...(instructions[item.id] ? { instruction: instructions[item.id] } : {}),
            }));
    }, [globalItems, projectItems, selectedIds, instructions]);

    const createItem = React.useCallback(
        async (data: { name: string; description?: string; content: string; scope: 'global' | 'project' }) => {
            if (!credentials) return;
            try {
                await createMdItem(credentials, {
                    name: data.name,
                    description: data.description,
                    content: data.content,
                    meta: {
                        memoryType: 'memory',
                        alwaysApply: false,
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
        instructions,
        toggleSelection,
        removeSelection,
        clearSelection,
        setInstruction,
        getSelectedContents,
        getSelectedSummaries,
        fetchItemContent,
        createItem,
        updateItem,
        deleteItem,
        refresh: fetchItems,
    };
}

import { AuthCredentials } from '@/auth/tokenStorage';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import type {
    SharedItemSummary,
    SharedItemFull,
    SessionSharedItemSummary,
    SessionSharedItemContent
} from './sharedItemTypes';

/**
 * Fetch all shared items accessible to the user
 */
export async function fetchSharedItems(
    credentials: AuthCredentials,
    params?: {
        type?: 'skill' | 'context';
        visibility?: 'private' | 'team' | 'public';
        teamId?: string;
        limit?: number;
        cursor?: string;
    }
): Promise<{ items: SharedItemSummary[]; nextCursor: string | null }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const searchParams = new URLSearchParams();
        if (params?.type) searchParams.set('type', params.type);
        if (params?.visibility) searchParams.set('visibility', params.visibility);
        if (params?.teamId) searchParams.set('teamId', params.teamId);
        if (params?.limit) searchParams.set('limit', String(params.limit));
        if (params?.cursor) searchParams.set('cursor', params.cursor);

        const response = await fetch(`${API_ENDPOINT}/v1/shared-items?${searchParams}`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch shared items: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Fetch a single shared item with full content
 */
export async function fetchSharedItem(credentials: AuthCredentials, id: string): Promise<SharedItemFull> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/shared-items/${id}`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch shared item: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Create a new shared item
 */
export async function createSharedItem(
    credentials: AuthCredentials,
    data: {
        type: 'skill' | 'context';
        visibility: 'private' | 'team' | 'public';
        teamId?: string;
        name: string;
        slug?: string;
        description?: string;
        content: string;
        meta?: any;
    }
): Promise<SharedItemFull> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/shared-items`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Failed to create shared item: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Update a shared item
 */
export async function updateSharedItem(
    credentials: AuthCredentials,
    id: string,
    data: {
        name?: string;
        description?: string | null;
        content?: string;
        expectedContentVersion?: number;
        visibility?: 'private' | 'team' | 'public';
        teamId?: string;
        meta?: any;
    }
): Promise<{ success: boolean; contentVersion?: number; error?: string; currentContentVersion?: number }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/shared-items/${id}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Failed to update shared item: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Delete a shared item
 */
export async function deleteSharedItem(credentials: AuthCredentials, id: string): Promise<void> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/shared-items/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to delete shared item: ${response.status}`);
        }
    });
}

/**
 * Toggle star on a shared item
 */
export async function toggleStarSharedItem(
    credentials: AuthCredentials,
    id: string
): Promise<{ starred: boolean; starCount: number }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/shared-items/${id}/star`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to toggle star: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Search shared items
 */
export async function searchSharedItems(
    credentials: AuthCredentials,
    query: string,
    params?: { type?: 'skill' | 'context'; limit?: number }
): Promise<{ items: SharedItemSummary[] }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const searchParams = new URLSearchParams({ q: query });
        if (params?.type) searchParams.set('type', params.type);
        if (params?.limit) searchParams.set('limit', String(params.limit));

        const response = await fetch(`${API_ENDPOINT}/v1/shared-items/search?${searchParams}`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to search shared items: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Discover public shared items
 */
export async function discoverSharedItems(
    credentials: AuthCredentials,
    params?: { type?: 'skill' | 'context'; sort?: 'popular' | 'recent'; limit?: number; cursor?: string }
): Promise<{ items: SharedItemSummary[]; nextCursor: string | null }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const searchParams = new URLSearchParams();
        if (params?.type) searchParams.set('type', params.type);
        if (params?.sort) searchParams.set('sort', params.sort);
        if (params?.limit) searchParams.set('limit', String(params.limit));
        if (params?.cursor) searchParams.set('cursor', params.cursor);

        const response = await fetch(`${API_ENDPOINT}/v1/shared-items/discover?${searchParams}`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to discover shared items: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Attach shared items to a session
 */
export async function attachSessionSharedItems(
    credentials: AuthCredentials,
    sessionId: string,
    itemIds: string[]
): Promise<{ added: string[]; skipped: string[] }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/sessions/${sessionId}/shared-items`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ itemIds })
        });

        if (!response.ok) {
            throw new Error(`Failed to attach shared items: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Detach a shared item from a session
 */
export async function detachSessionSharedItem(
    credentials: AuthCredentials,
    sessionId: string,
    itemId: string
): Promise<void> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/sessions/${sessionId}/shared-items/${itemId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to detach shared item: ${response.status}`);
        }
    });
}

/**
 * List shared items attached to a session
 */
export async function fetchSessionSharedItems(
    credentials: AuthCredentials,
    sessionId: string
): Promise<{ items: SessionSharedItemSummary[] }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/sessions/${sessionId}/shared-items`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch session shared items: ${response.status}`);
        }

        return await response.json();
    });
}

/**
 * Get full content of all shared items attached to a session (for AI injection)
 */
export async function fetchSessionSharedItemsContent(
    credentials: AuthCredentials,
    sessionId: string
): Promise<{ items: SessionSharedItemContent[] }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/sessions/${sessionId}/shared-items/content`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch session shared items content: ${response.status}`);
        }

        return await response.json();
    });
}

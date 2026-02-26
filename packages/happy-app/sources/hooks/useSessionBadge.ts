import { Session } from '@/sync/storageTypes';
import { storage, useSessionIsUnread } from '@/sync/storage';
import { useShallow } from 'zustand/react/shallow';

export type SessionBadgeType = 'action' | 'info' | null;

/**
 * Returns the badge type for a single session:
 * - 'action': session has pending permission requests or user questions (red pulsing dot)
 * - 'info': session completed work but user hasn't viewed yet (blue static dot)
 * - null: no badge needed
 */
export function useSessionBadge(session: Session): SessionBadgeType {
    const hasRequests = session.agentState?.requests
        && Object.keys(session.agentState.requests).length > 0;
    const isUnread = useSessionIsUnread(session.id);

    if (hasRequests) return 'action';
    if (isUnread) return 'info';
    return null;
}

/**
 * Returns total count of sessions that need user attention (for TabBar/Sidebar badges).
 * Counts both action-required and unread-completed sessions.
 */
export function useSessionsBadgeCount(): number {
    return storage(useShallow(state => {
        let count = 0;
        for (const session of Object.values(state.sessions)) {
            const hasRequests = session.agentState?.requests
                && Object.keys(session.agentState.requests).length > 0;
            if (hasRequests || state.unreadSessions[session.id]) count++;
        }
        return count;
    }));
}

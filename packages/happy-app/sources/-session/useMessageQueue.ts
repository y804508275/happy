import * as React from 'react';
import { randomUUID } from 'expo-crypto';
import { sync } from '@/sync/sync';
import type { SessionState } from '@/utils/sessionUtils';

/**
 * A message queued while the AI is thinking.
 * Captures a snapshot of the user's input (text, images, files, mdRefs)
 * at the moment they press send during a thinking state.
 */
export interface QueuedMessage {
    id: string;
    text: string;
    images: Array<{ uri: string; base64: string; mediaType: string }>;
    files: Array<{ name: string; content: string; mediaType: string; kind: 'text' | 'pdf' }>;
    mdRefs: Array<{ name: string; content: string; instruction?: string }>;
    createdAt: number;
}

/**
 * Manages a local message queue for messages sent while the AI is thinking.
 * Messages are queued in React state and automatically flushed (sent via
 * sync.sendMessage) when the session transitions to 'waiting' state.
 *
 * Flush merges all queued messages into a single message:
 * - Text is joined with double newlines
 * - Images, files, and mdRefs are concatenated
 *
 * - Flush triggers on: thinking→waiting, permission_required→waiting, abort→waiting
 * - Does NOT flush on: thinking→permission_required, thinking→disconnected
 */
export function useMessageQueue(sessionId: string, sessionState: SessionState) {
    const [queue, setQueue] = React.useState<QueuedMessage[]>([]);
    const prevStateRef = React.useRef<SessionState>(sessionState);
    const queueRef = React.useRef<QueuedMessage[]>(queue);
    queueRef.current = queue;

    // Guard against double-flush: flush reads from queueRef (sync) but
    // setQueue([]) is async (React batch), so a second effect in the same
    // render cycle would see stale queueRef and send duplicates.
    const flushingRef = React.useRef(false);

    const enqueue = React.useCallback((msg: Omit<QueuedMessage, 'id' | 'createdAt'>) => {
        setQueue(prev => [...prev, {
            ...msg,
            id: randomUUID(),
            createdAt: Date.now(),
        }]);
    }, []);

    const removeFromQueue = React.useCallback((id: string) => {
        setQueue(prev => prev.filter(m => m.id !== id));
    }, []);

    // Flush: merge all queued messages into one and send
    const flush = React.useCallback(() => {
        const current = queueRef.current;
        if (current.length === 0) return;
        if (flushingRef.current) return; // Already flushing in this render cycle
        flushingRef.current = true;

        const mergedText = current.map(m => m.text).filter(Boolean).join('\n\n');
        const mergedImages = current.flatMap(m =>
            m.images.map(img => ({ base64: img.base64, mediaType: img.mediaType }))
        );
        const mergedFiles = current.flatMap(m => m.files);
        const mergedMdRefs = current.flatMap(m => m.mdRefs);

        sync.sendMessage(
            sessionId,
            mergedText,
            undefined,
            mergedImages.length > 0 ? mergedImages : undefined,
            mergedMdRefs.length > 0 ? mergedMdRefs : undefined,
            mergedFiles.length > 0 ? mergedFiles : undefined,
        );

        setQueue([]);
    }, [sessionId]);

    // Reset flushing guard when queue actually empties (after React state update)
    React.useEffect(() => {
        if (queue.length === 0) {
            flushingRef.current = false;
        }
    }, [queue]);

    // Auto-flush when session transitions to 'waiting' from an active state
    React.useEffect(() => {
        const prev = prevStateRef.current;
        prevStateRef.current = sessionState;

        if (prev !== 'waiting' && prev !== 'disconnected' && sessionState === 'waiting') {
            flush();
        }
    }, [sessionState, flush]);

    // Catch-up flush: handle race condition where messages are enqueued
    // after the state has already transitioned to 'waiting'.
    // This happens when handleQueueMessage's async gap (await mdRefs.getSelectedContents())
    // allows the thinking→waiting transition to fire flush() before enqueue() runs.
    React.useEffect(() => {
        if (sessionState === 'waiting' && queue.length > 0) {
            flush();
        }
    }, [queue, sessionState, flush]);

    return { queue, enqueue, removeFromQueue };
}

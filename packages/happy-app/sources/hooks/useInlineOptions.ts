import * as React from 'react';
import { Platform } from 'react-native';
import { parseMarkdown } from '@/components/markdown/parseMarkdown';
import { sync } from '@/sync/sync';
import { Message } from '@/sync/typesMessage';

/**
 * Manages inline options keyboard navigation state.
 *
 * Scans messages from newest to oldest:
 * - If the first relevant message is user-text → no active options (user already replied)
 * - If an agent-text contains <options> → those become activeItems
 *
 * On web, registers window-level keydown listeners for ArrowUp/Down/Enter
 * to navigate and select options. The textarea's keydown fires first and
 * consumes events when input has text or autocomplete is open, so this
 * hook only activates when the input is empty and no autocomplete is shown.
 */

type InlineOptionsContextType = {
    activeItems: string[] | null;
    focusedIndex: number;
};

const InlineOptionsContext = React.createContext<InlineOptionsContextType>({
    activeItems: null,
    focusedIndex: 0,
});

export function useInlineOptions() {
    return React.useContext(InlineOptionsContext);
}

export function InlineOptionsProvider(props: {
    messages: Message[];
    sessionId: string;
    inputValue: string;
    children: React.ReactNode;
}) {
    const { messages, sessionId, inputValue, children } = props;

    // Find active options: scan from newest message, stop at first user message
    const activeItems = React.useMemo(() => {
        for (const msg of messages) {
            if (msg.kind === 'user-text') {
                return null;
            }
            if (msg.kind === 'agent-text') {
                const blocks = parseMarkdown(msg.text);
                for (const block of blocks) {
                    if (block.type === 'options' && block.items.length > 0) {
                        return block.items;
                    }
                }
            }
        }
        return null;
    }, [messages]);

    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const [submitted, setSubmitted] = React.useState(false);

    // Reset focusedIndex and submitted when activeItems change
    const activeItemsKey = activeItems ? activeItems.join('\0') : '';
    React.useEffect(() => {
        setFocusedIndex(0);
        setSubmitted(false);
    }, [activeItemsKey]);

    // Refs for stable access in the keyboard handler
    const focusedIndexRef = React.useRef(focusedIndex);
    focusedIndexRef.current = focusedIndex;

    const inputValueRef = React.useRef(inputValue);
    inputValueRef.current = inputValue;

    const submittedRef = React.useRef(submitted);
    submittedRef.current = submitted;

    const activeItemsRef = React.useRef(activeItems);
    activeItemsRef.current = activeItems;

    // Keyboard navigation (web only)
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (!activeItems) return;

        const len = activeItems.length;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex(i => {
                    const next = (i - 1 + len) % len;
                    focusedIndexRef.current = next;
                    return next;
                });
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex(i => {
                    const next = (i + 1) % len;
                    focusedIndexRef.current = next;
                    return next;
                });
            } else if (e.key === 'Enter' && !e.shiftKey) {
                if (inputValueRef.current.trim() === '' && !submittedRef.current && activeItemsRef.current) {
                    e.preventDefault();
                    setSubmitted(true);
                    sync.sendMessage(sessionId, activeItemsRef.current[focusedIndexRef.current]);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeItemsKey, sessionId]);

    const value = React.useMemo<InlineOptionsContextType>(() => ({
        activeItems,
        focusedIndex,
    }), [activeItems, focusedIndex]);

    return React.createElement(InlineOptionsContext.Provider, { value }, children);
}

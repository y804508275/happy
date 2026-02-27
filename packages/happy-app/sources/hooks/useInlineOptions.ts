import * as React from 'react';
import { Platform } from 'react-native';
import { parseMarkdown } from '@/components/markdown/parseMarkdown';
import { sync } from '@/sync/sync';
import { Message } from '@/sync/typesMessage';

/**
 * Manages keyboard navigation for inline options and other option bars.
 *
 * Instead of using window.addEventListener (which doesn't reliably receive
 * events from the textarea in React Native Web), this context exposes a
 * handleOptionsKey() callback. AgentInput calls it from its own handleKeyPress
 * as a fallback when no other handler consumed the key.
 *
 * Priority chain in AgentInput.handleKeyPress:
 * 1. Autocomplete navigation (ArrowUp/Down/Enter/Tab)
 * 2. Send message (Enter when input has text)
 * 3. handleOptionsKey → inline options or registered external handler (Enter/ArrowUp/Down)
 *
 * External components (e.g. FixedAskUserQuestionBar) register their keyboard
 * handlers via setExternalHandler, which takes priority over inline options.
 */

type OptionsKeyHandler = (key: string, shiftKey: boolean) => boolean;

type InlineOptionsContextType = {
    activeItems: string[] | null;
    focusedIndex: number;
    /** Called by AgentInput for unhandled keyboard events */
    handleOptionsKey: OptionsKeyHandler;
    /** Called by external option bars (AskUserQuestion, Permission) to register a handler */
    setExternalHandler: (handler: OptionsKeyHandler | null) => void;
};

const InlineOptionsContext = React.createContext<InlineOptionsContextType>({
    activeItems: null,
    focusedIndex: 0,
    handleOptionsKey: () => false,
    setExternalHandler: () => {},
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
    const { messages, sessionId, children } = props;

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

    // External handler (e.g. FixedAskUserQuestionBar keyboard navigation)
    const externalHandlerRef = React.useRef<OptionsKeyHandler | null>(null);
    const setExternalHandler = React.useCallback((handler: OptionsKeyHandler | null) => {
        externalHandlerRef.current = handler;
    }, []);

    // Unified keyboard handler called by AgentInput
    const handleOptionsKey = React.useCallback((key: string, shiftKey: boolean): boolean => {
        // External handler takes priority (AskUserQuestion / Permission bars are more urgent)
        if (externalHandlerRef.current) {
            if (externalHandlerRef.current(key, shiftKey)) {
                return true;
            }
        }

        // Inline options handling
        if (!activeItems || submitted) return false;
        const len = activeItems.length;

        if (key === 'ArrowUp') {
            setFocusedIndex(i => (i - 1 + len) % len);
            return true;
        } else if (key === 'ArrowDown') {
            setFocusedIndex(i => (i + 1) % len);
            return true;
        } else if (key === 'Enter' && !shiftKey) {
            setSubmitted(true);
            sync.sendMessage(sessionId, activeItems[focusedIndex]);
            return true;
        }

        return false;
    }, [activeItems, submitted, focusedIndex, sessionId]);

    // Window-level listener for when textarea is not focused (e.g. user clicked outside)
    // AgentInput.handleKeyPress handles events when textarea IS focused.
    const handleOptionsKeyRef = React.useRef(handleOptionsKey);
    handleOptionsKeyRef.current = handleOptionsKey;
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
            if (tag === 'textarea' || tag === 'input') return;
            if (handleOptionsKeyRef.current(e.key, e.shiftKey)) {
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const value = React.useMemo<InlineOptionsContextType>(() => ({
        activeItems,
        focusedIndex,
        handleOptionsKey,
        setExternalHandler,
    }), [activeItems, focusedIndex, handleOptionsKey, setExternalHandler]);

    return React.createElement(InlineOptionsContext.Provider, { value }, children);
}

import * as React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSessionMessages } from '@/sync/storage';
import { parseMarkdown } from '@/components/markdown/parseMarkdown';
import { sync } from '@/sync/sync';
import { Metadata } from '@/sync/storageTypes';
import { ToolCallMessage } from '@/sync/typesMessage';
import { layout } from '@/components/layout';

/**
 * Renders markdown <options> blocks in a fixed position above the input bar.
 * Supports keyboard navigation (up/down arrows + Enter) on web.
 * Only shows when the most recent messages contain options and the user
 * hasn't responded yet.
 * In 'all' autoConfirmMode, auto-selects the first option after a brief delay.
 */
export const FixedOptionsBar = React.memo((props: {
    sessionId: string;
    metadata: Metadata | null;
    autoConfirmMode?: 'off' | 'confirm' | 'all';
}) => {
    const { messages } = useSessionMessages(props.sessionId);

    // Find active options: scan from newest message, stop at first user message
    // Also track whether the user has ever sent a message in this session
    const { activeOptions, hasAnyUserMessage } = React.useMemo(() => {
        let hasPendingAskQuestion = false;
        let foundOptions: string[] | null = null;
        let hasAnyUserMessage = false;
        for (const msg of messages) {
            if (msg.kind === 'user-text') {
                hasAnyUserMessage = true;
                // If we already found options, the user message is older — keep the options
                if (foundOptions) break;
                // User message is newer than any options — no active options
                return { activeOptions: null, hasAnyUserMessage: true };
            }
            if (msg.kind === 'tool-call') {
                const toolMsg = msg as ToolCallMessage;
                if (toolMsg.tool?.name === 'AskUserQuestion' && toolMsg.tool.state === 'running') {
                    hasPendingAskQuestion = true;
                }
            }
            if (!foundOptions && msg.kind === 'agent-text') {
                const blocks = parseMarkdown(msg.text);
                for (const block of blocks) {
                    if (block.type === 'options' && block.items.length > 0) {
                        // Skip if AskUserQuestion is also pending (avoid duplicate options)
                        if (hasPendingAskQuestion) return { activeOptions: null, hasAnyUserMessage };
                        foundOptions = block.items;
                        break;
                    }
                }
            }
        }
        // If we found options, continue scanning determined hasAnyUserMessage
        if (foundOptions) {
            // If we broke out of the loop after finding a user message, hasAnyUserMessage is already true
            // If we exhausted all messages without finding a user message, it stays false
            return { activeOptions: foundOptions, hasAnyUserMessage };
        }
        return { activeOptions: null, hasAnyUserMessage };
    }, [messages]);

    if (!activeOptions) {
        return null;
    }

    return (
        <View style={barStyles.container}>
            <FixedOptionsContent
                items={activeOptions}
                sessionId={props.sessionId}
                autoConfirmMode={props.autoConfirmMode}
                hasAnyUserMessage={hasAnyUserMessage}
            />
        </View>
    );
});

const FixedOptionsContent = React.memo(({ items, sessionId, autoConfirmMode, hasAnyUserMessage }: {
    items: string[];
    sessionId: string;
    autoConfirmMode?: 'off' | 'confirm' | 'all';
    hasAnyUserMessage: boolean;
}) => {
    const { theme } = useUnistyles();
    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const [submitted, setSubmitted] = React.useState(false);
    const focusedIndexRef = React.useRef(0);
    focusedIndexRef.current = focusedIndex;

    const handleSelect = React.useCallback((index: number) => {
        if (submitted) return;
        setSubmitted(true);
        sync.sendMessage(sessionId, items[index]);
    }, [sessionId, items, submitted]);

    const handleSelectRef = React.useRef(handleSelect);
    handleSelectRef.current = handleSelect;

    // Only auto-select options in 'all' mode (confirm mode only auto-approves permissions)
    // But NOT if user hasn't sent any message yet (initial greeting — let user choose)
    const isAutoMode = autoConfirmMode === 'all';
    const autoTriggered = React.useRef(false);
    React.useEffect(() => {
        if (!isAutoMode || autoTriggered.current || submitted || !hasAnyUserMessage) return;
        autoTriggered.current = true;
        setFocusedIndex(0);
        const timer = setTimeout(() => {
            handleSelectRef.current(0);
        }, 300);
        return () => clearTimeout(timer);
    }, [isAutoMode, submitted, hasAnyUserMessage]);

    // Keyboard navigation: up/down to focus, enter to confirm (web only)
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex(i => {
                    const next = (i - 1 + items.length) % items.length;
                    focusedIndexRef.current = next;
                    return next;
                });
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex(i => {
                    const next = (i + 1) % items.length;
                    focusedIndexRef.current = next;
                    return next;
                });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleSelectRef.current(focusedIndexRef.current);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [items.length]);

    return (
        <View style={contentStyles.wrapper}>
            {isAutoMode && (
                <Text style={[contentStyles.autoLabel, { color: theme.colors.radio.active }]}>Auto</Text>
            )}
            {items.map((item, index) => (
                <Pressable
                    key={index}
                    style={({ pressed }) => [
                        contentStyles.optionItem,
                        focusedIndex === index && contentStyles.optionItemFocused,
                        pressed && contentStyles.optionItemPressed,
                        submitted && contentStyles.optionItemDisabled,
                    ]}
                    onPress={() => handleSelect(index)}
                    disabled={submitted}
                >
                    <Text style={[
                        contentStyles.optionText,
                        focusedIndex === index && contentStyles.optionTextFocused,
                    ]}>{item}</Text>
                </Pressable>
            ))}
        </View>
    );
});

const barStyles = StyleSheet.create((theme) => ({
    container: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.maxWidth,
    },
}));

const contentStyles = StyleSheet.create((theme) => ({
    wrapper: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 4,
    },
    autoLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    optionItem: {
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
    },
    optionItemFocused: {
        backgroundColor: theme.colors.surfaceHigh,
        borderLeftColor: theme.colors.textSecondary,
    },
    optionItemPressed: {
        opacity: 0.7,
        backgroundColor: theme.colors.surfaceHigh,
    },
    optionItemDisabled: {
        opacity: 0.4,
    },
    optionText: {
        fontSize: 15,
        color: theme.colors.text,
    },
    optionTextFocused: {
        fontWeight: '500',
    },
}));

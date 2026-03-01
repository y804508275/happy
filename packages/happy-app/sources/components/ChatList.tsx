import * as React from 'react';
import { useSession, useSessionMessages, useStreamingText, storage } from "@/sync/storage";
import { FlatList, NativeSyntheticEvent, NativeScrollEvent, Platform, Pressable, View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHeaderHeight } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MessageView } from './MessageView';
import { MarkdownView } from './markdown/MarkdownView';
import { Metadata, Session } from '@/sync/storageTypes';
import { ChatFooter } from './ChatFooter';
import { Message, ToolCallMessage } from '@/sync/typesMessage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { layout } from './layout';
import { ToolCallGroupView } from './chat/ToolCallGroupView';

// --- Tool call grouping ---

type ToolCallGroup = {
    kind: 'tool-call-group';
    id: string;
    messages: ToolCallMessage[];
    createdAt: number;
};

type ListItem = Message | ToolCallGroup;

function groupMessages(messages: Message[]): ListItem[] {
    const result: ListItem[] = [];
    let currentRun: ToolCallMessage[] = [];

    const flushRun = () => {
        if (currentRun.length >= 1) {
            // All consecutive tool calls become a group (even single ones).
            // This keeps the FlatList key stable as new tools join the run.
            const oldest = currentRun[currentRun.length - 1];
            result.push({
                kind: 'tool-call-group',
                id: `group-${oldest.id}`,
                messages: [...currentRun],
                createdAt: oldest.createdAt,
            });
        }
        currentRun = [];
    };

    for (const message of messages) {
        if (message.kind === 'tool-call' && message.tool) {
            currentRun.push(message);
        } else {
            flushRun();
            result.push(message);
        }
    }
    flushRun();

    return result;
}

export const ChatList = React.memo((props: { session: Session }) => {
    const { messages } = useSessionMessages(props.session.id);
    return (
        <ChatListInternal
            metadata={props.session.metadata}
            sessionId={props.session.id}
            messages={messages}
        />
    )
});

const ListHeader = React.memo(() => {
    const headerHeight = useHeaderHeight();
    const safeArea = useSafeAreaInsets();
    return <View style={{ flexDirection: 'row', alignItems: 'center', height: headerHeight + safeArea.top + 32 }} />;
});

const StreamingMessage = React.memo((props: { text: string }) => {
    return (
        <View style={streamingStyles.container}>
            <View style={streamingStyles.content}>
                <View style={streamingStyles.textContainer}>
                    <MarkdownView markdown={props.text} />
                </View>
            </View>
        </View>
    );
});

const ListFooter = React.memo((props: { sessionId: string }) => {
    const session = useSession(props.sessionId)!;
    const streamingText = useStreamingText(props.sessionId);
    return (
        <>
            {streamingText ? <StreamingMessage text={streamingText} /> : null}
            <ChatFooter controlledByUser={session.agentState?.controlledByUser || false} />
        </>
    )
});

const ScrollToBottomButton = React.memo(({ onPress }: { onPress: () => void }) => {
    const { theme } = useUnistyles();
    return (
        <View style={scrollButtonStyles.container}>
            <Pressable
                style={({ pressed }) => [
                    scrollButtonStyles.button,
                    pressed ? scrollButtonStyles.buttonPressed : scrollButtonStyles.buttonDefault
                ]}
                onPress={onPress}
            >
                <Ionicons name="chevron-down" size={24} color={theme.colors.fab.icon} />
            </Pressable>
        </View>
    );
});

const ChatListInternal = React.memo((props: {
    metadata: Metadata | null,
    sessionId: string,
    messages: Message[],
}) => {
    const listItems = React.useMemo(() => groupMessages(props.messages), [props.messages]);

    const keyExtractor = useCallback((item: ListItem) => item.id, []);
    const renderItem = useCallback(({ item }: { item: ListItem }) => {
        if (item.kind === 'tool-call-group') {
            return (
                <View style={groupWrapperStyles.container}>
                    <View style={groupWrapperStyles.content}>
                        <ToolCallGroupView
                            messages={item.messages}
                            metadata={props.metadata}
                            sessionId={props.sessionId}
                        />
                    </View>
                </View>
            );
        }
        return (
            <MessageView message={item} metadata={props.metadata} sessionId={props.sessionId} />
        );
    }, [props.metadata, props.sessionId]);

    // Track whether the user is near the visual bottom (latest messages).
    // In an inverted FlatList, offsetY ≈ 0 corresponds to the visual bottom.
    const isNearBottomRef = useRef(true);
    const [showScrollButton, setShowScrollButton] = useState(false);

    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetY = e.nativeEvent.contentOffset.y;
        const nearBottom = offsetY < 100;
        isNearBottomRef.current = nearBottom;
        setShowScrollButton(!nearBottom);
    }, []);

    // Web: compensate scrollTop when content changes to prevent layout shift.
    // react-native-web does not support maintainVisibleContentPosition, so without
    // this the inverted (scaleY(-1)) FlatList jumps when new items are inserted
    // or when streaming text grows in the ListHeaderComponent.
    //
    // We use ResizeObserver on the scroll content element for reliable detection
    // (onContentSizeChange can miss ListHeaderComponent changes), and disable
    // browser scroll anchoring which conflicts with scaleY(-1) compensation.
    //
    // IMPORTANT: We only compensate when new messages are actually added (data length
    // increases) or when streaming is active. Without this guard, FlatList
    // virtualization causes spurious content size changes as items are recycled,
    // and blindly compensating for those pushes the scroll position far into old messages.
    const flatListRef = useRef<FlatList>(null);
    const prevMessageCountRef = useRef<number>(props.messages.length);
    const hasNewMessagesRef = useRef(false);
    const sessionIdRef = useRef(props.sessionId);
    sessionIdRef.current = props.sessionId;

    // Detect when new messages are prepended to the list
    if (props.messages.length > prevMessageCountRef.current) {
        hasNewMessagesRef.current = true;
    }
    prevMessageCountRef.current = props.messages.length;

    useEffect(() => {
        if (Platform.OS !== 'web') return;

        let observer: MutationObserver | null = null;
        let rafId = 0;
        let prevHeight = 0;

        // Retry getting the scroll node — FlatList DOM may not be ready on first frame
        const setup = () => {
            const node = (flatListRef.current as any)?.getScrollableNode?.();
            if (!node) {
                rafId = requestAnimationFrame(setup);
                return;
            }

            // Disable browser scroll anchoring — it conflicts with our manual
            // compensation in the scaleY(-1) inverted list
            node.style.overflowAnchor = 'none';

            prevHeight = node.scrollHeight;

            // Use MutationObserver to detect ALL DOM changes (streaming text,
            // new messages, virtualization). ResizeObserver on firstElementChild
            // can miss changes if the observed element isn't the actual content wrapper.
            observer = new MutationObserver(() => {
                // Batch multiple mutations within the same frame
                if (rafId) return;
                rafId = requestAnimationFrame(() => {
                    rafId = 0;
                    const newHeight = node.scrollHeight;
                    if (newHeight === prevHeight) return;

                    const delta = newHeight - prevHeight;
                    prevHeight = newHeight;

                    const currentScrollTop = node.scrollTop;
                    const nearBottom = currentScrollTop < 100;

                    if (nearBottom) {
                        // User is at the bottom watching new messages → stay at bottom
                        node.scrollTop = 0;
                    } else if (delta > 0 && (hasNewMessagesRef.current || !!storage.getState().streamingTexts[sessionIdRef.current])) {
                        // Content grew from new messages or streaming → compensate to prevent jump
                        node.scrollTop = currentScrollTop + delta;
                        hasNewMessagesRef.current = false;
                    }
                    // When content size changes from virtualization (item recycling) or
                    // content shrinking (streaming text cleared), do NOT compensate.
                });
            });

            observer.observe(node, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        };

        rafId = requestAnimationFrame(setup);

        return () => {
            if (observer) observer.disconnect();
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, []);

    const scrollToBottom = useCallback(() => {
        if (Platform.OS === 'web') {
            const node = (flatListRef.current as any)?.getScrollableNode?.();
            if (node) node.scrollTop = 0;
        } else {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
    }, []);

    return (
        <View style={{ flex: 1 }}>
            <FlatList
                ref={flatListRef}
                data={listItems}
                inverted={true}
                keyExtractor={keyExtractor}
                maintainVisibleContentPosition={{
                    minIndexForVisible: 0,
                    autoscrollToTopThreshold: 10,
                }}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
                renderItem={renderItem}
                ListHeaderComponent={<ListFooter sessionId={props.sessionId} />}
                ListFooterComponent={<ListHeader />}
            />
            {showScrollButton && (
                <ScrollToBottomButton onPress={scrollToBottom} />
            )}
        </View>
    )
});

const scrollButtonStyles = StyleSheet.create((theme) => ({
    container: {
        position: 'absolute',
        bottom: 16,
        right: 16,
    },
    button: {
        borderRadius: 20,
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 3.84,
        shadowOpacity: theme.colors.shadow.opacity,
        elevation: 5,
    },
    buttonDefault: {
        backgroundColor: theme.colors.fab.background,
    },
    buttonPressed: {
        backgroundColor: theme.colors.fab.backgroundPressed,
    },
}));

const groupWrapperStyles = StyleSheet.create(() => ({
    container: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    content: {
        flexDirection: 'column',
        flexGrow: 1,
        flexBasis: 0,
        maxWidth: layout.maxWidth,
    },
}));

const streamingStyles = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    content: {
        flexDirection: 'column',
        flexGrow: 1,
        flexBasis: 0,
        maxWidth: layout.maxWidth,
    },
    textContainer: {
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 16,
        alignSelf: 'flex-start',
    },
}));
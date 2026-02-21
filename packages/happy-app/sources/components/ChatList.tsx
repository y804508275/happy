import * as React from 'react';
import { useSession, useSessionMessages, useStreamingText } from "@/sync/storage";
import { FlatList, NativeSyntheticEvent, NativeScrollEvent, Platform, Pressable, View } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useHeaderHeight } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MessageView } from './MessageView';
import { MarkdownView } from './markdown/MarkdownView';
import { Metadata, Session } from '@/sync/storageTypes';
import { ChatFooter } from './ChatFooter';
import { Message } from '@/sync/typesMessage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { layout } from './layout';

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
    const keyExtractor = useCallback((item: any) => item.id, []);
    const renderItem = useCallback(({ item }: { item: any }) => (
        <MessageView message={item} metadata={props.metadata} sessionId={props.sessionId} />
    ), [props.metadata, props.sessionId]);

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

    // Web: compensate scrollTop when content size changes to prevent layout shift.
    // react-native-web does not support maintainVisibleContentPosition, so without
    // this the inverted (scaleY(-1)) FlatList jumps when new items are inserted.
    // We only compensate when the user is browsing old messages; when at the bottom,
    // we keep scrollTop=0 so new content appears naturally.
    const flatListRef = useRef<FlatList>(null);
    const prevContentHeight = useRef<number>(0);
    const handleContentSizeChange = useCallback((_w: number, h: number) => {
        if (Platform.OS !== 'web') return;
        const prev = prevContentHeight.current;
        prevContentHeight.current = h;
        if (prev > 0 && h > prev) {
            const node = (flatListRef.current as any)?.getScrollableNode?.();
            if (!node) return;
            if (isNearBottomRef.current) {
                // User is at the bottom watching new messages → keep scrollTop=0
                node.scrollTop = 0;
            } else {
                // User is browsing old messages → compensate to prevent jump
                node.scrollTop += h - prev;
            }
        }
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
                data={props.messages}
                inverted={true}
                keyExtractor={keyExtractor}
                maintainVisibleContentPosition={{
                    minIndexForVisible: 0,
                    autoscrollToTopThreshold: 10,
                }}
                onScroll={handleScroll}
                scrollEventThrottle={100}
                onContentSizeChange={handleContentSizeChange}
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
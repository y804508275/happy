import * as React from 'react';
import { View, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCallMessage } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { ToolView } from '../tools/ToolView';

interface ToolCallGroupViewProps {
    messages: ToolCallMessage[];
    metadata: Metadata | null;
    sessionId: string;
}

const PEEK_HEIGHT = 6;
const MAX_PEEKS = 3;

export const ToolCallGroupView = React.memo<ToolCallGroupViewProps>((props) => {
    const { messages, metadata, sessionId } = props;
    const { theme } = useUnistyles();
    const [expanded, setExpanded] = React.useState(false);

    // Newest message is first in array (messages are newest-first)
    const topMessage = messages[0];
    const peekCount = Math.min(messages.length - 1, MAX_PEEKS);

    // Animation for expand/collapse
    const contentHeight = useSharedValue(0);
    const [measuredHeight, setMeasuredHeight] = React.useState(0);

    React.useEffect(() => {
        contentHeight.value = withTiming(
            expanded ? measuredHeight : 0,
            { duration: 250, easing: Easing.out(Easing.cubic) }
        );
    }, [expanded, measuredHeight]);

    const animatedStyle = useAnimatedStyle(() => ({
        height: contentHeight.value,
        overflow: 'hidden' as const,
    }));

    const toggleExpanded = React.useCallback(() => {
        setExpanded(prev => !prev);
    }, []);

    const onContentLayout = React.useCallback((e: any) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && h !== measuredHeight) {
            setMeasuredHeight(h);
        }
    }, [measuredHeight]);

    // Reverse for chronological order when expanded
    const orderedMessages = React.useMemo(
        () => [...messages].reverse(),
        [messages]
    );

    return (
        <View style={styles.outerContainer}>
            {/* Stacked card: top card + peek bars */}
            <Pressable onPress={toggleExpanded}>
                <View style={styles.topCard}>
                    <ToolView
                        tool={topMessage.tool}
                        metadata={metadata}
                        messages={topMessage.children}
                        sessionId={sessionId}
                        messageId={topMessage.id}
                    />
                </View>

                {peekCount > 0 && (
                    <View style={styles.peekArea}>
                        {Array.from({ length: peekCount }).map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.peekBar,
                                    {
                                        backgroundColor: theme.colors.surfaceHighest,
                                        marginHorizontal: (i + 1) * 4,
                                    },
                                ]}
                            />
                        ))}
                    </View>
                )}
            </Pressable>

            {/* Expanded: all tool calls */}
            <Animated.View style={animatedStyle}>
                <View onLayout={onContentLayout}>
                    {orderedMessages.map((msg) => (
                        <View key={msg.id} style={styles.expandedItem}>
                            <ToolView
                                tool={msg.tool}
                                metadata={metadata}
                                messages={msg.children}
                                sessionId={sessionId}
                                messageId={msg.id}
                            />
                        </View>
                    ))}
                </View>
            </Animated.View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    outerContainer: {
        marginHorizontal: 8,
        marginVertical: 4,
    },
    topCard: {
        borderRadius: 8,
        overflow: 'hidden',
    },
    peekArea: {
        gap: 2,
    },
    peekBar: {
        height: PEEK_HEIGHT,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6,
    },
    expandedItem: {
        marginTop: 4,
    },
}));

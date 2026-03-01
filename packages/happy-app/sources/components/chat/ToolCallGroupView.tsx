import * as React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCallMessage } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { ToolView } from '../tools/ToolView';
import { knownTools } from '../tools/knownTools';
import { formatMCPTitle } from '../tools/views/MCPToolView';

interface ToolCallGroupViewProps {
    messages: ToolCallMessage[];
    metadata: Metadata | null;
    sessionId: string;
}

function getToolDisplayName(toolName: string, tool: any, metadata: Metadata | null): string {
    if (toolName.startsWith('mcp__')) {
        return formatMCPTitle(toolName);
    }
    const known = knownTools[toolName as keyof typeof knownTools] as any;
    if (known?.title) {
        if (typeof known.title === 'function') {
            return known.title({ tool, metadata });
        }
        return known.title;
    }
    return toolName;
}

export const ToolCallGroupView = React.memo<ToolCallGroupViewProps>((props) => {
    const { messages, metadata, sessionId } = props;
    const { theme } = useUnistyles();
    const [expanded, setExpanded] = React.useState(false);

    // Build tool name summary
    const toolNameSummary = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const msg of messages) {
            const name = getToolDisplayName(msg.tool.name, msg.tool, metadata);
            counts.set(name, (counts.get(name) || 0) + 1);
        }
        const parts: string[] = [];
        for (const [name, count] of counts) {
            parts.push(count > 1 ? `${name} ×${count}` : name);
        }
        const summary = parts.join(', ');
        return summary.length > 60 ? summary.slice(0, 57) + '...' : summary;
    }, [messages, metadata]);

    // Height animation
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

    // Measure actual content height
    const onContentLayout = React.useCallback((e: any) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && h !== measuredHeight) {
            setMeasuredHeight(h);
        }
    }, [measuredHeight]);

    // Reverse messages for correct chronological order in inverted list
    const orderedMessages = React.useMemo(
        () => [...messages].reverse(),
        [messages]
    );

    return (
        <View style={styles.container}>
                {/* Header - always visible */}
                <Pressable style={styles.header} onPress={toggleExpanded}>
                    <View style={styles.headerLeft}>
                        <View style={styles.iconContainer}>
                            <Ionicons name="layers-outline" size={18} color={theme.colors.textSecondary} />
                        </View>
                        <View style={styles.titleContainer}>
                            <Text style={styles.title}>
                                {messages.length} tool calls
                            </Text>
                            <Text style={styles.subtitle} numberOfLines={1}>
                                {toolNameSummary}
                            </Text>
                        </View>
                        <Ionicons
                            name={expanded ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color={theme.colors.textSecondary}
                        />
                    </View>
                </Pressable>

                {/* Animated expandable content */}
                <Animated.View style={animatedStyle}>
                    <View onLayout={onContentLayout}>
                        {orderedMessages.map((msg) => (
                            <View key={msg.id} style={styles.toolItem}>
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
    container: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 8,
        marginVertical: 4,
        marginHorizontal: 8,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    iconContainer: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleContainer: {
        flex: 1,
    },
    title: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    subtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    toolItem: {
        marginHorizontal: 4,
        marginTop: 4,
    },
}));

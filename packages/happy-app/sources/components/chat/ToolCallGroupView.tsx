import * as React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { ToolCallMessage, ToolCall, Message } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { knownTools } from '../tools/knownTools';
import { useRouter } from 'expo-router';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { parseToolUseError } from '@/utils/toolErrorParser';
import { formatMCPTitle } from '../tools/views/MCPToolView';
import { t } from '@/text';

interface ToolCallGroupViewProps {
    messages: ToolCallMessage[];
    metadata: Metadata | null;
    sessionId: string;
}

export const ToolCallGroupView = React.memo<ToolCallGroupViewProps>((props) => {
    const { messages, metadata, sessionId } = props;
    const { theme } = useUnistyles();

    // Check if any tools are currently running
    const hasRunning = messages.some(msg => msg.tool?.state === 'running');

    // Default: expanded if running, collapsed if all done
    const [expanded, setExpanded] = React.useState(hasRunning);

    // Auto-expand when a new tool starts running
    React.useEffect(() => {
        if (hasRunning) {
            setExpanded(true);
        }
    }, [hasRunning]);

    // Count running tools
    const runningCount = messages.filter(msg => msg.tool?.state === 'running').length;

    // Reverse for chronological order
    const orderedMessages = React.useMemo(
        () => [...messages].reverse(),
        [messages]
    );

    // Animation for expand/collapse
    const contentHeight = useSharedValue(0);
    const [measuredHeight, setMeasuredHeight] = React.useState(0);

    React.useEffect(() => {
        contentHeight.value = withTiming(
            expanded ? measuredHeight : 0,
            { duration: 200, easing: Easing.out(Easing.cubic) }
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

    // For single tool call, just show a compact line
    if (messages.length === 1) {
        const msg = messages[0];
        return (
            <View style={styles.container}>
                <CompactToolLine
                    tool={msg.tool}
                    metadata={metadata}
                    messages={msg.children}
                    sessionId={sessionId}
                    messageId={msg.id}
                />
            </View>
        );
    }

    // For multiple tool calls, show collapsible group
    const totalCount = messages.length;
    const allDone = runningCount === 0;

    // Header text
    const headerText = allDone
        ? t('tools.group.stepsCompleted')
        : t('tools.group.steps');

    return (
        <View style={styles.container}>
            {/* Collapsible header */}
            <Pressable style={styles.header} onPress={toggleExpanded}>
                <Ionicons
                    name={expanded ? 'chevron-down' : 'chevron-forward'}
                    size={16}
                    color={theme.colors.textSecondary}
                />
                <View style={[styles.countBadge, { backgroundColor: theme.colors.surfaceHighest }]}>
                    <Text style={styles.countText}>{totalCount}</Text>
                </View>
                <Text style={styles.headerText}>{headerText}</Text>
                {runningCount > 0 && (
                    <ActivityIndicator
                        size="small"
                        color={theme.colors.textSecondary}
                        style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }], marginLeft: 4 }}
                    />
                )}
            </Pressable>

            {/* Expanded content */}
            <Animated.View style={animatedStyle}>
                <View onLayout={onContentLayout}>
                    {orderedMessages.map((msg) => (
                        <CompactToolLine
                            key={msg.id}
                            tool={msg.tool}
                            metadata={metadata}
                            messages={msg.children}
                            sessionId={sessionId}
                            messageId={msg.id}
                        />
                    ))}
                </View>
            </Animated.View>
        </View>
    );
});

// --- Compact line for a single tool call ---

interface CompactToolLineProps {
    tool: ToolCall;
    metadata: Metadata | null;
    messages?: Message[];
    sessionId: string;
    messageId: string;
}

const CompactToolLine = React.memo<CompactToolLineProps>((props) => {
    const { tool, metadata, messages, sessionId, messageId } = props;
    const router = useRouter();
    const { theme } = useUnistyles();

    const handlePress = React.useCallback(() => {
        router.push(`/session/${sessionId}/message/${messageId}`);
    }, [sessionId, messageId, router]);

    // Resolve tool info using knownTools (same logic as ToolView)
    let knownTool = knownTools[tool.name as keyof typeof knownTools] as any;

    // Tool title
    let toolTitle = tool.name;
    if (tool.name.startsWith('mcp__')) {
        toolTitle = formatMCPTitle(tool.name);
    } else if (knownTool?.title) {
        if (typeof knownTool.title === 'function') {
            toolTitle = knownTool.title({ tool, metadata });
        } else {
            toolTitle = knownTool.title;
        }
    }

    // Extract subtitle
    let subtitle: string | null = null;
    if (knownTool && typeof knownTool.extractSubtitle === 'function') {
        const extracted = knownTool.extractSubtitle({ tool, metadata });
        if (typeof extracted === 'string' && extracted) {
            subtitle = extracted;
        }
    }

    // Determine status icon
    let isToolUseError = false;
    if (tool.state === 'error' && tool.result && parseToolUseError(tool.result).isToolUseError) {
        isToolUseError = true;
    }

    const isDenied = tool.permission && (tool.permission.status === 'denied' || tool.permission.status === 'canceled');

    let statusIcon: React.ReactNode = null;

    if (isDenied) {
        statusIcon = <Ionicons name="remove-circle" size={16} color={theme.colors.textSecondary} />;
    } else if (isToolUseError) {
        statusIcon = <Ionicons name="remove-circle" size={16} color={theme.colors.textSecondary} />;
    } else {
        switch (tool.state) {
            case 'running':
                statusIcon = (
                    <ActivityIndicator
                        size="small"
                        color={theme.colors.textSecondary}
                        style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                    />
                );
                break;
            case 'completed':
                statusIcon = <Ionicons name="checkmark-circle" size={16} color="#34C759" />;
                break;
            case 'error':
                statusIcon = <Ionicons name="close-circle" size={16} color={theme.colors.warning} />;
                break;
        }
    }

    return (
        <Pressable style={styles.lineContainer} onPress={handlePress}>
            <View style={styles.lineStatusIcon}>
                {statusIcon}
            </View>
            <Text style={styles.lineToolName} numberOfLines={1}>
                {toolTitle}
            </Text>
            {subtitle && (
                <Text style={styles.lineSubtitle} numberOfLines={1}>
                    {subtitle}
                </Text>
            )}
            {tool.state === 'running' && (
                <View style={styles.lineElapsed}>
                    <ElapsedView from={tool.createdAt} />
                </View>
            )}
        </Pressable>
    );
});

function ElapsedView(props: { from: number }) {
    const { from } = props;
    const elapsed = useElapsedTime(from);
    return <Text style={styles.elapsedText}>{elapsed.toFixed(1)}s</Text>;
}

const styles = StyleSheet.create((theme) => ({
    container: {
        marginHorizontal: 8,
        marginVertical: 2,
    },
    // --- Header ---
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 8,
        gap: 6,
    },
    countBadge: {
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 1,
        minWidth: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    countText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    headerText: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.textSecondary,
    },
    // --- Compact line ---
    lineContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        gap: 6,
    },
    lineStatusIcon: {
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lineToolName: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.text,
        flexShrink: 0,
    },
    lineSubtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        flex: 1,
    },
    lineElapsed: {
        marginLeft: 'auto',
    },
    elapsedText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
}));

import * as React from 'react';
import { View, Text, Platform } from 'react-native';
import { ToolViewProps } from './_all';
import { ToolView } from '../ToolView';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { Message } from '@/sync/typesMessage';
import { Ionicons } from '@expo/vector-icons';
import { Metadata } from '@/sync/storageTypes';
import { StyleSheet } from 'react-native-unistyles';
import { toolFullViewStyles } from '../ToolFullView';
import { t } from '@/text';

export const TaskViewFull = React.memo<ToolViewProps>(({ tool, metadata, messages }) => {
    if (!messages || messages.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={48} color="#8E8E93" />
                <Text style={styles.emptyText}>{t('tools.taskViewFull.noDetails')}</Text>
            </View>
        );
    }

    // Filter out thinking messages and keep meaningful content
    const meaningfulMessages = messages.filter(msg => {
        if (msg.kind === 'agent-text' && msg.isThinking) return false;
        return true;
    });

    return (
        <View style={styles.container}>
            {/* Task prompt/description */}
            {tool.input?.prompt && (
                <View style={toolFullViewStyles.section}>
                    <View style={toolFullViewStyles.sectionHeader}>
                        <Ionicons name="document-text-outline" size={20} color="#5856D6" />
                        <Text style={toolFullViewStyles.sectionTitle}>{t('tools.taskViewFull.taskPrompt')}</Text>
                    </View>
                    <Text style={styles.promptText}>{tool.input.prompt}</Text>
                </View>
            )}

            {/* Execution steps timeline */}
            <View style={toolFullViewStyles.section}>
                <View style={toolFullViewStyles.sectionHeader}>
                    <Ionicons name="list-outline" size={20} color="#5856D6" />
                    <Text style={toolFullViewStyles.sectionTitle}>
                        {t('tools.taskViewFull.executionDetails')}
                    </Text>
                </View>
                <View style={styles.timeline}>
                    {meaningfulMessages.map((msg, index) => (
                        <MessageItem
                            key={msg.id || `msg-${index}`}
                            message={msg}
                            metadata={metadata}
                            isLast={index === meaningfulMessages.length - 1}
                        />
                    ))}
                </View>
            </View>

            {/* Final result */}
            {tool.state === 'completed' && tool.result && (
                <View style={toolFullViewStyles.section}>
                    <View style={toolFullViewStyles.sectionHeader}>
                        <Ionicons name="checkmark-circle" size={20} color="#34C759" />
                        <Text style={toolFullViewStyles.sectionTitle}>{t('tools.taskViewFull.result')}</Text>
                    </View>
                    <View style={styles.resultContent}>
                        <MarkdownView markdown={typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)} />
                    </View>
                </View>
            )}

            {/* Error state */}
            {tool.state === 'error' && tool.result && (
                <View style={toolFullViewStyles.section}>
                    <View style={toolFullViewStyles.sectionHeader}>
                        <Ionicons name="close-circle" size={20} color="#FF3B30" />
                        <Text style={toolFullViewStyles.sectionTitle}>{t('tools.fullView.error')}</Text>
                    </View>
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{String(tool.result)}</Text>
                    </View>
                </View>
            )}
        </View>
    );
});

const MessageItem = React.memo(({ message, metadata, isLast }: {
    message: Message;
    metadata: Metadata | null;
    isLast: boolean;
}) => {
    if (message.kind === 'agent-text') {
        return (
            <View style={[styles.messageItem, !isLast && styles.messageItemBorder]}>
                <View style={styles.messageHeader}>
                    <Ionicons name="chatbubble-outline" size={14} color="#8E8E93" />
                    <Text style={styles.messageLabel}>{t('tools.taskViewFull.agentResponse')}</Text>
                </View>
                <View style={styles.messageContent}>
                    <MarkdownView markdown={message.text} />
                </View>
            </View>
        );
    }

    if (message.kind === 'tool-call') {
        return (
            <View style={[styles.messageItem, !isLast && styles.messageItemBorder]}>
                <ToolView
                    tool={message.tool}
                    metadata={metadata}
                    messages={message.children}
                />
            </View>
        );
    }

    if (message.kind === 'user-text') {
        return (
            <View style={[styles.messageItem, !isLast && styles.messageItemBorder]}>
                <View style={styles.messageHeader}>
                    <Ionicons name="person-outline" size={14} color="#8E8E93" />
                    <Text style={styles.messageLabel}>{t('tools.taskViewFull.userMessage')}</Text>
                </View>
                <View style={styles.messageContent}>
                    <Text style={styles.userText}>{message.text}</Text>
                </View>
            </View>
        );
    }

    return null;
});

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingTop: 8,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 48,
        gap: 12,
    },
    emptyText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
    },
    promptText: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 8,
        padding: 12,
        overflow: 'hidden',
    },
    timeline: {
        gap: 0,
    },
    messageItem: {
        paddingVertical: 8,
    },
    messageItemBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    messageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    messageLabel: {
        fontSize: 12,
        fontWeight: '500',
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    messageContent: {
        paddingLeft: 4,
    },
    userText: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.text,
    },
    resultContent: {
        paddingLeft: 4,
    },
    errorContainer: {
        backgroundColor: theme.colors.box.error.background,
        borderRadius: 8,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.box.error.border,
    },
    errorText: {
        fontSize: 14,
        color: theme.colors.box.error.text,
        lineHeight: 20,
    },
}));

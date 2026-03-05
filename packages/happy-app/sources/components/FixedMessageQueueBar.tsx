import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { layout } from '@/components/layout';
import { t } from '@/text';
import type { QueuedMessage } from '@/-session/useMessageQueue';

/**
 * Renders queued messages in a fixed position above the input bar.
 * Shows messages that the user sent while the AI was still thinking.
 * Each message can be deleted by tapping a close button.
 * Follows the same FixedBar container pattern as FixedPermissionBar.
 */
export const FixedMessageQueueBar = React.memo((props: {
    queue: QueuedMessage[];
    onRemove: (id: string) => void;
}) => {
    const { theme } = useUnistyles();

    if (props.queue.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            <View style={styles.wrapper}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                    {t('agentInput.messageQueue.label', { count: props.queue.length })}
                    {' · '}
                    {t('agentInput.messageQueue.hint')}
                </Text>
                {props.queue.map((msg) => (
                    <View key={msg.id} style={[styles.item, { backgroundColor: theme.colors.input.background }]}>
                        <View style={styles.itemContent}>
                            <Text
                                style={[styles.itemText, { color: theme.colors.text }]}
                                numberOfLines={2}
                            >
                                {msg.text || (msg.images.length > 0 ? `[${msg.images.length} image${msg.images.length > 1 ? 's' : ''}]` : '') + (msg.files.length > 0 ? `[${msg.files.length} file${msg.files.length > 1 ? 's' : ''}]` : '')}
                            </Text>
                            {(msg.images.length > 0 || msg.files.length > 0 || msg.mdRefs.length > 0) && msg.text.length > 0 && (
                                <Text style={[styles.attachmentHint, { color: theme.colors.textSecondary }]}>
                                    {[
                                        msg.images.length > 0 ? `${msg.images.length} img` : '',
                                        msg.files.length > 0 ? `${msg.files.length} file` : '',
                                        msg.mdRefs.length > 0 ? `${msg.mdRefs.length} ref` : '',
                                    ].filter(Boolean).join(' · ')}
                                </Text>
                            )}
                        </View>
                        <Pressable
                            onPress={() => props.onRemove(msg.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={styles.removeButton}
                        >
                            <Ionicons name="close" size={14} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>
                ))}
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.maxWidth,
    },
    wrapper: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        gap: 6,
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 8,
    },
    itemContent: {
        flex: 1,
        gap: 2,
    },
    itemText: {
        fontSize: 13,
        lineHeight: 18,
    },
    attachmentHint: {
        fontSize: 11,
    },
    removeButton: {
        padding: 4,
    },
}));

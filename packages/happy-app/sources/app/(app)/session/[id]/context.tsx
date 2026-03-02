import React, { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSession, useIsDataReady } from '@/sync/storage';
import { useAuth } from '@/auth/AuthContext';
import { Modal } from '@/modal';
import { useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import type { SharedItemFull } from '@/sync/sharedItemTypes';

function KnowledgeBaseContent({ sessionId }: { sessionId: string }) {
    const { theme } = useUnistyles();
    const session = useSession(sessionId);
    const { credentials } = useAuth();
    const workingDirectory = session?.metadata?.path || '';

    const { globalItems, projectItems, loading, deleteItem, fetchItemContent } =
        useKnowledgeBase(credentials, workingDirectory);

    // Track expanded item content by ID
    const [expanded, setExpanded] = useState<Record<string, SharedItemFull | 'loading'>>({});

    const handlePress = useCallback(async (itemId: string) => {
        if (expanded[itemId]) {
            // Collapse
            setExpanded((prev) => {
                const next = { ...prev };
                delete next[itemId];
                return next;
            });
            return;
        }
        // Expand — fetch content
        setExpanded((prev) => ({ ...prev, [itemId]: 'loading' }));
        const full = await fetchItemContent(itemId);
        if (full) {
            setExpanded((prev) => ({ ...prev, [itemId]: full }));
        } else {
            setExpanded((prev) => {
                const next = { ...prev };
                delete next[itemId];
                return next;
            });
        }
    }, [expanded, fetchItemContent]);

    const handleDelete = useCallback((itemId: string, itemName: string) => {
        Modal.alert(
            t('knowledgeBase.deleteConfirm'),
            t('knowledgeBase.deleteConfirmMessage', { name: itemName }),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('knowledgeBase.deleteConfirm'),
                    style: 'destructive',
                    onPress: () => deleteItem(itemId),
                },
            ],
        );
    }, [deleteItem]);

    if (loading) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            </View>
        );
    }

    const isEmpty = globalItems.length === 0 && projectItems.length === 0;
    if (isEmpty) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
                <Ionicons name="book-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={{
                    color: theme.colors.text,
                    fontSize: 20,
                    marginTop: 16,
                    textAlign: 'center',
                    ...Typography.default('semiBold'),
                }}>
                    {t('knowledgeBase.emptyTitle')}
                </Text>
                <Text style={{
                    color: theme.colors.textSecondary,
                    fontSize: 15,
                    marginTop: 8,
                    textAlign: 'center',
                    ...Typography.default(),
                }}>
                    {t('knowledgeBase.emptyDescription')}
                </Text>
            </View>
        );
    }

    const renderExpandedContent = (itemId: string) => {
        const data = expanded[itemId];
        if (!data) return null;
        if (data === 'loading') {
            return (
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                </View>
            );
        }
        return (
            <View style={{
                paddingHorizontal: 16,
                paddingBottom: 12,
                backgroundColor: theme.colors.surface,
            }}>
                <Text style={{
                    color: theme.colors.text,
                    fontSize: 14,
                    lineHeight: 20,
                    ...Typography.default(),
                }}>
                    {data.content}
                </Text>
            </View>
        );
    };

    return (
        <ItemList>
            <View style={{ maxWidth: layout.maxWidth, alignSelf: 'center', width: '100%' }}>
                {globalItems.length > 0 && (
                    <ItemGroup title={t('knowledgeBase.globalContext')}>
                        {globalItems.map((item) => {
                            const tags = (item.meta?.tags as string[]) || [];
                            const isAlways = item.meta?.alwaysApply !== false;
                            const parts: string[] = [isAlways ? 'Always active' : 'On-demand'];
                            if (item.description) parts.push(item.description);
                            if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);
                            const subtitle = parts.join(' | ') || undefined;
                            return (
                                <React.Fragment key={item.id}>
                                    <Item
                                        title={item.name}
                                        subtitle={subtitle}
                                        icon={<Ionicons name="globe-outline" size={29} color="#007AFF" />}
                                        onPress={() => handlePress(item.id)}
                                        onLongPress={() => handleDelete(item.id, item.name)}
                                        showChevron={false}
                                    />
                                    {renderExpandedContent(item.id)}
                                </React.Fragment>
                            );
                        })}
                    </ItemGroup>
                )}

                {projectItems.length > 0 && (
                    <ItemGroup title={(() => {
                        const projectName = workingDirectory.split('/').filter(Boolean).pop() || '';
                        return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{
                                    ...Typography.default('regular'),
                                    color: theme.colors.groupped.sectionTitle,
                                    fontSize: Platform.select({ ios: 13, default: 14 }),
                                    lineHeight: Platform.select({ ios: 18, default: 20 }),
                                    letterSpacing: Platform.select({ ios: -0.08, default: 0.1 }),
                                    textTransform: 'uppercase',
                                    fontWeight: Platform.select({ ios: 'normal', default: '500' }),
                                }}>
                                    {t('knowledgeBase.projectContext')}
                                </Text>
                                {projectName ? (
                                    <View style={{
                                        backgroundColor: 'rgba(88, 86, 214, 0.15)',
                                        paddingHorizontal: 8,
                                        paddingVertical: 2,
                                        borderRadius: 6,
                                    }}>
                                        <Text style={{
                                            color: '#5856D6',
                                            fontSize: 12,
                                            fontWeight: '500',
                                            ...Typography.default('medium'),
                                        }}>
                                            {projectName}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        );
                    })()}>
                        {projectItems.map((item) => {
                            const tags = (item.meta?.tags as string[]) || [];
                            const isAlways = item.meta?.alwaysApply !== false;
                            const parts: string[] = [isAlways ? 'Always active' : 'On-demand'];
                            if (item.description) parts.push(item.description);
                            if (tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);
                            const subtitle = parts.join(' | ') || undefined;
                            return (
                                <React.Fragment key={item.id}>
                                    <Item
                                        title={item.name}
                                        subtitle={subtitle}
                                        icon={<Ionicons name="folder-outline" size={29} color="#5856D6" />}
                                        onPress={() => handlePress(item.id)}
                                        onLongPress={() => handleDelete(item.id, item.name)}
                                        showChevron={false}
                                    />
                                    {renderExpandedContent(item.id)}
                                </React.Fragment>
                            );
                        })}
                    </ItemGroup>
                )}
            </View>
        </ItemList>
    );
}

export default React.memo(() => {
    const { theme } = useUnistyles();
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const session = useSession(sessionId);
    const isDataReady = useIsDataReady();

    if (!isDataReady) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                <Text style={{
                    color: theme.colors.textSecondary,
                    fontSize: 17,
                    marginTop: 16,
                    ...Typography.default('semiBold'),
                }}>
                    {t('common.loading')}
                </Text>
            </View>
        );
    }

    if (!session) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={{
                    color: theme.colors.text,
                    fontSize: 20,
                    marginTop: 16,
                    ...Typography.default('semiBold'),
                }}>
                    {t('errors.sessionDeleted')}
                </Text>
            </View>
        );
    }

    return <KnowledgeBaseContent sessionId={sessionId} />;
});

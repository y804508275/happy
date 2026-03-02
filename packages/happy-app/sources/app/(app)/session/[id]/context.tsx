import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
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
import type { SharedItemFull, SharedItemSummary } from '@/sync/sharedItemTypes';

// ── Edit Modal Component ────────────────────────────────────────────

function EditRuleModal({ item, onClose, onSave }: {
    item: SharedItemFull;
    onClose: () => void;
    onSave: (name: string, content: string) => void;
}) {
    const { theme } = useUnistyles();
    const [name, setName] = useState(item.name);
    const [content, setContent] = useState(item.content || '');

    const handleSave = () => {
        if (!name.trim()) return;
        onSave(name.trim(), content.trim());
        onClose();
    };

    return (
        <View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 14,
            width: 400,
            maxWidth: '90%',
            overflow: 'hidden',
            shadowColor: theme.colors.shadow.color,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
        }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 }}>
                <Text style={{
                    fontSize: 17,
                    textAlign: 'center',
                    color: theme.colors.text,
                    marginBottom: 16,
                    ...Typography.default('semiBold'),
                }}>
                    Edit Rule
                </Text>

                <Text style={{
                    fontSize: 13,
                    color: theme.colors.textSecondary,
                    marginBottom: 6,
                    ...Typography.default('medium'),
                }}>
                    Title
                </Text>
                <TextInput
                    style={{
                        height: 36,
                        borderWidth: 1,
                        borderColor: theme.colors.divider,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        fontSize: 14,
                        color: theme.colors.text,
                        backgroundColor: theme.colors.input.background,
                        ...Typography.default(),
                    }}
                    value={name}
                    onChangeText={setName}
                    placeholder="Rule title"
                    placeholderTextColor={theme.colors.input.placeholder}
                    autoFocus={Platform.OS === 'web'}
                />

                <Text style={{
                    fontSize: 13,
                    color: theme.colors.textSecondary,
                    marginBottom: 6,
                    marginTop: 12,
                    ...Typography.default('medium'),
                }}>
                    Content
                </Text>
                <TextInput
                    style={{
                        minHeight: 120,
                        maxHeight: 300,
                        borderWidth: 1,
                        borderColor: theme.colors.divider,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        fontSize: 14,
                        color: theme.colors.text,
                        backgroundColor: theme.colors.input.background,
                        textAlignVertical: 'top',
                        ...Typography.default(),
                    }}
                    value={content}
                    onChangeText={setContent}
                    placeholder="Rule content"
                    placeholderTextColor={theme.colors.input.placeholder}
                    multiline
                />
            </View>

            <View style={{
                borderTopWidth: 1,
                borderTopColor: theme.colors.divider,
                flexDirection: 'row',
            }}>
                <Pressable
                    style={({ pressed }) => ({
                        flex: 1,
                        paddingVertical: 11,
                        alignItems: 'center' as const,
                        justifyContent: 'center' as const,
                        backgroundColor: pressed ? theme.colors.divider : 'transparent',
                    })}
                    onPress={onClose}
                >
                    <Text style={{
                        fontSize: 17,
                        color: theme.colors.textLink,
                        ...Typography.default(),
                    }}>
                        Cancel
                    </Text>
                </Pressable>
                <View style={{ width: 1, backgroundColor: theme.colors.divider }} />
                <Pressable
                    style={({ pressed }) => ({
                        flex: 1,
                        paddingVertical: 11,
                        alignItems: 'center' as const,
                        justifyContent: 'center' as const,
                        backgroundColor: pressed ? theme.colors.divider : 'transparent',
                    })}
                    onPress={handleSave}
                >
                    <Text style={{
                        fontSize: 17,
                        color: theme.colors.textLink,
                        ...Typography.default('semiBold'),
                    }}>
                        Save
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

// ── Main Content ────────────────────────────────────────────────────

function KnowledgeBaseContent({ sessionId }: { sessionId: string }) {
    const { theme } = useUnistyles();
    const session = useSession(sessionId);
    const { credentials } = useAuth();
    const workingDirectory = session?.metadata?.path || '';

    const { globalItems, projectItems, loading, deleteItem, updateItem, fetchItemContent } =
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

    const handleEdit = useCallback(async (itemId: string) => {
        // Fetch full content first
        const full = await fetchItemContent(itemId);
        if (!full) return;

        Modal.show({
            component: EditRuleModal,
            props: {
                item: full,
                onSave: (name: string, content: string) => {
                    updateItem(itemId, {
                        name,
                        content,
                        expectedContentVersion: full.contentVersion,
                    });
                    // Update expanded content if visible
                    setExpanded((prev) => {
                        if (!prev[itemId]) return prev;
                        return { ...prev, [itemId]: { ...full, name, content } };
                    });
                },
            },
        });
    }, [fetchItemContent, updateItem]);

    const handleToggleScope = useCallback(async (item: SharedItemSummary) => {
        const currentScope = item.meta?.scope;
        const isGlobal = currentScope === 'global';
        const newScope = isGlobal ? 'project' : 'global';
        const label = isGlobal ? 'Move to Project' : 'Move to Global';

        const confirmed = await Modal.confirm(
            label,
            isGlobal
                ? `Move "${item.name}" to project scope? It will only apply to the current project.`
                : `Move "${item.name}" to global scope? It will apply to all projects.`,
        );
        if (!confirmed) return;

        const newMeta = { ...item.meta, scope: newScope };
        if (newScope === 'project') {
            newMeta.projectPath = workingDirectory;
        } else {
            delete newMeta.projectPath;
        }
        await updateItem(item.id, { meta: newMeta });
    }, [updateItem, workingDirectory]);

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

    const renderActions = (item: SharedItemSummary) => {
        const isGlobal = item.meta?.scope === 'global';
        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Pressable
                    onPress={(e) => { e.stopPropagation(); handleEdit(item.id); }}
                    style={({ pressed }) => ({
                        padding: 6,
                        borderRadius: 6,
                        backgroundColor: pressed ? theme.colors.divider : 'transparent',
                    })}
                    hitSlop={4}
                >
                    <Ionicons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
                </Pressable>
                <Pressable
                    onPress={(e) => { e.stopPropagation(); handleToggleScope(item); }}
                    style={({ pressed }) => ({
                        padding: 6,
                        borderRadius: 6,
                        backgroundColor: pressed ? theme.colors.divider : 'transparent',
                    })}
                    hitSlop={4}
                >
                    <Ionicons
                        name={isGlobal ? 'folder-outline' : 'globe-outline'}
                        size={18}
                        color={theme.colors.textSecondary}
                    />
                </Pressable>
                <Pressable
                    onPress={(e) => { e.stopPropagation(); handleDelete(item.id, item.name); }}
                    style={({ pressed }) => ({
                        padding: 6,
                        borderRadius: 6,
                        backgroundColor: pressed ? theme.colors.divider : 'transparent',
                    })}
                    hitSlop={4}
                >
                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                </Pressable>
            </View>
        );
    };

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
                                        rightElement={renderActions(item)}
                                        showChevron={false}
                                    />
                                    {renderExpandedContent(item.id)}
                                </React.Fragment>
                            );
                        })}
                    </ItemGroup>
                )}

                {projectItems.length > 0 && (
                    <ItemGroup title={t('knowledgeBase.projectContext')}>
                        {projectItems.map((item) => {
                            const tags = (item.meta?.tags as string[]) || [];
                            const isAlways = item.meta?.alwaysApply !== false;
                            const projectName = item.meta?.projectPath?.split('/').filter(Boolean).pop() || '';
                            const parts: string[] = [isAlways ? 'Always active' : 'On-demand'];
                            if (projectName) parts.push(projectName);
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
                                        rightElement={renderActions(item)}
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

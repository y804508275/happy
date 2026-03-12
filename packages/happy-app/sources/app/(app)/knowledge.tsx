import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useAuth } from '@/auth/AuthContext';
import { Modal } from '@/modal';
import { useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import type { SharedItemFull, SharedItemSummary } from '@/sync/sharedItemTypes';

// ── Edit Modal Component ────────────────────────────────────────────

function EditRuleModal({ item, defaultScope, onClose, onSave }: {
    item?: SharedItemFull;
    defaultScope?: 'global' | 'project';
    onClose: () => void;
    onSave: (name: string, content: string, scope: 'global' | 'project') => void;
}) {
    const { theme } = useUnistyles();
    const [name, setName] = useState(item?.name || '');
    const [content, setContent] = useState(item?.content || '');
    const [scope, setScope] = useState<'global' | 'project'>(item?.meta?.scope || defaultScope || 'global');
    const isCreate = !item;

    const handleSave = () => {
        if (!name.trim() || !content.trim()) return;
        onSave(name.trim(), content.trim(), scope);
        onClose();
    };

    return (
        <View style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 14,
            width: 440,
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
                    {isCreate ? t('knowledgeBase.createTitle') : t('knowledgeBase.editTitle')}
                </Text>

                <Text style={{
                    fontSize: 13,
                    color: theme.colors.textSecondary,
                    marginBottom: 6,
                    ...Typography.default(),
                }}>
                    {t('mdReference.nameLabel')}
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
                    placeholder={t('mdReference.namePlaceholder')}
                    placeholderTextColor={theme.colors.input.placeholder}
                    autoFocus={Platform.OS === 'web'}
                />

                {isCreate && (
                    <>
                        <Text style={{
                            fontSize: 13,
                            color: theme.colors.textSecondary,
                            marginBottom: 6,
                            marginTop: 12,
                            ...Typography.default(),
                        }}>
                            {t('mdReference.scopeLabel')}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable
                                onPress={() => setScope('global')}
                                style={({ pressed }) => ({
                                    flex: 1,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: scope === 'global' ? theme.colors.textLink : theme.colors.divider,
                                    backgroundColor: scope === 'global' ? theme.colors.textLink + '15' : 'transparent',
                                    alignItems: 'center' as const,
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <Text style={{
                                    fontSize: 13,
                                    color: scope === 'global' ? theme.colors.textLink : theme.colors.textSecondary,
                                    ...Typography.default(),
                                }}>
                                    {t('mdReference.scopeGlobal')}
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={() => setScope('project')}
                                style={({ pressed }) => ({
                                    flex: 1,
                                    paddingVertical: 8,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: scope === 'project' ? theme.colors.textLink : theme.colors.divider,
                                    backgroundColor: scope === 'project' ? theme.colors.textLink + '15' : 'transparent',
                                    alignItems: 'center' as const,
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <Text style={{
                                    fontSize: 13,
                                    color: scope === 'project' ? theme.colors.textLink : theme.colors.textSecondary,
                                    ...Typography.default(),
                                }}>
                                    {t('mdReference.scopeProject')}
                                </Text>
                            </Pressable>
                        </View>
                    </>
                )}

                <Text style={{
                    fontSize: 13,
                    color: theme.colors.textSecondary,
                    marginBottom: 6,
                    marginTop: 12,
                    ...Typography.default(),
                }}>
                    {t('mdReference.contentLabel')}
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
                    placeholder={t('mdReference.contentPlaceholder')}
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
                        {t('common.cancel')}
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
                        opacity: (!name.trim() || !content.trim()) ? 0.4 : 1,
                    })}
                    onPress={handleSave}
                    disabled={!name.trim() || !content.trim()}
                >
                    <Text style={{
                        fontSize: 17,
                        color: theme.colors.textLink,
                        ...Typography.default('semiBold'),
                    }}>
                        {t('common.save')}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

// ── Main Content ────────────────────────────────────────────────────

function KnowledgeBaseContent() {
    const { theme } = useUnistyles();
    const { credentials } = useAuth();
    const workingDirectory = '';

    const { globalItems, projectItems, loading, createItem, deleteItem, updateItem, fetchItemContent } =
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

    const handleCreate = useCallback((defaultScope?: 'global' | 'project') => {
        Modal.show({
            component: EditRuleModal,
            props: {
                defaultScope,
                onSave: (name: string, content: string, scope: 'global' | 'project') => {
                    createItem({ name, content, scope });
                },
            },
        });
    }, [createItem]);

    const handleEdit = useCallback(async (itemId: string) => {
        // Fetch full content first
        const full = await fetchItemContent(itemId);
        if (!full) return;

        Modal.show({
            component: EditRuleModal,
            props: {
                item: full,
                onSave: (name: string, content: string, _scope: 'global' | 'project') => {
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
            newMeta.projectPath = '';
        } else {
            delete newMeta.projectPath;
        }
        await updateItem(item.id, { meta: newMeta });
    }, [updateItem]);

    const handleToggleAlwaysApply = useCallback(async (item: SharedItemSummary) => {
        const isAlways = item.meta?.alwaysApply !== false;
        const confirmed = await Modal.confirm(
            isAlways ? t('knowledgeBase.toggleToOnDemand') : t('knowledgeBase.toggleToAlwaysActive'),
            isAlways
                ? t('knowledgeBase.toggleToOnDemandMessage', { name: item.name })
                : t('knowledgeBase.toggleToAlwaysActiveMessage', { name: item.name }),
        );
        if (!confirmed) return;
        await updateItem(item.id, { meta: { ...item.meta, alwaysApply: !isAlways } });
    }, [updateItem]);

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
                <Pressable
                    onPress={() => handleCreate()}
                    style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 20,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: theme.colors.textLink,
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Ionicons name="add" size={18} color="#fff" />
                    <Text style={{
                        fontSize: 15,
                        color: '#fff',
                        ...Typography.default('semiBold'),
                    }}>
                        {t('knowledgeBase.newButton')}
                    </Text>
                </Pressable>
            </View>
        );
    }

    const renderActions = (item: SharedItemSummary) => {
        const isGlobal = !item.meta?.scope || item.meta?.scope === 'global';
        const isAlways = item.meta?.alwaysApply !== false;
        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Pressable
                    onPress={(e) => { e.stopPropagation(); handleToggleAlwaysApply(item); }}
                    style={({ pressed }) => ({
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: isAlways ? theme.colors.textLink + '15' : theme.colors.divider,
                        borderWidth: 1,
                        borderColor: isAlways ? theme.colors.textLink + '40' : theme.colors.divider,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        opacity: pressed ? 0.7 : 1,
                    })}
                    hitSlop={4}
                >
                    <Ionicons
                        name={isAlways ? 'flash' : 'hand-left-outline'}
                        size={13}
                        color={isAlways ? theme.colors.textLink : theme.colors.textSecondary}
                    />
                    <Text style={{
                        fontSize: 11,
                        color: isAlways ? theme.colors.textLink : theme.colors.textSecondary,
                        ...Typography.default('semiBold'),
                    }}>
                        {isAlways ? t('knowledgeBase.alwaysActive') : t('knowledgeBase.onDemand')}
                    </Text>
                </Pressable>
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
                <View style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    paddingHorizontal: 16,
                    paddingTop: 12,
                    paddingBottom: 4,
                }}>
                    <Pressable
                        onPress={() => handleCreate()}
                        hitSlop={8}
                        style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            opacity: pressed ? 0.6 : 1,
                        })}
                    >
                        <Ionicons name="add" size={18} color={theme.colors.textLink} />
                        <Text style={{
                            fontSize: 14,
                            color: theme.colors.textLink,
                            ...Typography.default(),
                        }}>
                            {t('knowledgeBase.newButton')}
                        </Text>
                    </Pressable>
                </View>
                {globalItems.length > 0 && (
                    <ItemGroup title={t('knowledgeBase.globalContext')}>
                        {globalItems.map((item) => {
                            const tags = (item.meta?.tags as string[]) || [];
                            const parts: string[] = [];
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
                            const projectName = item.meta?.projectPath?.split('/').filter(Boolean).pop() || '';
                            const parts: string[] = [];
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
    return <KnowledgeBaseContent />;
});

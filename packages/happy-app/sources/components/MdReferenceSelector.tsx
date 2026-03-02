import * as React from 'react';
import { View, Text, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { FloatingOverlay } from './FloatingOverlay';
import { Modal } from '@/modal';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import type { SharedItemSummary, SharedItemFull } from '@/sync/sharedItemTypes';

// ── Edit/Create Modal Component ────────────────────────────────────

function EditMdRefModal({ item, onClose, onSave }: {
    item?: SharedItemFull;
    onClose: () => void;
    onSave: (name: string, content: string, scope: 'global' | 'project') => void;
}) {
    const { theme } = useUnistyles();
    const [name, setName] = React.useState(item?.name || '');
    const [content, setContent] = React.useState(item?.content || '');
    const [scope, setScope] = React.useState<'global' | 'project'>(item?.meta?.scope || 'global');

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
                    {item ? t('mdReference.editTitle') : t('mdReference.createTitle')}
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
                        minHeight: 160,
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
                        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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

// ── Selector Component ─────────────────────────────────────────────

interface MdReferenceSelectorProps {
    globalItems: SharedItemSummary[];
    projectItems: SharedItemSummary[];
    selectedIds: Set<string>;
    loading: boolean;
    onToggle: (id: string) => void;
    onCreateItem: (data: { name: string; content: string; scope: 'global' | 'project' }) => void;
    onEditItem: (id: string, data: { name: string; content: string; expectedContentVersion: number; meta: any }) => void;
    onDeleteItem: (id: string) => void;
    fetchItemContent: (id: string) => Promise<SharedItemFull | null>;
}

export const MdReferenceSelector = React.memo(({
    globalItems,
    projectItems,
    selectedIds,
    loading,
    onToggle,
    onCreateItem,
    onEditItem,
    onDeleteItem,
    fetchItemContent,
}: MdReferenceSelectorProps) => {
    const { theme } = useUnistyles();

    const handleNew = () => {
        Modal.show({
            component: EditMdRefModal,
            props: {
                onSave: (name: string, content: string, scope: 'global' | 'project') => {
                    onCreateItem({ name, content, scope });
                },
            },
        });
    };

    const handleEdit = async (item: SharedItemSummary) => {
        const full = await fetchItemContent(item.id);
        if (!full) return;

        Modal.show({
            component: EditMdRefModal,
            props: {
                item: full,
                onSave: (name: string, content: string, scope: 'global' | 'project') => {
                    onEditItem(item.id, {
                        name,
                        content,
                        expectedContentVersion: full.contentVersion,
                        meta: {
                            ...full.meta,
                            scope,
                            ...(scope === 'project' ? {} : { projectPath: undefined }),
                        },
                    });
                },
            },
        });
    };

    const handleDelete = async (item: SharedItemSummary) => {
        const confirmed = await Modal.confirm(
            t('mdReference.deleteConfirm'),
            t('mdReference.deleteConfirmMessage', { name: item.name }),
            { destructive: true },
        );
        if (confirmed) {
            onDeleteItem(item.id);
        }
    };

    const renderItem = (item: SharedItemSummary) => {
        const isSelected = selectedIds.has(item.id);
        return (
            <Pressable
                key={item.id}
                onPress={() => onToggle(item.id)}
                style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: pressed ? theme.colors.divider : 'transparent',
                    gap: 10,
                })}
            >
                <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={isSelected ? theme.colors.textLink : theme.colors.textSecondary}
                />
                <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{
                        fontSize: 14,
                        color: theme.colors.text,
                        ...Typography.default(),
                    }}>
                        {item.name}
                    </Text>
                    {item.description && (
                        <Text numberOfLines={1} style={{
                            fontSize: 12,
                            color: theme.colors.textSecondary,
                            marginTop: 1,
                            ...Typography.default(),
                        }}>
                            {item.description}
                        </Text>
                    )}
                </View>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                    <Pressable
                        onPress={(e) => { e.stopPropagation(); handleEdit(item); }}
                        hitSlop={4}
                        style={({ pressed }) => ({
                            padding: 4,
                            borderRadius: 4,
                            opacity: pressed ? 0.5 : 1,
                        })}
                    >
                        <Ionicons name="pencil-outline" size={14} color={theme.colors.textSecondary} />
                    </Pressable>
                    <Pressable
                        onPress={(e) => { e.stopPropagation(); handleDelete(item); }}
                        hitSlop={4}
                        style={({ pressed }) => ({
                            padding: 4,
                            borderRadius: 4,
                            opacity: pressed ? 0.5 : 1,
                        })}
                    >
                        <Ionicons name="trash-outline" size={14} color="#FF3B30" />
                    </Pressable>
                </View>
            </Pressable>
        );
    };

    const allItems = [...globalItems, ...projectItems];

    return (
        <FloatingOverlay maxHeight={350} keyboardShouldPersistTaps="always">
            {/* Header */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 0.5,
                borderBottomColor: theme.colors.divider,
            }}>
                <Text style={{
                    fontSize: 13,
                    color: theme.colors.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    ...Typography.default('semiBold'),
                }}>
                    {t('mdReference.title')}
                </Text>
                <Pressable
                    onPress={handleNew}
                    hitSlop={8}
                    style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        opacity: pressed ? 0.6 : 1,
                    })}
                >
                    <Ionicons name="add" size={16} color={theme.colors.textLink} />
                    <Text style={{
                        fontSize: 13,
                        color: theme.colors.textLink,
                        ...Typography.default(),
                    }}>
                        {t('mdReference.newButton')}
                    </Text>
                </Pressable>
            </View>

            {loading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                </View>
            ) : allItems.length === 0 ? (
                <View style={{ paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center' }}>
                    <Ionicons name="document-text-outline" size={28} color={theme.colors.textSecondary} />
                    <Text style={{
                        fontSize: 13,
                        color: theme.colors.textSecondary,
                        marginTop: 8,
                        textAlign: 'center',
                        ...Typography.default(),
                    }}>
                        {t('mdReference.emptyDescription')}
                    </Text>
                </View>
            ) : (
                <>
                    {globalItems.length > 0 && (
                        <>
                            <Text style={{
                                fontSize: 11,
                                color: theme.colors.textSecondary,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                paddingHorizontal: 12,
                                paddingTop: 8,
                                paddingBottom: 4,
                                ...Typography.default('semiBold'),
                            }}>
                                {t('mdReference.globalSection')}
                            </Text>
                            {globalItems.map(renderItem)}
                        </>
                    )}
                    {projectItems.length > 0 && (
                        <>
                            <Text style={{
                                fontSize: 11,
                                color: theme.colors.textSecondary,
                                textTransform: 'uppercase',
                                letterSpacing: 0.5,
                                paddingHorizontal: 12,
                                paddingTop: 8,
                                paddingBottom: 4,
                                ...Typography.default('semiBold'),
                            }}>
                                {t('mdReference.projectSection')}
                            </Text>
                            {projectItems.map(renderItem)}
                        </>
                    )}
                </>
            )}
        </FloatingOverlay>
    );
});

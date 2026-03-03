import * as React from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';

interface MdReferenceChipsProps {
    items: Array<{ id: string; name: string; instruction?: string }>;
    onRemove: (id: string) => void;
    onInstructionChange?: (id: string, instruction: string) => void;
}

export const MdReferenceChips = React.memo(({ items, onRemove, onInstructionChange }: MdReferenceChipsProps) => {
    const { theme } = useUnistyles();
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editingText, setEditingText] = React.useState('');

    if (items.length === 0) return null;

    const handleChipPress = (item: { id: string; name: string; instruction?: string }) => {
        if (!onInstructionChange) return;
        setEditingId(item.id);
        setEditingText(item.instruction || '');
    };

    const handleInstructionSubmit = () => {
        if (editingId && onInstructionChange) {
            onInstructionChange(editingId, editingText.trim());
        }
        setEditingId(null);
        setEditingText('');
    };

    return (
        <View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ paddingHorizontal: 12, paddingTop: 10 }}
                contentContainerStyle={{ gap: 6 }}
                keyboardShouldPersistTaps="handled"
            >
                {items.map((item) => {
                    const hasInstruction = !!item.instruction;
                    return (
                        <Pressable
                            key={item.id}
                            onPress={() => handleChipPress(item)}
                            style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: hasInstruction
                                    ? theme.colors.textLink + '20'
                                    : theme.colors.divider,
                                borderRadius: 8,
                                paddingLeft: 8,
                                paddingRight: 4,
                                paddingVertical: 4,
                                gap: 4,
                                borderWidth: hasInstruction ? 1 : 0,
                                borderColor: hasInstruction ? theme.colors.textLink + '40' : 'transparent',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Ionicons
                                name="book-outline"
                                size={13}
                                color={hasInstruction ? theme.colors.textLink : theme.colors.textSecondary}
                            />
                            <Text
                                numberOfLines={1}
                                style={{
                                    fontSize: 13,
                                    color: theme.colors.text,
                                    maxWidth: 140,
                                    ...Typography.default(),
                                }}
                            >
                                {item.name}
                            </Text>
                            {hasInstruction && (
                                <Ionicons
                                    name="chatbubble-ellipses-outline"
                                    size={11}
                                    color={theme.colors.textLink}
                                />
                            )}
                            <Pressable
                                onPress={() => onRemove(item.id)}
                                hitSlop={4}
                                style={({ pressed }) => ({
                                    padding: 2,
                                    borderRadius: 10,
                                    opacity: pressed ? 0.5 : 1,
                                })}
                            >
                                <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
                            </Pressable>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {/* Inline instruction editor */}
            {editingId && (
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginHorizontal: 12,
                    marginTop: 6,
                    gap: 6,
                }}>
                    <TextInput
                        style={{
                            flex: 1,
                            height: 32,
                            borderWidth: 1,
                            borderColor: theme.colors.textLink + '60',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            fontSize: 13,
                            color: theme.colors.text,
                            backgroundColor: theme.colors.input.background,
                            ...Typography.default(),
                        }}
                        value={editingText}
                        onChangeText={setEditingText}
                        placeholder={t('mdReference.instructionPlaceholder')}
                        placeholderTextColor={theme.colors.input.placeholder}
                        autoFocus={Platform.OS === 'web'}
                        onSubmitEditing={handleInstructionSubmit}
                        returnKeyType="done"
                    />
                    <Pressable
                        onPress={handleInstructionSubmit}
                        style={({ pressed }) => ({
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: theme.colors.textLink,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Text style={{
                            fontSize: 13,
                            color: '#fff',
                            ...Typography.default('semiBold'),
                        }}>
                            {t('common.ok')}
                        </Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
});

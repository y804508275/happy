import * as React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';

interface MdReferenceChipsProps {
    items: Array<{ id: string; name: string }>;
    onRemove: (id: string) => void;
}

export const MdReferenceChips = React.memo(({ items, onRemove }: MdReferenceChipsProps) => {
    const { theme } = useUnistyles();

    if (items.length === 0) return null;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ paddingHorizontal: 12, paddingTop: 10 }}
            contentContainerStyle={{ gap: 6 }}
            keyboardShouldPersistTaps="handled"
        >
            {items.map((item) => (
                <View
                    key={item.id}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: theme.colors.divider,
                        borderRadius: 8,
                        paddingLeft: 8,
                        paddingRight: 4,
                        paddingVertical: 4,
                        gap: 4,
                    }}
                >
                    <Ionicons name="document-text-outline" size={13} color={theme.colors.textSecondary} />
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
                </View>
            ))}
        </ScrollView>
    );
});

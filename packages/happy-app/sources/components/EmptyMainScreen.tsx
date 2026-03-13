import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        marginBottom: 32,
    },
    iconContainer: {
        marginBottom: 24,
    },
    title: {
        marginBottom: 8,
        textAlign: 'center',
        fontSize: 20,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 32,
        ...Typography.default(),
    },
    button: {
        backgroundColor: theme.colors.button.primary.background,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    buttonIcon: {
        marginRight: 8,
    },
    buttonText: {
        fontSize: 16,
        color: theme.colors.button.primary.tint,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
}));

export function EmptyMainScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();

    const handleStartNewSession = () => {
        router.push('/new');
    };

    return (
        <View style={styles.container}>
            <Ionicons
                name="chatbubble-ellipses-outline"
                size={64}
                color={theme.colors.textSecondary}
                style={styles.iconContainer}
            />

            <Text style={styles.title}>
                {t('components.emptyMainScreen.noSessions')}
            </Text>

            <Text style={styles.subtitle}>
                {t('components.emptyMainScreen.startFirst')}
            </Text>

            <Pressable
                style={styles.button}
                onPress={handleStartNewSession}
            >
                <Ionicons
                    name="add"
                    size={20}
                    color={theme.colors.button.primary.tint}
                    style={styles.buttonIcon}
                />
                <Text style={styles.buttonText}>
                    {t('newSession.title')}
                </Text>
            </Pressable>
        </View>
    );
}

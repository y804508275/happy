import { useSocketStatus, useFriendRequests } from '@/sync/storage';
import * as React from 'react';
import { Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from '@/utils/responsive';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { VoiceAssistantStatusBar } from './VoiceAssistantStatusBar';
import { useRealtimeStatus } from '@/sync/storage';
import { MainView } from './MainView';
import { Image } from 'expo-image';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useInboxHasContent } from '@/hooks/useInboxHasContent';
import { Ionicons } from '@expo/vector-icons';

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        flex: 1,
        borderStyle: 'solid',
        backgroundColor: theme.colors.groupped.background,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        backgroundColor: theme.colors.groupped.background,
    },
    logo: {
        height: 24,
        width: 24,
    },
    titleText: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.colors.header.tint,
        marginLeft: 10,
        ...Typography.default('semiBold'),
    },
    statusTag: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 'auto',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        gap: 4,
    },
    statusTagText: {
        fontSize: 11,
        fontWeight: '500',
        ...Typography.default(),
    },
    // Status colors
    statusConnected: {
        color: theme.colors.status.connected,
    },
    statusConnecting: {
        color: theme.colors.status.connecting,
    },
    statusDisconnected: {
        color: theme.colors.status.disconnected,
    },
    statusError: {
        color: theme.colors.status.error,
    },
    statusDefault: {
        color: theme.colors.status.default,
    },
    // Bottom bar
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
        gap: 16,
    },
    bottomButton: {
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: theme.colors.status.error,
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        ...Typography.default('semiBold'),
    },
    indicatorDot: {
        position: 'absolute',
        top: 0,
        right: -2,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.text,
    },
}));

export const SidebarView = React.memo(() => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const router = useRouter();
    const headerHeight = useHeaderHeight();
    const socketStatus = useSocketStatus();
    const realtimeStatus = useRealtimeStatus();
    const friendRequests = useFriendRequests();
    const inboxHasContent = useInboxHasContent();

    // Compute connection status once per render (theme-reactive, no stale memoization)
    const connectionStatus = (() => {
        const { status } = socketStatus;
        switch (status) {
            case 'connected':
                return {
                    color: styles.statusConnected.color,
                    isPulsing: false,
                    text: t('status.connected'),
                    textColor: styles.statusConnected.color
                };
            case 'connecting':
                return {
                    color: styles.statusConnecting.color,
                    isPulsing: true,
                    text: t('status.connecting'),
                    textColor: styles.statusConnecting.color
                };
            case 'disconnected':
                return {
                    color: styles.statusDisconnected.color,
                    isPulsing: false,
                    text: t('status.disconnected'),
                    textColor: styles.statusDisconnected.color
                };
            case 'error':
                return {
                    color: styles.statusError.color,
                    isPulsing: false,
                    text: t('status.error'),
                    textColor: styles.statusError.color
                };
            default:
                return {
                    color: styles.statusDefault.color,
                    isPulsing: false,
                    text: '',
                    textColor: styles.statusDefault.color
                };
        }
    })();

    return (
        <View style={[styles.container, { paddingTop: safeArea.top }]}>
            {/* Header: Logo + App Name */}
            <View style={[styles.header, { height: headerHeight }]}>
                <Image
                    source={theme.dark ? require('@/assets/images/logo-white.png') : require('@/assets/images/logo-black.png')}
                    contentFit="contain"
                    style={[styles.logo, { height: 24, width: 24 }]}
                />
                <Text style={styles.titleText}>Happy</Text>
            </View>

            {realtimeStatus !== 'disconnected' && (
                <VoiceAssistantStatusBar variant="sidebar" />
            )}

            {/* Session list */}
            <MainView variant="sidebar" />

            {/* Bottom bar: Inbox + Settings + Knowledge + Status tag */}
            <View style={[styles.bottomBar, { paddingBottom: Math.max(safeArea.bottom, 12) }]}>
                <Pressable
                    onPress={() => router.push('/(app)/inbox')}
                    hitSlop={15}
                    style={styles.bottomButton}
                >
                    <Ionicons name="mail-outline" size={20} color={theme.colors.header.tint} />
                    {friendRequests.length > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>
                                {friendRequests.length > 99 ? '99+' : friendRequests.length}
                            </Text>
                        </View>
                    )}
                    {inboxHasContent && friendRequests.length === 0 && (
                        <View style={styles.indicatorDot} />
                    )}
                </Pressable>
                <Pressable
                    onPress={() => router.push('/settings')}
                    hitSlop={15}
                >
                    <Ionicons name="settings-outline" size={20} color={theme.colors.header.tint} />
                </Pressable>
                <Pressable
                    onPress={() => router.push('/(app)/knowledge')}
                    hitSlop={15}
                >
                    <Ionicons name="book-outline" size={20} color={theme.colors.header.tint} />
                </Pressable>
                {connectionStatus.text && (
                    <View style={[styles.statusTag, { backgroundColor: connectionStatus.color + '18' }]}>
                        <StatusDot
                            color={connectionStatus.color}
                            isPulsing={connectionStatus.isPulsing}
                            size={6}
                        />
                        <Text style={[styles.statusTagText, { color: connectionStatus.textColor }]}>
                            {connectionStatus.text}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
});

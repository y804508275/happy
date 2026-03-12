import React from 'react';
import { View, Pressable, FlatList, Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Text } from '@/components/StyledText';
import { usePathname } from 'expo-router';
import { SessionListViewItem, storage } from '@/sync/storage';
import { Ionicons } from '@expo/vector-icons';
import { getSessionName, useSessionStatus, getSessionSubtitle } from '@/utils/sessionUtils';
import { ActiveSessionsGroup } from './ActiveSessionsGroup';
import { ActiveSessionsGroupCompact } from './ActiveSessionsGroupCompact';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSetting } from '@/sync/storage';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { Typography } from '@/constants/Typography';
import { Session } from '@/sync/storageTypes';
import { StatusDot } from './StatusDot';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useIsTablet } from '@/utils/responsive';
import { requestReview } from '@/utils/requestReview';

import { layout } from './layout';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { t } from '@/text';
import { useRouter } from 'expo-router';
import { Item } from './Item';
import { ItemGroup } from './ItemGroup';
import { useHappyAction } from '@/hooks/useHappyAction';
import { sessionDelete, sessionUpdateSummary } from '@/sync/ops';
import { HappyError } from '@/utils/errors';
import { Modal } from '@/modal';
import { useSessionBadge } from '@/hooks/useSessionBadge';
import { WebContextMenu, useWebContextMenu } from './WebContextMenu';


const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'stretch',
        backgroundColor: theme.colors.groupped.background,
    },
    contentContainer: {
        flex: 1,
        maxWidth: layout.maxWidth,
    },
    headerSection: {
        backgroundColor: theme.colors.groupped.background,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerIcon: {
        color: theme.colors.groupped.sectionTitle,
    },
    headerText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.groupped.sectionTitle,
        letterSpacing: 0.1,
        ...Typography.default('semiBold'),
    },
    newSessionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 12,
        marginTop: 8,
        gap: 6,
        backgroundColor: theme.colors.groupped.background,
    },
    newSessionRowPressed: {
        opacity: 0.6,
    },
    newSessionRowHovered: {
        backgroundColor: theme.colors.surfaceSelected,
        borderRadius: 8,
    },
    newSessionIcon: {
        color: theme.colors.groupped.sectionTitle,
    },
    newSessionText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.groupped.sectionTitle,
        letterSpacing: 0.1,
        ...Typography.default('semiBold'),
    },
    projectGroup: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.colors.surface,
    },
    projectGroupTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    projectGroupSubtitle: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    sessionItem: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
    },
    sessionItemContainer: {
        marginHorizontal: 16,
        marginBottom: 1,
        overflow: 'hidden',
    },
    sessionItemFirst: {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    sessionItemLast: {
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
    },
    sessionItemSingle: {
        borderRadius: 12,
    },
    sessionItemContainerFirst: {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    sessionItemContainerLast: {
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        marginBottom: 8,
    },
    sessionItemContainerSingle: {
        borderRadius: 12,
        marginBottom: 8,
    },
    sessionItemSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    sessionContent: {
        flex: 1,
        justifyContent: 'center',
    },
    sessionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    sessionTitle: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
        ...Typography.default('semiBold'),
    },
    sessionTitleConnected: {
        color: theme.colors.text,
    },
    sessionTitleDisconnected: {
        color: theme.colors.textSecondary,
    },
    sessionSubtitle: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginBottom: 2,
        ...Typography.default(),
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusDotContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 16,
        marginTop: 2,
        marginRight: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
        ...Typography.default(),
    },
    artifactsSection: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: theme.colors.groupped.background,
    },
    swipeAction: {
        width: 112,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.status.error,
    },
    swipeActionText: {
        marginTop: 4,
        fontSize: 12,
        color: '#FFFFFF',
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
}));

export function SessionsList() {
    const styles = stylesheet;
    const safeArea = useSafeAreaInsets();
    const data = useVisibleSessionListViewData();
    const pathname = usePathname();
    const isTablet = useIsTablet();
    const navigateToSession = useNavigateToSession();
    const compactSessionView = useSetting('compactSessionView');
    const router = useRouter();
    const selectable = isTablet;
    const experiments = useSetting('experiments');
    const dataWithSelected = selectable ? React.useMemo(() => {
        return data?.map(item => ({
            ...item,
            selected: pathname.startsWith(`/session/${item.type === 'session' ? item.session.id : ''}`)
        }));
    }, [data, pathname]) : data;

    // Request review
    React.useEffect(() => {
        if (data && data.length > 0) {
            requestReview();
        }
    }, [data && data.length > 0]);

    // Early return if no data yet
    if (!data) {
        return (
            <View style={styles.container} />
        );
    }

    const keyExtractor = React.useCallback((item: SessionListViewItem & { selected?: boolean }, index: number) => {
        switch (item.type) {
            case 'header': return `header-${item.title}-${index}`;
            case 'active-sessions': return 'active-sessions';
            case 'project-group': return `project-group-${item.machine.id}-${item.displayPath}-${index}`;
            case 'session': return `session-${item.session.id}`;
        }
    }, []);

    const renderItem = React.useCallback(({ item, index }: { item: SessionListViewItem & { selected?: boolean }, index: number }) => {
        switch (item.type) {
            case 'header':
                return (
                    <View style={styles.headerSection}>
                        {item.icon && (
                            <Ionicons name={item.icon as any} size={14} style={styles.headerIcon} />
                        )}
                        <Text style={styles.headerText}>
                            {item.title}
                        </Text>
                    </View>
                );

            case 'active-sessions':
                // Extract just the session ID from pathname (e.g., /session/abc123/file -> abc123)
                let selectedId: string | undefined;
                if (isTablet && pathname.startsWith('/session/')) {
                    const parts = pathname.split('/');
                    selectedId = parts[2]; // parts[0] is empty, parts[1] is 'session', parts[2] is the ID
                }

                const ActiveComponent = compactSessionView ? ActiveSessionsGroupCompact : ActiveSessionsGroup;
                return (
                    <ActiveComponent
                        sessions={item.sessions}
                        selectedSessionId={selectedId}
                    />
                );

            case 'project-group':
                return (
                    <View style={styles.projectGroup}>
                        <Text style={styles.projectGroupTitle}>
                            {item.displayPath}
                        </Text>
                        <Text style={styles.projectGroupSubtitle}>
                            {item.machine.metadata?.displayName || item.machine.metadata?.host || item.machine.id}
                        </Text>
                    </View>
                );

            case 'session':
                if (compactSessionView) {
                    return (
                        <CompactSessionItem
                            session={item.session}
                            selected={item.selected}
                        />
                    );
                }

                // Determine card styling based on position within date group
                const prevItem = index > 0 && dataWithSelected ? dataWithSelected[index - 1] : null;
                const nextItem = index < (dataWithSelected?.length || 0) - 1 && dataWithSelected ? dataWithSelected[index + 1] : null;

                const isFirst = prevItem?.type === 'header';
                const isLast = nextItem?.type === 'header' || nextItem == null || nextItem?.type === 'active-sessions';
                const isSingle = isFirst && isLast;

                return (
                    <SessionItem
                        session={item.session}
                        selected={item.selected}
                        isFirst={isFirst}
                        isLast={isLast}
                        isSingle={isSingle}
                    />
                );
        }
    }, [pathname, dataWithSelected, compactSessionView]);


    // Remove this section as we'll use FlatList for all items now


    const HeaderComponent = React.useCallback(() => {
        return (
            <Pressable
                style={({ pressed, hovered }: any) => [
                    styles.newSessionRow,
                    pressed && styles.newSessionRowPressed,
                    hovered && styles.newSessionRowHovered,
                ]}
                onPress={() => router.push('/new')}
            >
                <Ionicons name="create-outline" size={14} style={styles.newSessionIcon} />
                <Text style={styles.newSessionText}>{t('newSession.title')}</Text>
            </Pressable>
        );
    }, [router]);

    // Footer removed - all sessions now shown inline

    return (
        <View style={styles.container}>
            <View style={styles.contentContainer}>
                <FlatList
                    data={dataWithSelected}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={{ paddingBottom: safeArea.bottom + 128, maxWidth: layout.maxWidth }}
                    ListHeaderComponent={HeaderComponent}
                />
            </View>
        </View>
    );
}

// Sub-component that handles session message logic
const SessionItem = React.memo(({ session, selected, isFirst, isLast, isSingle }: {
    session: Session;
    selected?: boolean;
    isFirst?: boolean;
    isLast?: boolean;
    isSingle?: boolean;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    // Subscribe directly to store for real-time status updates (bypasses FlatList cell caching)
    const liveSession = storage((state) => state.sessions[session.id]) ?? session;
    const sessionStatus = useSessionStatus(liveSession);
    const sessionName = getSessionName(session);
    const sessionSubtitle = getSessionSubtitle(session);
    const navigateToSession = useNavigateToSession();
    const isTablet = useIsTablet();
    const swipeableRef = React.useRef<Swipeable | null>(null);
    const swipeEnabled = Platform.OS !== 'web';
    const { ref: contextMenuRef, contextMenu, close: closeContextMenu } = useWebContextMenu();

    const [renamingSession, performRename] = useHappyAction(async () => {
        const newName = await Modal.prompt(
            t('sessionInfo.renameSession'),
            undefined,
            {
                placeholder: t('sessionInfo.renameSessionPlaceholder'),
                defaultValue: sessionName,
            }
        );
        if (newName !== null && newName.trim() !== '' && newName.trim() !== sessionName) {
            const result = await sessionUpdateSummary(session.id, newName.trim());
            if (!result.success) {
                throw new HappyError(result.message || 'Failed to rename session', false);
            }
        }
    });

    const handleRename = React.useCallback(() => {
        closeContextMenu();
        performRename();
    }, [performRename, closeContextMenu]);

    const [deletingSession, performDelete] = useHappyAction(async () => {
        const result = await sessionDelete(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToDeleteSession'), false);
        }
    });

    const handleDelete = React.useCallback(() => {
        swipeableRef.current?.close();
        Modal.alert(
            t('sessionInfo.deleteSession'),
            t('sessionInfo.deleteSessionWarning'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('sessionInfo.deleteSession'),
                    style: 'destructive',
                    onPress: performDelete
                }
            ]
        );
    }, [performDelete]);

    const itemContent = (
        <Pressable
            style={[
                styles.sessionItem,
                selected && styles.sessionItemSelected,
                isSingle ? styles.sessionItemSingle :
                    isFirst ? styles.sessionItemFirst :
                        isLast ? styles.sessionItemLast : {}
            ]}
            onPressIn={() => {
                if (isTablet) {
                    navigateToSession(session.id);
                }
            }}
            onPress={() => {
                if (!isTablet) {
                    navigateToSession(session.id);
                }
            }}
        >
            <View style={styles.sessionContent}>
                {/* Title line */}
                <View style={styles.sessionTitleRow}>
                    <Text style={[
                        styles.sessionTitle,
                        sessionStatus.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                    ]} numberOfLines={1}> {/* {variant !== 'no-path' ? 1 : 2} - issue is we don't have anything to take this space yet and it looks strange - if summaries were more reliably generated, we can add this. While no summary - add something like "New session" or "Empty session", and extend summary to 2 lines once we have it */}
                        {sessionName}
                    </Text>
                </View>

                {/* Subtitle line */}
                <Text style={styles.sessionSubtitle} numberOfLines={1}>
                    {sessionSubtitle}
                </Text>

                {/* Status line with dot */}
                <View style={styles.statusRow}>
                    <View style={styles.statusDotContainer}>
                        <StatusDot color={sessionStatus.statusDotColor} isPulsing={sessionStatus.isPulsing} />
                    </View>
                    <Text style={[
                        styles.statusText,
                        { color: sessionStatus.statusColor }
                    ]}>
                        {sessionStatus.statusText}
                    </Text>
                </View>
            </View>
        </Pressable>
    );

    const containerStyles = [
        styles.sessionItemContainer,
        isSingle ? styles.sessionItemContainerSingle :
            isFirst ? styles.sessionItemContainerFirst :
                isLast ? styles.sessionItemContainerLast : {}
    ];

    if (!swipeEnabled) {
        return (
            <View ref={contextMenuRef} style={containerStyles}>
                {itemContent}
                <WebContextMenu
                    visible={contextMenu !== null}
                    position={contextMenu || { x: 0, y: 0 }}
                    items={[
                        {
                            label: t('sessionInfo.renameSession'),
                            icon: 'pencil-outline',
                            onPress: handleRename,
                            disabled: renamingSession,
                        },
                        {
                            label: t('sessionInfo.deleteSession'),
                            icon: 'trash-outline',
                            color: theme.colors.status.error,
                            onPress: handleDelete,
                            disabled: deletingSession,
                        },
                    ]}
                    onClose={closeContextMenu}
                />
            </View>
        );
    }

    const renderRightActions = () => (
        <Pressable
            style={styles.swipeAction}
            onPress={handleDelete}
            disabled={deletingSession}
        >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText} numberOfLines={2}>
                {t('sessionInfo.deleteSession')}
            </Text>
        </Pressable>
    );

    return (
        <View style={containerStyles}>
            <Swipeable
                ref={swipeableRef}
                renderRightActions={renderRightActions}
                overshootRight={false}
                enabled={!deletingSession}
            >
                {itemContent}
            </Swipeable>
        </View>
    );
});

// Compact session item for inactive sessions - Claude-style minimal design
const compactItemStylesheet = StyleSheet.create((theme) => ({
    row: {
        height: 36,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        backgroundColor: theme.colors.groupped.background,
    },
    rowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
        borderRadius: 8,
    },
    rowHovered: {
        backgroundColor: theme.colors.surfaceSelected,
        borderRadius: 8,
    },
    trailingIndicator: {
        marginLeft: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 13,
        flex: 1,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
    },
    swipeAction: {
        width: 80,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.status.error,
    },
    swipeActionText: {
        marginTop: 4,
        fontSize: 12,
        color: '#FFFFFF',
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
}));

const CompactSessionItem = React.memo(({ session, selected }: {
    session: Session;
    selected?: boolean;
}) => {
    const styles = compactItemStylesheet;
    const { theme } = useUnistyles();
    const sessionName = getSessionName(session);
    const navigateToSession = useNavigateToSession();
    const isTablet = useIsTablet();
    const swipeableRef = React.useRef<Swipeable | null>(null);
    const swipeEnabled = Platform.OS !== 'web';
    const badgeType = useSessionBadge(session);
    const { ref: contextMenuRef, contextMenu, close: closeContextMenu } = useWebContextMenu();

    const [renamingSession, performRename] = useHappyAction(async () => {
        const newName = await Modal.prompt(
            t('sessionInfo.renameSession'),
            undefined,
            {
                placeholder: t('sessionInfo.renameSessionPlaceholder'),
                defaultValue: sessionName,
            }
        );
        if (newName !== null && newName.trim() !== '' && newName.trim() !== sessionName) {
            const result = await sessionUpdateSummary(session.id, newName.trim());
            if (!result.success) {
                throw new HappyError(result.message || 'Failed to rename session', false);
            }
        }
    });

    const handleRename = React.useCallback(() => {
        closeContextMenu();
        performRename();
    }, [performRename, closeContextMenu]);

    const [deletingSession, performDelete] = useHappyAction(async () => {
        const result = await sessionDelete(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToDeleteSession'), false);
        }
    });

    const handleDelete = React.useCallback(() => {
        swipeableRef.current?.close();
        Modal.alert(
            t('sessionInfo.deleteSession'),
            t('sessionInfo.deleteSessionWarning'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('sessionInfo.deleteSession'),
                    style: 'destructive',
                    onPress: performDelete
                }
            ]
        );
    }, [performDelete]);

    const itemContent = (
        <Pressable
            style={({ hovered }: any) => [
                styles.row,
                selected && styles.rowSelected,
                !selected && hovered && styles.rowHovered,
            ]}
            onPressIn={() => {
                if (isTablet) {
                    navigateToSession(session.id);
                }
            }}
            onPress={() => {
                if (!isTablet) {
                    navigateToSession(session.id);
                }
            }}
        >
            <Text style={styles.title} numberOfLines={1}>
                {sessionName}
            </Text>
            {badgeType && (
                <View style={styles.trailingIndicator}>
                    <StatusDot
                        color={badgeType === 'action' ? theme.colors.badge.action : theme.colors.badge.info}
                        isPulsing={badgeType === 'action'}
                    />
                </View>
            )}
        </Pressable>
    );

    if (!swipeEnabled) {
        return (
            <View ref={contextMenuRef}>
                {itemContent}
                <WebContextMenu
                    visible={contextMenu !== null}
                    position={contextMenu || { x: 0, y: 0 }}
                    items={[
                        {
                            label: t('sessionInfo.renameSession'),
                            icon: 'pencil-outline',
                            onPress: handleRename,
                            disabled: renamingSession,
                        },
                        {
                            label: t('sessionInfo.deleteSession'),
                            icon: 'trash-outline',
                            color: theme.colors.status.error,
                            onPress: handleDelete,
                            disabled: deletingSession,
                        },
                    ]}
                    onClose={closeContextMenu}
                />
            </View>
        );
    }

    const renderRightActions = () => (
        <Pressable
            style={styles.swipeAction}
            onPress={handleDelete}
            disabled={deletingSession}
        >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText} numberOfLines={2}>
                {t('sessionInfo.deleteSession')}
            </Text>
        </Pressable>
    );

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            enabled={!deletingSession}
        >
            {itemContent}
        </Swipeable>
    );
});

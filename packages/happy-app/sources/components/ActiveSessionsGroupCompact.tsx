import React from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Text } from '@/components/StyledText';
import { Session } from '@/sync/storageTypes';
import { storage } from '@/sync/storage';
import { Ionicons } from '@expo/vector-icons';
import { getSessionName, useSessionStatus } from '@/utils/sessionUtils';
import { Typography } from '@/constants/Typography';

import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { sessionArchive, sessionDelete, sessionUpdateSummary } from '@/sync/ops';
import { Modal } from '@/modal';
import { t } from '@/text';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useIsTablet } from '@/utils/responsive';
import { useHappyAction } from '@/hooks/useHappyAction';
import { HappyError } from '@/utils/errors';
import { useSessionBadge } from '@/hooks/useSessionBadge';
import { WebContextMenu, useWebContextMenu } from './WebContextMenu';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
    },
    sessionRow: {
        height: 36,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        backgroundColor: theme.colors.groupped.background,
    },
    sessionRowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
        borderRadius: 8,
    },
    sessionRowHovered: {
        backgroundColor: theme.colors.surfaceSelected,
        borderRadius: 8,
    },
    statusTag: {
        marginLeft: 8,
        fontSize: 11,
        ...Typography.default(),
    },
    sessionTitle: {
        fontSize: 13,
        flex: 1,
        ...Typography.default('regular'),
    },
    sessionTitleConnected: {
        color: theme.colors.textSecondary,
    },
    sessionTitleDisconnected: {
        color: theme.colors.textSecondary,
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

interface ActiveSessionsGroupProps {
    sessions: Session[];
    selectedSessionId?: string;
}

export function ActiveSessionsGroupCompact({ sessions, selectedSessionId }: ActiveSessionsGroupProps) {
    const styles = stylesheet;

    // Flatten all sessions and sort by activity (newest first)
    const sortedSessions = React.useMemo(() => {
        return [...sessions].sort((a, b) => b.sortTimestamp - a.sortTimestamp);
    }, [sessions]);

    return (
        <View style={styles.container}>
            {sortedSessions.map((session) => (
                <CompactSessionRow
                    key={session.id}
                    session={session}
                    selected={selectedSessionId === session.id}
                />
            ))}
        </View>
    );
}

// Compact session row - Claude-style minimal design
const CompactSessionRow = React.memo(({ session, selected }: { session: Session; selected?: boolean }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    // Subscribe directly to store for real-time status updates (bypasses FlatList cell caching)
    const liveSession = storage((state) => state.sessions[session.id]) ?? session;
    const sessionStatus = useSessionStatus(liveSession);
    const sessionName = getSessionName(session);
    const navigateToSession = useNavigateToSession();
    const isTablet = useIsTablet();
    const swipeableRef = React.useRef<Swipeable | null>(null);
    const swipeEnabled = Platform.OS !== 'web';
    const badgeType = useSessionBadge(session);
    const { ref: contextMenuRef, contextMenu, close: closeContextMenu } = useWebContextMenu();

    const [archivingSession, performArchive] = useHappyAction(async () => {
        const result = await sessionArchive(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
    });

    const [deletingSession, performDelete] = useHappyAction(async () => {
        const result = await sessionDelete(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToDeleteSession'), false);
        }
    });

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

    const handleArchive = React.useCallback(() => {
        swipeableRef.current?.close();
        Modal.alert(
            t('sessionInfo.archiveSession'),
            t('sessionInfo.archiveSessionConfirm'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('sessionInfo.archiveSession'),
                    style: 'destructive',
                    onPress: performArchive
                }
            ]
        );
    }, [performArchive]);

    const handleDelete = React.useCallback(() => {
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

    // Badge indicator (notification dot) - shown after title
    // Trailing status tag - concise text label for session state
    const statusTag = (() => {
        if (badgeType === 'action') {
            return { text: t('sessions.actionNeeded'), color: theme.colors.badge.action };
        }
        if (badgeType === 'info') {
            return { text: t('sessions.unread'), color: theme.colors.badge.info };
        }
        if (sessionStatus.state === 'thinking') {
            return { text: t('sessions.thinking'), color: sessionStatus.statusDotColor };
        }
        if (sessionStatus.state === 'waiting' && session.draft) {
            return { text: t('sessions.draft'), color: theme.colors.textSecondary };
        }
        return null;
    })();

    const itemContent = (
        <Pressable
            style={({ hovered }: any) => [
                styles.sessionRow,
                selected && styles.sessionRowSelected,
                !selected && hovered && styles.sessionRowHovered,
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
            <Text
                style={[
                    styles.sessionTitle,
                    sessionStatus.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                ]}
                numberOfLines={1}
            >
                {sessionName}
            </Text>
            {statusTag && (
                <Text style={[styles.statusTag, { color: statusTag.color }]}>
                    {statusTag.text}
                </Text>
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
                            label: t('sessionInfo.archiveSession'),
                            icon: 'archive-outline',
                            onPress: handleArchive,
                            disabled: archivingSession,
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
            onPress={handleArchive}
            disabled={archivingSession}
        >
            <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
            <Text style={styles.swipeActionText} numberOfLines={2}>
                {t('sessionInfo.archiveSession')}
            </Text>
        </Pressable>
    );

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            enabled={!archivingSession}
        >
            {itemContent}
        </Swipeable>
    );
});

import React from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { Session } from '@/sync/storageTypes';
import { useSessionStatus, formatPathRelativeToHome } from '@/utils/sessionUtils';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useProjectScanning } from '@/hooks/useProjectScanning';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    iconContainer: {
        marginBottom: 12,
    },
    hostText: {
        fontSize: 18,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: 4,
        ...Typography.default('semiBold'),
    },
    pathText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        ...Typography.default('regular'),
    },
    projectsSection: {
        width: '100%',
        maxWidth: 400,
        maxHeight: 280,
        marginBottom: 16,
    },
    projectsSectionTitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase' as const,
        letterSpacing: 0.5,
        ...Typography.default('semiBold'),
    },
    projectsList: {
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHigh,
        overflow: 'hidden' as const,
    },
    projectRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    projectRowBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    projectIcon: {
        marginRight: 10,
    },
    projectInfo: {
        flex: 1,
        minWidth: 0,
    },
    projectName: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    projectPath: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 1,
        ...Typography.default('regular'),
    },
    loadingContainer: {
        borderRadius: 12,
        backgroundColor: theme.colors.surfaceHigh,
        padding: 16,
        alignItems: 'center' as const,
        gap: 8,
    },
    loadingRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 8,
    },
    loadingText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
    },
    createdText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
        ...Typography.default(),
    },
}));

interface EmptyMessagesProps {
    session: Session;
    onProjectSelect?: (path: string) => void;
}

function getOSIcon(os?: string): keyof typeof Ionicons.glyphMap {
    if (!os) return 'hardware-chip-outline';

    const osLower = os.toLowerCase();
    if (osLower.includes('darwin') || osLower.includes('mac')) {
        return 'laptop-outline';
    } else if (osLower.includes('win')) {
        return 'desktop-outline';
    } else if (osLower.includes('linux')) {
        return 'terminal-outline';
    }
    return 'hardware-chip-outline';
}

function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
        return t('time.justNow');
    } else if (diffMinutes < 60) {
        return t('time.minutesAgo', { count: diffMinutes });
    } else if (diffHours < 24) {
        return t('time.hoursAgo', { count: diffHours });
    } else {
        return t('sessionHistory.daysAgo', { count: diffDays });
    }
}

export function EmptyMessages({ session, onProjectSelect }: EmptyMessagesProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const osIcon = getOSIcon(session.metadata?.os);
    const sessionStatus = useSessionStatus(session);
    const startedTime = formatRelativeTime(session.createdAt);

    const machineId = session.metadata?.machineId ?? null;
    const homeDir = session.metadata?.homeDir ?? null;
    const projectScan = useProjectScanning(machineId, homeDir);

    return (
        <View style={styles.container}>
            <Ionicons
                name={osIcon}
                size={72}
                color={theme.colors.textSecondary}
                style={styles.iconContainer}
            />

            {session.metadata?.host && (
                <Text style={styles.hostText}>
                    {session.metadata.host}
                </Text>
            )}

            {session.metadata?.path && (
                <Text style={styles.pathText}>
                    {formatPathRelativeToHome(session.metadata.path, session.metadata.homeDir)}
                </Text>
            )}

            {/* Project list section */}
            {machineId && (
                <View style={styles.projectsSection}>
                    <Text style={styles.projectsSectionTitle}>
                        Projects on this machine
                    </Text>

                    {projectScan.isScanning ? (
                        <View style={styles.loadingContainer}>
                            <View style={styles.loadingRow}>
                                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                <Text style={styles.loadingText}>Scanning for projects...</Text>
                            </View>
                        </View>
                    ) : projectScan.projects.length > 0 ? (
                        <ScrollView style={styles.projectsList} showsVerticalScrollIndicator={false}>
                            {projectScan.projects.map((project, index) => (
                                <Pressable
                                    key={project.path}
                                    style={({ pressed }) => [
                                        styles.projectRow,
                                        index < projectScan.projects.length - 1 && styles.projectRowBorder,
                                        pressed && { opacity: 0.6 },
                                    ]}
                                    onPress={() => onProjectSelect?.(project.path)}
                                >
                                    <Ionicons
                                        name="code-slash-outline"
                                        size={18}
                                        color={theme.colors.textSecondary}
                                        style={styles.projectIcon}
                                    />
                                    <View style={styles.projectInfo}>
                                        <Text style={styles.projectName} numberOfLines={1}>
                                            {project.name}
                                        </Text>
                                        <Text style={styles.projectPath} numberOfLines={1}>
                                            {formatPathRelativeToHome(project.path, homeDir ?? undefined)}
                                        </Text>
                                    </View>
                                    <Ionicons
                                        name="chevron-forward"
                                        size={16}
                                        color={theme.colors.textSecondary}
                                    />
                                </Pressable>
                            ))}
                        </ScrollView>
                    ) : null}
                </View>
            )}

            <Text style={styles.createdText}>
                Created {startedTime}
            </Text>
        </View>
    );
}

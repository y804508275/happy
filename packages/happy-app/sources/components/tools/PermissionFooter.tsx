import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sessionAllow, sessionDeny } from '@/sync/ops';
import { useUnistyles } from 'react-native-unistyles';
import { storage } from '@/sync/storage';
import { t } from '@/text';

/**
 * Minimum time (ms) after mount before clicks are accepted.
 * Prevents mis-clicks caused by layout shifts in the inverted FlatList
 * (especially on web where maintainVisibleContentPosition is unsupported).
 */
const CLICK_GUARD_MS = 300;

/**
 * Cache which button the user actually clicked, keyed by permission ID.
 * The server response may not preserve allowedTools/decision correctly,
 * so we track the decision locally to display the correct selected state.
 */
type PermissionDecisionType = 'allow' | 'allowAllEdits' | 'allowForSession' | 'deny' | 'codexApprove' | 'codexApproveForSession' | 'codexAbort';
const permissionDecisionCache = new Map<string, PermissionDecisionType>();

interface PermissionFooterProps {
    permission: {
        id: string;
        status: "pending" | "approved" | "denied" | "canceled";
        reason?: string;
        mode?: string;
        allowedTools?: string[];
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
    };
    sessionId: string;
    toolName: string;
    toolInput?: any;
    metadata?: any;
    /** When true, enables keyboard navigation (up/down/enter) and disables click guard */
    enableKeyboard?: boolean;
}

export const PermissionFooter: React.FC<PermissionFooterProps> = React.memo(({ permission, sessionId, toolName, toolInput, metadata, enableKeyboard }) => {
    const { theme } = useUnistyles();
    const [loadingButton, setLoadingButton] = useState<'allow' | 'deny' | 'abort' | null>(null);
    const [loadingAllEdits, setLoadingAllEdits] = useState(false);
    const [loadingForSession, setLoadingForSession] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState(0);

    // Guard against mis-clicks caused by layout shifts.
    // Only applies on mount (not every render) to avoid blocking legitimate clicks.
    // When enableKeyboard is true (FixedPermissionBar), guard is skipped entirely
    // since the component is outside the FlatList and not affected by layout shifts.
    const mountedAt = useRef(Date.now());
    const isClickTooSoon = () => !enableKeyboard && Date.now() - mountedAt.current < CLICK_GUARD_MS;

    // Check if this is a Codex session - check both metadata.flavor and tool name prefix
    const isCodex = metadata?.flavor === 'codex' || toolName.startsWith('Codex');

    const handleApprove = async () => {
        if (isClickTooSoon()) return;
        if (permission.status !== 'pending' || loadingButton !== null || loadingAllEdits || loadingForSession) return;

        permissionDecisionCache.set(permission.id, 'allow');
        setLoadingButton('allow');
        try {
            await sessionAllow(sessionId, permission.id);
        } catch (error) {
            console.error('Failed to approve permission:', error);
        } finally {
            setLoadingButton(null);
        }
    };

    const handleApproveAllEdits = async () => {
        if (isClickTooSoon()) return;
        if (permission.status !== 'pending' || loadingButton !== null || loadingAllEdits || loadingForSession) return;

        permissionDecisionCache.set(permission.id, 'allowAllEdits');
        setLoadingAllEdits(true);
        try {
            await sessionAllow(sessionId, permission.id, 'acceptEdits');
            // Update the session permission mode to 'acceptEdits' for future permissions
            storage.getState().updateSessionPermissionMode(sessionId, 'acceptEdits');
        } catch (error) {
            console.error('Failed to approve all edits:', error);
        } finally {
            setLoadingAllEdits(false);
        }
    };

    const handleApproveForSession = async () => {
        if (isClickTooSoon()) return;
        if (permission.status !== 'pending' || loadingButton !== null || loadingAllEdits || loadingForSession || !toolName) return;

        permissionDecisionCache.set(permission.id, 'allowForSession');
        setLoadingForSession(true);
        try {
            // Special handling for Bash tool - include exact command
            let toolIdentifier = toolName;
            if (toolName === 'Bash' && toolInput?.command) {
                const command = toolInput.command;
                toolIdentifier = `Bash(${command})`;
            }
            
            await sessionAllow(sessionId, permission.id, undefined, [toolIdentifier]);
        } catch (error) {
            console.error('Failed to approve for session:', error);
        } finally {
            setLoadingForSession(false);
        }
    };

    const handleDeny = async () => {
        if (isClickTooSoon()) return;
        if (permission.status !== 'pending' || loadingButton !== null || loadingAllEdits || loadingForSession) return;

        permissionDecisionCache.set(permission.id, 'deny');
        setLoadingButton('deny');
        try {
            await sessionDeny(sessionId, permission.id);
        } catch (error) {
            console.error('Failed to deny permission:', error);
        } finally {
            setLoadingButton(null);
        }
    };
    
    // Codex-specific handlers
    const handleCodexApprove = async () => {
        if (isClickTooSoon()) return;
        if (permission.status !== 'pending' || loadingButton !== null || loadingForSession) return;

        permissionDecisionCache.set(permission.id, 'codexApprove');
        setLoadingButton('allow');
        try {
            await sessionAllow(sessionId, permission.id, undefined, undefined, 'approved');
        } catch (error) {
            console.error('Failed to approve permission:', error);
        } finally {
            setLoadingButton(null);
        }
    };
    
    const handleCodexApproveForSession = async () => {
        if (isClickTooSoon()) return;
        if (permission.status !== 'pending' || loadingButton !== null || loadingForSession) return;

        permissionDecisionCache.set(permission.id, 'codexApproveForSession');
        setLoadingForSession(true);
        try {
            await sessionAllow(sessionId, permission.id, undefined, undefined, 'approved_for_session');
        } catch (error) {
            console.error('Failed to approve for session:', error);
        } finally {
            setLoadingForSession(false);
        }
    };
    
    const handleCodexAbort = async () => {
        if (isClickTooSoon()) return;
        if (permission.status !== 'pending' || loadingButton !== null || loadingForSession) return;

        permissionDecisionCache.set(permission.id, 'codexAbort');
        setLoadingButton('abort');
        try {
            await sessionDeny(sessionId, permission.id, undefined, undefined, 'abort');
        } catch (error) {
            console.error('Failed to abort permission:', error);
        } finally {
            setLoadingButton(null);
        }
    };

    const isApproved = permission.status === 'approved';
    const isDenied = permission.status === 'denied';
    const isPending = permission.status === 'pending';

    // Helper function to check if tool matches allowed pattern
    const isToolAllowed = (toolName: string, toolInput: any, allowedTools: string[] | undefined): boolean => {
        if (!allowedTools) return false;
        
        // Direct match for non-Bash tools
        if (allowedTools.includes(toolName)) return true;
        
        // For Bash, check exact command match
        if (toolName === 'Bash' && toolInput?.command) {
            const command = toolInput.command;
            return allowedTools.includes(`Bash(${command})`);
        }
        
        return false;
    };

    // Detect which button was used based on local cache first, then server data as fallback
    const cachedDecision = permissionDecisionCache.get(permission.id);

    const isApprovedViaAllow = isApproved && (
        cachedDecision === 'allow' ||
        (!cachedDecision && permission.mode !== 'acceptEdits' && !isToolAllowed(toolName, toolInput, permission.allowedTools))
    );
    const isApprovedViaAllEdits = isApproved && (
        cachedDecision === 'allowAllEdits' ||
        (!cachedDecision && permission.mode === 'acceptEdits')
    );
    const isApprovedForSession = isApproved && (
        cachedDecision === 'allowForSession' ||
        (!cachedDecision && isToolAllowed(toolName, toolInput, permission.allowedTools))
    );

    // Codex-specific status detection with local cache and server fallback
    const isCodexApproved = isCodex && isApproved && (
        cachedDecision === 'codexApprove' ||
        (!cachedDecision && (permission.decision === 'approved' || !permission.decision))
    );
    const isCodexApprovedForSession = isCodex && isApproved && (
        cachedDecision === 'codexApproveForSession' ||
        (!cachedDecision && permission.decision === 'approved_for_session')
    );
    const isCodexAborted = isCodex && isDenied && (
        cachedDecision === 'codexAbort' ||
        (!cachedDecision && permission.decision === 'abort')
    );

    // Build list of action handlers for keyboard navigation
    // Use a ref so the keyboard handler always calls the latest version
    const buttonActionsRef = useRef<(() => void)[]>([]);
    const buttonCount = (() => {
        if (isCodex) {
            buttonActionsRef.current = [handleCodexApprove, handleCodexApproveForSession, handleCodexAbort];
            return 3;
        }
        const actions: (() => void)[] = [handleApprove];
        const isEditTool = toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write' || toolName === 'NotebookEdit' || toolName === 'exit_plan_mode' || toolName === 'ExitPlanMode';
        if (isEditTool) {
            actions.push(handleApproveAllEdits);
        } else if (toolName) {
            actions.push(handleApproveForSession);
        }
        actions.push(handleDeny);
        buttonActionsRef.current = actions;
        return actions.length;
    })();
    const focusedIndexRef = useRef(focusedIndex);
    focusedIndexRef.current = focusedIndex;

    // Keyboard navigation: up/down to select, enter to confirm (web only)
    useEffect(() => {
        if (Platform.OS !== 'web' || !enableKeyboard || !isPending) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex(i => {
                    const next = (i - 1 + buttonCount) % buttonCount;
                    focusedIndexRef.current = next;
                    return next;
                });
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex(i => {
                    const next = (i + 1) % buttonCount;
                    focusedIndexRef.current = next;
                    return next;
                });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                buttonActionsRef.current[focusedIndexRef.current]?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enableKeyboard, isPending, buttonCount]);

    const styles = StyleSheet.create({
        container: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            justifyContent: 'center',
        },
        buttonContainer: {
            flexDirection: 'column',
            gap: 4,
            alignItems: 'flex-start',
        },
        button: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 1,
            backgroundColor: 'transparent',
            alignItems: 'flex-start',
            justifyContent: 'center',
            minHeight: 32,
            borderLeftWidth: 3,
            borderLeftColor: 'transparent',
            alignSelf: 'stretch',
        },
        buttonAllow: {
            backgroundColor: 'transparent',
        },
        buttonDeny: {
            backgroundColor: 'transparent',
        },
        buttonAllowAll: {
            backgroundColor: 'transparent',
        },
        buttonSelected: {
            backgroundColor: 'transparent',
            borderLeftColor: theme.colors.text,
        },
        buttonFocused: {
            backgroundColor: theme.colors.surfaceHigh,
            borderLeftColor: theme.colors.textSecondary,
        },
        buttonInactive: {
            opacity: 0.3,
        },
        buttonContent: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            minHeight: 20,
        },
        icon: {
            marginRight: 2,
        },
        buttonText: {
            fontSize: 14,
            fontWeight: '400',
            color: theme.colors.textSecondary,
        },
        buttonTextAllow: {
            color: theme.colors.permissionButton.allow.background,
            fontWeight: '500',
        },
        buttonTextDeny: {
            color: theme.colors.permissionButton.deny.background,
            fontWeight: '500',
        },
        buttonTextAllowAll: {
            color: theme.colors.permissionButton.allowAll.background,
            fontWeight: '500',
        },
        buttonTextSelected: {
            color: theme.colors.text,
            fontWeight: '500',
        },
        buttonForSession: {
            backgroundColor: 'transparent',
        },
        buttonTextForSession: {
            color: theme.colors.permissionButton.allowAll.background,
            fontWeight: '500',
        },
        loadingIndicatorAllow: {
            color: theme.colors.permissionButton.allow.background,
        },
        loadingIndicatorDeny: {
            color: theme.colors.permissionButton.deny.background,
        },
        loadingIndicatorAllowAll: {
            color: theme.colors.permissionButton.allowAll.background,
        },
        loadingIndicatorForSession: {
            color: theme.colors.permissionButton.allowAll.background,
        },
        iconApproved: {
            color: theme.colors.permissionButton.allow.background,
        },
        iconDenied: {
            color: theme.colors.permissionButton.deny.background,
        },
    });

    // Render Codex buttons if this is a Codex session
    if (isCodex) {
        return (
            <View style={styles.container}>
                <View style={styles.buttonContainer}>
                    {/* Codex: Yes button */}
                    <TouchableOpacity
                        style={[
                            styles.button,
                            isPending && styles.buttonAllow,
                            enableKeyboard && isPending && focusedIndex === 0 && styles.buttonFocused,
                            isCodexApproved && styles.buttonSelected,
                            (isCodexAborted || isCodexApprovedForSession) && styles.buttonInactive
                        ]}
                        onPress={handleCodexApprove}
                        disabled={!isPending || loadingButton !== null || loadingForSession}
                        activeOpacity={isPending ? 0.7 : 1}
                    >
                        {loadingButton === 'allow' && isPending ? (
                            <View style={[styles.buttonContent, { width: 40, height: 20, justifyContent: 'center' }]}>
                                <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={styles.loadingIndicatorAllow.color} />
                            </View>
                        ) : (
                            <View style={styles.buttonContent}>
                                <Text style={[
                                    styles.buttonText,
                                    isPending && styles.buttonTextAllow,
                                    isCodexApproved && styles.buttonTextSelected
                                ]} numberOfLines={1} ellipsizeMode="tail">
                                    {t('common.yes')}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Codex: Yes, and don't ask for a session button */}
                    <TouchableOpacity
                        style={[
                            styles.button,
                            isPending && styles.buttonForSession,
                            enableKeyboard && isPending && focusedIndex === 1 && styles.buttonFocused,
                            isCodexApprovedForSession && styles.buttonSelected,
                            (isCodexAborted || isCodexApproved) && styles.buttonInactive
                        ]}
                        onPress={handleCodexApproveForSession}
                        disabled={!isPending || loadingButton !== null || loadingForSession}
                        activeOpacity={isPending ? 0.7 : 1}
                    >
                        {loadingForSession && isPending ? (
                            <View style={[styles.buttonContent, { width: 40, height: 20, justifyContent: 'center' }]}>
                                <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={styles.loadingIndicatorForSession.color} />
                            </View>
                        ) : (
                            <View style={styles.buttonContent}>
                                <Text style={[
                                    styles.buttonText,
                                    isPending && styles.buttonTextForSession,
                                    isCodexApprovedForSession && styles.buttonTextSelected
                                ]} numberOfLines={1} ellipsizeMode="tail">
                                    {t('codex.permissions.yesForSession')}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Codex: Stop, and explain what to do button */}
                    <TouchableOpacity
                        style={[
                            styles.button,
                            isPending && styles.buttonDeny,
                            enableKeyboard && isPending && focusedIndex === 2 && styles.buttonFocused,
                            isCodexAborted && styles.buttonSelected,
                            (isCodexApproved || isCodexApprovedForSession) && styles.buttonInactive
                        ]}
                        onPress={handleCodexAbort}
                        disabled={!isPending || loadingButton !== null || loadingForSession}
                        activeOpacity={isPending ? 0.7 : 1}
                    >
                        {loadingButton === 'abort' && isPending ? (
                            <View style={[styles.buttonContent, { width: 40, height: 20, justifyContent: 'center' }]}>
                                <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={styles.loadingIndicatorDeny.color} />
                            </View>
                        ) : (
                            <View style={styles.buttonContent}>
                                <Text style={[
                                    styles.buttonText,
                                    isPending && styles.buttonTextDeny,
                                    isCodexAborted && styles.buttonTextSelected
                                ]} numberOfLines={1} ellipsizeMode="tail">
                                    {t('codex.permissions.stopAndExplain')}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Render Claude buttons (existing behavior)
    return (
        <View style={styles.container}>
            <View style={styles.buttonContainer}>
                <TouchableOpacity
                    style={[
                        styles.button,
                        isPending && styles.buttonAllow,
                        enableKeyboard && isPending && focusedIndex === 0 && styles.buttonFocused,
                        isApprovedViaAllow && styles.buttonSelected,
                        (isDenied || isApprovedViaAllEdits || isApprovedForSession) && styles.buttonInactive
                    ]}
                    onPress={handleApprove}
                    disabled={!isPending || loadingButton !== null || loadingAllEdits || loadingForSession}
                    activeOpacity={isPending ? 0.7 : 1}
                >
                    {loadingButton === 'allow' && isPending ? (
                        <View style={[styles.buttonContent, { width: 40, height: 20, justifyContent: 'center' }]}>
                            <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={styles.loadingIndicatorAllow.color} />
                        </View>
                    ) : (
                        <View style={styles.buttonContent}>
                            <Text style={[
                                styles.buttonText,
                                isPending && styles.buttonTextAllow,
                                isApprovedViaAllow && styles.buttonTextSelected
                            ]} numberOfLines={1} ellipsizeMode="tail">
                                {t('common.yes')}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Allow All Edits button - only show for Edit and MultiEdit tools */}
                {(toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write' || toolName === 'NotebookEdit' || toolName === 'exit_plan_mode' || toolName === 'ExitPlanMode') && (
                    <TouchableOpacity
                        style={[
                            styles.button,
                            isPending && styles.buttonAllowAll,
                            enableKeyboard && isPending && focusedIndex === 1 && styles.buttonFocused,
                            isApprovedViaAllEdits && styles.buttonSelected,
                            (isDenied || isApprovedViaAllow || isApprovedForSession) && styles.buttonInactive
                        ]}
                        onPress={handleApproveAllEdits}
                        disabled={!isPending || loadingButton !== null || loadingAllEdits || loadingForSession}
                        activeOpacity={isPending ? 0.7 : 1}
                    >
                        {loadingAllEdits && isPending ? (
                            <View style={[styles.buttonContent, { width: 40, height: 20, justifyContent: 'center' }]}>
                                <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={styles.loadingIndicatorAllowAll.color} />
                            </View>
                        ) : (
                            <View style={styles.buttonContent}>
                                <Text style={[
                                    styles.buttonText,
                                    isPending && styles.buttonTextAllowAll,
                                    isApprovedViaAllEdits && styles.buttonTextSelected
                                ]} numberOfLines={1} ellipsizeMode="tail">
                                    {t('claude.permissions.yesAllowAllEdits')}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                {/* Allow for session button - only show for non-edit, non-exit-plan tools */}
                {toolName && toolName !== 'Edit' && toolName !== 'MultiEdit' && toolName !== 'Write' && toolName !== 'NotebookEdit' && toolName !== 'exit_plan_mode' && toolName !== 'ExitPlanMode' && (
                    <TouchableOpacity
                        style={[
                            styles.button,
                            isPending && styles.buttonForSession,
                            enableKeyboard && isPending && focusedIndex === 1 && styles.buttonFocused,
                            isApprovedForSession && styles.buttonSelected,
                            (isDenied || isApprovedViaAllow || isApprovedViaAllEdits) && styles.buttonInactive
                        ]}
                        onPress={handleApproveForSession}
                        disabled={!isPending || loadingButton !== null || loadingAllEdits || loadingForSession}
                        activeOpacity={isPending ? 0.7 : 1}
                    >
                        {loadingForSession && isPending ? (
                            <View style={[styles.buttonContent, { width: 40, height: 20, justifyContent: 'center' }]}>
                                <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={styles.loadingIndicatorForSession.color} />
                            </View>
                        ) : (
                            <View style={styles.buttonContent}>
                                <Text style={[
                                    styles.buttonText,
                                    isPending && styles.buttonTextForSession,
                                    isApprovedForSession && styles.buttonTextSelected
                                ]} numberOfLines={1} ellipsizeMode="tail">
                                    {t('claude.permissions.yesForTool')}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={[
                        styles.button,
                        isPending && styles.buttonDeny,
                        enableKeyboard && isPending && focusedIndex === 2 && styles.buttonFocused,
                        isDenied && styles.buttonSelected,
                        (isApproved) && styles.buttonInactive
                    ]}
                    onPress={handleDeny}
                    disabled={!isPending || loadingButton !== null || loadingAllEdits || loadingForSession}
                    activeOpacity={isPending ? 0.7 : 1}
                >
                    {loadingButton === 'deny' && isPending ? (
                        <View style={[styles.buttonContent, { width: 40, height: 20, justifyContent: 'center' }]}>
                            <ActivityIndicator size={Platform.OS === 'ios' ? "small" : 14 as any} color={styles.loadingIndicatorDeny.color} />
                        </View>
                    ) : (
                        <View style={styles.buttonContent}>
                            <Text style={[
                                styles.buttonText,
                                isPending && styles.buttonTextDeny,
                                isDenied && styles.buttonTextSelected
                            ]} numberOfLines={1} ellipsizeMode="tail">
                                {t('claude.permissions.noTellClaude')}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
});
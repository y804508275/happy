import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useSessionMessages } from '@/sync/storage';
import { ToolCallMessage } from '@/sync/typesMessage';
import { PermissionFooter } from './PermissionFooter';
import { Metadata } from '@/sync/storageTypes';
import { layout } from '@/components/layout';
import { sessionAllow } from '@/sync/ops';

/**
 * Renders pending permission buttons in a fixed position above the input bar.
 * This prevents mis-clicks caused by FlatList layout shifts on web, where
 * react-native-web does not support maintainVisibleContentPosition.
 *
 * In 'confirm' or 'all' autoConfirmMode, auto-approves pending permissions
 * from the App side (backup for CLI-side auto-confirm to avoid UI flicker).
 */
export const FixedPermissionBar = React.memo((props: {
    sessionId: string;
    metadata: Metadata | null;
    isConnected: boolean;
    autoConfirmMode?: 'off' | 'confirm' | 'all';
}) => {
    const { messages } = useSessionMessages(props.sessionId);

    // Find the most recent tool call with a pending permission
    // Skip AskUserQuestion — it's handled by FixedAskUserQuestionBar which
    // approves the permission and sends the answer in one step.
    const pendingTool = React.useMemo(() => {
        for (const msg of messages) {
            if (msg.kind === 'tool-call') {
                const toolMsg = msg as ToolCallMessage;
                if (toolMsg.tool?.permission?.status === 'pending' && toolMsg.tool?.name !== 'AskUserQuestion') {
                    return toolMsg;
                }
            }
        }
        return null;
    }, [messages]);

    // Auto-approve permissions from App side in confirm/all mode
    const autoApprovedRef = React.useRef<Set<string>>(new Set());
    React.useEffect(() => {
        if (!pendingTool || !props.isConnected) return;
        if (props.autoConfirmMode !== 'all') return;
        const permId = pendingTool.tool.permission!.id;
        if (autoApprovedRef.current.has(permId)) return;
        autoApprovedRef.current.add(permId);
        sessionAllow(props.sessionId, permId);
    }, [pendingTool, props.isConnected, props.autoConfirmMode, props.sessionId]);

    // Hide when session is disconnected, no pending permission,
    // or in auto-confirm mode (permissions get auto-approved above)
    if (!props.isConnected || !pendingTool) {
        return null;
    }
    if (props.autoConfirmMode === 'all') {
        return null;
    }

    return (
        <View style={styles.container}>
            <PermissionFooter
                permission={pendingTool.tool.permission!}
                sessionId={props.sessionId}
                toolName={pendingTool.tool.name}
                toolInput={pendingTool.tool.input}
                metadata={props.metadata}
                enableKeyboard
            />
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.maxWidth,
    },
}));

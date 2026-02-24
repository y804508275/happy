import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useSessionMessages } from '@/sync/storage';
import { ToolCallMessage } from '@/sync/typesMessage';
import { PermissionFooter } from './PermissionFooter';
import { Metadata } from '@/sync/storageTypes';
import { layout } from '@/components/layout';

/**
 * Renders pending permission buttons in a fixed position above the input bar.
 * This prevents mis-clicks caused by FlatList layout shifts on web, where
 * react-native-web does not support maintainVisibleContentPosition.
 */
export const FixedPermissionBar = React.memo((props: {
    sessionId: string;
    metadata: Metadata | null;
}) => {
    const { messages } = useSessionMessages(props.sessionId);

    // Find the most recent tool call with a pending permission
    const pendingTool = React.useMemo(() => {
        for (const msg of messages) {
            if (msg.kind === 'tool-call') {
                const toolMsg = msg as ToolCallMessage;
                if (toolMsg.tool?.permission?.status === 'pending') {
                    return toolMsg;
                }
            }
        }
        return null;
    }, [messages]);

    if (!pendingTool) {
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

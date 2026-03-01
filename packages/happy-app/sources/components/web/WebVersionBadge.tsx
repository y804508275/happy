import React from 'react';
import { Platform, View, Text } from 'react-native';
import { APP_DEPLOY_VERSION } from '@/version';

export const WebVersionBadge = React.memo(() => {
    if (Platform.OS !== 'web') {
        return null;
    }

    return (
        <View
            style={{
                position: 'fixed' as any,
                bottom: 8,
                right: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 4,
                zIndex: 9999,
                pointerEvents: 'none',
            }}
        >
            <Text
                style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: '500',
                }}
            >
                v{APP_DEPLOY_VERSION}
            </Text>
        </View>
    );
});

WebVersionBadge.displayName = 'WebVersionBadge';

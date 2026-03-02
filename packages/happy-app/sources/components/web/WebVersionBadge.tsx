import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Platform, View, Text, Pressable, ScrollView } from 'react-native';
import { APP_DEPLOY_VERSION } from '@/version';
import { getChangelogEntries } from '@/changelog';

export const WebVersionBadge = React.memo(() => {
    const [showPanel, setShowPanel] = useState(false);
    const containerRef = useRef<View>(null);

    const togglePanel = useCallback(() => {
        setShowPanel(prev => !prev);
    }, []);

    // Close panel when clicking outside
    useEffect(() => {
        if (!showPanel) return;
        const handleClick = (e: MouseEvent) => {
            const container = containerRef.current as any;
            if (container && !container.contains(e.target)) {
                setShowPanel(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showPanel]);

    if (Platform.OS !== 'web') {
        return null;
    }

    const entries = getChangelogEntries();

    return (
        <View
            ref={containerRef}
            style={{
                position: 'fixed' as any,
                bottom: 8,
                right: 8,
                zIndex: 9999,
                alignItems: 'flex-end',
            }}
        >
            {showPanel && (
                <View
                    style={{
                        width: 360,
                        maxHeight: 420,
                        backgroundColor: 'rgba(20, 20, 20, 0.95)',
                        borderRadius: 8,
                        marginBottom: 6,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: -4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 12,
                        overflow: 'hidden',
                    }}
                >
                    <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' }}>
                            Version History
                        </Text>
                    </View>
                    <ScrollView
                        style={{ maxHeight: 370 }}
                        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}
                        showsVerticalScrollIndicator={false}
                    >
                        {entries.map((entry, index) => (
                            <View
                                key={entry.version}
                                style={{
                                    paddingVertical: 10,
                                    borderTopWidth: index > 0 ? 1 : 0,
                                    borderTopColor: 'rgba(255,255,255,0.1)',
                                }}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600', fontFamily: 'monospace' }}>
                                        v{entry.deployVersion}
                                    </Text>
                                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }}>
                                        {entry.date}
                                    </Text>
                                </View>
                                {entry.summary && (
                                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 16, marginBottom: 6 }} numberOfLines={2}>
                                        {entry.summary}
                                    </Text>
                                )}
                                {entry.changes.map((change, i) => (
                                    <View key={i} style={{ flexDirection: 'row', marginTop: 2 }}>
                                        <Text style={{ color: 'rgba(100,180,255,0.8)', fontSize: 11, marginRight: 6 }}>•</Text>
                                        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 16, flex: 1 }}>
                                            {change}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}
            <Pressable
                onPress={togglePanel}
                style={({ hovered }: any) => ({
                    backgroundColor: hovered ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 4,
                    cursor: 'pointer' as any,
                })}
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
            </Pressable>
        </View>
    );
});

WebVersionBadge.displayName = 'WebVersionBadge';

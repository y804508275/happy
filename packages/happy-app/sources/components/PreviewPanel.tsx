import * as React from 'react';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';

export interface PreviewData {
    kind: 'screenshot' | 'url' | 'html' | 'text';
    url?: string;
    title?: string;
    body?: string;
}

export function PreviewPanel({ onClose, previewData, history }: {
    sessionId: string;
    machineId: string;
    onClose: () => void;
    previewData?: PreviewData | null;
    history?: PreviewData[];
}) {
    const { theme } = useUnistyles();
    const [refreshKey, setRefreshKey] = useState(0);

    // If we have a live stream URL, always prefer that
    const liveStream = history?.find(h => h.kind === 'url' && h.url) ?? (previewData?.kind === 'url' ? previewData : null);
    const current = liveStream ?? previewData;

    // Determine if this is a browser preview or an app preview
    const isBrowserPreview = !current?.title || current.title === 'Live Browser';
    const panelTitle = isBrowserPreview ? 'Browser' : current?.title || 'Browser';

    const isDark = theme.colors.surface !== '#ffffff';
    const chromeBg = isDark ? '#2a2a2a' : '#e8e8e8';
    const chromeBarBg = isDark ? '#3a3a3a' : '#f5f5f5';

    return (
        <View style={{
            flex: 2,
            borderLeftWidth: 1,
            borderLeftColor: theme.colors.divider,
            backgroundColor: theme.colors.surface,
            flexDirection: 'column',
        }}>
            {/* Title bar */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                height: 40,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.divider,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>
                        {panelTitle}
                    </Text>
                    {current && (
                        <View style={{
                            width: 6, height: 6, borderRadius: 3,
                            backgroundColor: '#34C759',
                        }} />
                    )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <PanelButton icon="refresh-outline" onPress={() => setRefreshKey(k => k + 1)} theme={theme} />
                    <PanelButton icon="expand-outline" onPress={() => {}} theme={theme} />
                    <PanelButton icon="close" onPress={onClose} theme={theme} />
                </View>
            </View>

            {/* Browser chrome bar - only for browser previews */}
            {isBrowserPreview && (
                <View style={{
                    backgroundColor: chromeBg,
                    paddingTop: 8,
                    paddingHorizontal: 12,
                    paddingBottom: 8,
                }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 6, marginRight: 4 }}>
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isDark ? '#555' : '#ccc' }} />
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isDark ? '#555' : '#ccc' }} />
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isDark ? '#555' : '#ccc' }} />
                        </View>
                        <View style={{
                            flex: 1,
                            height: 28,
                            backgroundColor: chromeBarBg,
                            borderRadius: 6,
                            justifyContent: 'center',
                            paddingHorizontal: 10,
                        }}>
                            <Text style={{ fontSize: 11, color: theme.colors.textSecondary }} numberOfLines={1}>
                                {liveStream ? 'Live Desktop Stream' : (current?.url || '')}
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Content area */}
            <View style={{ flex: 1, backgroundColor: isDark ? '#1e1e1e' : '#ffffff' }}>
                {current ? (
                    <CapabilityPreview data={current} theme={theme} refreshKey={refreshKey} />
                ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                        <Ionicons name="globe-outline" size={28} color={theme.colors.textSecondary} style={{ opacity: 0.3 }} />
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 10, opacity: 0.5 }}>
                            Waiting for browser activity...
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
}

function CapabilityPreview({ data, theme, refreshKey }: { data: PreviewData; theme: any; refreshKey?: number }) {
    if (data.kind === 'url' && data.url) {
        return (
            <View style={{ width: '100%', height: '100%' }}>
                <iframe
                    key={refreshKey}
                    src={data.url}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    allow="clipboard-read; clipboard-write"
                />
            </View>
        );
    }

    if (data.kind === 'screenshot' && data.body) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Image
                    source={{ uri: `data:image/png;base64,${data.body}` }}
                    style={{ width: '94%', aspectRatio: 16 / 9, borderRadius: 4 }}
                    resizeMode="contain"
                />
            </View>
        );
    }

    if (data.kind === 'html' && data.body) {
        return (
            <View style={{ width: '100%', height: '100%' }}>
                <iframe
                    srcDoc={data.body}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    sandbox="allow-scripts"
                />
            </View>
        );
    }

    if (data.kind === 'text' && data.body) {
        return (
            <ScrollView style={{ flex: 1, padding: 16, width: '100%' }}>
                {data.title && (
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 8 }}>
                        {data.title}
                    </Text>
                )}
                <Text style={{ fontSize: 13, color: theme.colors.text, lineHeight: 20 }}>
                    {data.body}
                </Text>
            </ScrollView>
        );
    }

    return null;
}

function PanelButton({ icon, onPress, theme }: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    theme: any;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={({ hovered }: any) => ({
                width: 26,
                height: 26,
                borderRadius: 5,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: hovered ? theme.colors.surfaceHigh : 'transparent',
            })}
            hitSlop={4}
        >
            <Ionicons name={icon} size={15} color={theme.colors.textSecondary} />
        </Pressable>
    );
}

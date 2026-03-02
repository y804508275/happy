import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSettingMutable } from '@/sync/storage';
import { t } from '@/text';

/**
 * Browser preview panel shown as a right sidebar on web.
 * Loads user-provided URLs in an iframe. Persists the last URL via local settings.
 */
export function PreviewPanel({ onClose }: {
    sessionId: string;
    machineId: string;
    onClose: () => void;
}) {
    const { theme } = useUnistyles();
    const [lastUrl, setLastUrl] = useLocalSettingMutable('lastPreviewUrl');
    const [inputValue, setInputValue] = React.useState(lastUrl || '');
    const [loadedUrl, setLoadedUrl] = React.useState(lastUrl || '');
    const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
    const [iframeKey, setIframeKey] = React.useState(0);

    // Normalize URL: add https:// if no protocol specified
    const normalizeUrl = React.useCallback((url: string): string => {
        const trimmed = url.trim();
        if (!trimmed) return '';
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        return 'https://' + trimmed;
    }, []);

    // Navigate to the URL in the input
    const navigate = React.useCallback(() => {
        const url = normalizeUrl(inputValue);
        if (url) {
            setLoadedUrl(url);
            setLastUrl(url);
        }
    }, [inputValue, normalizeUrl, setLastUrl]);

    // Handle Enter key in URL input
    const handleKeyPress = React.useCallback((e: { nativeEvent: { key: string } }) => {
        if (e.nativeEvent.key === 'Enter') {
            navigate();
        }
    }, [navigate]);

    // Refresh the iframe
    const handleRefresh = React.useCallback(() => {
        setIframeKey(k => k + 1);
    }, []);

    // Go back in iframe history
    const handleBack = React.useCallback(() => {
        try {
            iframeRef.current?.contentWindow?.history.back();
        } catch {
            // Cross-origin restriction — ignore
        }
    }, []);

    const iconColor = theme.colors.textSecondary;
    const iconColorHover = theme.colors.text;

    return (
        <View style={{
            width: '50%',
            borderLeftWidth: 1,
            borderLeftColor: theme.colors.divider,
            backgroundColor: theme.colors.surface,
            flexDirection: 'column',
        }}>
            {/* Toolbar */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.divider,
                gap: 4,
            }}>
                {/* Back button */}
                <ToolbarButton
                    icon="arrow-back"
                    onPress={handleBack}
                    color={iconColor}
                    hoverColor={iconColorHover}
                />

                {/* URL input */}
                <TextInput
                    style={{
                        flex: 1,
                        height: 32,
                        backgroundColor: theme.colors.input.background,
                        borderRadius: 6,
                        paddingHorizontal: 10,
                        fontSize: 13,
                        color: theme.colors.input.text,
                        outlineStyle: 'none',
                    } as any}
                    value={inputValue}
                    onChangeText={setInputValue}
                    onSubmitEditing={navigate}
                    onKeyPress={handleKeyPress}
                    placeholder={t('preview.urlPlaceholder')}
                    placeholderTextColor={theme.colors.input.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectTextOnFocus
                />

                {/* Refresh button */}
                <ToolbarButton
                    icon="refresh"
                    onPress={handleRefresh}
                    color={iconColor}
                    hoverColor={iconColorHover}
                />

                {/* Close button */}
                <ToolbarButton
                    icon="close"
                    onPress={onClose}
                    color={iconColor}
                    hoverColor={iconColorHover}
                />
            </View>

            {/* iframe */}
            <View style={{ flex: 1 }}>
                {loadedUrl ? (
                    <iframe
                        key={iframeKey}
                        ref={iframeRef as any}
                        src={loadedUrl}
                        style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                        }}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                    />
                ) : null}
            </View>
        </View>
    );
}

/** Small pressable icon button for the toolbar */
function ToolbarButton({ icon, onPress, color, hoverColor }: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    color: string;
    hoverColor: string;
}) {
    const [hovered, setHovered] = React.useState(false);

    return (
        <Pressable
            onPress={onPress}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
            }}
            hitSlop={4}
        >
            <Ionicons name={icon} size={18} color={hovered ? hoverColor : color} />
        </Pressable>
    );
}

import React from 'react';
import { View, Pressable, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';

export interface ContextMenuItem {
    label: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    color?: string;
    onPress: () => void;
    disabled?: boolean;
}

interface WebContextMenuProps {
    visible: boolean;
    position: { x: number; y: number };
    items: ContextMenuItem[];
    onClose: () => void;
}

const stylesheet = StyleSheet.create((theme) => ({
    menu: {
        position: 'absolute' as any,
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
        paddingVertical: 4,
        minWidth: 180,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    menuItem: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minHeight: 36,
    },
    menuItemHovered: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    menuItemIcon: {
        marginRight: 8,
        width: 20,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    menuItemText: {
        fontSize: 13,
        ...Typography.default('regular'),
    },
}));

export function WebContextMenu({ visible, position, items, onClose }: WebContextMenuProps) {
    if (!visible || Platform.OS !== 'web') return null;

    const styles = stylesheet;

    // Close on Escape key
    React.useEffect(() => {
        const handler = (e: any) => {
            if (e.key === 'Escape') onClose();
        };
        (globalThis as any).addEventListener('keydown', handler);
        return () => (globalThis as any).removeEventListener('keydown', handler);
    }, [onClose]);

    // Adjust position to stay within viewport
    const adjustedPosition = React.useMemo(() => {
        const win = globalThis as any;
        if (!win.innerWidth) return position;
        const menuWidth = 200;
        const menuHeight = items.length * 36 + 8;
        let x = position.x;
        let y = position.y;
        if (x + menuWidth > win.innerWidth) x = win.innerWidth - menuWidth - 8;
        if (y + menuHeight > win.innerHeight) y = win.innerHeight - menuHeight - 8;
        return { x: Math.max(8, x), y: Math.max(8, y) };
    }, [position, items.length]);

    return (
        <View
            style={{
                // @ts-ignore - position: 'fixed' works on web
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99999,
            }}
        >
            {/* Backdrop to catch clicks */}
            <Pressable
                style={{
                    // @ts-ignore
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                }}
                onPress={onClose}
                // @ts-ignore
                onContextMenu={(e: any) => { e.preventDefault(); onClose(); }}
            />
            {/* Menu */}
            <View
                style={[
                    styles.menu,
                    { top: adjustedPosition.y, left: adjustedPosition.x },
                ]}
                // @ts-ignore
                onContextMenu={(e: any) => e.preventDefault()}
            >
                {items.map((item, index) => (
                    <ContextMenuRow key={index} item={item} onClose={onClose} />
                ))}
            </View>
        </View>
    );
}

const ContextMenuRow = React.memo(({ item, onClose }: { item: ContextMenuItem; onClose: () => void }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const [hovered, setHovered] = React.useState(false);
    const color = item.color || theme.colors.text;

    return (
        <View
            // @ts-ignore - onMouseEnter/onMouseLeave work on web
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <Pressable
                style={[styles.menuItem, hovered && styles.menuItemHovered]}
                onPress={() => {
                    onClose();
                    item.onPress();
                }}
                disabled={item.disabled}
            >
                {item.icon && (
                    <View style={styles.menuItemIcon}>
                        <Ionicons name={item.icon} size={16} color={color} />
                    </View>
                )}
                <Text style={[styles.menuItemText, { color }]}>
                    {item.label}
                </Text>
            </Pressable>
        </View>
    );
});

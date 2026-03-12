import * as React from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, withSequence } from 'react-native-reanimated';

interface BouncingDotsProps {
    color: string;
    size?: number;
    gap?: number;
}

/**
 * Three bouncing dots animation for loading/thinking states.
 * Each dot bounces up with a staggered delay for a wave effect.
 */
export const BouncingDots = React.memo(({ color, size = 4, gap = 3 }: BouncingDotsProps) => {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap, height: size * 3 }}>
            <Dot color={color} size={size} delay={0} />
            <Dot color={color} size={size} delay={150} />
            <Dot color={color} size={size} delay={300} />
        </View>
    );
});

const Dot = React.memo(({ color, size, delay }: { color: string; size: number; delay: number }) => {
    const translateY = useSharedValue(0);

    React.useEffect(() => {
        translateY.value = withDelay(delay,
            withRepeat(
                withSequence(
                    withTiming(-size * 1.5, { duration: 300 }),
                    withTiming(0, { duration: 300 }),
                    withTiming(0, { duration: 400 }), // pause at bottom
                ),
                -1,
            )
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <Animated.View
            style={[
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: color,
                },
                animatedStyle,
            ]}
        />
    );
});

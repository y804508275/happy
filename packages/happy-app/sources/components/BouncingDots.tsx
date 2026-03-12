import * as React from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, withSequence } from 'react-native-reanimated';

interface BouncingDotsProps {
    color: string;
    size?: number;
    gap?: number;
}

/**
 * Three pulsing dots animation for loading/thinking states.
 * Each dot scales up then down with a staggered delay for a wave effect.
 */
export const BouncingDots = React.memo(({ color, size = 4, gap = 3 }: BouncingDotsProps) => {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
            <Dot color={color} size={size} delay={0} />
            <Dot color={color} size={size} delay={200} />
            <Dot color={color} size={size} delay={400} />
        </View>
    );
});

const Dot = React.memo(({ color, size, delay }: { color: string; size: number; delay: number }) => {
    const scale = useSharedValue(1);

    React.useEffect(() => {
        scale.value = withDelay(delay,
            withRepeat(
                withSequence(
                    withTiming(1.6, { duration: 300 }),
                    withTiming(1, { duration: 300 }),
                    withTiming(1, { duration: 500 }), // pause
                ),
                -1,
            )
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
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

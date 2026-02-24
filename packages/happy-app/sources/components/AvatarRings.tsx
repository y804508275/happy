import * as React from "react";
import { Canvas, Circle, Group, Skia } from "@shopify/react-native-skia";

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

const RING_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F1948A', '#82E0AA', '#F8C471', '#AED6F1', '#D7BDE2',
    '#A3E4D7', '#FAD7A0', '#D2B4DE', '#A9CCE3', '#F5B7B1',
];

const GRAYSCALE_COLORS = [
    '#444444', '#666666', '#888888', '#aaaaaa', '#cccccc',
];

const NUM_RINGS = 5;

interface AvatarRingsProps {
    id: string;
    title?: boolean;
    square?: boolean;
    size?: number;
    monochrome?: boolean;
}

export const AvatarRings = React.memo((props: AvatarRingsProps) => {
    const { id, square, size = 48, monochrome } = props;

    const rings = React.useMemo(() => {
        const hash = hashCode(id);
        const palette = monochrome ? GRAYSCALE_COLORS : RING_COLORS;
        const center = size / 2;
        const result = [];

        for (let i = 0; i < NUM_RINGS; i++) {
            const colorHash = hashCode(id + String(i));
            const color = palette[colorHash % palette.length];
            const radius = (size / 2) * ((NUM_RINGS - i) / NUM_RINGS);
            const strokeWidth = (size / 2 / NUM_RINGS) * (0.6 + (hashCode(id + 'w' + i) % 40) / 100);

            result.push({
                cx: center,
                cy: center,
                r: radius,
                color,
                strokeWidth,
            });
        }

        return result;
    }, [id, size, monochrome]);

    const clipPath = React.useMemo(() => {
        const path = Skia.Path.Make();
        if (square) {
            path.addRect(Skia.XYWHRect(0, 0, size, size));
        } else {
            path.addRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, size, size), size / 2, size / 2));
        }
        return path;
    }, [square, size]);

    const bgHash = hashCode(id + 'bg');
    const bgColor = monochrome ? '#222222' : RING_COLORS[bgHash % RING_COLORS.length];

    return (
        <Canvas style={{ width: size, height: size }}>
            <Group clip={clipPath}>
                <Circle cx={size / 2} cy={size / 2} r={size / 2} color={bgColor} />
                {rings.map((ring, i) => (
                    <Circle
                        key={i}
                        cx={ring.cx}
                        cy={ring.cy}
                        r={ring.r}
                        color={ring.color}
                        style="stroke"
                        strokeWidth={ring.strokeWidth}
                    />
                ))}
            </Group>
        </Canvas>
    );
});

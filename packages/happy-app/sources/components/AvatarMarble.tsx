import * as React from "react";
import { Canvas, Rect, Group, Circle, Skia, BlurMask } from "@shopify/react-native-skia";

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

const PALETTE = [
    ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51'],
    ['#606c38', '#283618', '#fefae0', '#dda15e', '#bc6c25'],
    ['#003049', '#d62828', '#f77f00', '#fcbf49', '#eae2b7'],
    ['#10002b', '#240046', '#3c096c', '#5a189a', '#7b2cbf'],
    ['#0077b6', '#00b4d8', '#90e0ef', '#caf0f8', '#023e8a'],
    ['#590d22', '#800f2f', '#a4133c', '#c9184a', '#ff4d6d'],
    ['#132a13', '#31572c', '#4f772d', '#90a955', '#ecf39e'],
    ['#7400b8', '#6930c3', '#5e60ce', '#5390d9', '#4ea8de'],
];

const GRAYSCALE_PALETTE = ['#333333', '#666666', '#999999', '#bbbbbb', '#dddddd'];

interface AvatarMarbleProps {
    id: string;
    title?: boolean;
    square?: boolean;
    size?: number;
    monochrome?: boolean;
}

export const AvatarMarble = React.memo((props: AvatarMarbleProps) => {
    const { id, square, size = 48, monochrome } = props;

    const hash = hashCode(id);
    const colors = monochrome ? GRAYSCALE_PALETTE : PALETTE[hash % PALETTE.length];

    // Generate 3 blobs with deterministic positions and sizes
    const blobs = React.useMemo(() => {
        const h1 = hashCode(id + 'a');
        const h2 = hashCode(id + 'b');
        const h3 = hashCode(id + 'c');

        return [
            {
                cx: (h1 % 80 + 10) / 100 * size,
                cy: (hashCode(id + 'd') % 80 + 10) / 100 * size,
                r: size * (0.3 + (h1 % 30) / 100),
                color: colors[0],
            },
            {
                cx: (h2 % 80 + 10) / 100 * size,
                cy: (hashCode(id + 'e') % 80 + 10) / 100 * size,
                r: size * (0.25 + (h2 % 25) / 100),
                color: colors[1],
            },
            {
                cx: (h3 % 80 + 10) / 100 * size,
                cy: (hashCode(id + 'f') % 80 + 10) / 100 * size,
                r: size * (0.2 + (h3 % 20) / 100),
                color: colors[2],
            },
        ];
    }, [id, size, colors]);

    const clipPath = React.useMemo(() => {
        const path = Skia.Path.Make();
        if (square) {
            path.addRect(Skia.XYWHRect(0, 0, size, size));
        } else {
            path.addRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, size, size), size / 2, size / 2));
        }
        return path;
    }, [square, size]);

    const bgColor = monochrome ? '#aaaaaa' : colors[3] || colors[0];

    return (
        <Canvas style={{ width: size, height: size }}>
            <Group clip={clipPath}>
                <Rect x={0} y={0} width={size} height={size} color={bgColor} />
                {blobs.map((blob, i) => (
                    <Circle
                        key={i}
                        cx={blob.cx}
                        cy={blob.cy}
                        r={blob.r}
                        color={blob.color}
                        opacity={0.7}
                    >
                        <BlurMask blur={size * 0.15} style="normal" />
                    </Circle>
                ))}
            </Group>
        </Canvas>
    );
});

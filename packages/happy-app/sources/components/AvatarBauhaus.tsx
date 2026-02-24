import * as React from "react";
import { Canvas, Circle, Rect, Group, Skia, Path as SkiaPath } from "@shopify/react-native-skia";

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

const BAUHAUS_COLORS = [
    '#E63946', '#F1FAEE', '#A8DADC', '#457B9D', '#1D3557',
    '#FFD166', '#06D6A0', '#118AB2', '#073B4C', '#EF476F',
    '#F72585', '#7209B7', '#3A0CA3', '#4361EE', '#4CC9F0',
    '#FB5607', '#FF006E', '#8338EC', '#3A86FF', '#FFBE0B',
];

const GRAYSCALE_COLORS = [
    '#333333', '#555555', '#777777', '#999999', '#bbbbbb',
];

type ShapeType = 'circle' | 'rect' | 'triangle';
const SHAPE_TYPES: ShapeType[] = ['circle', 'rect', 'triangle'];
const NUM_SHAPES = 4;

interface AvatarBauhausProps {
    id: string;
    title?: boolean;
    square?: boolean;
    size?: number;
    monochrome?: boolean;
}

export const AvatarBauhaus = React.memo((props: AvatarBauhausProps) => {
    const { id, square, size = 48, monochrome } = props;

    const palette = monochrome ? GRAYSCALE_COLORS : BAUHAUS_COLORS;

    const shapes = React.useMemo(() => {
        const result = [];

        for (let i = 0; i < NUM_SHAPES; i++) {
            const typeHash = hashCode(id + 'type' + i);
            const colorHash = hashCode(id + 'color' + i);
            const posXHash = hashCode(id + 'x' + i);
            const posYHash = hashCode(id + 'y' + i);
            const sizeHash = hashCode(id + 'size' + i);
            const rotHash = hashCode(id + 'rot' + i);

            const shapeType = SHAPE_TYPES[typeHash % SHAPE_TYPES.length];
            const color = palette[colorHash % palette.length];
            const x = (posXHash % 80 + 10) / 100 * size;
            const y = (posYHash % 80 + 10) / 100 * size;
            const shapeSize = size * (0.15 + (sizeHash % 30) / 100);
            const rotation = (rotHash % 360);

            result.push({ shapeType, color, x, y, shapeSize, rotation });
        }

        return result;
    }, [id, size, palette]);

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
    const bgColor = monochrome ? '#eeeeee' : palette[bgHash % palette.length];

    return (
        <Canvas style={{ width: size, height: size }}>
            <Group clip={clipPath}>
                <Rect x={0} y={0} width={size} height={size} color={bgColor} />
                {shapes.map((shape, i) => {
                    if (shape.shapeType === 'circle') {
                        return (
                            <Circle
                                key={i}
                                cx={shape.x}
                                cy={shape.y}
                                r={shape.shapeSize / 2}
                                color={shape.color}
                            />
                        );
                    } else if (shape.shapeType === 'rect') {
                        return (
                            <Group
                                key={i}
                                transform={[
                                    { translateX: shape.x },
                                    { translateY: shape.y },
                                    { rotate: (shape.rotation * Math.PI) / 180 },
                                    { translateX: -shape.shapeSize / 2 },
                                    { translateY: -shape.shapeSize / 2 },
                                ]}
                            >
                                <Rect
                                    x={0}
                                    y={0}
                                    width={shape.shapeSize}
                                    height={shape.shapeSize}
                                    color={shape.color}
                                />
                            </Group>
                        );
                    } else {
                        // Triangle
                        const triPath = Skia.Path.Make();
                        const half = shape.shapeSize / 2;
                        triPath.moveTo(shape.x, shape.y - half);
                        triPath.lineTo(shape.x + half, shape.y + half);
                        triPath.lineTo(shape.x - half, shape.y + half);
                        triPath.close();
                        return (
                            <SkiaPath key={i} path={triPath} color={shape.color} />
                        );
                    }
                })}
            </Group>
        </Canvas>
    );
});

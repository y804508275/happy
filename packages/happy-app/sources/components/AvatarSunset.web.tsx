import * as React from "react";
import { View } from "react-native";

function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

const SUNSET_PALETTES = [
    ['#1a1a2e', '#16213e', '#0f3460', '#e94560', '#ff6b6b', '#ffd93d'],
    ['#2d00f7', '#6a00f4', '#8900f2', '#a100f2', '#b100e8', '#db00b6'],
    ['#03071e', '#370617', '#6a040f', '#9d0208', '#d00000', '#e85d04'],
    ['#001219', '#005f73', '#0a9396', '#94d2bd', '#e9d8a6', '#ee9b00'],
    ['#240046', '#3c096c', '#5a189a', '#7b2cbf', '#9d4edd', '#c77dff'],
    ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd', '#f0ead2'],
    ['#590d22', '#800f2f', '#a4133c', '#c9184a', '#ff4d6d', '#ff758f'],
    ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2'],
];

const GRAYSCALE_PALETTE = ['#222222', '#444444', '#666666', '#888888', '#aaaaaa', '#cccccc'];

const NUM_LAYERS = 5;

interface AvatarSunsetProps {
    id: string;
    title?: boolean;
    square?: boolean;
    size?: number;
    monochrome?: boolean;
}

export const AvatarSunset = React.memo((props: AvatarSunsetProps) => {
    const { id, square, size = 48, monochrome } = props;

    const hash = hashCode(id);
    const colors = monochrome ? GRAYSCALE_PALETTE : SUNSET_PALETTES[hash % SUNSET_PALETTES.length];

    const layers = React.useMemo(() => {
        const result = [];
        const center = size / 2;

        for (let i = 0; i < NUM_LAYERS; i++) {
            const layerHash = hashCode(id + 'layer' + i);
            const heightRatio = (NUM_LAYERS - i) / (NUM_LAYERS + 1);
            const y = size * (1 - heightRatio);
            const radiusX = size * (0.3 + (layerHash % 40) / 100);
            const color = colors[i % colors.length];

            result.push({ cx: center, y, radiusX, color });
        }

        return result;
    }, [id, size, colors]);

    // Sun circle
    const sunHash = hashCode(id + 'sun');
    const sunX = size * (0.25 + (sunHash % 50) / 100);
    const sunY = size * (0.15 + (hashCode(id + 'sunY') % 30) / 100);
    const sunR = size * (0.08 + (sunHash % 10) / 100);
    const sunColor = monochrome ? '#dddddd' : colors[colors.length - 1];

    const bgColor = colors[0];

    // Build SVG path strings for semi-ellipse shapes
    const layerPaths = React.useMemo(() => {
        return layers.map((layer) => {
            const left = layer.cx - layer.radiusX;
            const right = layer.cx + layer.radiusX;
            const top = layer.y - layer.radiusX * 0.6;

            return {
                d: `M ${left} ${size} Q ${left} ${top} ${layer.cx} ${top} Q ${right} ${top} ${right} ${size} Z`,
                color: layer.color,
            };
        });
    }, [layers, size]);

    return (
        <View
            style={{
                width: size,
                height: size,
                overflow: 'hidden',
                borderRadius: square ? 0 : size / 2,
            }}
        >
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                style={{ display: 'block' }}
            >
                <rect width={size} height={size} fill={bgColor} />
                <circle cx={sunX} cy={sunY} r={sunR} fill={sunColor} />
                {layerPaths.map((lp, i) => (
                    <path key={i} d={lp.d} fill={lp.color} />
                ))}
            </svg>
        </View>
    );
});

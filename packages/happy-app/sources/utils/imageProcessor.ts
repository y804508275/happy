/**
 * Image processing utility for web platform.
 * Handles resizing and compressing images before sending to Claude Code.
 */

export interface ProcessedImage {
    uri: string;           // Blob URL for local preview
    base64: string;        // Base64-encoded data (no data: prefix)
    mediaType: string;     // e.g., 'image/jpeg'
    width: number;
    height: number;
}

const MAX_DIMENSION = 1024;
const MIN_DIMENSION = 256;
const DIMENSION_SCALE = 0.75; // shrink to 75% each round
const MAX_SIZE_BYTES = 300 * 1024; // 300KB — keeps encrypted payload manageable for rn-encryption
const INITIAL_QUALITY = 0.7;
const MIN_QUALITY = 0.3;
const QUALITY_STEP = 0.1;

/**
 * Process a File object (from paste or file picker) into a format suitable for sending.
 * Resizes if needed and compresses to stay under size limits.
 * Progressively reduces both quality and dimensions to guarantee the result fits.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
    const bitmap = await createImageBitmap(file);
    const isPng = file.type === 'image/png';

    let maxDim = MAX_DIMENSION;
    let fallbackBlob: Blob | null = null;
    let fallbackWidth = 0;
    let fallbackHeight = 0;

    while (maxDim >= MIN_DIMENSION) {
        const { width, height } = getResizedDimensions(bitmap.width, bitmap.height, maxDim);

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0, width, height);

        // For PNG input, try keeping PNG format first
        if (isPng) {
            const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
            if (pngBlob.size <= MAX_SIZE_BYTES) {
                bitmap.close();
                return blobToProcessedImage(pngBlob, 'image/png', width, height);
            }
        }

        // Try JPEG with progressively lower quality
        let quality = INITIAL_QUALITY;
        let blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

        while (blob.size > MAX_SIZE_BYTES && quality > MIN_QUALITY) {
            quality -= QUALITY_STEP;
            blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: Math.max(quality, MIN_QUALITY) });
        }

        // Keep as fallback in case no size fits perfectly
        fallbackBlob = blob;
        fallbackWidth = width;
        fallbackHeight = height;

        if (blob.size <= MAX_SIZE_BYTES) {
            bitmap.close();
            return blobToProcessedImage(blob, 'image/jpeg', width, height);
        }

        // Still too large — shrink dimensions and retry
        maxDim = Math.round(maxDim * DIMENSION_SCALE);
    }

    // Fallback: return the smallest version we could produce
    bitmap.close();
    return blobToProcessedImage(fallbackBlob!, 'image/jpeg', fallbackWidth, fallbackHeight);
}

function getResizedDimensions(w: number, h: number, maxDim: number): { width: number; height: number } {
    if (w <= maxDim && h <= maxDim) {
        return { width: w, height: h };
    }
    const ratio = Math.min(maxDim / w, maxDim / h);
    return {
        width: Math.round(w * ratio),
        height: Math.round(h * ratio),
    };
}

async function blobToProcessedImage(blob: Blob, mediaType: string, width: number, height: number): Promise<ProcessedImage> {
    const uri = URL.createObjectURL(blob);
    const base64 = await blobToBase64(blob);
    return { uri, base64, mediaType, width, height };
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1]); // strip "data:...;base64," prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

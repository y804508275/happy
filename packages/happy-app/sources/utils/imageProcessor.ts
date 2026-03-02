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
const MAX_SIZE_BYTES = 300 * 1024; // 300KB — keeps encrypted payload manageable for rn-encryption
const INITIAL_QUALITY = 0.7;
const MIN_QUALITY = 0.3;

/**
 * Process a File object (from paste or file picker) into a format suitable for sending.
 * Resizes if needed and compresses to stay under size limits.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
    const bitmap = await createImageBitmap(file);
    const { width, height } = getResizedDimensions(bitmap.width, bitmap.height, MAX_DIMENSION);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Determine output format: keep PNG for transparency, otherwise JPEG
    const isPng = file.type === 'image/png';
    const mediaType = isPng ? 'image/png' : 'image/jpeg';

    let blob: Blob;
    let quality = INITIAL_QUALITY;

    if (isPng) {
        blob = await canvas.convertToBlob({ type: 'image/png' });
        // If PNG is too large, fall back to JPEG
        if (blob.size > MAX_SIZE_BYTES) {
            blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
            while (blob.size > MAX_SIZE_BYTES && quality > MIN_QUALITY) {
                quality -= 0.15;
                blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
            }
            return blobToProcessedImage(blob, 'image/jpeg', width, height);
        }
    } else {
        blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        while (blob.size > MAX_SIZE_BYTES && quality > MIN_QUALITY) {
            quality -= 0.15;
            blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
        }
    }

    return blobToProcessedImage(blob, mediaType, width, height);
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
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    return { uri, base64, mediaType, width, height };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    // Process in chunks to avoid stack overflow with large arrays
    const CHUNK_SIZE = 8192;
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength));
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

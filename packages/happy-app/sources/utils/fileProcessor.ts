/**
 * File processing utility for web platform.
 * Handles reading text files and PDFs for sending to AI.
 */

export interface ProcessedFile {
    name: string;
    mediaType: string;
    kind: 'text' | 'pdf';
    content: string; // text content (for text files) or base64 (for PDFs)
}

const MAX_TEXT_SIZE = 500 * 1024; // 500KB for text files
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB for PDFs

const TEXT_MIME_TYPES = new Set([
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/css',
    'text/xml',
    'text/yaml',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/typescript',
]);

const TEXT_EXTENSIONS = new Set([
    '.txt', '.md', '.py', '.js', '.ts', '.tsx', '.jsx', '.json', '.csv',
    '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.swift',
    '.kt', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.toml', '.xml',
    '.html', '.css', '.scss', '.sql', '.lua', '.r', '.m', '.pl',
    '.ex', '.exs', '.hs', '.ml', '.scala', '.dart', '.vue', '.svelte',
    '.graphql', '.proto', '.tf', '.dockerfile', '.makefile',
    '.gitignore', '.env', '.ini', '.cfg', '.conf',
]);

/**
 * File accept string for the file picker input.
 * Includes images, PDFs, and common text/code file types.
 */
export const FILE_ACCEPT = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'text/plain', 'text/markdown', 'text/csv', 'application/json',
    '.py', '.js', '.ts', '.tsx', '.jsx', '.rb', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.swift', '.sh', '.yaml', '.yml', '.toml',
    '.xml', '.html', '.css', '.sql', '.md', '.txt',
].join(',');

function getExtension(filename: string): string {
    const idx = filename.lastIndexOf('.');
    return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function isTextFile(file: File): boolean {
    if (TEXT_MIME_TYPES.has(file.type)) return true;
    if (file.type === '' || file.type === 'application/octet-stream') {
        return TEXT_EXTENSIONS.has(getExtension(file.name));
    }
    return TEXT_EXTENSIONS.has(getExtension(file.name));
}

function isPdfFile(file: File): boolean {
    return file.type === 'application/pdf' || getExtension(file.name) === '.pdf';
}

export function isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
}

export function isSupportedFile(file: File): boolean {
    return isImageFile(file) || isTextFile(file) || isPdfFile(file);
}

/**
 * Process a non-image file into a format suitable for sending.
 * For text files: reads as UTF-8 text.
 * For PDFs: reads as base64.
 */
export async function processFile(file: File): Promise<ProcessedFile> {
    if (isPdfFile(file)) {
        if (file.size > MAX_PDF_SIZE) {
            throw new Error(`PDF file too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${MAX_PDF_SIZE / 1024 / 1024}MB)`);
        }
        const base64 = await readFileAsBase64(file);
        return {
            name: file.name,
            mediaType: 'application/pdf',
            kind: 'pdf',
            content: base64,
        };
    }

    if (isTextFile(file)) {
        if (file.size > MAX_TEXT_SIZE) {
            throw new Error(`Text file too large: ${(file.size / 1024).toFixed(0)}KB (max ${MAX_TEXT_SIZE / 1024}KB)`);
        }
        const text = await readFileAsText(file);
        return {
            name: file.name,
            mediaType: file.type || 'text/plain',
            kind: 'text',
            content: text,
        };
    }

    throw new Error(`Unsupported file type: ${file.name} (${file.type})`);
}

function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file, 'utf-8');
    });
}

function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1]); // strip "data:...;base64," prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

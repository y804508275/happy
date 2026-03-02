import * as crypto from 'rn-encryption';
import { decodeUTF8, encodeUTF8 } from './text';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { Platform } from 'react-native';

//
// Web-safe AES-GCM implementation using WebCrypto API directly.
// The rn-encryption web polyfill (web-secure-encryption) uses
// `btoa(String.fromCharCode(...largeArray))` which causes a stack overflow
// when encrypting large payloads (e.g. image messages ~400KB+).
//

function uint8ArrayToBase64(bytes: Uint8Array): string {
    const CHUNK_SIZE = 8192;
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function webImportAESKey(keyBase64: string, usage: KeyUsage[]): Promise<CryptoKey> {
    const keyBytes = base64ToUint8Array(keyBase64);
    return globalThis.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, usage);
}

async function webEncryptAESGCMString(data: string, keyBase64: string): Promise<string> {
    const key = await webImportAESKey(keyBase64, ['encrypt']);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    const encrypted = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return uint8ArrayToBase64(combined);
}

async function webDecryptAESGCMString(data: string, keyBase64: string): Promise<string | null> {
    const key = await webImportAESKey(keyBase64, ['decrypt']);
    const combined = base64ToUint8Array(data);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
}

export async function encryptAESGCMString(data: string, key64: string): Promise<string> {
    if (Platform.OS === 'web') {
        return webEncryptAESGCMString(data, key64);
    }
    return await crypto.encryptAsyncAES(data, key64);
}

export async function decryptAESGCMString(data: string, key64: string): Promise<string | null> {
    if (Platform.OS === 'web') {
        return webDecryptAESGCMString(data, key64);
    }
    const res = (await crypto.decryptAsyncAES(data, key64)).trim();
    return res;
}

export async function encryptAESGCM(data: Uint8Array, key64: string): Promise<Uint8Array> {
    if (Platform.OS === 'web') {
        const encrypted = await webEncryptAESGCMString(decodeUTF8(data), key64);
        return decodeBase64(encrypted);
    }
    const encrypted = (await crypto.encryptAsyncAES(decodeUTF8(data), key64)).trim();
    return decodeBase64(encrypted);
}

export async function decryptAESGCM(data: Uint8Array, key64: string): Promise<Uint8Array | null> {
    if (Platform.OS === 'web') {
        const raw = await webDecryptAESGCMString(encodeBase64(data), key64);
        return raw ? encodeUTF8(raw) : null;
    }
    let raw = await crypto.decryptAsyncAES(encodeBase64(data), key64);
    return raw ? encodeUTF8(raw) : null;
}

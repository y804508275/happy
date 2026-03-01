/**
 * Non-interactive auth script for Tauri standalone mode.
 *
 * Flow:
 *   1. Generate ephemeral tweetnacl box keypair
 *   2. POST /v1/auth/request to register
 *   3. Print approval URL to stdout (Rust reads it and opens browser)
 *   4. Poll until user approves in Web UI
 *   5. Decrypt credentials and save to HAPPY_HOME/access.key
 *
 * Environment variables:
 *   HAPPY_SERVER_URL  - server URL (default: http://localhost:3005)
 *   HAPPY_HOME_DIR    - home dir  (default: ~/.happy-standalone)
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import tweetnacl from 'tweetnacl';

const SERVER_URL = process.env.HAPPY_SERVER_URL || 'http://localhost:3005';
const HAPPY_HOME = process.env.HAPPY_HOME_DIR || path.join(process.env.HOME!, '.happy-standalone');
const ACCESS_KEY = path.join(HAPPY_HOME, 'access.key');

function encodeBase64(buf: Uint8Array): string {
    return Buffer.from(buf).toString('base64');
}

function decodeBase64(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

function encodeBase64Url(buf: Uint8Array): string {
    return Buffer.from(buf).toString('base64url');
}

function decryptWithEphemeralKey(bundle: Uint8Array, secretKey: Uint8Array): Uint8Array | null {
    const ephemeralPK = bundle.slice(0, 32);
    const nonce = bundle.slice(32, 56);
    const ciphertext = bundle.slice(56);
    return tweetnacl.box.open(ciphertext, nonce, ephemeralPK, secretKey);
}

async function main() {
    // Check if already authenticated
    if (fs.existsSync(ACCESS_KEY)) {
        console.log('AUTH_ALREADY_DONE');
        process.exit(0);
    }

    fs.mkdirSync(HAPPY_HOME, { recursive: true });

    // 1. Generate keypair
    const seed = new Uint8Array(crypto.randomBytes(32));
    const keypair = tweetnacl.box.keyPair.fromSecretKey(seed);

    // 2. Register with server
    await axios.post(`${SERVER_URL}/v1/auth/request`, {
        publicKey: encodeBase64(keypair.publicKey),
        supportsV2: true,
    });

    // 3. Print approval URL for Rust to open
    const approvalUrl = `${SERVER_URL}/terminal/connect#key=${encodeBase64Url(keypair.publicKey)}`;
    console.log(`AUTH_URL:${approvalUrl}`);

    // 4. Poll (up to 5 minutes)
    for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 1000));

        const res = await axios.post(`${SERVER_URL}/v1/auth/request`, {
            publicKey: encodeBase64(keypair.publicKey),
            supportsV2: true,
        });

        if (res.data.state === 'authorized') {
            const token = res.data.token as string;
            const encrypted = decodeBase64(res.data.response);
            const decrypted = decryptWithEphemeralKey(encrypted, keypair.secretKey);

            if (!decrypted) {
                console.error('Decryption failed');
                process.exit(1);
            }

            // V2 dataKey: [0x00] + 32-byte contentDataKey
            if (decrypted[0] === 0 && decrypted.length === 33) {
                const publicKey = decrypted.slice(1, 33);
                const machineKey = new Uint8Array(crypto.randomBytes(32));
                fs.writeFileSync(ACCESS_KEY, JSON.stringify({
                    encryption: {
                        publicKey: encodeBase64(publicKey),
                        machineKey: encodeBase64(machineKey),
                    },
                    token,
                }, null, 2));
            } else {
                // V1 legacy
                fs.writeFileSync(ACCESS_KEY, JSON.stringify({
                    secret: encodeBase64(decrypted),
                    token,
                }, null, 2));
            }

            console.log('AUTH_DONE');
            process.exit(0);
        }
    }

    console.error('AUTH_TIMEOUT');
    process.exit(1);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

/**
 * Generate local daemon credentials.
 *
 * Reads the first account from the local database, decrypts its master secret,
 * derives the correct Curve25519 public key, creates a JWT token,
 * generates a machineKey, and writes access.key to ~/.happy-local/.
 *
 * The public key derivation chain matches the web app:
 *   secret → HMAC-SHA512('Happy EnCoder Master Seed', secret) → chainCode
 *   → HMAC-SHA512(chainCode, 0x00 || 'content') → contentDataKey
 *   → crypto_box_seed_keypair(contentDataKey) → Curve25519 publicKey
 *
 * Usage: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handy \
 *        HANDY_MASTER_SECRET=your-super-secret-key-for-local-development \
 *        tsx sources/recipes/localDaemonAuth.ts
 */

import { db } from "@/storage/db";
import { auth } from "@/app/auth/auth";
import { initEncrypt } from "@/modules/encrypt";
import { decryptBytes } from "@/modules/encrypt";
import * as privacyKit from "privacy-kit";
import tweetnacl from "tweetnacl";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Derive a content encryption key from master secret.
 * Replicates the web app's deriveKey(secret, 'Happy EnCoder', ['content']).
 */
function deriveContentDataKey(secret: Uint8Array): Uint8Array {
    // Root: HMAC-SHA512(key='Happy EnCoder Master Seed', data=secret)
    const rootHmac = crypto.createHmac("sha512", Buffer.from("Happy EnCoder Master Seed"))
        .update(Buffer.from(secret))
        .digest();
    const chainCode = rootHmac.subarray(32); // last 32 bytes

    // Child 'content': HMAC-SHA512(key=chainCode, data=0x00 || 'content')
    const childData = Buffer.concat([Buffer.from([0x00]), Buffer.from("content")]);
    const childHmac = crypto.createHmac("sha512", chainCode)
        .update(childData)
        .digest();
    return new Uint8Array(childHmac.subarray(0, 32)); // first 32 bytes
}

/**
 * Derive Curve25519 public key from a seed.
 * Equivalent to libsodium's crypto_box_seed_keypair(seed).publicKey.
 */
function boxPublicKeyFromSeed(seed: Uint8Array): Uint8Array {
    const hash = crypto.createHash("sha512").update(Buffer.from(seed)).digest();
    const secretKey = new Uint8Array(hash.subarray(0, 32));
    return tweetnacl.box.keyPair.fromSecretKey(secretKey).publicKey;
}

async function main() {
    // Init modules
    await auth.init();
    await initEncrypt();

    // Find first account with encryptedSecret
    const account = await db.account.findFirst({
        select: { id: true, publicKey: true, encryptedSecret: true }
    });

    if (!account) {
        console.error("No account found in local database. Create one via Feishu login on localhost:8082 first.");
        process.exit(1);
    }

    if (!account.encryptedSecret) {
        console.error("Account has no encryptedSecret. Login via Feishu on localhost:8082 first.");
        process.exit(1);
    }

    console.log(`Found account: ${account.id}`);

    // Decrypt master secret
    const encryptedBytes = privacyKit.decodeBase64(account.encryptedSecret);
    const secret = decryptBytes(["feishu", "secret"], encryptedBytes as Uint8Array<ArrayBuffer>);
    console.log(`Decrypted master secret (${secret.length} bytes)`);

    // Derive Curve25519 public key (same derivation as web app)
    const contentDataKey = deriveContentDataKey(secret);
    const publicKey = boxPublicKeyFromSeed(contentDataKey);
    console.log(`Derived Curve25519 publicKey: ${Buffer.from(publicKey).toString("hex").slice(0, 16)}...`);

    // Create token
    const token = await auth.createToken(account.id);

    // Generate machineKey (random 32 bytes for this daemon instance)
    const machineKey = crypto.randomBytes(32);

    // Write access.key
    const happyLocalDir = path.join(os.homedir(), ".happy-local");
    if (!fs.existsSync(happyLocalDir)) {
        fs.mkdirSync(happyLocalDir, { recursive: true });
    }

    const accessKey = {
        encryption: {
            publicKey: Buffer.from(publicKey).toString("base64"),
            machineKey: Buffer.from(machineKey).toString("base64"),
        },
        token,
    };

    const accessKeyPath = path.join(happyLocalDir, "access.key");
    fs.writeFileSync(accessKeyPath, JSON.stringify(accessKey, null, 2));

    // Also write settings.json with a machineId
    const settingsPath = path.join(happyLocalDir, "settings.json");
    if (!fs.existsSync(settingsPath)) {
        fs.writeFileSync(settingsPath, JSON.stringify({
            onboardingCompleted: false,
            machineId: crypto.randomUUID(),
        }, null, 2));
    }

    console.log(`Credentials written to ${accessKeyPath}`);
    console.log(`\nStart local daemon with:`);
    console.log(`  HAPPY_HOME_DIR=~/.happy-local HAPPY_SERVER_URL=http://localhost:3000 happy daemon start-sync`);

    await db.$disconnect();
}

main();

#!/usr/bin/env node
/**
 * Non-interactive auth script for environments without TTY
 * Generates an auth URL, user opens it in browser, script polls and saves credentials
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import tweetnacl from 'tweetnacl';

const SERVER_URL = process.env.HAPPY_SERVER_URL || 'http://localhost:3005';
const WEBAPP_URL = process.env.HAPPY_WEBAPP_URL || 'http://localhost:8082';
const HAPPY_HOME = (process.env.HAPPY_HOME_DIR || '~/.happy-dev').replace(/^~/, homedir());

// Base64 helpers
function encodeBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}
function encodeBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}
function decodeBase64(str) {
  return new Uint8Array(Buffer.from(str, 'base64'));
}

async function main() {
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Webapp: ${WEBAPP_URL}`);
  console.log(`Home:   ${HAPPY_HOME}`);
  console.log();

  // Generate ephemeral keypair
  const secret = new Uint8Array(randomBytes(32));
  const keypair = tweetnacl.box.keyPair.fromSecretKey(secret);

  // Register auth request with server
  const res = await fetch(`${SERVER_URL}/v1/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: encodeBase64(keypair.publicKey),
      supportsV2: true
    })
  });

  if (!res.ok) {
    console.error('Failed to create auth request:', res.status, await res.text());
    process.exit(1);
  }

  // Generate web auth URL
  const authUrl = `${WEBAPP_URL}/terminal/connect#key=${encodeBase64Url(keypair.publicKey)}`;
  console.log('=== Open this URL in your browser (localhost:8082): ===');
  console.log();
  console.log(authUrl);
  console.log();
  console.log('Waiting for authentication...');

  // Poll for response
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 2000));

    try {
      const pollRes = await fetch(`${SERVER_URL}/v1/auth/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: encodeBase64(keypair.publicKey),
          supportsV2: true
        })
      });

      const data = await pollRes.json();

      if (data.state === 'authorized') {
        console.log('Auth response received, decrypting...');

        const bundle = decodeBase64(data.response);
        // Extract: ephemeralPK(32) + nonce(24) + ciphertext
        const ephemeralPK = bundle.slice(0, 32);
        const nonce = bundle.slice(32, 56);
        const ciphertext = bundle.slice(56);

        const decrypted = tweetnacl.box.open(ciphertext, nonce, ephemeralPK, keypair.secretKey);
        if (!decrypted) {
          console.error('Failed to decrypt response');
          process.exit(1);
        }

        // Ensure home dir exists
        if (!existsSync(HAPPY_HOME)) {
          mkdirSync(HAPPY_HOME, { recursive: true });
        }

        const accessKeyPath = join(HAPPY_HOME, 'access.key');
        const settingsPath = join(HAPPY_HOME, 'settings.json');

        if (decrypted.length === 32) {
          // Legacy format
          writeFileSync(accessKeyPath, JSON.stringify({
            secret: encodeBase64(decrypted),
            token: data.token
          }, null, 2));
        } else if (decrypted[0] === 0) {
          // V2 DataKey format
          const publicKey = decrypted.slice(1, 33);
          const machineKey = randomBytes(32);
          writeFileSync(accessKeyPath, JSON.stringify({
            encryption: {
              publicKey: encodeBase64(publicKey),
              machineKey: encodeBase64(new Uint8Array(machineKey))
            },
            token: data.token
          }, null, 2));
        } else {
          console.error('Unknown credential format');
          process.exit(1);
        }

        // Ensure settings.json has a machineId
        let settings = { schemaVersion: 2, onboardingCompleted: true, profiles: [], localEnvironmentVariables: {} };
        if (existsSync(settingsPath)) {
          try {
            settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
          } catch {}
        }
        if (!settings.machineId) {
          settings.machineId = randomUUID();
        }
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        console.log();
        console.log('Authentication successful!');
        console.log(`Credentials saved to: ${accessKeyPath}`);
        console.log(`Machine ID: ${settings.machineId}`);
        console.log();
        console.log('Now start the daemon:');
        console.log(`  cd ${process.cwd()} && npx tsx --env-file .env.dev-local-server src/index.ts daemon start-sync`);
        process.exit(0);
      }
    } catch (e) {
      // Connection error, retry
    }

    process.stdout.write('.');
  }

  console.log('\nTimeout: Authentication did not complete within 4 minutes.');
  process.exit(1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

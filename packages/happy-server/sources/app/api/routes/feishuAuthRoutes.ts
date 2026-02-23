import { z } from "zod";
import { type Fastify } from "../types";
import * as privacyKit from "privacy-kit";
import { db } from "@/storage/db";
import { auth } from "@/app/auth/auth";
import { log } from "@/utils/log";
import { encryptBytes, decryptBytes } from "@/modules/encrypt";
import * as crypto from "crypto";
import axios from "axios";

/**
 * Feishu OAuth authentication routes.
 *
 * Flow:
 * 1. Client redirects to GET /v1/auth/feishu/authorize → Feishu OAuth page
 * 2. Feishu calls back GET /v1/auth/feishu/callback → server exchanges code for token,
 *    fetches user info, creates/finds account, generates a one-time exchange code,
 *    and redirects client to the app with ?feishu_auth=CODE
 * 3. Client POSTs the code to POST /v1/auth/feishu/exchange → receives { token, secret }
 * 4. For linking an existing account: client first calls POST /v1/auth/feishu/prepare-link
 *    to get a linkToken, then starts the OAuth flow with ?link_token=xxx
 */

// In-memory stores with 5-minute TTL
const feishuOAuthStates = new Map<string, { linkToken?: string; appUrl?: string; expiresAt: number }>();
const feishuAuthCodes = new Map<string, { token: string; secret: string; expiresAt: number }>();
const feishuLinkTokens = new Map<string, { userId: string; encryptedSecret: string; expiresAt: number }>();

// Cleanup expired entries every 60 seconds
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of feishuOAuthStates) {
        if (value.expiresAt < now) feishuOAuthStates.delete(key);
    }
    for (const [key, value] of feishuAuthCodes) {
        if (value.expiresAt < now) feishuAuthCodes.delete(key);
    }
    for (const [key, value] of feishuLinkTokens) {
        if (value.expiresAt < now) feishuLinkTokens.delete(key);
    }
}, 60 * 1000);

function encryptSecret(secret: Uint8Array): string {
    const encrypted = encryptBytes(['feishu', 'secret'], secret as Uint8Array<ArrayBuffer>);
    return privacyKit.encodeBase64(encrypted);
}

function decryptSecret(encrypted: string): Uint8Array {
    const encryptedBytes = privacyKit.decodeBase64(encrypted);
    return decryptBytes(['feishu', 'secret'], encryptedBytes as Uint8Array<ArrayBuffer>);
}

function toBase64Url(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString('base64url');
}

export function feishuAuthRoutes(app: Fastify) {

    // Route A: Redirect to Feishu OAuth authorization page
    app.get('/v1/auth/feishu/authorize', {
        schema: {
            querystring: z.object({
                link_token: z.string().optional(),
                app_url: z.string().optional(),
            })
        }
    }, async (request, reply) => {
        const appId = process.env.FEISHU_APP_ID;
        if (!appId) {
            return reply.code(500).send({ error: 'Feishu not configured' });
        }

        const state = crypto.randomBytes(32).toString('hex');
        const stateData: { linkToken?: string; appUrl?: string; expiresAt: number } = {
            expiresAt: Date.now() + 5 * 60 * 1000
        };

        if (request.query.link_token) {
            stateData.linkToken = request.query.link_token;
        }
        if (request.query.app_url) {
            stateData.appUrl = request.query.app_url;
        }

        feishuOAuthStates.set(state, stateData);

        const redirectUri = encodeURIComponent(`${request.protocol}://${request.host}/v1/auth/feishu/callback`);
        const url = `https://open.feishu.cn/open-apis/authen/v1/index?client_id=${appId}&redirect_uri=${redirectUri}&response_type=code&state=${state}`;

        return reply.redirect(url);
    });

    // Route B: Feishu OAuth callback - exchange code, create/find account, redirect with one-time code
    app.get('/v1/auth/feishu/callback', {
        schema: {
            querystring: z.object({
                code: z.string(),
                state: z.string()
            })
        }
    }, async (request, reply) => {
        try {
            const { code, state } = request.query;

            // Validate state
            const stateData = feishuOAuthStates.get(state);
            if (!stateData || stateData.expiresAt < Date.now()) {
                feishuOAuthStates.delete(state);
                return reply.code(400).send({ error: 'Invalid or expired state' });
            }
            feishuOAuthStates.delete(state);

            const appId = process.env.FEISHU_APP_ID!;
            const appSecret = process.env.FEISHU_APP_SECRET!;

            // Exchange code for access_token
            log({ module: 'feishu-auth' }, `Exchanging code for token, redirect_uri: ${request.protocol}://${request.host}/v1/auth/feishu/callback`);
            const tokenResponse = await axios.post('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
                grant_type: 'authorization_code',
                client_id: appId,
                client_secret: appSecret,
                code,
                redirect_uri: `${request.protocol}://${request.host}/v1/auth/feishu/callback`
            });

            log({ module: 'feishu-auth' }, `Token response: ${JSON.stringify(tokenResponse.data)}`);
            const accessToken = tokenResponse.data.access_token;
            if (!accessToken) {
                log({ module: 'feishu-auth', level: 'error' }, `Token exchange failed: ${JSON.stringify(tokenResponse.data)}`);
                return reply.code(400).send({ error: 'Token exchange failed' });
            }

            // Get user info
            const userInfoResponse = await axios.get('https://open.feishu.cn/open-apis/authen/v1/user_info', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            log({ module: 'feishu-auth' }, `User info response: ${JSON.stringify(userInfoResponse.data)}`);
            const userInfo = userInfoResponse.data.data;
            const unionId = userInfo?.union_id;
            if (!unionId) {
                log({ module: 'feishu-auth', level: 'error' }, `Failed to get union_id: ${JSON.stringify(userInfoResponse.data)}`);
                return reply.code(400).send({ error: 'Failed to get user info' });
            }

            const name = userInfo.name || '';

            let token: string;
            let secretBase64Url: string;

            if (stateData.linkToken) {
                // Link mode: associate Feishu with existing account
                const linkData = feishuLinkTokens.get(stateData.linkToken);
                if (!linkData || linkData.expiresAt < Date.now()) {
                    feishuLinkTokens.delete(stateData.linkToken);
                    return reply.code(400).send({ error: 'Link token expired' });
                }
                feishuLinkTokens.delete(stateData.linkToken);

                // Clear feishuUnionId from any other account first
                await db.account.updateMany({
                    where: { feishuUnionId: unionId },
                    data: { feishuUnionId: null, encryptedSecret: null }
                });

                await db.account.update({
                    where: { id: linkData.userId },
                    data: {
                        feishuUnionId: unionId,
                        feishuName: name || undefined,
                        encryptedSecret: linkData.encryptedSecret,
                    }
                });

                token = await auth.createToken(linkData.userId);
                const decrypted = decryptSecret(linkData.encryptedSecret);
                secretBase64Url = toBase64Url(decrypted);
            } else {
                // Normal login: find existing or create new account
                const existingAccount = await db.account.findFirst({
                    where: { feishuUnionId: unionId }
                });

                if (existingAccount) {
                    if (!existingAccount.encryptedSecret) {
                        return reply.code(500).send({ error: 'Account has no encrypted secret' });
                    }
                    token = await auth.createToken(existingAccount.id);
                    const decrypted = decryptSecret(existingAccount.encryptedSecret);
                    secretBase64Url = toBase64Url(decrypted);
                } else {
                    // New account
                    const tweetnacl = (await import("tweetnacl")).default;
                    const secret = crypto.randomBytes(32);
                    const keyPair = tweetnacl.sign.keyPair.fromSeed(new Uint8Array(secret));
                    const publicKeyHex = privacyKit.encodeHex(keyPair.publicKey as Uint8Array<ArrayBuffer>);
                    const encrypted = encryptSecret(new Uint8Array(secret));

                    const account = await db.account.create({
                        data: {
                            publicKey: publicKeyHex,
                            feishuUnionId: unionId,
                            feishuName: name || undefined,
                            encryptedSecret: encrypted,
                            firstName: name || undefined,
                        }
                    });

                    token = await auth.createToken(account.id);
                    secretBase64Url = toBase64Url(new Uint8Array(secret));
                }
            }

            // Generate one-time exchange code and redirect
            const exchangeCode = crypto.randomBytes(32).toString('hex');
            feishuAuthCodes.set(exchangeCode, {
                token,
                secret: secretBase64Url,
                expiresAt: Date.now() + 5 * 60 * 1000
            });

            const appUrl = stateData.appUrl || `${request.protocol}://${request.host}`;
            return reply.redirect(`${appUrl}/?feishu_auth=${exchangeCode}`);
        } catch (e: any) {
            log({ module: 'feishu-auth', level: 'error' }, `Callback error: ${e.message}, response: ${JSON.stringify(e.response?.data)}`);
            return reply.code(500).send({ error: 'Feishu auth failed', detail: e.message });
        }
    });

    // Route C: Exchange one-time code for token + secret
    app.post('/v1/auth/feishu/exchange', {
        schema: {
            body: z.object({
                code: z.string()
            })
        }
    }, async (request, reply) => {
        const { code } = request.body;
        const data = feishuAuthCodes.get(code);
        if (!data || data.expiresAt < Date.now()) {
            feishuAuthCodes.delete(code);
            return reply.code(400).send({ error: 'Invalid or expired code' });
        }
        feishuAuthCodes.delete(code);

        return reply.send({
            token: data.token,
            secret: data.secret
        });
    });

    // Route D: Prepare to link Feishu to existing account (requires auth)
    app.post('/v1/auth/feishu/prepare-link', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                secret: z.string()
            })
        }
    }, async (request, reply) => {
        const secretBytes = new Uint8Array(Buffer.from(request.body.secret, 'base64url')) as Uint8Array<ArrayBuffer>;
        const encrypted = encryptSecret(secretBytes);

        const linkToken = crypto.randomBytes(32).toString('hex');
        feishuLinkTokens.set(linkToken, {
            userId: request.userId,
            encryptedSecret: encrypted,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        return reply.send({ linkToken });
    });
}

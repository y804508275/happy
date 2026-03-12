/**
 * Happy App Protocol - Tool Auto-Registration
 * 
 * Reads installed app manifests and registers their declared tools
 * as MCP tools on the Happy server. The platform layer automatically
 * translates tool calls into HTTP requests to the app's API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios, { type AxiosRequestConfig } from "axios";
import { logger } from "@/ui/logger";
import { type InstalledApp, type AppTool, type ConfirmationStrategy } from "./types";

/**
 * Resolve the effective confirmation strategy for a tool
 * User override > manifest default
 */
function getEffectiveConfirmation(app: InstalledApp, tool: AppTool): ConfirmationStrategy {
    return app.confirmationOverrides[tool.name] || tool.confirmation;
}

/**
 * Build a Zod input schema from the tool's parameter declarations
 */
function buildInputSchema(tool: AppTool): Record<string, z.ZodTypeAny> {
    const schema: Record<string, z.ZodTypeAny> = {};
    for (const param of tool.parameters) {
        let zodType: z.ZodTypeAny;
        switch (param.type) {
            case 'number':
                zodType = z.number().describe(param.description);
                break;
            case 'boolean':
                zodType = z.boolean().describe(param.description);
                break;
            case 'object':
                zodType = z.record(z.any()).describe(param.description);
                break;
            case 'array':
                zodType = z.array(z.any()).describe(param.description);
                break;
            default:
                zodType = z.string().describe(param.description);
                break;
        }
        if (!param.required) {
            zodType = zodType.optional();
        }
        schema[param.name] = zodType;
    }
    return schema;
}

/**
 * Resolve path template with parameters
 * e.g. "/api/pages/:pageId" + { pageId: "123" } => "/api/pages/123"
 */
function resolvePath(pathTemplate: string, args: Record<string, any>): string {
    return pathTemplate.replace(/:([a-zA-Z_]+)/g, (_, key) => {
        const val = args[key];
        return val !== undefined ? encodeURIComponent(String(val)) : `:${key}`;
    });
}

/**
 * Extract a nested value from an object using dot-notation path
 * e.g. getNestedValue({ data: { content: "hello" } }, "data.content") => "hello"
 */
function getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Cache for session cookies: appId -> cookie string
const sessionCookieCache = new Map<string, string>();

/**
 * Login to an app's auth endpoint to obtain a session cookie.
 * Caches the result per app ID.
 */
async function loginAndCacheCookie(app: InstalledApp): Promise<string | null> {
    const auth = app.manifest.auth;
    if (!auth?.loginEndpoint) return null;

    const cached = sessionCookieCache.get(app.manifest.id);
    if (cached) return cached;

    try {
        const loginUrl = `${app.manifest.baseUrl}${auth.loginEndpoint}`;
        logger.debug(`[apps] Logging in to ${loginUrl}`);

        const response = await axios.post(loginUrl, app.credentials, {
            timeout: 10000,
            maxRedirects: 0,
            validateStatus: (s) => s < 400,
        });

        // Extract Set-Cookie header
        const setCookieHeaders = response.headers['set-cookie'];
        if (setCookieHeaders && setCookieHeaders.length > 0) {
            // Build a Cookie header from all Set-Cookie responses
            const cookieParts = setCookieHeaders.map((sc: string) => sc.split(';')[0]);
            const cookieStr = cookieParts.join('; ');
            sessionCookieCache.set(app.manifest.id, cookieStr);
            logger.debug(`[apps] Login successful for ${app.manifest.name}, cached session cookie`);
            return cookieStr;
        }

        logger.debug(`[apps] Login response had no Set-Cookie header`);
        return null;
    } catch (error: any) {
        logger.debug(`[apps] Login failed for ${app.manifest.name}: ${error.message}`);
        return null;
    }
}

/**
 * Get auth cookie for an app (login if needed). Exposed for proxy usage.
 */
export async function getAppAuthCookie(app: InstalledApp): Promise<string | null> {
    return loginAndCacheCookie(app);
}

/**
 * Build auth headers/cookies for the API request
 */
async function buildAuthConfig(app: InstalledApp): Promise<Partial<AxiosRequestConfig>> {
    const auth = app.manifest.auth;
    if (!auth) return {};

    switch (auth.type) {
        case 'cookie': {
            // First try login endpoint if available
            if (auth.loginEndpoint && app.credentials.email && app.credentials.password) {
                const cookie = await loginAndCacheCookie(app);
                if (cookie) {
                    return { headers: { 'Cookie': cookie } };
                }
            }
            // Fallback: use stored cookie fields directly
            const cookieParts: string[] = [];
            for (const field of auth.fields) {
                if (app.credentials[field]) {
                    cookieParts.push(`${field}=${app.credentials[field]}`);
                }
            }
            if (cookieParts.length > 0) {
                return { headers: { 'Cookie': cookieParts.join('; ') } };
            }
            return {};
        }
        case 'bearer': {
            const tokenField = auth.fields[0] || 'token';
            const token = app.credentials[tokenField];
            if (token) {
                return { headers: { 'Authorization': `Bearer ${token}` } };
            }
            return {};
        }
        case 'basic': {
            const user = app.credentials[auth.fields[0] || 'username'] || '';
            const pass = app.credentials[auth.fields[1] || 'password'] || '';
            const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
            return { headers: { 'Authorization': `Basic ${encoded}` } };
        }
        default:
            return {};
    }
}

// Track "once" confirmation grants per session: Set<"appId:toolName">
const onceConfirmedTools = new Set<string>();

/**
 * Confirmation callback type.
 * The platform layer calls this to ask the user for permission.
 * Returns true if user approves, false if denied.
 */
export type ConfirmationCallback = (appName: string, toolName: string, toolDescription: string, args: Record<string, any>) => Promise<boolean>;

/**
 * Register all tools from an installed app onto the MCP server.
 * Returns the list of registered tool names (prefixed with app__<appId>__).
 */
export function registerAppTools(
    mcp: McpServer,
    app: InstalledApp,
    confirmCallback?: ConfirmationCallback,
): string[] {
    const registeredNames: string[] = [];
    const { manifest } = app;

    for (const tool of manifest.tools) {
        // Tool name is prefixed to avoid collisions: app__{appId}__{toolName}
        const fullToolName = `app__${manifest.id}__${tool.name}`;
        const inputSchema = buildInputSchema(tool);
        const confirmation = getEffectiveConfirmation(app, tool);

        mcp.registerTool(fullToolName, {
            description: `[${manifest.name}] ${tool.description}`,
            title: `${manifest.name}: ${tool.name}`,
            inputSchema,
        }, async (args: Record<string, any>) => {
            // Build request config outside try so it's available for retry in catch
            const resolvedPath = resolvePath(tool.api.path, args);
            const url = `${manifest.baseUrl}${resolvedPath}`;
            const pathParams = new Set(
                (tool.api.path.match(/:([a-zA-Z_]+)/g) || []).map(p => p.slice(1))
            );
            const nonPathArgs = Object.fromEntries(
                Object.entries(args).filter(([k]) => !pathParams.has(k))
            );

            try {
                // Check confirmation strategy
                if (confirmation === 'confirm') {
                    if (confirmCallback) {
                        const approved = await confirmCallback(manifest.name, tool.name, tool.description, args);
                        if (!approved) {
                            return {
                                content: [{ type: 'text' as const, text: `Operation "${tool.name}" was denied by user.` }],
                                isError: true,
                            };
                        }
                    }
                } else if (confirmation === 'once') {
                    const key = `${manifest.id}:${tool.name}`;
                    if (!onceConfirmedTools.has(key)) {
                        if (confirmCallback) {
                            const approved = await confirmCallback(manifest.name, tool.name, tool.description, args);
                            if (!approved) {
                                return {
                                    content: [{ type: 'text' as const, text: `Operation "${tool.name}" was denied by user.` }],
                                    isError: true,
                                };
                            }
                            onceConfirmedTools.add(key);
                        } else {
                            // No callback = auto-approve, but mark as confirmed
                            onceConfirmedTools.add(key);
                        }
                    }
                }
                // 'auto' = no confirmation needed

                // Build the HTTP request
                const authConfig = await buildAuthConfig(app);

                const requestConfig: AxiosRequestConfig = {
                    method: tool.api.method,
                    url,
                    timeout: 30000,
                    headers: {
                        'Content-Type': 'application/json',
                        ...tool.api.headers,
                        ...authConfig.headers,
                    },
                };

                if (['GET', 'DELETE'].includes(tool.api.method)) {
                    requestConfig.params = nonPathArgs;
                } else {
                    requestConfig.data = { ...tool.api.defaultBody, ...nonPathArgs };
                }

                logger.debug(`[apps] Calling ${tool.api.method} ${url}`);
                const response = await axios(requestConfig);

                // Extract the useful part of the response
                let result = response.data;
                if (tool.api.responseField) {
                    result = getNestedValue(result, tool.api.responseField);
                }

                // Format result for AI
                const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

                return {
                    content: [{ type: 'text' as const, text: resultText }],
                    isError: false,
                };
            } catch (error: any) {
                const status = error.response?.status;

                // If 401, invalidate cached cookie and retry once
                if (status === 401 && app.manifest.auth?.loginEndpoint) {
                    sessionCookieCache.delete(manifest.id);
                    try {
                        const retryAuth = await buildAuthConfig(app);
                        const retryConfig: AxiosRequestConfig = {
                            method: tool.api.method,
                            url,
                            timeout: 30000,
                            headers: {
                                'Content-Type': 'application/json',
                                ...tool.api.headers,
                                ...retryAuth.headers,
                            },
                        };
                        if (['GET', 'DELETE'].includes(tool.api.method)) {
                            retryConfig.params = nonPathArgs;
                        } else {
                            retryConfig.data = { ...tool.api.defaultBody, ...nonPathArgs };
                        }
                        const retryResponse = await axios(retryConfig);
                        let retryResult = retryResponse.data;
                        if (tool.api.responseField) {
                            retryResult = getNestedValue(retryResult, tool.api.responseField);
                        }
                        const retryText = typeof retryResult === 'string' ? retryResult : JSON.stringify(retryResult, null, 2);
                        return { content: [{ type: 'text' as const, text: retryText }], isError: false };
                    } catch (retryError: any) {
                        // Fall through to error handling below
                    }
                }

                const detail = error.response?.data ? ` (${JSON.stringify(error.response.data)})` : '';
                logger.debug(`[apps] Tool ${fullToolName} failed: ${error.message}${detail}`);
                return {
                    content: [{
                        type: 'text' as const,
                        text: `Failed to execute ${tool.name}: ${status ? `HTTP ${status}` : error.message}${detail}`,
                    }],
                    isError: true,
                };
            }
        });

        registeredNames.push(fullToolName);
        logger.debug(`[apps] Registered tool: ${fullToolName} (confirmation: ${confirmation})`);
    }

    logger.debug(`[apps] Registered ${registeredNames.length} tools for app "${manifest.name}"`);
    return registeredNames;
}

/**
 * Register tools from all installed apps.
 * Returns all registered tool names.
 */
export function registerAllAppTools(
    mcp: McpServer,
    apps: InstalledApp[],
    confirmCallback?: ConfirmationCallback,
): string[] {
    const allNames: string[] = [];
    for (const app of apps) {
        const names = registerAppTools(mcp, app, confirmCallback);
        allNames.push(...names);
    }
    return allNames;
}

/**
 * Happy MCP server
 * Provides Happy CLI specific tools including chat session title management
 * and local project discovery
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AddressInfo } from "node:net";
import { z } from "zod";
import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { randomUUID } from "node:crypto";
import { type ScannedProject, scanProjects, readProjectCache, findProjectForPath } from "./projectScanner";
import axios from "axios";
import { configuration } from "@/configuration";
import { registerCapabilityTools, cleanupCapabilitySandbox, type PreviewEmitter } from "@/capabilities/registerCapabilityTools";
import { createEnvelope } from '@slopus/happy-wire';
import { listInstalledApps, registerAllAppTools, buildAppSystemPrompt, getAppAuthCookie } from "@/apps";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL as NodeURL } from "node:url";
import { Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";

export async function startHappyServer(client: ApiSessionClient, projects: ScannedProject[] = [], workingDirectory?: string) {
    logger.debug(`[happyMCP] server:start sessionId=${client.sessionId}`);

    // Handler that sends title updates via the client
    const handler = async (title: string) => {
        logger.debug('[happyMCP] Changing title to:', title);
        try {
            // Send title as a summary message, similar to title generator
            client.sendClaudeSessionMessage({
                type: 'summary',
                summary: title,
                leafUuid: randomUUID()
            });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    };

    //
    // Create the MCP server
    //

    // Load installed apps early so we can set MCP instructions
    const installedApps = listInstalledApps();
    const appInstructions = buildAppSystemPrompt(installedApps);

    const mcp = new McpServer({
        name: "Happy MCP",
        version: "1.0.0",
    }, {
        instructions: appInstructions || undefined,
    });

    mcp.registerTool('change_title', {
        description: 'Change the title of the current chat session',
        title: 'Change Chat Title',
        inputSchema: {
            title: z.string().describe('The new title for the chat session'),
        },
    }, async (args) => {
        const response = await handler(args.title);
        logger.debug('[happyMCP] Response:', response);
        
        if (response.success) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully changed chat title to: "${args.title}"`,
                    },
                ],
                isError: false,
            };
        } else {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to change chat title: ${response.error || 'Unknown error'}`,
                    },
                ],
                isError: true,
            };
        }
    });

    // Keep a mutable reference to the project list for refresh
    let currentProjects = projects;

    mcp.registerTool('list_projects', {
        description: 'List all local git projects discovered on this machine. Use refresh=true to re-scan the filesystem.',
        title: 'List Local Projects',
        inputSchema: {
            refresh: z.boolean().optional().default(false).describe('Set to true to re-scan the filesystem instead of using cached results'),
        },
    }, async (args) => {
        try {
            if (args.refresh) {
                logger.debug('[happyMCP] Refreshing project list...');
                currentProjects = await scanProjects();
            } else {
                // Try cache first, fallback to current list
                const cached = readProjectCache();
                if (cached) {
                    currentProjects = cached;
                }
            }

            if (currentProjects.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: 'No git projects found on this machine.',
                    }],
                    isError: false,
                };
            }

            const lines = currentProjects.map(p => `- ${p.name}: ${p.path}`).join('\n');
            return {
                content: [{
                    type: 'text',
                    text: `Found ${currentProjects.length} local projects:\n\n${lines}`,
                }],
                isError: false,
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Failed to list projects: ${String(error)}`,
                }],
                isError: true,
            };
        }
    });

    //
    // Memory tools
    //

    const apiBase = configuration.serverUrl;
    const apiHeaders = () => ({
        'Authorization': `Bearer ${client.getAuthToken()}`,
        'Content-Type': 'application/json'
    });

    function slugify(title: string): string {
        return 'memory-' + title
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 70) || 'untitled';
    }

    mcp.registerTool('load_context', {
        description: 'Load full content of knowledge base items by their IDs. Use this to retrieve detailed content for entries listed in the knowledge base directory.',
        title: 'Load Context',
        inputSchema: {
            ids: z.array(z.string()).min(1).max(20).describe('Array of knowledge base item IDs to load.'),
        },
    }, async (args) => {
        try {
            const results = await Promise.all(
                args.ids.map(async (id: string) => {
                    try {
                        const resp = await axios.get(`${apiBase}/v1/shared-items/${id}`, {
                            headers: apiHeaders(),
                            timeout: 10000,
                        });
                        return resp.data;
                    } catch {
                        return null;
                    }
                })
            );

            const validItems = results.filter(Boolean);
            if (validItems.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No items found for the given IDs.' }],
                    isError: false,
                };
            }

            const formatted = validItems.map((item: any) => {
                const tags = item.meta?.tags?.length ? ` (tags: ${item.meta.tags.join(', ')})` : '';
                return `## ${item.name}${tags}\n\n${item.content}`;
            }).join('\n\n---\n\n');

            return {
                content: [{ type: 'text', text: formatted }],
                isError: false,
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Failed to load context: ${error.message || String(error)}` }],
                isError: true,
            };
        }
    });

    mcp.registerTool('save_memory', {
        description: 'Save a memory (important fact, preference, decision, or context) for future retrieval across sessions.',
        title: 'Save Memory',
        inputSchema: {
            content: z.string().describe('The memory content to save. Be specific and self-contained.'),
            title: z.string().max(200).describe('A short, descriptive title for the memory.'),
            scope: z.enum(['global', 'project']).default('project').describe('global = applies everywhere. project = applies only to the current project/directory.'),
            tags: z.array(z.string()).optional().describe('Optional tags for categorization, e.g. ["preference", "architecture"]'),
            description: z.string().max(500).optional().describe('Brief summary for the knowledge base directory listing.'),
            alwaysApply: z.boolean().default(true).describe('true (default) = always injected as a rule. false = on-demand reference, loaded only when relevant.'),
        },
    }, async (args) => {
        try {
            const slug = slugify(args.title);
            const meta: Record<string, unknown> = {
                memoryType: 'memory',
                scope: args.scope,
                tags: args.tags || [],
                createdBy: 'claude-auto',
                alwaysApply: args.alwaysApply,
            };
            if (args.scope === 'project' && workingDirectory) {
                const matchedProject = findProjectForPath(workingDirectory, currentProjects);
                meta.projectPath = matchedProject?.path || workingDirectory;
            }

            const response = await axios.post(`${apiBase}/v1/shared-items`, {
                type: 'context',
                visibility: 'private',
                name: args.title,
                slug,
                description: args.description || args.tags?.join(', ') || undefined,
                content: args.content,
                meta,
            }, { headers: apiHeaders(), timeout: 10000 });

            return {
                content: [{ type: 'text', text: `Memory saved: "${args.title}" (${args.scope} scope, id: ${response.data.id})` }],
                isError: false,
            };
        } catch (error: any) {
            // Handle slug conflict by appending timestamp suffix
            if (error.response?.status === 409) {
                const retrySlug = slugify(args.title).slice(0, 60) + '-' + Date.now().toString(36);
                const meta: Record<string, unknown> = {
                    memoryType: 'memory',
                    scope: args.scope,
                    tags: args.tags || [],
                    createdBy: 'claude-auto',
                    alwaysApply: args.alwaysApply,
                };
                if (args.scope === 'project' && workingDirectory) {
                    const matchedProject = findProjectForPath(workingDirectory, currentProjects);
                    meta.projectPath = matchedProject?.path || workingDirectory;
                }
                try {
                    const response = await axios.post(`${apiBase}/v1/shared-items`, {
                        type: 'context',
                        visibility: 'private',
                        name: args.title,
                        slug: retrySlug,
                        description: args.description || args.tags?.join(', ') || undefined,
                        content: args.content,
                        meta,
                    }, { headers: apiHeaders(), timeout: 10000 });
                    return {
                        content: [{ type: 'text', text: `Memory saved: "${args.title}" (${args.scope} scope, id: ${response.data.id})` }],
                        isError: false,
                    };
                } catch (retryError: any) {
                    return {
                        content: [{ type: 'text', text: `Failed to save memory: ${retryError.message || String(retryError)}` }],
                        isError: true,
                    };
                }
            }
            const detail = error.response?.data ? ` (detail: ${JSON.stringify(error.response.data)})` : '';
            logger.debug(`[happyMCP] save_memory failed: status=${error.response?.status} data=${JSON.stringify(error.response?.data)} url=${apiBase}/v1/shared-items`);
            return {
                content: [{ type: 'text', text: `Failed to save memory: ${error.message || String(error)}${detail}` }],
                isError: true,
            };
        }
    });

    mcp.registerTool('save_md_reference', {
        description: 'Save a markdown reference document for context injection. Use this when the user describes a rule, convention, or context that should be stored as an MD reference file (not a memory rule). MD references are selectable context files that users can attach to conversations.',
        title: 'Save MD Reference',
        inputSchema: {
            content: z.string().describe('The markdown content of the reference document.'),
            title: z.string().max(200).describe('A short, descriptive title for the reference.'),
            scope: z.enum(['global', 'project']).default('project').describe('global = applies everywhere. project = applies only to the current project/directory.'),
            description: z.string().max(500).optional().describe('Brief summary of the reference document.'),
        },
    }, async (args) => {
        try {
            const slug = slugify(args.title);
            const meta: Record<string, unknown> = {
                memoryType: 'memory',
                alwaysApply: false,
                scope: args.scope,
            };
            if (args.scope === 'project' && workingDirectory) {
                const matchedProject = findProjectForPath(workingDirectory, currentProjects);
                meta.projectPath = matchedProject?.path || workingDirectory;
            }

            const response = await axios.post(`${apiBase}/v1/shared-items`, {
                type: 'context',
                visibility: 'private',
                name: args.title,
                slug,
                description: args.description || undefined,
                content: args.content,
                meta,
            }, { headers: apiHeaders(), timeout: 10000 });

            return {
                content: [{ type: 'text', text: `MD reference saved: "${args.title}" (${args.scope} scope, id: ${response.data.id})` }],
                isError: false,
            };
        } catch (error: any) {
            if (error.response?.status === 409) {
                const retrySlug = slugify(args.title).slice(0, 60) + '-' + Date.now().toString(36);
                const meta: Record<string, unknown> = {
                    memoryType: 'memory',
                alwaysApply: false,
                    scope: args.scope,
                };
                if (args.scope === 'project' && workingDirectory) {
                    const matchedProject = findProjectForPath(workingDirectory, currentProjects);
                    meta.projectPath = matchedProject?.path || workingDirectory;
                }
                try {
                    const response = await axios.post(`${apiBase}/v1/shared-items`, {
                        type: 'context',
                        visibility: 'private',
                        name: args.title,
                        slug: retrySlug,
                        description: args.description || undefined,
                        content: args.content,
                        meta,
                    }, { headers: apiHeaders(), timeout: 10000 });
                    return {
                        content: [{ type: 'text', text: `MD reference saved: "${args.title}" (${args.scope} scope, id: ${response.data.id})` }],
                        isError: false,
                    };
                } catch (retryError: any) {
                    return {
                        content: [{ type: 'text', text: `Failed to save MD reference: ${retryError.message || String(retryError)}` }],
                        isError: true,
                    };
                }
            }
            return {
                content: [{ type: 'text', text: `Failed to save MD reference: ${error.message || String(error)}` }],
                isError: true,
            };
        }
    });


    mcp.registerTool('notify_rule_applied', {
        description: 'Notify the user that a knowledge base rule was applied in your response. Call this BEFORE your response when a rule from the Knowledge Base influenced your behavior.',
        title: 'Notify Rule Applied',
        inputSchema: {
            rule_title: z.string().describe('The title of the knowledge base rule that was applied'),
            brief: z.string().describe('A very brief (< 15 words) description of how the rule was applied'),
        },
    }, async (args) => {
        try {
            client.sendSessionEvent({
                type: 'message',
                message: `Rule applied: ${args.rule_title} — ${args.brief}`,
            });
            return {
                content: [{ type: 'text', text: `Notified user about rule: ${args.rule_title}` }],
                isError: false,
            };
        } catch (error: any) {
            return {
                content: [{ type: 'text', text: `Failed to notify: ${error.message || String(error)}` }],
                isError: true,
            };
        }
    });

    mcp.registerTool('delete_memory', {
        description: 'Delete a saved memory by its ID.',
        title: 'Delete Memory',
        inputSchema: {
            id: z.string().describe('The ID of the memory to delete.'),
        },
    }, async (args) => {
        try {
            await axios.delete(`${apiBase}/v1/shared-items/${args.id}`, {
                headers: apiHeaders(),
                timeout: 10000,
            });
            return {
                content: [{ type: 'text', text: `Memory deleted (id: ${args.id}).` }],
                isError: false,
            };
        } catch (error: any) {
            if (error.response?.status === 404) {
                return {
                    content: [{ type: 'text', text: `Memory not found (id: ${args.id}).` }],
                    isError: true,
                };
            }
            return {
                content: [{ type: 'text', text: `Failed to delete memory: ${error.message || String(error)}` }],
                isError: true,
            };
        }
    });

    // Register cloud capability tools (browser, sandbox file I/O, code execution) if E2B_API_KEY is set
    const previewEmitter: PreviewEmitter = {
        sendPreview(preview) {
            logger.debug(`[happyMCP] sendPreview called: kind=${preview.kind}, url=${preview.url}, hasBody=${!!preview.body}`);
            try {
                const envelope = createEnvelope('agent', {
                    t: 'preview',
                    kind: preview.kind,
                    ...(preview.url ? { url: preview.url } : {}),
                    ...(preview.title ? { title: preview.title } : {}),
                    ...(preview.body ? { body: preview.body } : {}),
                });
                client.sendSessionProtocolMessage(envelope);
                logger.debug(`[happyMCP] preview envelope sent successfully`);
            } catch (error: any) {
                logger.debug(`[happyMCP] sendPreview error: ${error.message}`);
            }
        },
    };
    const capabilityToolNames = registerCapabilityTools(mcp, previewEmitter);

    // Register installed app tools (Happy App Protocol)
    const appToolNames = registerAllAppTools(mcp, installedApps);
    if (installedApps.length > 0) {
        logger.debug(`[happyMCP] Loaded ${installedApps.length} app(s), ${appToolNames.length} tool(s)`);
    }

    // Register open_app tool for apps with embed config
    // Start per-app proxy servers with full HTTP + WebSocket support
    const appProxyUrls = new Map<string, string>();
    const appProxyServers: ReturnType<typeof createServer>[] = [];
    const embeddableApps = installedApps.filter(a => a.manifest.embed);

    for (const app of embeddableApps) {
        const appProxyServer = createServer(async (req, res) => {
            try {
                const cookie = await getAppAuthCookie(app);
                const targetPath = req.url || '/';
                const target = new NodeURL(targetPath, app.manifest.baseUrl);
                const isHttps = target.protocol === 'https:';
                const makeRequest = isHttps ? httpsRequest : httpRequest;

                const proxyHeaders: Record<string, string> = {};
                for (const key of ['accept', 'content-type', 'accept-language', 'accept-encoding', 'referer', 'user-agent', 'content-length']) {
                    if (req.headers[key]) proxyHeaders[key] = req.headers[key] as string;
                }
                proxyHeaders['host'] = target.host;
                if (cookie) proxyHeaders['cookie'] = cookie;

                const proxyReq = makeRequest(target.toString(), {
                    method: req.method,
                    headers: proxyHeaders,
                }, (proxyRes) => {
                    const headers: Record<string, string | string[]> = {};
                    for (const [key, val] of Object.entries(proxyRes.headers)) {
                        if (!val) continue;
                        if (key.toLowerCase() === 'transfer-encoding') continue;
                        // Strip restrictive frame/CSP headers from proxied response
                        if (key.toLowerCase() === 'x-frame-options') continue;
                        if (key.toLowerCase() === 'content-security-policy') continue;
                        headers[key] = val as any;
                    }
                    res.writeHead(proxyRes.statusCode || 200, headers);
                    proxyRes.pipe(res);
                });

                proxyReq.on('error', (err) => {
                    logger.debug(`[happyMCP] App proxy error for ${app.manifest.id}: ${err.message}`);
                    if (!res.headersSent) res.writeHead(502).end('Proxy error');
                });

                req.pipe(proxyReq);
            } catch (error: any) {
                logger.debug(`[happyMCP] App proxy error for ${app.manifest.id}: ${error.message}`);
                if (!res.headersSent) res.writeHead(500).end('Internal proxy error');
            }
        });

        // WebSocket upgrade handling
        appProxyServer.on('upgrade', async (req, clientSocket, head) => {
            try {
                const cookie = await getAppAuthCookie(app);
                const targetPath = req.url || '/';
                const target = new NodeURL(targetPath, app.manifest.baseUrl);
                const isHttps = target.protocol === 'https:';
                const port = parseInt(target.port) || (isHttps ? 443 : 80);

                const connectFn = isHttps
                    ? () => tlsConnect({ host: target.hostname, port, servername: target.hostname })
                    : () => new Socket();

                const serverSocket = connectFn();
                if (!isHttps) {
                    (serverSocket as Socket).connect(port, target.hostname);
                }

                serverSocket.on('connect', () => {
                    const headers = [
                        `GET ${target.pathname}${target.search} HTTP/1.1`,
                        `Host: ${target.host}`,
                        `Upgrade: websocket`,
                        `Connection: Upgrade`,
                    ];
                    // Forward WebSocket-specific headers
                    for (const key of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions', 'sec-websocket-protocol']) {
                        if (req.headers[key]) headers.push(`${key}: ${req.headers[key]}`);
                    }
                    if (cookie) headers.push(`Cookie: ${cookie}`);
                    headers.push('', '');

                    serverSocket.write(headers.join('\r\n'));
                    if (head.length > 0) serverSocket.write(head);

                    serverSocket.pipe(clientSocket);
                    clientSocket.pipe(serverSocket);
                });

                serverSocket.on('error', (err) => {
                    logger.debug(`[happyMCP] WS proxy error for ${app.manifest.id}: ${err.message}`);
                    clientSocket.destroy();
                });

                clientSocket.on('error', () => serverSocket.destroy());
            } catch (error: any) {
                logger.debug(`[happyMCP] WS upgrade error for ${app.manifest.id}: ${error.message}`);
                clientSocket.destroy();
            }
        });

        const proxyUrl = await new Promise<string>((resolve) => {
            appProxyServer.listen(0, '127.0.0.1', () => {
                const addr = appProxyServer.address() as AddressInfo;
                resolve(`http://127.0.0.1:${addr.port}`);
            });
        });

        appProxyUrls.set(app.manifest.id, proxyUrl);
        appProxyServers.push(appProxyServer);
        logger.debug(`[happyMCP] App proxy for "${app.manifest.name}" at ${proxyUrl} (HTTP+WS)`);
    }

    if (embeddableApps.length > 0) {
        const appChoices = embeddableApps.map(a => a.manifest.id);

        // Build description including pathTemplate params for each app
        const appDescs = embeddableApps.map(a => {
            const tpl = a.manifest.embed?.pathTemplate;
            if (tpl) {
                const params = (tpl.match(/:([a-zA-Z_]+)/g) || []).map(p => p.slice(1));
                return `${a.manifest.id} (${a.manifest.name}, pathTemplate: "${tpl}", params: ${params.join(', ')})`;
            }
            return `${a.manifest.id} (${a.manifest.name})`;
        }).join('; ');

        mcp.registerTool('open_app', {
            description: `Open an installed app in the side panel. Available: ${appDescs}. To open a specific page, pass the pathTemplate params (e.g. spaceSlug, slugId from search results). Without params, opens the app home page.`,
            title: 'Open App',
            inputSchema: {
                appId: z.string().describe(`App ID to open. One of: ${appChoices.join(', ')}`),
                params: z.record(z.string()).optional().describe('Key-value pairs to fill the pathTemplate (e.g. {"spaceSlug": "general", "slugId": "TGiuZmsa1N"})'),
            },
        }, async (args: { appId: string; params?: Record<string, string> }) => {
            const app = embeddableApps.find(a => a.manifest.id === args.appId);
            if (!app || !app.manifest.embed) {
                return {
                    content: [{ type: 'text' as const, text: `App "${args.appId}" not found or has no embed config.` }],
                    isError: true,
                };
            }

            let appPath: string;
            if (args.params && app.manifest.embed.pathTemplate) {
                appPath = app.manifest.embed.pathTemplate.replace(/:([a-zA-Z_]+)/g, (_, key) => {
                    return args.params![key] || `:${key}`;
                });
            } else {
                appPath = app.manifest.embed.defaultPath || '/';
            }
            // Use proxy URL with auth injection + WebSocket support
            const proxyBase = appProxyUrls.get(app.manifest.id);
            if (!proxyBase) {
                return {
                    content: [{ type: 'text' as const, text: `Proxy not available for "${app.manifest.name}".` }],
                    isError: true,
                };
            }
            const embedUrl = `${proxyBase}${appPath}`;

            previewEmitter.sendPreview({
                kind: 'url',
                url: embedUrl,
                title: app.manifest.name,
            });

            return {
                content: [{ type: 'text' as const, text: `Opened ${app.manifest.name} in side panel: ${embedUrl}` }],
                isError: false,
            };
        });
        appToolNames.push('open_app');
        logger.debug(`[happyMCP] Registered open_app tool for ${embeddableApps.length} embeddable app(s)`);
    }

    const transport = new StreamableHTTPServerTransport({
        // NOTE: Returning session id here will result in claude
        // sdk spawn to fail with `Invalid Request: Server already initialized`
        sessionIdGenerator: undefined
    });
    await mcp.connect(transport);

    //
    // Create the HTTP server
    //

    const server = createServer(async (req, res) => {
        try {
            await transport.handleRequest(req, res);
        } catch (error) {
            logger.debug("Error handling request:", error);
            if (!res.headersSent) {
                res.writeHead(500).end();
            }
        }
    });

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as AddressInfo;
            resolve(new URL(`http://127.0.0.1:${addr.port}`));
        });
    });

    logger.debug(`[happyMCP] server:ready sessionId=${client.sessionId} url=${baseUrl.toString()}`);

    const baseToolNames = ['change_title', 'list_projects', 'load_context', 'save_memory', 'save_md_reference', 'delete_memory', 'notify_rule_applied'];

    return {
        url: baseUrl.toString(),
        toolNames: [...baseToolNames, ...capabilityToolNames, ...appToolNames],
        installedApps,
        stop: () => {
            logger.debug(`[happyMCP] server:stop sessionId=${client.sessionId}`);
            cleanupCapabilitySandbox().catch(e => logger.debug('[happyMCP] sandbox cleanup error:', e));
            appProxyServers.forEach(s => s.close());
            mcp.close();
            server.close();
        }
    }
}

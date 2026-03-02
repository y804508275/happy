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

    const mcp = new McpServer({
        name: "Happy MCP",
        version: "1.0.0",
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
                description: args.description || args.tags?.join(', ') || null,
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
                        description: args.description || args.tags?.join(', ') || null,
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
            return {
                content: [{ type: 'text', text: `Failed to save memory: ${error.message || String(error)}` }],
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

    return {
        url: baseUrl.toString(),
        toolNames: ['change_title', 'list_projects', 'load_context', 'save_memory', 'delete_memory'],
        stop: () => {
            logger.debug(`[happyMCP] server:stop sessionId=${client.sessionId}`);
            mcp.close();
            server.close();
        }
    }
}

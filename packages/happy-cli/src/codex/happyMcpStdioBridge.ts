/**
 * Happy MCP STDIO Bridge
 *
 * Minimal STDIO MCP server exposing a single tool `change_title`.
 * On invocation it forwards the tool call to an existing Happy HTTP MCP server
 * using the StreamableHTTPClientTransport.
 *
 * Configure the target HTTP MCP URL via env var `HAPPY_HTTP_MCP_URL` or
 * via CLI flag `--url <http://127.0.0.1:PORT>`.
 *
 * Note: This process must not print to stdout as it would break MCP STDIO.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

function parseArgs(argv: string[]): { url: string | null } {
  let url: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url' && i + 1 < argv.length) {
      url = argv[i + 1];
      i++;
    }
  }
  return { url };
}

async function main() {
  // Resolve target HTTP MCP URL
  const { url: urlFromArgs } = parseArgs(process.argv.slice(2));
  const baseUrl = urlFromArgs || process.env.HAPPY_HTTP_MCP_URL || '';

  if (!baseUrl) {
    // Write to stderr; never stdout.
    process.stderr.write(
      '[happy-mcp] Missing target URL. Set HAPPY_HTTP_MCP_URL or pass --url <http://127.0.0.1:PORT>\n'
    );
    process.exit(2);
  }

  let httpClient: Client | null = null;

  async function ensureHttpClient(): Promise<Client> {
    if (httpClient) return httpClient;
    const client = new Client(
      { name: 'happy-stdio-bridge', version: '1.0.0' },
      { capabilities: {} }
    );

    const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
    await client.connect(transport);
    httpClient = client;
    return client;
  }

  // Create STDIO MCP server
  const server = new McpServer({
    name: 'Happy MCP Bridge',
    version: '1.0.0',
  });

  // Generic forwarder: register a tool that proxies to the HTTP MCP server
  function registerForwardTool(
    name: string,
    description: string,
    title: string,
    inputSchema: Record<string, z.ZodTypeAny>,
  ) {
    server.registerTool(name, { description, title, inputSchema }, async (args) => {
      try {
        const client = await ensureHttpClient();
        const response = await client.callTool({ name, arguments: args });
        return response as any;
      } catch (error) {
        return {
          content: [
            { type: 'text', text: `Failed to call ${name}: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    });
  }

  // Register tools and forward to HTTP MCP
  registerForwardTool('change_title',
    'Change the title of the current chat session',
    'Change Chat Title',
    { title: z.string().describe('The new title for the chat session') }
  );

  registerForwardTool('save_memory',
    'Save a memory for future retrieval across sessions.',
    'Save Memory',
    {
      content: z.string().describe('The memory content to save.'),
      title: z.string().max(200).describe('A short, descriptive title.'),
      scope: z.enum(['global', 'project']).default('project').describe('global or project scope.'),
      tags: z.array(z.string()).optional().describe('Optional tags.'),
    }
  );

  registerForwardTool('delete_memory',
    'Delete a memory by ID.',
    'Delete Memory',
    { id: z.string().describe('The ID of the memory to delete.') }
  );

  // Start STDIO transport
  const stdio = new StdioServerTransport();
  await server.connect(stdio);
}

// Start and surface fatal errors to stderr only
main().catch((err) => {
  try {
    process.stderr.write(`[happy-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  } finally {
    process.exit(1);
  }
});


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

  // Connect to HTTP MCP server first to discover all available tools
  const initialClient = await ensureHttpClient();
  const toolsResult = await initialClient.listTools();

  // Create STDIO MCP server, passing through instructions from the HTTP server
  const server = new McpServer({
    name: 'Happy MCP Bridge',
    version: '1.0.0',
  }, {
    instructions: initialClient.getInstructions?.() || undefined,
  });

  // Auto-register all tools discovered from the HTTP MCP server
  for (const tool of toolsResult.tools) {
    const inputSchema: Record<string, z.ZodTypeAny> = {};
    const props = (tool.inputSchema as any)?.properties || {};
    const required = new Set((tool.inputSchema as any)?.required || []);

    for (const [key, val] of Object.entries(props)) {
      const prop = val as any;
      let zodType: z.ZodTypeAny;
      switch (prop.type) {
        case 'number': zodType = z.number(); break;
        case 'boolean': zodType = z.boolean(); break;
        case 'array': zodType = z.array(z.any()); break;
        case 'object': zodType = z.object({}).passthrough(); break;
        default: zodType = z.string(); break;
      }
      if (prop.description) zodType = zodType.describe(prop.description);
      if (!required.has(key)) zodType = zodType.optional();
      inputSchema[key] = zodType;
    }

    server.registerTool(
      tool.name,
      { description: tool.description || tool.name, title: tool.name, inputSchema },
      async (args) => {
        try {
          const client = await ensureHttpClient();
          const response = await client.callTool({ name: tool.name, arguments: args });
          return response as any;
        } catch (error) {
          return {
            content: [
              { type: 'text', text: `Failed to call ${tool.name}: ${error instanceof Error ? error.message : String(error)}` },
            ],
            isError: true,
          };
        }
      }
    );
  }

  process.stderr.write(`[happy-mcp] Registered ${toolsResult.tools.length} tools from HTTP MCP server\n`);

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


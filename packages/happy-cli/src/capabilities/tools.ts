export interface CapabilityToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, { type: string; description: string }>;
}

export const capabilityTools: CapabilityToolDefinition[] = [
    {
        name: 'browser_navigate',
        description: 'Open a URL in a cloud browser and return a screenshot and the page text content. Use this when you need to view web pages, analyze websites, or gather online information.',
        parameters: {
            url: { type: 'string', description: 'The URL to navigate to' },
        },
    },
    {
        name: 'browser_screenshot',
        description: 'Take a screenshot of the current browser page.',
        parameters: {},
    },
    {
        name: 'sandbox_file_read',
        description: 'Read a file from the cloud sandbox file system.',
        parameters: {
            path: { type: 'string', description: 'Absolute path of the file to read' },
        },
    },
    {
        name: 'sandbox_file_write',
        description: 'Write content to a file in the cloud sandbox. Use this for generating reports, documents, or any file that should be previewed in the right panel.',
        parameters: {
            path: { type: 'string', description: 'Absolute path of the file to write' },
            content: { type: 'string', description: 'Content to write' },
        },
    },
    {
        name: 'sandbox_file_list',
        description: 'List files in a directory in the cloud sandbox.',
        parameters: {
            path: { type: 'string', description: 'Absolute path of the directory to list' },
        },
    },
    {
        name: 'sandbox_run_code',
        description: 'Execute a shell command in the cloud sandbox (supports Python, Node.js, Bash). Use this for data processing, analysis, or any computation.',
        parameters: {
            command: { type: 'string', description: 'The shell command to execute' },
        },
    },
];

export function isCapabilityTool(toolName: string): boolean {
    return capabilityTools.some(t => t.name === toolName);
}

export function buildCapabilityToolsSystemPrompt(): string {
    const lines = capabilityTools.map(t => {
        const params = Object.entries(t.parameters)
            .map(([k, v]) => `${k}: ${v.description}`)
            .join(', ');
        return `- ${t.name}(${params}): ${t.description}`;
    });

    return [
        'You have access to the following cloud capabilities:',
        '',
        ...lines,
        '',
        'When the user needs to browse the web, generate files, or execute code, use these cloud tools.',
    ].join('\n');
}

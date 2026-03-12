import type { ScannedProject } from '@/claude/utils/projectScanner';

export function buildDroidSystemPrompt(projects: ScannedProject[], projectContext?: string | null): string {
    const parts: string[] = [];

    parts.push('You are being controlled remotely via Happy Coder mobile/web client.');
    parts.push('The user is sending messages through an encrypted relay.');

    if (process.env.E2B_API_KEY) {
        parts.push(`
# Cloud Capabilities (IMPORTANT)

You have access to cloud-hosted browser and sandbox tools via MCP. When the user asks you to browse the web, view a website, take a screenshot, or run code in an isolated environment, you MUST use these MCP tools instead of local tools or skills:

- mcp__happy__browser_navigate: Open a URL in a cloud Chromium browser and get the page title, text content, and a screenshot. ALWAYS use this instead of local browser skills or curl.
- mcp__happy__browser_screenshot: Take a screenshot of the current cloud browser page.
- mcp__happy__sandbox_run_code: Execute commands in an isolated cloud sandbox (Python, Node.js, Bash).
- mcp__happy__sandbox_file_read: Read a file from the cloud sandbox.
- mcp__happy__sandbox_file_write: Write a file to the cloud sandbox.
- mcp__happy__sandbox_file_list: List files in the cloud sandbox.

These tools run in a cloud sandbox with a full Chromium browser. The results are automatically displayed in the user's preview panel. Do NOT use local Execute/Skill for web browsing - always prefer mcp__happy__browser_navigate.`);
    }

    if (projects.length > 0) {
        parts.push('\nLocal projects on this machine:');
        for (const project of projects) {
            parts.push(`- ${project.name}: ${project.path}`);
        }
    }

    if (projectContext) {
        parts.push('\n' + projectContext);
    }

    return parts.join('\n');
}

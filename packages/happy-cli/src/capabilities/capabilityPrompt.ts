import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configuration } from "@/configuration";

function hasBrowserbaseKeys(): boolean {
    if (process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID) return true;
    try {
        const envFile = join(configuration.happyHomeDir, 'capabilities.env');
        const content = readFileSync(envFile, 'utf-8');
        return /^BROWSERBASE_API_KEY=.+$/m.test(content) && /^BROWSERBASE_PROJECT_ID=.+$/m.test(content);
    } catch {}
    return false;
}

export function buildCapabilitySystemPrompt(): string | null {
    if (!hasBrowserbaseKeys()) return null;

    return `# Cloud Browser (IMPORTANT - READ CAREFULLY)

You have access to a cloud-hosted browser via MCP. When the user asks you to browse the web, view a website, take a screenshot, or search online, you MUST use these MCP tools:

- mcp__happy__browser_navigate(url): Open a URL in a cloud browser. Returns page title. The browser is live-streamed to the user's preview panel in real-time.
- mcp__happy__browser_screenshot(): Take a screenshot of the current browser page.

CRITICAL RULES:
1. For ANY web browsing request, ALWAYS use mcp__happy__browser_navigate. Do NOT use local Execute, Skill, or agent-browser.
2. The browser runs in the cloud (Browserbase) with low-latency live streaming to the user.
3. The user can see the browser in real-time in the preview panel on the right side of their screen.
4. Do NOT install browsers locally or use curl/wget for web browsing.`;
}

import type { ScannedProject } from '@/claude/utils/projectScanner';

export function buildDroidSystemPrompt(projects: ScannedProject[], projectContext?: string | null): string {
    const parts: string[] = [];

    parts.push('You are being controlled remotely via Happy Coder mobile/web client.');
    parts.push('The user is sending messages through an encrypted relay.');

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

#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

interface ChangelogEntry {
    version: number;
    deployVersion: string;
    date: string;
    summary: string;
    changes: string[];
    rawMarkdown?: string;
}

interface ChangelogData {
    entries: ChangelogEntry[];
    latestVersion: number;
}

function parseChangelog(): ChangelogData {
    const changelogPath = path.join(__dirname, '../../CHANGELOG.md');

    if (!fs.existsSync(changelogPath)) {
        console.warn('CHANGELOG.md not found, creating empty changelog data');
        return { entries: [], latestVersion: 0 };
    }

    const content = fs.readFileSync(changelogPath, 'utf-8');
    const entries: ChangelogEntry[] = [];

    // Split by version headers: ## Version N (DEPLOY_VERSION) - DATE
    const versionSections = content.split(/^## Version (\d+) \(([^)]+)\) - (.+)$/gm);

    // Skip the first element (content before first version)
    for (let i = 1; i < versionSections.length; i += 4) {
        const versionStr = versionSections[i];
        const deployVersion = versionSections[i + 1];
        const dateStr = versionSections[i + 2];
        const changesContent = versionSections[i + 3];

        const version = parseInt(versionStr, 10);
        if (isNaN(version)) continue;

        // Extract summary and bullet points
        const changes: string[] = [];
        const lines = changesContent.trim().split('\n');
        let summary = '';
        let foundFirstBullet = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('- ')) {
                foundFirstBullet = true;
                changes.push(trimmed.substring(2));
            } else if (!foundFirstBullet && trimmed.length > 0) {
                // This is part of the summary (before any bullet points)
                summary += (summary ? ' ' : '') + trimmed;
            }
        }

        entries.push({
            version,
            deployVersion: deployVersion.trim(),
            date: dateStr.trim(),
            summary: summary.trim(),
            changes,
            rawMarkdown: `## Version ${version} (${deployVersion.trim()}) - ${dateStr}\n${changesContent}`.trim()
        });
    }
    
    // Sort entries by version descending (newest first)
    entries.sort((a, b) => b.version - a.version);
    
    const latestVersion = entries.length > 0 ? entries[0].version : 0;
    
    return { entries, latestVersion };
}

function main() {
    console.log('Parsing CHANGELOG.md...');
    
    const changelogData = parseChangelog();
    const outputPath = path.join(__dirname, '../changelog/changelog.json');
    
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the parsed data
    fs.writeFileSync(outputPath, JSON.stringify(changelogData, null, 2));
    
    console.log(`✅ Parsed ${changelogData.entries.length} changelog entries`);
    console.log(`📝 Latest version: ${changelogData.latestVersion}`);
    console.log(`💾 Output written to: ${outputPath}`);
}

if (require.main === module) {
    main();
}

export { parseChangelog };
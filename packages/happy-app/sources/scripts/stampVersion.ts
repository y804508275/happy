#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

function main() {
    const today = new Date();
    const datePrefix = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    const filePath = path.join(__dirname, '../version.ts');

    // Read current version to auto-increment build number within same day
    let buildNum = 1;
    if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, 'utf-8');
        const match = existing.match(/APP_DEPLOY_VERSION = '(.+)'/);
        if (match) {
            const parts = match[1].split('.');
            const existingDate = parts.slice(0, 3).join('.');
            if (existingDate === datePrefix && parts[3]) {
                buildNum = parseInt(parts[3], 10) + 1;
            }
        }
    }

    const version = `${datePrefix}.${buildNum}`;
    const content = [
        '// Deploy version — auto-updated by the deploy pipeline.',
        '// Format: YYYY.MM.DD.N (date + build number)',
        '// To update: run `yarn stamp-version` or it runs automatically during `yarn ota`',
        `export const APP_DEPLOY_VERSION = '${version}';`,
        '',
    ].join('\n');

    fs.writeFileSync(filePath, content);
    console.log(`✅ Stamped deploy version: ${version}`);
}

if (require.main === module) {
    main();
}

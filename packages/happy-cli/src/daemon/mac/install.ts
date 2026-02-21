/**
 * Installation script for Happy daemon using macOS LaunchAgents (user-level)
 *
 * Installs a LaunchAgent that auto-starts the daemon on login and keeps it alive.
 * No sudo required — runs as the current user under ~/Library/LaunchAgents/.
 */

import { writeFileSync, chmodSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { logger } from '@/ui/logger';
import { trimIdent } from '@/utils/trimIdent';
import os from 'os';
import { join } from 'path';
import { projectPath } from '@/projectPath';

const PLIST_LABEL = 'com.happy-cli.daemon';

export function getPlistPath(): string {
    return join(os.homedir(), 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);
}

export async function install(): Promise<void> {
    try {
        const plistFile = getPlistPath();

        // Ensure ~/Library/LaunchAgents exists
        const launchAgentsDir = join(os.homedir(), 'Library', 'LaunchAgents');
        if (!existsSync(launchAgentsDir)) {
            mkdirSync(launchAgentsDir, { recursive: true });
        }

        // Unload existing plist if present
        if (existsSync(plistFile)) {
            logger.info('Daemon plist already exists. Unloading first...');
            try {
                execSync(`launchctl unload ${plistFile}`, { stdio: 'pipe' });
            } catch {
                // May not be loaded, that's fine
            }
        }

        // Resolve the node binary and the Happy CLI entrypoint
        const nodePath = process.argv[0];
        const entrypoint = join(projectPath(), 'dist', 'index.mjs');

        // Collect PATH so the daemon can find node/npm/etc.
        const currentPath = process.env.PATH || '/usr/local/bin:/usr/bin:/bin';

        // Ensure ~/.happy directory exists for logs
        const happyDir = join(os.homedir(), '.happy');
        if (!existsSync(happyDir)) {
            mkdirSync(happyDir, { recursive: true });
        }

        // Create plist content
        const plistContent = trimIdent(`
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
            <dict>
                <key>Label</key>
                <string>${PLIST_LABEL}</string>

                <key>ProgramArguments</key>
                <array>
                    <string>${nodePath}</string>
                    <string>--no-warnings</string>
                    <string>--no-deprecation</string>
                    <string>${entrypoint}</string>
                    <string>daemon</string>
                    <string>start-sync</string>
                </array>

                <key>EnvironmentVariables</key>
                <dict>
                    <key>HAPPY_DAEMON_MODE</key>
                    <string>true</string>
                    <key>PATH</key>
                    <string>${currentPath}</string>
                </dict>

                <key>RunAtLoad</key>
                <true/>

                <key>KeepAlive</key>
                <true/>

                <key>LimitLoadToSessionType</key>
                <string>Aqua</string>

                <key>StandardErrorPath</key>
                <string>${os.homedir()}/.happy/daemon.err</string>

                <key>StandardOutPath</key>
                <string>${os.homedir()}/.happy/daemon.log</string>

                <key>WorkingDirectory</key>
                <string>${os.homedir()}</string>
            </dict>
            </plist>
        `);

        // Write plist file
        writeFileSync(plistFile, plistContent);
        chmodSync(plistFile, 0o644);

        logger.info(`Created daemon plist at ${plistFile}`);

        // Load the agent
        execSync(`launchctl load ${plistFile}`, { stdio: 'inherit' });

        logger.info('Daemon installed and started successfully');
        logger.info('The daemon will auto-start on login and restart if it crashes.');
        logger.info('Check logs at ~/.happy/daemon.log');

    } catch (error) {
        logger.debug('Failed to install daemon:', error);
        throw error;
    }
}
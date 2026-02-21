/**
 * Uninstallation script for Happy daemon LaunchAgent (user-level)
 */

import { existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { logger } from '@/ui/logger';
import { getPlistPath } from './install';

export async function uninstall(): Promise<void> {
    try {
        const plistFile = getPlistPath();

        // Check if plist exists
        if (!existsSync(plistFile)) {
            logger.info('Daemon plist not found. Nothing to uninstall.');
            return;
        }

        // Unload the agent
        try {
            execSync(`launchctl unload ${plistFile}`, { stdio: 'pipe' });
            logger.info('Daemon stopped successfully');
        } catch {
            // Agent might not be loaded, continue with removal
            logger.info('Failed to unload daemon (it might not be running)');
        }

        // Remove the plist file
        unlinkSync(plistFile);
        logger.info(`Removed daemon plist from ${plistFile}`);

        logger.info('Daemon uninstalled successfully');

    } catch (error) {
        logger.debug('Failed to uninstall daemon:', error);
        throw error;
    }
}
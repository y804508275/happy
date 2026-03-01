/**
 * Project scanner - discovers git projects on the local filesystem
 * and caches results for fast access by MCP tools and system prompt injection.
 */

import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { configuration } from "@/configuration";
import { logger } from "@/ui/logger";

export interface ScannedProject {
    path: string;   // Absolute path, e.g. /home/user/projects/my-app
    name: string;   // Directory name, e.g. my-app
}

interface ProjectCache {
    homeDir: string;
    timestamp: number;
    projects: ScannedProject[];
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SCAN_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_PROJECTS = 200;

function cachePath(): string {
    return join(configuration.happyHomeDir, 'projects-cache.json');
}

/**
 * Read cached project list from disk.
 * Returns null if cache is missing, expired, or for a different home directory.
 */
export function readProjectCache(): ScannedProject[] | null {
    try {
        const raw = readFileSync(cachePath(), 'utf-8');
        const cache: ProjectCache = JSON.parse(raw);

        if (cache.homeDir !== homedir()) {
            logger.debug('[projectScanner] Cache invalidated: homeDir mismatch');
            return null;
        }

        if (Date.now() - cache.timestamp > CACHE_TTL_MS) {
            logger.debug('[projectScanner] Cache expired');
            return null;
        }

        return cache.projects;
    } catch {
        return null;
    }
}

/**
 * Scan the filesystem for git projects and write results to cache.
 */
export async function scanProjects(): Promise<ScannedProject[]> {
    const home = homedir();
    logger.debug(`[projectScanner] Scanning for projects in ${home}`);

    const projects = await new Promise<ScannedProject[]>((resolve) => {
        execFile(
            'find',
            [home, '-maxdepth', '4', '-name', '.git', '-type', 'd'],
            { timeout: SCAN_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
            (error, stdout) => {
                if (error && !stdout) {
                    logger.debug('[projectScanner] Scan error:', error.message);
                    resolve([]);
                    return;
                }

                const lines = stdout.trim().split('\n').filter(l => l.length > 0);
                const result: ScannedProject[] = lines
                    .slice(0, MAX_PROJECTS)
                    .map(line => {
                        const projectPath = line.replace(/\/\.git$/, '');
                        return {
                            path: projectPath,
                            name: projectPath.split('/').pop() || projectPath,
                        };
                    })
                    .sort((a, b) => a.name.localeCompare(b.name));

                resolve(result);
            }
        );
    });

    // Write cache
    try {
        const cache: ProjectCache = {
            homeDir: home,
            timestamp: Date.now(),
            projects,
        };
        writeFileSync(cachePath(), JSON.stringify(cache), 'utf-8');
        logger.debug(`[projectScanner] Cached ${projects.length} projects`);
    } catch (e) {
        logger.debug('[projectScanner] Failed to write cache:', e);
    }

    return projects;
}

/**
 * Get projects with cache-first strategy.
 * Returns cached results if valid, otherwise scans the filesystem.
 */
export async function getProjects(): Promise<ScannedProject[]> {
    const cached = readProjectCache();
    if (cached) {
        logger.debug(`[projectScanner] Using cached projects (${cached.length} items)`);
        return cached;
    }
    return scanProjects();
}

/**
 * Format project list for inclusion in system prompt.
 * Returns empty string if no projects found.
 */
export function formatProjectsForPrompt(projects: ScannedProject[]): string {
    if (projects.length === 0) return '';

    const lines = projects.map(p => `- ${p.name}: ${p.path}`).join('\n');
    return `The following local projects are available on this machine:\n\n${lines}\n\nYou can use the "mcp__happy__list_projects" tool to refresh this list.`;
}

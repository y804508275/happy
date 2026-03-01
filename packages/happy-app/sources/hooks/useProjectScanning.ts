import { useState, useEffect } from 'react';
import { machineBash } from '@/sync/ops';

export interface ScannedProject {
    path: string;   // Absolute path, e.g. /home/user/projects/my-app
    name: string;   // Directory name, e.g. my-app
}

interface ProjectScanResult {
    projects: ScannedProject[];
    isScanning: boolean;
    error?: string;
}

/**
 * Scans for git projects on a remote machine's filesystem.
 *
 * NON-BLOCKING: Scanning runs asynchronously. UI shows loading state
 * while scan is in progress, then updates when results arrive.
 *
 * Uses machineBash to run `find` on the remote machine, looking for
 * directories containing .git (up to 3 levels deep from home).
 *
 * @param machineId - The machine to scan (null = no scan)
 * @param homeDir - The machine's home directory (for display purposes)
 */
export function useProjectScanning(machineId: string | null, homeDir: string | null): ProjectScanResult {
    const [result, setResult] = useState<ProjectScanResult>({
        projects: [],
        isScanning: false,
    });

    useEffect(() => {
        if (!machineId) {
            setResult({ projects: [], isScanning: false });
            return;
        }

        let cancelled = false;

        const scan = async () => {
            setResult(prev => ({ ...prev, isScanning: true }));
            console.log('[useProjectScanning] Starting scan for machineId:', machineId);

            try {
                // Find all .git directories up to 3 levels deep, strip /.git suffix
                // Use home directory as scan root; head -200 to cap results
                const bashResult = await machineBash(
                    machineId,
                    'find ~ -maxdepth 4 -name .git -type d 2>/dev/null | head -200 | sed \'s|/\\.git$||\'  | sort',
                    '/'
                );

                if (cancelled) return;
                console.log('[useProjectScanning] Result:', {
                    success: bashResult.success,
                    exitCode: bashResult.exitCode,
                    lineCount: bashResult.stdout.trim().split('\n').length,
                });

                if (bashResult.success && bashResult.exitCode === 0 && bashResult.stdout.trim()) {
                    const lines = bashResult.stdout.trim().split('\n');
                    const projects: ScannedProject[] = lines
                        .filter(line => line.trim().length > 0)
                        .map(line => {
                            const path = line.trim();
                            return {
                                path,
                                name: path.split('/').pop() || path,
                            };
                        });

                    console.log('[useProjectScanning] Found', projects.length, 'projects');
                    setResult({
                        projects,
                        isScanning: false,
                    });
                } else {
                    // No projects found or command failed
                    console.log('[useProjectScanning] No projects found or scan failed');
                    setResult({
                        projects: [],
                        isScanning: false,
                        error: bashResult.stderr || undefined,
                    });
                }
            } catch (error) {
                if (cancelled) return;

                console.log('[useProjectScanning] Error:', error);
                setResult({
                    projects: [],
                    isScanning: false,
                    error: error instanceof Error ? error.message : 'Scan error',
                });
            }
        };

        scan();

        return () => {
            cancelled = true;
        };
    }, [machineId]);

    return result;
}

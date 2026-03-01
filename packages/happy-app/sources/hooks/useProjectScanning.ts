import { useState, useEffect, useRef } from 'react';

export interface ScannedProject {
    path: string;   // Absolute path, e.g. /home/user/projects/my-app
    name: string;   // Directory name, e.g. my-app
}

interface ProjectScanResult {
    projects: ScannedProject[];
    isScanning: boolean;
    error?: string;
}

type BashFn = (machineId: string, command: string, cwd: string) => Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}>;

/**
 * Scans for git projects on a remote machine's filesystem.
 *
 * NON-BLOCKING: Scanning runs asynchronously. UI shows loading state
 * while scan is in progress, then updates when results arrive.
 *
 * Uses a bash function to run `find` on the remote machine, looking for
 * directories containing .git (up to 4 levels deep from home).
 *
 * NOTE: Does NOT import from @/sync/ops to avoid circular dependency
 * (ops → sync → storage → sync). Caller must pass machineBash as bashFn.
 *
 * @param machineId - The machine to scan (null = no scan)
 * @param bashFn - The bash execution function (machineBash from ops.ts)
 */
export function useProjectScanning(machineId: string | null, bashFn: BashFn): ProjectScanResult {
    const [result, setResult] = useState<ProjectScanResult>({
        projects: [],
        isScanning: false,
    });

    // Stable ref for bashFn to avoid re-triggering effect
    const bashFnRef = useRef(bashFn);
    bashFnRef.current = bashFn;

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
                // Find all .git directories up to 4 levels deep, strip /.git suffix
                // Use home directory as scan root; head -200 to cap results
                const bashResult = await bashFnRef.current(
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

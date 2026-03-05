import type { PermissionMode } from '@/api/types';

export type AutoConfirmMode = 'off' | 'confirm' | 'all';

/**
 * Map Happy permission modes to Droid autonomy levels.
 *
 * Base mapping (permissionMode):
 *   default          → medium
 *   acceptEdits      → medium
 *   plan             → none (read-only)
 *   bypassPermissions → skip-permissions-unsafe
 *   yolo             → skip-permissions-unsafe
 *
 * AutoConfirm escalation (applied on top of base):
 *   off    → no change
 *   confirm → escalate to at least high
 *   all    → skip-permissions-unsafe
 */
export type DroidAutoLevel = 'none' | 'low' | 'medium' | 'high' | 'skip-permissions-unsafe';

const AUTO_LEVEL_ORDER: DroidAutoLevel[] = ['none', 'low', 'medium', 'high', 'skip-permissions-unsafe'];

function maxAutoLevel(a: DroidAutoLevel, b: DroidAutoLevel): DroidAutoLevel {
    return AUTO_LEVEL_ORDER.indexOf(a) >= AUTO_LEVEL_ORDER.indexOf(b) ? a : b;
}

export function mapToDroidAutoLevel(
    mode: PermissionMode | undefined,
    autoConfirmMode: AutoConfirmMode = 'off',
): DroidAutoLevel {
    // Base level from permissionMode
    let base: DroidAutoLevel;
    switch (mode) {
        case 'plan':
            base = 'none';
            break;
        case 'default':
        case 'acceptEdits':
            base = 'medium';
            break;
        case 'bypassPermissions':
        case 'yolo':
            base = 'skip-permissions-unsafe';
            break;
        case 'low' as PermissionMode:
            base = 'low';
            break;
        case 'medium' as PermissionMode:
            base = 'medium';
            break;
        case 'high' as PermissionMode:
            base = 'high';
            break;
        default:
            base = 'none';
            break;
    }

    // Escalate based on autoConfirmMode
    switch (autoConfirmMode) {
        case 'confirm':
            return maxAutoLevel(base, 'high');
        case 'all':
            return 'skip-permissions-unsafe';
        default:
            return base;
    }
}

export function buildDroidAutoArgs(level: DroidAutoLevel): string[] {
    switch (level) {
        case 'none':
            return [];
        case 'skip-permissions-unsafe':
            return ['--skip-permissions-unsafe'];
        default:
            return ['--auto', level];
    }
}

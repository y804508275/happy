import { db } from "@/storage/db";
import { SharedItemVisibility } from "@prisma/client";

/**
 * Check if a user can read a shared item based on its visibility.
 */
export async function canReadSharedItem(
    userId: string,
    item: { authorId: string; visibility: SharedItemVisibility; teamId: string | null }
): Promise<boolean> {
    if (item.visibility === 'public') return true;
    if (item.visibility === 'private') return item.authorId === userId;
    if (item.visibility === 'team' && item.teamId) {
        const membership = await db.teamMember.findUnique({
            where: { teamId_accountId: { teamId: item.teamId, accountId: userId } }
        });
        return !!membership;
    }
    return false;
}

/**
 * Check if a user can write (update/delete) a shared item.
 * Only the author can modify their own items.
 */
export function canWriteSharedItem(
    userId: string,
    item: { authorId: string }
): boolean {
    return item.authorId === userId;
}

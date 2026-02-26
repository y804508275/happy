import { z } from "zod";
import { Fastify } from "../types";
import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { allocateUserSeq } from "@/storage/seq";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import {
    eventRouter,
    buildNewSharedItemUpdate,
    buildUpdateSharedItemUpdate,
    buildDeleteSharedItemUpdate
} from "@/app/events/eventRouter";
import { canReadSharedItem, canWriteSharedItem } from "@/app/shared-item/sharedItemAccess";
import { Prisma } from "@prisma/client";

const SharedItemTypeSchema = z.enum(['skill', 'context']);
const SharedItemVisibilitySchema = z.enum(['private', 'team', 'public']);

const SharedItemResponseSchema = z.object({
    id: z.string(),
    type: SharedItemTypeSchema,
    visibility: SharedItemVisibilitySchema,
    authorId: z.string(),
    teamId: z.string().nullable(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    content: z.string(),
    contentVersion: z.number(),
    meta: z.any().nullable(),
    usageCount: z.number(),
    starCount: z.number(),
    isStarred: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number()
});

const SharedItemSummarySchema = z.object({
    id: z.string(),
    type: SharedItemTypeSchema,
    visibility: SharedItemVisibilitySchema,
    authorId: z.string(),
    teamId: z.string().nullable(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    usageCount: z.number(),
    starCount: z.number(),
    isStarred: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number()
});

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'untitled';
}

export function sharedItemRoutes(app: Fastify) {

    // POST /v1/shared-items - Create shared item
    app.post('/v1/shared-items', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                type: SharedItemTypeSchema,
                visibility: SharedItemVisibilitySchema,
                teamId: z.string().optional(),
                name: z.string().min(1).max(200),
                slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).optional(),
                description: z.string().max(1000).optional(),
                content: z.string().max(100000),
                meta: z.any().optional()
            }),
            response: {
                200: SharedItemResponseSchema,
                400: z.object({ error: z.string() }),
                409: z.object({ error: z.literal('Slug already taken') }),
                500: z.object({ error: z.literal('Failed to create shared item') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { type, visibility, teamId, name, slug: providedSlug, description, content, meta } = request.body;

        try {
            // Validate team visibility
            if (visibility === 'team') {
                if (!teamId) {
                    return reply.code(400).send({ error: 'teamId is required for team visibility' });
                }
                const membership = await db.teamMember.findUnique({
                    where: { teamId_accountId: { teamId, accountId: userId } }
                });
                if (!membership) {
                    return reply.code(400).send({ error: 'You are not a member of this team' });
                }
            }

            const slug = providedSlug || slugify(name);

            // Check slug uniqueness for this author
            const existing = await db.sharedItem.findUnique({
                where: { authorId_slug: { authorId: userId, slug } }
            });
            if (existing) {
                return reply.code(409).send({ error: 'Slug already taken' });
            }

            const item = await db.sharedItem.create({
                data: {
                    type,
                    visibility,
                    authorId: userId,
                    teamId: visibility === 'team' ? teamId : null,
                    name,
                    slug,
                    description: description || null,
                    content,
                    meta: meta || null
                }
            });

            // Emit event
            const updSeq = await allocateUserSeq(userId);
            eventRouter.emitUpdate({
                userId,
                payload: buildNewSharedItemUpdate(item, updSeq, randomKeyNaked(12)),
                recipientFilter: { type: 'user-scoped-only' }
            });

            // If team visibility, also notify team members
            if (visibility === 'team' && teamId) {
                const members = await db.teamMember.findMany({
                    where: { teamId, accountId: { not: userId } },
                    select: { accountId: true }
                });
                for (const member of members) {
                    const memberSeq = await allocateUserSeq(member.accountId);
                    eventRouter.emitUpdate({
                        userId: member.accountId,
                        payload: buildNewSharedItemUpdate(item, memberSeq, randomKeyNaked(12)),
                        recipientFilter: { type: 'user-scoped-only' }
                    });
                }
            }

            return reply.send({
                id: item.id,
                type: item.type as 'skill' | 'context',
                visibility: item.visibility as 'private' | 'team' | 'public',
                authorId: item.authorId,
                teamId: item.teamId,
                name: item.name,
                slug: item.slug,
                description: item.description,
                content: item.content,
                contentVersion: item.contentVersion,
                meta: item.meta,
                usageCount: item.usageCount,
                starCount: item.starCount,
                isStarred: false,
                createdAt: item.createdAt.getTime(),
                updatedAt: item.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to create shared item: ${error}`);
            return reply.code(500).send({ error: 'Failed to create shared item' });
        }
    });

    // GET /v1/shared-items - List shared items
    app.get('/v1/shared-items', {
        preHandler: app.authenticate,
        schema: {
            querystring: z.object({
                type: SharedItemTypeSchema.optional(),
                visibility: SharedItemVisibilitySchema.optional(),
                teamId: z.string().optional(),
                authorId: z.string().optional(),
                limit: z.coerce.number().int().min(1).max(100).default(50),
                cursor: z.string().optional()
            }),
            response: {
                200: z.object({
                    items: z.array(SharedItemSummarySchema),
                    nextCursor: z.string().nullable()
                }),
                500: z.object({ error: z.literal('Failed to list shared items') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { type, visibility, teamId, authorId, limit, cursor } = request.query;

        try {
            // Build where clause based on what the user can see
            const conditions: Prisma.SharedItemWhereInput[] = [];

            // Always include own private items
            conditions.push({ authorId: userId, visibility: 'private' });

            // Include team items for teams user belongs to
            const myTeams = await db.teamMember.findMany({
                where: { accountId: userId },
                select: { teamId: true }
            });
            if (myTeams.length > 0) {
                conditions.push({
                    visibility: 'team',
                    teamId: { in: myTeams.map(t => t.teamId) }
                });
            }

            // Include all public items
            conditions.push({ visibility: 'public' });

            let where: Prisma.SharedItemWhereInput = { OR: conditions };

            // Apply filters
            if (type) where.type = type;
            if (visibility) {
                // Override the OR with a specific visibility filter
                if (visibility === 'private') {
                    where = { authorId: userId, visibility: 'private' };
                } else if (visibility === 'team') {
                    where = {
                        visibility: 'team',
                        teamId: teamId ? teamId : { in: myTeams.map(t => t.teamId) }
                    };
                } else {
                    where = { visibility: 'public' };
                }
                if (type) where.type = type;
            }
            if (authorId) where.authorId = authorId;
            if (teamId && !visibility) where.teamId = teamId;

            if (cursor) {
                where.id = { lt: cursor };
            }

            const items = await db.sharedItem.findMany({
                where,
                select: {
                    id: true, type: true, visibility: true, authorId: true,
                    teamId: true, name: true, slug: true, description: true,
                    usageCount: true, starCount: true, createdAt: true, updatedAt: true,
                    stars: { where: { accountId: userId }, select: { id: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: limit + 1
            });

            const hasMore = items.length > limit;
            const resultItems = hasMore ? items.slice(0, limit) : items;

            return reply.send({
                items: resultItems.map(item => ({
                    id: item.id,
                    type: item.type as 'skill' | 'context',
                    visibility: item.visibility as 'private' | 'team' | 'public',
                    authorId: item.authorId,
                    teamId: item.teamId,
                    name: item.name,
                    slug: item.slug,
                    description: item.description,
                    usageCount: item.usageCount,
                    starCount: item.starCount,
                    isStarred: item.stars.length > 0,
                    createdAt: item.createdAt.getTime(),
                    updatedAt: item.updatedAt.getTime()
                })),
                nextCursor: hasMore ? resultItems[resultItems.length - 1].id : null
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to list shared items: ${error}`);
            return reply.code(500).send({ error: 'Failed to list shared items' });
        }
    });

    // GET /v1/shared-items/search - Search shared items
    app.get('/v1/shared-items/search', {
        preHandler: app.authenticate,
        schema: {
            querystring: z.object({
                q: z.string().min(1).max(200),
                type: SharedItemTypeSchema.optional(),
                limit: z.coerce.number().int().min(1).max(50).default(20)
            }),
            response: {
                200: z.object({ items: z.array(SharedItemSummarySchema) }),
                500: z.object({ error: z.literal('Failed to search shared items') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { q, type, limit } = request.query;

        try {
            const myTeams = await db.teamMember.findMany({
                where: { accountId: userId },
                select: { teamId: true }
            });

            const accessConditions: Prisma.SharedItemWhereInput[] = [
                { authorId: userId, visibility: 'private' },
                { visibility: 'public' }
            ];
            if (myTeams.length > 0) {
                accessConditions.push({
                    visibility: 'team',
                    teamId: { in: myTeams.map(t => t.teamId) }
                });
            }

            const where: Prisma.SharedItemWhereInput = {
                OR: accessConditions,
                AND: {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { slug: { contains: q, mode: 'insensitive' } },
                        { description: { contains: q, mode: 'insensitive' } }
                    ]
                }
            };
            if (type) where.type = type;

            const items = await db.sharedItem.findMany({
                where,
                select: {
                    id: true, type: true, visibility: true, authorId: true,
                    teamId: true, name: true, slug: true, description: true,
                    usageCount: true, starCount: true, createdAt: true, updatedAt: true,
                    stars: { where: { accountId: userId }, select: { id: true } }
                },
                orderBy: { updatedAt: 'desc' },
                take: limit
            });

            return reply.send({
                items: items.map(item => ({
                    id: item.id,
                    type: item.type as 'skill' | 'context',
                    visibility: item.visibility as 'private' | 'team' | 'public',
                    authorId: item.authorId,
                    teamId: item.teamId,
                    name: item.name,
                    slug: item.slug,
                    description: item.description,
                    usageCount: item.usageCount,
                    starCount: item.starCount,
                    isStarred: item.stars.length > 0,
                    createdAt: item.createdAt.getTime(),
                    updatedAt: item.updatedAt.getTime()
                }))
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to search shared items: ${error}`);
            return reply.code(500).send({ error: 'Failed to search shared items' });
        }
    });

    // GET /v1/shared-items/discover - Public discovery feed
    app.get('/v1/shared-items/discover', {
        preHandler: app.authenticate,
        schema: {
            querystring: z.object({
                type: SharedItemTypeSchema.optional(),
                sort: z.enum(['popular', 'recent']).default('popular'),
                limit: z.coerce.number().int().min(1).max(50).default(20),
                cursor: z.string().optional()
            }),
            response: {
                200: z.object({
                    items: z.array(SharedItemSummarySchema),
                    nextCursor: z.string().nullable()
                }),
                500: z.object({ error: z.literal('Failed to discover shared items') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { type, sort, limit, cursor } = request.query;

        try {
            const where: Prisma.SharedItemWhereInput = { visibility: 'public' };
            if (type) where.type = type;
            if (cursor) where.id = { lt: cursor };

            const orderBy: Prisma.SharedItemOrderByWithRelationInput = sort === 'popular'
                ? { starCount: 'desc' }
                : { createdAt: 'desc' };

            const items = await db.sharedItem.findMany({
                where,
                select: {
                    id: true, type: true, visibility: true, authorId: true,
                    teamId: true, name: true, slug: true, description: true,
                    usageCount: true, starCount: true, createdAt: true, updatedAt: true,
                    stars: { where: { accountId: userId }, select: { id: true } }
                },
                orderBy,
                take: limit + 1
            });

            const hasMore = items.length > limit;
            const resultItems = hasMore ? items.slice(0, limit) : items;

            return reply.send({
                items: resultItems.map(item => ({
                    id: item.id,
                    type: item.type as 'skill' | 'context',
                    visibility: item.visibility as 'private' | 'team' | 'public',
                    authorId: item.authorId,
                    teamId: item.teamId,
                    name: item.name,
                    slug: item.slug,
                    description: item.description,
                    usageCount: item.usageCount,
                    starCount: item.starCount,
                    isStarred: item.stars.length > 0,
                    createdAt: item.createdAt.getTime(),
                    updatedAt: item.updatedAt.getTime()
                })),
                nextCursor: hasMore ? resultItems[resultItems.length - 1].id : null
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to discover shared items: ${error}`);
            return reply.code(500).send({ error: 'Failed to discover shared items' });
        }
    });

    // GET /v1/shared-items/:id - Get single shared item
    app.get('/v1/shared-items/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            response: {
                200: SharedItemResponseSchema,
                403: z.object({ error: z.literal('Access denied') }),
                404: z.object({ error: z.literal('Shared item not found') }),
                500: z.object({ error: z.literal('Failed to get shared item') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const item = await db.sharedItem.findUnique({
                where: { id },
                include: {
                    stars: { where: { accountId: userId }, select: { id: true } }
                }
            });

            if (!item) {
                return reply.code(404).send({ error: 'Shared item not found' });
            }

            if (!await canReadSharedItem(userId, item)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            return reply.send({
                id: item.id,
                type: item.type as 'skill' | 'context',
                visibility: item.visibility as 'private' | 'team' | 'public',
                authorId: item.authorId,
                teamId: item.teamId,
                name: item.name,
                slug: item.slug,
                description: item.description,
                content: item.content,
                contentVersion: item.contentVersion,
                meta: item.meta,
                usageCount: item.usageCount,
                starCount: item.starCount,
                isStarred: item.stars.length > 0,
                createdAt: item.createdAt.getTime(),
                updatedAt: item.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get shared item: ${error}`);
            return reply.code(500).send({ error: 'Failed to get shared item' });
        }
    });

    // POST /v1/shared-items/:id - Update shared item
    app.post('/v1/shared-items/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            body: z.object({
                name: z.string().min(1).max(200).optional(),
                description: z.string().max(1000).nullable().optional(),
                content: z.string().max(100000).optional(),
                expectedContentVersion: z.number().int().min(0).optional(),
                visibility: SharedItemVisibilitySchema.optional(),
                teamId: z.string().optional(),
                meta: z.any().optional()
            }),
            response: {
                200: z.union([
                    z.object({ success: z.literal(true), contentVersion: z.number() }),
                    z.object({
                        success: z.literal(false),
                        error: z.literal('version-mismatch'),
                        currentContentVersion: z.number()
                    })
                ]),
                400: z.object({ error: z.string() }),
                403: z.object({ error: z.literal('Access denied') }),
                404: z.object({ error: z.literal('Shared item not found') }),
                500: z.object({ error: z.literal('Failed to update shared item') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;
        const { name, description, content, expectedContentVersion, visibility, teamId, meta } = request.body;

        try {
            const item = await db.sharedItem.findUnique({ where: { id } });

            if (!item) {
                return reply.code(404).send({ error: 'Shared item not found' });
            }
            if (!canWriteSharedItem(userId, item)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            // Version check for content
            if (content !== undefined && expectedContentVersion !== undefined) {
                if (item.contentVersion !== expectedContentVersion) {
                    return reply.send({
                        success: false,
                        error: 'version-mismatch',
                        currentContentVersion: item.contentVersion
                    });
                }
            }

            const updateData: any = {};
            if (name !== undefined) updateData.name = name;
            if (description !== undefined) updateData.description = description;
            if (content !== undefined && expectedContentVersion !== undefined) {
                updateData.content = content;
                updateData.contentVersion = expectedContentVersion + 1;
            }
            if (visibility !== undefined) {
                updateData.visibility = visibility;
                if (visibility === 'team') {
                    if (!teamId) {
                        return reply.code(400).send({ error: 'teamId required for team visibility' });
                    }
                    updateData.teamId = teamId;
                } else {
                    updateData.teamId = null;
                }
            }
            if (meta !== undefined) updateData.meta = meta;
            updateData.seq = item.seq + 1;

            await db.sharedItem.update({ where: { id }, data: updateData });

            // Build update notification
            const updates: any = {};
            if (name !== undefined) updates.name = name;
            if (description !== undefined) updates.description = description;
            if (content !== undefined && expectedContentVersion !== undefined) {
                updates.content = { value: content, version: expectedContentVersion + 1 };
            }

            // Emit to author
            const updSeq = await allocateUserSeq(userId);
            eventRouter.emitUpdate({
                userId,
                payload: buildUpdateSharedItemUpdate(id, updSeq, randomKeyNaked(12), updates),
                recipientFilter: { type: 'user-scoped-only' }
            });

            // If team item, notify team members
            const effectiveTeamId = updateData.teamId !== undefined ? updateData.teamId : item.teamId;
            const effectiveVisibility = updateData.visibility || item.visibility;
            if (effectiveVisibility === 'team' && effectiveTeamId) {
                const members = await db.teamMember.findMany({
                    where: { teamId: effectiveTeamId, accountId: { not: userId } },
                    select: { accountId: true }
                });
                for (const member of members) {
                    const memberSeq = await allocateUserSeq(member.accountId);
                    eventRouter.emitUpdate({
                        userId: member.accountId,
                        payload: buildUpdateSharedItemUpdate(id, memberSeq, randomKeyNaked(12), updates),
                        recipientFilter: { type: 'user-scoped-only' }
                    });
                }
            }

            return reply.send({
                success: true,
                contentVersion: updateData.contentVersion || item.contentVersion
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to update shared item: ${error}`);
            return reply.code(500).send({ error: 'Failed to update shared item' });
        }
    });

    // DELETE /v1/shared-items/:id - Delete shared item
    app.delete('/v1/shared-items/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            response: {
                200: z.object({ success: z.literal(true) }),
                403: z.object({ error: z.literal('Access denied') }),
                404: z.object({ error: z.literal('Shared item not found') }),
                500: z.object({ error: z.literal('Failed to delete shared item') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const item = await db.sharedItem.findUnique({ where: { id } });

            if (!item) {
                return reply.code(404).send({ error: 'Shared item not found' });
            }
            if (!canWriteSharedItem(userId, item)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            await db.sharedItem.delete({ where: { id } });

            // Emit to author
            const updSeq = await allocateUserSeq(userId);
            eventRouter.emitUpdate({
                userId,
                payload: buildDeleteSharedItemUpdate(id, updSeq, randomKeyNaked(12)),
                recipientFilter: { type: 'user-scoped-only' }
            });

            // Notify team members if team item
            if (item.visibility === 'team' && item.teamId) {
                const members = await db.teamMember.findMany({
                    where: { teamId: item.teamId, accountId: { not: userId } },
                    select: { accountId: true }
                });
                for (const member of members) {
                    const memberSeq = await allocateUserSeq(member.accountId);
                    eventRouter.emitUpdate({
                        userId: member.accountId,
                        payload: buildDeleteSharedItemUpdate(id, memberSeq, randomKeyNaked(12)),
                        recipientFilter: { type: 'user-scoped-only' }
                    });
                }
            }

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to delete shared item: ${error}`);
            return reply.code(500).send({ error: 'Failed to delete shared item' });
        }
    });

    // POST /v1/shared-items/:id/star - Toggle star
    app.post('/v1/shared-items/:id/star', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            response: {
                200: z.object({ starred: z.boolean(), starCount: z.number() }),
                403: z.object({ error: z.literal('Access denied') }),
                404: z.object({ error: z.literal('Shared item not found') }),
                500: z.object({ error: z.literal('Failed to toggle star') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const item = await db.sharedItem.findUnique({ where: { id } });

            if (!item) {
                return reply.code(404).send({ error: 'Shared item not found' });
            }
            if (!await canReadSharedItem(userId, item)) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            const existingStar = await db.sharedItemStar.findUnique({
                where: { sharedItemId_accountId: { sharedItemId: id, accountId: userId } }
            });

            if (existingStar) {
                // Unstar
                await db.sharedItemStar.delete({
                    where: { sharedItemId_accountId: { sharedItemId: id, accountId: userId } }
                });
                await db.sharedItem.update({
                    where: { id },
                    data: { starCount: { decrement: 1 } }
                });
                return reply.send({ starred: false, starCount: Math.max(0, item.starCount - 1) });
            } else {
                // Star
                await db.sharedItemStar.create({
                    data: { sharedItemId: id, accountId: userId }
                });
                await db.sharedItem.update({
                    where: { id },
                    data: { starCount: { increment: 1 } }
                });
                return reply.send({ starred: true, starCount: item.starCount + 1 });
            }
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to toggle star: ${error}`);
            return reply.code(500).send({ error: 'Failed to toggle star' });
        }
    });
}

import { z } from "zod";
import { Fastify } from "../types";
import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { allocateUserSeq } from "@/storage/seq";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { eventRouter, buildSessionSharedItemRefUpdate } from "@/app/events/eventRouter";
import { canReadSharedItem } from "@/app/shared-item/sharedItemAccess";

export function sessionSharedItemRoutes(app: Fastify) {

    // POST /v1/sessions/:sessionId/shared-items - Attach shared item(s) to session
    app.post('/v1/sessions/:sessionId/shared-items', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ sessionId: z.string() }),
            body: z.object({
                itemIds: z.array(z.string()).min(1).max(20)
            }),
            response: {
                200: z.object({
                    added: z.array(z.string()),
                    skipped: z.array(z.string())
                }),
                404: z.object({ error: z.literal('Session not found') }),
                500: z.object({ error: z.literal('Failed to attach shared items') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.params;
        const { itemIds } = request.body;

        try {
            // Verify session ownership
            const session = await db.session.findFirst({
                where: { id: sessionId, accountId: userId }
            });
            if (!session) {
                return reply.code(404).send({ error: 'Session not found' });
            }

            const added: string[] = [];
            const skipped: string[] = [];

            for (const itemId of itemIds) {
                // Check item exists and user has access
                const item = await db.sharedItem.findUnique({ where: { id: itemId } });
                if (!item || !await canReadSharedItem(userId, item)) {
                    skipped.push(itemId);
                    continue;
                }

                // Check if already attached
                const existing = await db.sessionSharedItemRef.findUnique({
                    where: { sessionId_sharedItemId: { sessionId, sharedItemId: itemId } }
                });
                if (existing) {
                    skipped.push(itemId);
                    continue;
                }

                await db.sessionSharedItemRef.create({
                    data: {
                        sessionId,
                        sharedItemId: itemId,
                        addedById: userId
                    }
                });

                // Increment usage count
                await db.sharedItem.update({
                    where: { id: itemId },
                    data: { usageCount: { increment: 1 } }
                });

                added.push(itemId);

                // Emit event
                const updSeq = await allocateUserSeq(userId);
                eventRouter.emitUpdate({
                    userId,
                    payload: buildSessionSharedItemRefUpdate(sessionId, itemId, 'added', updSeq, randomKeyNaked(12)),
                    recipientFilter: { type: 'all-interested-in-session', sessionId }
                });
            }

            return reply.send({ added, skipped });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to attach shared items: ${error}`);
            return reply.code(500).send({ error: 'Failed to attach shared items' });
        }
    });

    // DELETE /v1/sessions/:sessionId/shared-items/:itemId - Detach shared item
    app.delete('/v1/sessions/:sessionId/shared-items/:itemId', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ sessionId: z.string(), itemId: z.string() }),
            response: {
                200: z.object({ success: z.literal(true) }),
                404: z.object({ error: z.literal('Reference not found') }),
                500: z.object({ error: z.literal('Failed to detach shared item') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId, itemId } = request.params;

        try {
            // Verify session ownership
            const session = await db.session.findFirst({
                where: { id: sessionId, accountId: userId }
            });
            if (!session) {
                return reply.code(404).send({ error: 'Reference not found' });
            }

            const ref = await db.sessionSharedItemRef.findUnique({
                where: { sessionId_sharedItemId: { sessionId, sharedItemId: itemId } }
            });
            if (!ref) {
                return reply.code(404).send({ error: 'Reference not found' });
            }

            await db.sessionSharedItemRef.delete({
                where: { sessionId_sharedItemId: { sessionId, sharedItemId: itemId } }
            });

            // Emit event
            const updSeq = await allocateUserSeq(userId);
            eventRouter.emitUpdate({
                userId,
                payload: buildSessionSharedItemRefUpdate(sessionId, itemId, 'removed', updSeq, randomKeyNaked(12)),
                recipientFilter: { type: 'all-interested-in-session', sessionId }
            });

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to detach shared item: ${error}`);
            return reply.code(500).send({ error: 'Failed to detach shared item' });
        }
    });

    // GET /v1/sessions/:sessionId/shared-items - List active shared items for session
    app.get('/v1/sessions/:sessionId/shared-items', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ sessionId: z.string() }),
            response: {
                200: z.object({
                    items: z.array(z.object({
                        id: z.string(),
                        type: z.enum(['skill', 'context']),
                        name: z.string(),
                        slug: z.string(),
                        description: z.string().nullable(),
                        authorId: z.string(),
                        addedAt: z.number()
                    }))
                }),
                404: z.object({ error: z.literal('Session not found') }),
                500: z.object({ error: z.literal('Failed to list session shared items') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.params;

        try {
            const session = await db.session.findFirst({
                where: { id: sessionId, accountId: userId }
            });
            if (!session) {
                return reply.code(404).send({ error: 'Session not found' });
            }

            const refs = await db.sessionSharedItemRef.findMany({
                where: { sessionId },
                include: {
                    sharedItem: {
                        select: {
                            id: true, type: true, name: true, slug: true,
                            description: true, authorId: true
                        }
                    }
                },
                orderBy: { createdAt: 'asc' }
            });

            return reply.send({
                items: refs.map(ref => ({
                    id: ref.sharedItem.id,
                    type: ref.sharedItem.type as 'skill' | 'context',
                    name: ref.sharedItem.name,
                    slug: ref.sharedItem.slug,
                    description: ref.sharedItem.description,
                    authorId: ref.sharedItem.authorId,
                    addedAt: ref.createdAt.getTime()
                }))
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to list session shared items: ${error}`);
            return reply.code(500).send({ error: 'Failed to list session shared items' });
        }
    });

    // GET /v1/sessions/:sessionId/shared-items/content - Get full content for injection
    app.get('/v1/sessions/:sessionId/shared-items/content', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ sessionId: z.string() }),
            response: {
                200: z.object({
                    items: z.array(z.object({
                        id: z.string(),
                        type: z.enum(['skill', 'context']),
                        name: z.string(),
                        slug: z.string(),
                        content: z.string()
                    }))
                }),
                404: z.object({ error: z.literal('Session not found') }),
                500: z.object({ error: z.literal('Failed to get shared items content') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.params;

        try {
            const session = await db.session.findFirst({
                where: { id: sessionId, accountId: userId }
            });
            if (!session) {
                return reply.code(404).send({ error: 'Session not found' });
            }

            const refs = await db.sessionSharedItemRef.findMany({
                where: { sessionId },
                include: {
                    sharedItem: {
                        select: {
                            id: true, type: true, name: true, slug: true, content: true
                        }
                    }
                },
                orderBy: { createdAt: 'asc' }
            });

            return reply.send({
                items: refs.map(ref => ({
                    id: ref.sharedItem.id,
                    type: ref.sharedItem.type as 'skill' | 'context',
                    name: ref.sharedItem.name,
                    slug: ref.sharedItem.slug,
                    content: ref.sharedItem.content
                }))
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get shared items content: ${error}`);
            return reply.code(500).send({ error: 'Failed to get shared items content' });
        }
    });
}

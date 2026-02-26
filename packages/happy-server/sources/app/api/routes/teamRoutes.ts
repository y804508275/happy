import { z } from "zod";
import { Fastify } from "../types";
import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { allocateUserSeq } from "@/storage/seq";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import {
    eventRouter,
    buildNewTeamUpdate,
    buildUpdateTeamUpdate,
    buildDeleteTeamUpdate,
    buildTeamMembershipUpdate
} from "@/app/events/eventRouter";

const TeamRoleSchema = z.enum(['owner', 'admin', 'member']);

const TeamMemberSchema = z.object({
    id: z.string(),
    accountId: z.string(),
    username: z.string().nullable(),
    firstName: z.string().nullable(),
    role: TeamRoleSchema,
    createdAt: z.number()
});

const TeamSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    myRole: TeamRoleSchema,
    memberCount: z.number(),
    createdAt: z.number(),
    updatedAt: z.number()
});

export function teamRoutes(app: Fastify) {

    // POST /v1/teams - Create team
    app.post('/v1/teams', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                name: z.string().min(1).max(100),
                description: z.string().max(500).optional()
            }),
            response: {
                200: TeamSchema,
                500: z.object({ error: z.literal('Failed to create team') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { name, description } = request.body;

        try {
            const team = await db.team.create({
                data: {
                    name,
                    description: description || null,
                    createdById: userId,
                    members: {
                        create: {
                            accountId: userId,
                            role: 'owner'
                        }
                    }
                },
                include: {
                    _count: { select: { members: true } }
                }
            });

            // Emit event
            const updSeq = await allocateUserSeq(userId);
            eventRouter.emitUpdate({
                userId,
                payload: buildNewTeamUpdate(team, updSeq, randomKeyNaked(12)),
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                id: team.id,
                name: team.name,
                description: team.description,
                myRole: 'owner' as const,
                memberCount: team._count.members,
                createdAt: team.createdAt.getTime(),
                updatedAt: team.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to create team: ${error}`);
            return reply.code(500).send({ error: 'Failed to create team' });
        }
    });

    // GET /v1/teams - List user's teams
    app.get('/v1/teams', {
        preHandler: app.authenticate,
        schema: {
            response: {
                200: z.object({ teams: z.array(TeamSchema) }),
                500: z.object({ error: z.literal('Failed to list teams') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;

        try {
            const memberships = await db.teamMember.findMany({
                where: { accountId: userId },
                include: {
                    team: {
                        include: { _count: { select: { members: true } } }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            const teams = memberships.map(m => ({
                id: m.team.id,
                name: m.team.name,
                description: m.team.description,
                myRole: m.role as 'owner' | 'admin' | 'member',
                memberCount: m.team._count.members,
                createdAt: m.team.createdAt.getTime(),
                updatedAt: m.team.updatedAt.getTime()
            }));

            return reply.send({ teams });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to list teams: ${error}`);
            return reply.code(500).send({ error: 'Failed to list teams' });
        }
    });

    // GET /v1/teams/:id - Get team details with members
    app.get('/v1/teams/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            response: {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
                    description: z.string().nullable(),
                    myRole: TeamRoleSchema,
                    members: z.array(TeamMemberSchema),
                    createdAt: z.number(),
                    updatedAt: z.number()
                }),
                403: z.object({ error: z.literal('Not a team member') }),
                404: z.object({ error: z.literal('Team not found') }),
                500: z.object({ error: z.literal('Failed to get team') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const team = await db.team.findUnique({
                where: { id },
                include: {
                    members: {
                        include: {
                            account: {
                                select: { id: true, username: true, firstName: true }
                            }
                        },
                        orderBy: { createdAt: 'asc' }
                    }
                }
            });

            if (!team) {
                return reply.code(404).send({ error: 'Team not found' });
            }

            const myMembership = team.members.find(m => m.accountId === userId);
            if (!myMembership) {
                return reply.code(403).send({ error: 'Not a team member' });
            }

            return reply.send({
                id: team.id,
                name: team.name,
                description: team.description,
                myRole: myMembership.role as 'owner' | 'admin' | 'member',
                members: team.members.map(m => ({
                    id: m.id,
                    accountId: m.account.id,
                    username: m.account.username,
                    firstName: m.account.firstName,
                    role: m.role as 'owner' | 'admin' | 'member',
                    createdAt: m.createdAt.getTime()
                })),
                createdAt: team.createdAt.getTime(),
                updatedAt: team.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get team: ${error}`);
            return reply.code(500).send({ error: 'Failed to get team' });
        }
    });

    // POST /v1/teams/:id - Update team
    app.post('/v1/teams/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            body: z.object({
                name: z.string().min(1).max(100).optional(),
                description: z.string().max(500).nullable().optional()
            }),
            response: {
                200: z.object({ success: z.literal(true) }),
                403: z.object({ error: z.literal('Insufficient permissions') }),
                404: z.object({ error: z.literal('Team not found') }),
                500: z.object({ error: z.literal('Failed to update team') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;
        const { name, description } = request.body;

        try {
            const membership = await db.teamMember.findUnique({
                where: { teamId_accountId: { teamId: id, accountId: userId } }
            });

            if (!membership) {
                return reply.code(404).send({ error: 'Team not found' });
            }
            if (membership.role !== 'owner' && membership.role !== 'admin') {
                return reply.code(403).send({ error: 'Insufficient permissions' });
            }

            const updateData: any = {};
            if (name !== undefined) updateData.name = name;
            if (description !== undefined) updateData.description = description;

            await db.team.update({
                where: { id },
                data: updateData
            });

            // Emit to all team members
            const members = await db.teamMember.findMany({
                where: { teamId: id },
                select: { accountId: true }
            });
            for (const member of members) {
                const updSeq = await allocateUserSeq(member.accountId);
                eventRouter.emitUpdate({
                    userId: member.accountId,
                    payload: buildUpdateTeamUpdate(id, updSeq, randomKeyNaked(12), { name, description }),
                    recipientFilter: { type: 'user-scoped-only' }
                });
            }

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to update team: ${error}`);
            return reply.code(500).send({ error: 'Failed to update team' });
        }
    });

    // DELETE /v1/teams/:id - Delete team (owner only)
    app.delete('/v1/teams/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            response: {
                200: z.object({ success: z.literal(true) }),
                403: z.object({ error: z.literal('Only the owner can delete a team') }),
                404: z.object({ error: z.literal('Team not found') }),
                500: z.object({ error: z.literal('Failed to delete team') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const membership = await db.teamMember.findUnique({
                where: { teamId_accountId: { teamId: id, accountId: userId } }
            });

            if (!membership) {
                return reply.code(404).send({ error: 'Team not found' });
            }
            if (membership.role !== 'owner') {
                return reply.code(403).send({ error: 'Only the owner can delete a team' });
            }

            // Get members before deletion for notification
            const members = await db.teamMember.findMany({
                where: { teamId: id },
                select: { accountId: true }
            });

            await db.team.delete({ where: { id } });

            // Notify all members
            for (const member of members) {
                const updSeq = await allocateUserSeq(member.accountId);
                eventRouter.emitUpdate({
                    userId: member.accountId,
                    payload: buildDeleteTeamUpdate(id, updSeq, randomKeyNaked(12)),
                    recipientFilter: { type: 'user-scoped-only' }
                });
            }

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to delete team: ${error}`);
            return reply.code(500).send({ error: 'Failed to delete team' });
        }
    });

    // POST /v1/teams/:id/members - Add member (admin+)
    app.post('/v1/teams/:id/members', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string() }),
            body: z.object({
                accountId: z.string(),
                role: TeamRoleSchema.optional().default('member')
            }),
            response: {
                200: z.object({ success: z.literal(true) }),
                403: z.object({ error: z.literal('Insufficient permissions') }),
                404: z.object({ error: z.literal('Team not found') }),
                409: z.object({ error: z.literal('User is already a member') }),
                500: z.object({ error: z.literal('Failed to add member') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;
        const { accountId, role } = request.body;

        try {
            const myMembership = await db.teamMember.findUnique({
                where: { teamId_accountId: { teamId: id, accountId: userId } }
            });

            if (!myMembership) {
                return reply.code(404).send({ error: 'Team not found' });
            }
            if (myMembership.role !== 'owner' && myMembership.role !== 'admin') {
                return reply.code(403).send({ error: 'Insufficient permissions' });
            }

            // Cannot add someone as owner
            const effectiveRole = role === 'owner' ? 'admin' : role;

            const existing = await db.teamMember.findUnique({
                where: { teamId_accountId: { teamId: id, accountId } }
            });
            if (existing) {
                return reply.code(409).send({ error: 'User is already a member' });
            }

            await db.teamMember.create({
                data: { teamId: id, accountId, role: effectiveRole }
            });

            // Notify the added user
            const updSeq = await allocateUserSeq(accountId);
            eventRouter.emitUpdate({
                userId: accountId,
                payload: buildTeamMembershipUpdate(id, accountId, 'added', updSeq, randomKeyNaked(12), effectiveRole),
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to add member: ${error}`);
            return reply.code(500).send({ error: 'Failed to add member' });
        }
    });

    // DELETE /v1/teams/:id/members/:uid - Remove member
    app.delete('/v1/teams/:id/members/:uid', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string(), uid: z.string() }),
            response: {
                200: z.object({ success: z.literal(true) }),
                403: z.object({ error: z.literal('Insufficient permissions') }),
                404: z.object({ error: z.literal('Team or member not found') }),
                500: z.object({ error: z.literal('Failed to remove member') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id, uid } = request.params;

        try {
            const myMembership = await db.teamMember.findUnique({
                where: { teamId_accountId: { teamId: id, accountId: userId } }
            });

            if (!myMembership) {
                return reply.code(404).send({ error: 'Team or member not found' });
            }

            // Self-leave is always allowed (except owner)
            const isSelfLeave = uid === userId;
            if (isSelfLeave && myMembership.role === 'owner') {
                return reply.code(403).send({ error: 'Insufficient permissions' });
            }

            // Removing others requires admin+
            if (!isSelfLeave && myMembership.role !== 'owner' && myMembership.role !== 'admin') {
                return reply.code(403).send({ error: 'Insufficient permissions' });
            }

            const targetMembership = await db.teamMember.findUnique({
                where: { teamId_accountId: { teamId: id, accountId: uid } }
            });
            if (!targetMembership) {
                return reply.code(404).send({ error: 'Team or member not found' });
            }

            // Admins cannot remove owners
            if (myMembership.role === 'admin' && targetMembership.role === 'owner') {
                return reply.code(403).send({ error: 'Insufficient permissions' });
            }

            await db.teamMember.delete({
                where: { teamId_accountId: { teamId: id, accountId: uid } }
            });

            // Notify the removed user
            const updSeq = await allocateUserSeq(uid);
            eventRouter.emitUpdate({
                userId: uid,
                payload: buildTeamMembershipUpdate(id, uid, 'removed', updSeq, randomKeyNaked(12)),
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to remove member: ${error}`);
            return reply.code(500).send({ error: 'Failed to remove member' });
        }
    });

    // POST /v1/teams/:id/members/:uid/role - Change member role (owner only)
    app.post('/v1/teams/:id/members/:uid/role', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: z.string(), uid: z.string() }),
            body: z.object({ role: TeamRoleSchema }),
            response: {
                200: z.object({ success: z.literal(true) }),
                403: z.object({ error: z.literal('Only the owner can change roles') }),
                404: z.object({ error: z.literal('Team or member not found') }),
                500: z.object({ error: z.literal('Failed to change role') })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id, uid } = request.params;
        const { role } = request.body;

        try {
            const myMembership = await db.teamMember.findUnique({
                where: { teamId_accountId: { teamId: id, accountId: userId } }
            });

            if (!myMembership) {
                return reply.code(404).send({ error: 'Team or member not found' });
            }
            if (myMembership.role !== 'owner') {
                return reply.code(403).send({ error: 'Only the owner can change roles' });
            }

            // Cannot change own role
            if (uid === userId) {
                return reply.code(403).send({ error: 'Only the owner can change roles' });
            }

            const targetMembership = await db.teamMember.findUnique({
                where: { teamId_accountId: { teamId: id, accountId: uid } }
            });
            if (!targetMembership) {
                return reply.code(404).send({ error: 'Team or member not found' });
            }

            // Cannot promote to owner via this endpoint
            const effectiveRole = role === 'owner' ? 'admin' : role;

            await db.teamMember.update({
                where: { teamId_accountId: { teamId: id, accountId: uid } },
                data: { role: effectiveRole }
            });

            // Notify the user whose role changed
            const updSeq = await allocateUserSeq(uid);
            eventRouter.emitUpdate({
                userId: uid,
                payload: buildTeamMembershipUpdate(id, uid, 'role-changed', updSeq, randomKeyNaked(12), effectiveRole),
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to change role: ${error}`);
            return reply.code(500).send({ error: 'Failed to change role' });
        }
    });
}

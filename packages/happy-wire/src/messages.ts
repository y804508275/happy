import * as z from 'zod';
import { sessionEnvelopeSchema } from './sessionProtocol';
import { MessageMetaSchema, type MessageMeta } from './messageMeta';
import { AgentMessageSchema, UserMessageSchema } from './legacyProtocol';

export const SessionMessageContentSchema = z.object({
  c: z.string(),
  t: z.literal('encrypted'),
});
export type SessionMessageContent = z.infer<typeof SessionMessageContentSchema>;

export const SessionMessageSchema = z.object({
  id: z.string(),
  seq: z.number(),
  localId: z.string().nullish(),
  content: SessionMessageContentSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SessionMessage = z.infer<typeof SessionMessageSchema>;
export { MessageMetaSchema };
export type { MessageMeta };

export const SessionProtocolMessageSchema = z.object({
  role: z.literal('session'),
  content: sessionEnvelopeSchema,
  meta: MessageMetaSchema.optional(),
});
export type SessionProtocolMessage = z.infer<typeof SessionProtocolMessageSchema>;

export const MessageContentSchema = z.discriminatedUnion('role', [
  UserMessageSchema,
  AgentMessageSchema,
  SessionProtocolMessageSchema,
]);
export type MessageContent = z.infer<typeof MessageContentSchema>;

export const VersionedEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string(),
});
export type VersionedEncryptedValue = z.infer<typeof VersionedEncryptedValueSchema>;

export const VersionedNullableEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string().nullable(),
});
export type VersionedNullableEncryptedValue = z.infer<typeof VersionedNullableEncryptedValueSchema>;

export const UpdateNewMessageBodySchema = z.object({
  t: z.literal('new-message'),
  sid: z.string(),
  message: SessionMessageSchema,
});
export type UpdateNewMessageBody = z.infer<typeof UpdateNewMessageBodySchema>;

export const UpdateSessionBodySchema = z.object({
  t: z.literal('update-session'),
  id: z.string(),
  metadata: VersionedEncryptedValueSchema.nullish(),
  agentState: VersionedNullableEncryptedValueSchema.nullish(),
});
export type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>;

export const VersionedMachineEncryptedValueSchema = z.object({
  version: z.number(),
  value: z.string(),
});
export type VersionedMachineEncryptedValue = z.infer<typeof VersionedMachineEncryptedValueSchema>;

export const UpdateMachineBodySchema = z.object({
  t: z.literal('update-machine'),
  machineId: z.string(),
  metadata: VersionedMachineEncryptedValueSchema.nullish(),
  daemonState: VersionedMachineEncryptedValueSchema.nullish(),
  active: z.boolean().optional(),
  activeAt: z.number().optional(),
});
export type UpdateMachineBody = z.infer<typeof UpdateMachineBodySchema>;

// === Shared Items & Teams ===

export const UpdateNewSharedItemBodySchema = z.object({
  t: z.literal('new-shared-item'),
  itemId: z.string(),
  itemType: z.enum(['skill', 'context']),
  visibility: z.enum(['private', 'team', 'public']),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  authorId: z.string(),
  teamId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type UpdateNewSharedItemBody = z.infer<typeof UpdateNewSharedItemBodySchema>;

export const UpdateSharedItemBodySchema = z.object({
  t: z.literal('update-shared-item'),
  itemId: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  content: z.object({ value: z.string(), version: z.number() }).optional(),
});
export type UpdateSharedItemBody = z.infer<typeof UpdateSharedItemBodySchema>;

export const DeleteSharedItemBodySchema = z.object({
  t: z.literal('delete-shared-item'),
  itemId: z.string(),
});
export type DeleteSharedItemBody = z.infer<typeof DeleteSharedItemBodySchema>;

export const SessionSharedItemRefBodySchema = z.object({
  t: z.literal('session-shared-item-ref'),
  sessionId: z.string(),
  itemId: z.string(),
  action: z.enum(['added', 'removed']),
});
export type SessionSharedItemRefBody = z.infer<typeof SessionSharedItemRefBodySchema>;

export const NewTeamBodySchema = z.object({
  t: z.literal('new-team'),
  teamId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.number(),
});
export type NewTeamBody = z.infer<typeof NewTeamBodySchema>;

export const UpdateTeamBodySchema = z.object({
  t: z.literal('update-team'),
  teamId: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
});
export type UpdateTeamBody = z.infer<typeof UpdateTeamBodySchema>;

export const DeleteTeamBodySchema = z.object({
  t: z.literal('delete-team'),
  teamId: z.string(),
});
export type DeleteTeamBody = z.infer<typeof DeleteTeamBodySchema>;

export const TeamMembershipBodySchema = z.object({
  t: z.literal('team-membership'),
  teamId: z.string(),
  accountId: z.string(),
  action: z.enum(['added', 'removed', 'role-changed']),
  role: z.enum(['owner', 'admin', 'member']).optional(),
});
export type TeamMembershipBody = z.infer<typeof TeamMembershipBodySchema>;

export const CoreUpdateBodySchema = z.discriminatedUnion('t', [
  UpdateNewMessageBodySchema,
  UpdateSessionBodySchema,
  UpdateMachineBodySchema,
  UpdateNewSharedItemBodySchema,
  UpdateSharedItemBodySchema,
  DeleteSharedItemBodySchema,
  SessionSharedItemRefBodySchema,
  NewTeamBodySchema,
  UpdateTeamBodySchema,
  DeleteTeamBodySchema,
  TeamMembershipBodySchema,
]);
export type CoreUpdateBody = z.infer<typeof CoreUpdateBodySchema>;

export const CoreUpdateContainerSchema = z.object({
  id: z.string(),
  seq: z.number(),
  body: CoreUpdateBodySchema,
  createdAt: z.number(),
});
export type CoreUpdateContainer = z.infer<typeof CoreUpdateContainerSchema>;

// Aliases used by existing consumers during migration.
export const ApiMessageSchema = SessionMessageSchema;
export type ApiMessage = SessionMessage;

export const ApiUpdateNewMessageSchema = UpdateNewMessageBodySchema;
export type ApiUpdateNewMessage = UpdateNewMessageBody;

export const ApiUpdateSessionStateSchema = UpdateSessionBodySchema;
export type ApiUpdateSessionState = UpdateSessionBody;

export const ApiUpdateMachineStateSchema = UpdateMachineBodySchema;
export type ApiUpdateMachineState = UpdateMachineBody;

export const UpdateBodySchema = UpdateNewMessageBodySchema;
export type UpdateBody = UpdateNewMessageBody;

export const UpdateSchema = CoreUpdateContainerSchema;
export type Update = CoreUpdateContainer;

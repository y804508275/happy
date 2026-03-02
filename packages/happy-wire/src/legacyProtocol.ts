import * as z from 'zod';
import { MessageMetaSchema } from './messageMeta';

const UserTextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const UserImageContentSchema = z.object({
  type: z.literal('image'),
  source: z.object({
    type: z.literal('base64'),
    media_type: z.string(),
    data: z.string(),
  }),
});

const UserDocumentContentSchema = z.object({
  type: z.literal('document'),
  source: z.object({
    type: z.literal('base64'),
    media_type: z.string(),
    data: z.string(),
  }),
});

const UserContentBlockSchema = z.union([UserTextContentSchema, UserImageContentSchema, UserDocumentContentSchema]);

export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([
    // Legacy format: single text object (backward compatible)
    z.object({ type: z.literal('text'), text: z.string() }),
    // New format: array of content blocks (text + images)
    z.array(UserContentBlockSchema),
  ]),
  localKey: z.string().optional(),
  meta: MessageMetaSchema.optional(),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

export const AgentMessageSchema = z.object({
  role: z.literal('agent'),
  content: z
    .object({
      type: z.string(),
    })
    .passthrough(),
  meta: MessageMetaSchema.optional(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const LegacyMessageContentSchema = z.discriminatedUnion('role', [UserMessageSchema, AgentMessageSchema]);
export type LegacyMessageContent = z.infer<typeof LegacyMessageContentSchema>;

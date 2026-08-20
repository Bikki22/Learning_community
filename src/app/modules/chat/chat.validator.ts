import { z } from "zod";

// ==================== CONVERSATION VALIDATORS ====================

export const createConversationSchema = z.object({
  type: z.enum(["DIRECT", "GROUP"]).default("DIRECT"),
  participantIds: z.array(z.string().cuid()).min(1).max(50),
});

export const updateConversationSchema = z.object({
  // Future fields like name, avatar, etc. can be added here
});

export const addParticipantSchema = z.object({
  userId: z.string().cuid(),
});

// ==================== MESSAGE VALIDATORS ====================

export const createMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  type: z
    .enum(["TEXT", "IMAGE", "VIDEO", "FILE", "AUDIO", "SYSTEM"])
    .optional(),
  attachmentUrl: z.string().url().nullable().optional(),
  replyToId: z.string().cuid().nullable().optional(),
});

export const updateMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

// ==================== GROUP VALIDATORS ====================

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  memberIds: z.array(z.string().cuid()).max(100).default([]),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

export const addGroupMemberSchema = z.object({
  userId: z.string().cuid(),
});

export const removeGroupMemberSchema = z.object({
  userId: z.string().cuid(),
});

export const updateGroupMemberRoleSchema = z.object({
  role: z.enum(["MEMBER", "ADMIN", "OWNER"]),
});

// ==================== GROUP MESSAGE VALIDATORS ====================

export const createGroupMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  type: z
    .enum(["TEXT", "IMAGE", "VIDEO", "FILE", "AUDIO", "SYSTEM"])
    .optional(),
  attachmentUrl: z.string().url().nullable().optional(),
  replyToId: z.string().cuid().nullable().optional(),
});

export const updateGroupMessageSchema = z.object({
  content: z.string().min(1).max(10000),
});

// ==================== QUERY VALIDATORS ====================

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().max(100).optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type AddParticipantInput = z.infer<typeof addParticipantSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;
export type RemoveGroupMemberInput = z.infer<typeof removeGroupMemberSchema>;
export type UpdateGroupMemberRoleInput = z.infer<typeof updateGroupMemberRoleSchema>;
export type CreateGroupMessageInput = z.infer<typeof createGroupMessageSchema>;
export type UpdateGroupMessageInput = z.infer<typeof updateGroupMessageSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
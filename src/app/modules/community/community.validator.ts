import { z } from "zod";

const slug = z
  .string()
  .min(2, "Slug must be at least 2 characters")
  .max(60, "Slug must be at most 60 characters")
  .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens");

export const createCommunitySchema = z.object({
  name: z.string().min(2).max(100),
  slug,
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  isPrivate: z.boolean().optional(),
});

export const updateCommunitySchema = createCommunitySchema.partial();

export const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
  slug,
  description: z.string().max(300).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateChannelSchema = createChannelSchema.partial();

export const createPostSchema = z.object({
  channelId: z.string().cuid().optional(),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(10000),
});

export const updatePostSchema = createPostSchema.partial();

export const createCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.string().cuid().optional(),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["MEMBER", "MODERATOR", "ADMIN"]),
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  channelId: z.string().cuid().optional(),
  q: z.string().max(100).optional(),
});

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

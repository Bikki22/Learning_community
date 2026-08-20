import { prisma } from "../../lib/prisma";
import type { CommunityMemberRole } from "../../../generated/prisma/client";
import logger from "../../lib/logger";

export type CreateCommunityInput = {
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  isPrivate?: boolean;
};

export type UpdateCommunityInput = Partial<CreateCommunityInput>;

export type CreateChannelInput = {
  name: string;
  slug: string;
  description?: string | null;
  sortOrder?: number;
};

export type UpdateChannelInput = Partial<CreateChannelInput>;

export type CreatePostInput = {
  channelId?: string | null;
  title?: string | null;
  content: string;
};

export type UpdatePostInput = Partial<CreatePostInput>;

export type CreateCommentInput = {
  content: string;
  parentId?: string | null;
};

export type UpdateCommentInput = {
  content: string;
};

export class CommunityRepository {
  // ==================== USER HELPER METHODS ====================

  /**
   * Find a user by their Clerk ID.
   */
  async findUserByClerkId(clerkId: string) {
    return prisma.user.findUnique({
      where: { clerkId, deletedAt: null },
    });
  }

  // ==================== COMMUNITY METHODS ====================

  /**
   * Find a community by its database ID.
   */
  async findCommunityById(id: string) {
    return prisma.community.findUnique({
      where: { id, deletedAt: null },
    });
  }

  /**
   * Find a community by its slug.
   */
  async findCommunityBySlug(slug: string) {
    return prisma.community.findUnique({
      where: { slug, deletedAt: null },
    });
  }

  /**
   * List communities with search and pagination.
   */
  async listCommunities(options: {
    query?: string;
    limit: number;
    offset: number;
  }) {
    const { query, limit, offset } = options;

    const where = {
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { slug: { contains: query, mode: "insensitive" as const } },
              {
                description: { contains: query, mode: "insensitive" as const },
              },
            ],
          }
        : {}),
    };

    const [communities, total] = await Promise.all([
      prisma.community.findMany({
        where,
        include: {
          _count: {
            select: { members: true, posts: true, channels: true },
          },
          createdBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              imageUrl: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.community.count({ where }),
    ]);

    return { communities, total };
  }

  /**
   * Create a new community and add the creator as an ADMIN member.
   */
  async createCommunity(creatorId: string, data: CreateCommunityInput) {
    const community = await prisma.$transaction(async (tx) => {
      const created = await tx.community.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description ?? null,
          imageUrl: data.imageUrl ?? null,
          isPrivate: data.isPrivate ?? false,
          createdById: creatorId,
        },
      });

      // Add creator as ADMIN member
      await tx.communityMember.create({
        data: {
          communityId: created.id,
          userId: creatorId,
          role: "ADMIN",
        },
      });

      return created;
    });

    logger.info(`Community created: ${community.slug} (${community.id})`);
    return community;
  }

  /**
   * Update a community.
   */
  async updateCommunity(id: string, data: UpdateCommunityInput) {
    const community = await prisma.community.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        imageUrl: data.imageUrl,
        isPrivate: data.isPrivate,
      },
    });
    logger.info(`Community updated: ${community.slug} (${id})`);
    return community;
  }

  /**
   * Soft-delete a community.
   */
  async deleteCommunity(id: string) {
    const community = await prisma.community.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    logger.info(`Community soft-deleted: ${community.slug} (${id})`);
    return community;
  }

  /**
   * Check if a user is a member of a community.
   */
  async findCommunityMember(communityId: string, userId: string) {
    return prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
    });
  }

  /**
   * Get a user's role in a community.
   */
  async getMemberRole(communityId: string, userId: string) {
    const member = await this.findCommunityMember(communityId, userId);
    return member?.role ?? null;
  }

  /**
   * Add a user as a member of a community.
   */
  async joinCommunity(communityId: string, userId: string) {
    const member = await prisma.communityMember.create({
      data: {
        communityId,
        userId,
        role: "MEMBER",
      },
    });
    logger.info(`User ${userId} joined community ${communityId}`);
    return member;
  }

  /**
   * Remove a user from a community.
   */
  async leaveCommunity(communityId: string, userId: string) {
    const deleted = await prisma.communityMember.deleteMany({
      where: {
        communityId,
        userId,
      },
    });
    logger.info(
      `User ${userId} left community ${communityId} (${deleted.count} removed)`,
    );
    return deleted.count > 0;
  }

  /**
   * List members of a community.
   */
  async listCommunityMembers(
    communityId: string,
    limit: number,
    offset: number,
  ) {
    const [members, total] = await Promise.all([
      prisma.communityMember.findMany({
        where: { communityId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              imageUrl: true,
              bio: true,
              xp: true,
              streakCount: true,
            },
          },
        },
        orderBy: { joinedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.communityMember.count({ where: { communityId } }),
    ]);

    return {
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
      total,
    };
  }

  /**
   * Update a member's role in a community.
   */
  async updateMemberRole(
    communityId: string,
    userId: string,
    role: CommunityMemberRole,
  ) {
    const member = await prisma.communityMember.update({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
      data: { role },
    });
    logger.info(
      `Member ${userId} role updated to ${role} in community ${communityId}`,
    );
    return member;
  }

  // ==================== CHANNEL METHODS ====================

  /**
   * Find a channel by its database ID.
   */
  async findChannelById(id: string) {
    return prisma.channel.findUnique({ where: { id } });
  }

  /**
   * List channels for a community.
   */
  async listChannels(communityId: string) {
    return prisma.channel.findMany({
      where: { communityId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  /**
   * Create a channel in a community.
   */
  async createChannel(communityId: string, data: CreateChannelInput) {
    const channel = await prisma.channel.create({
      data: {
        communityId,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    logger.info(`Channel created: ${channel.slug} (${channel.id})`);
    return channel;
  }

  /**
   * Update a channel.
   */
  async updateChannel(id: string, data: UpdateChannelInput) {
    const channel = await prisma.channel.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        sortOrder: data.sortOrder,
      },
    });
    logger.info(`Channel updated: ${channel.slug} (${id})`);
    return channel;
  }

  /**
   * Delete a channel.
   */
  async deleteChannel(id: string) {
    const channel = await prisma.channel.delete({ where: { id } });
    logger.info(`Channel deleted: ${channel.slug} (${id})`);
    return channel;
  }

  // ==================== POST METHODS ====================

  /**
   * Find a post by its database ID within a community.
   */
  async findPostById(communityId: string, postId: string) {
    return prisma.post.findFirst({
      where: {
        id: postId,
        communityId,
        deletedAt: null,
      },
    });
  }

  /**
   * List posts in a community with optional channel filter and search.
   */
  async listPosts(
    communityId: string,
    options: {
      limit: number;
      offset: number;
      channelId?: string;
      query?: string;
    },
  ) {
    const { limit, offset, channelId, query } = options;

    const where = {
      communityId,
      deletedAt: null,
      ...(channelId ? { channelId } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { content: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              imageUrl: true,
            },
          },
          channel: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          _count: {
            select: { comments: true, likes: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.post.count({ where }),
    ]);

    return { posts, total };
  }

  /**
   * Get a single post with full details.
   */
  async getPostById(communityId: string, postId: string) {
    return prisma.post.findFirst({
      where: {
        id: postId,
        communityId,
        deletedAt: null,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
          },
        },
        channel: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: { comments: true, likes: true },
        },
      },
    });
  }

  /**
   * Create a post in a community.
   */
  async createPost(
    communityId: string,
    authorId: string,
    data: CreatePostInput,
  ) {
    const post = await prisma.post.create({
      data: {
        communityId,
        authorId,
        channelId: data.channelId ?? null,
        title: data.title ?? null,
        content: data.content,
      },
    });
    logger.info(`Post created: ${post.id} in community ${communityId}`);
    return post;
  }

  /**
   * Update a post.
   */
  async updatePost(id: string, data: UpdatePostInput) {
    const post = await prisma.post.update({
      where: { id },
      data: {
        channelId: data.channelId,
        title: data.title,
        content: data.content,
      },
    });
    logger.info(`Post updated: ${post.id}`);
    return post;
  }

  /**
   * Soft-delete a post.
   */
  async deletePost(id: string) {
    const post = await prisma.post.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    logger.info(`Post soft-deleted: ${post.id}`);
    return post;
  }

  // ==================== COMMENT METHODS ====================

  /**
   * Find a comment by its database ID within a post.
   */
  async findCommentById(postId: string, commentId: string) {
    return prisma.comment.findFirst({
      where: {
        id: commentId,
        postId,
        deletedAt: null,
      },
    });
  }

  /**
   * List comments for a post.
   */
  async listComments(postId: string, limit: number, offset: number) {
    const where = {
      postId,
      deletedAt: null,
    };

    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              imageUrl: true,
            },
          },
          _count: {
            select: { likes: true, replies: true },
          },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
        skip: offset,
      }),
      prisma.comment.count({ where }),
    ]);

    return { comments, total };
  }

  /**
   * Create a comment on a post.
   */
  async createComment(
    postId: string,
    authorId: string,
    data: CreateCommentInput,
  ) {
    const comment = await prisma.comment.create({
      data: {
        postId,
        authorId,
        content: data.content,
        parentId: data.parentId ?? null,
      },
    });
    logger.info(`Comment created: ${comment.id} on post ${postId}`);
    return comment;
  }

  /**
   * Update a comment.
   */
  async updateComment(id: string, data: UpdateCommentInput) {
    const comment = await prisma.comment.update({
      where: { id },
      data: { content: data.content },
    });
    logger.info(`Comment updated: ${comment.id}`);
    return comment;
  }

  /**
   * Soft-delete a comment.
   */
  async deleteComment(id: string) {
    const comment = await prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    logger.info(`Comment soft-deleted: ${comment.id}`);
    return comment;
  }

  // ==================== LIKE METHODS ====================

  /**
   * Check if a user has liked a post.
   */
  async findPostLike(postId: string, userId: string) {
    return prisma.postLike.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });
  }

  /**
   * Like a post.
   */
  async likePost(postId: string, userId: string) {
    const like = await prisma.postLike.create({
      data: { postId, userId },
    });
    logger.info(`Post ${postId} liked by ${userId}`);
    return like;
  }

  /**
   * Unlike a post.
   */
  async unlikePost(postId: string, userId: string) {
    const deleted = await prisma.postLike.deleteMany({
      where: { postId, userId },
    });
    logger.info(
      `Post ${postId} unliked by ${userId} (${deleted.count} removed)`,
    );
    return deleted.count > 0;
  }

  /**
   * Check if a user has liked a comment.
   */
  async findCommentLike(commentId: string, userId: string) {
    return prisma.commentLike.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });
  }

  /**
   * Like a comment.
   */
  async likeComment(commentId: string, userId: string) {
    const like = await prisma.commentLike.create({
      data: { commentId, userId },
    });
    logger.info(`Comment ${commentId} liked by ${userId}`);
    return like;
  }

  /**
   * Unlike a comment.
   */
  async unlikeComment(commentId: string, userId: string) {
    const deleted = await prisma.commentLike.deleteMany({
      where: { commentId, userId },
    });
    logger.info(
      `Comment ${commentId} unliked by ${userId} (${deleted.count} removed)`,
    );
    return deleted.count > 0;
  }
}

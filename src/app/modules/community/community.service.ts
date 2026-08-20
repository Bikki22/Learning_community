import {
  CommunityRepository,
  CreateCommunityInput,
  UpdateCommunityInput,
  CreateChannelInput,
  UpdateChannelInput,
  CreatePostInput,
  UpdatePostInput,
  CreateCommentInput,
  UpdateCommentInput,
} from "./community.repository";
import { ApiError } from "../../lib/ApiError";
import logger from "../../lib/logger";
import type { CommunityMemberRole } from "../../../generated/prisma/client";

export class CommunityService {
  private communityRepository = new CommunityRepository();

  // ==================== COMMUNITY METHODS ====================

  /**
   * List communities with search and pagination.
   */
  async listCommunities(query: string | undefined, limit: number, offset: number) {
    return this.communityRepository.listCommunities({ query, limit, offset });
  }

  /**
   * Get a community by its slug.
   */
  async getCommunityBySlug(slug: string) {
    const community = await this.communityRepository.findCommunityBySlug(slug);
    if (!community) {
      throw new ApiError(404, "Community not found");
    }
    return community;
  }

  /**
   * Get a community by its database ID.
   */
  async getCommunityById(id: string) {
    const community = await this.communityRepository.findCommunityById(id);
    if (!community) {
      throw new ApiError(404, "Community not found");
    }
    return community;
  }

  /**
   * Create a new community. The creator becomes an ADMIN member.
   */
  async createCommunity(clerkId: string, data: CreateCommunityInput) {
    // Resolve the user by Clerk ID
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Check slug uniqueness
    const existing = await this.communityRepository.findCommunityBySlug(data.slug);
    if (existing) {
      throw new ApiError(409, `Community with slug "${data.slug}" already exists`);
    }

    const community = await this.communityRepository.createCommunity(user.id, data);
    logger.info(`Community created by service: ${community.slug}`);
    return community;
  }

  /**
   * Update a community. Requires ADMIN / MODERATOR role in the community.
   */
  async updateCommunity(clerkId: string, communityId: string, data: UpdateCommunityInput) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user has admin/moderator role in this community
    const role = await this.communityRepository.getMemberRole(communityId, user.id);
    if (role !== "ADMIN" && role !== "MODERATOR") {
      throw new ApiError(403, "Forbidden: insufficient community permissions");
    }

    // If slug is changing, check uniqueness
    if (data.slug) {
      const existing = await this.communityRepository.findCommunityBySlug(data.slug);
      if (existing && existing.id !== communityId) {
        throw new ApiError(409, `Community with slug "${data.slug}" already exists`);
      }
    }

    const community = await this.communityRepository.updateCommunity(communityId, data);
    logger.info(`Community updated by service: ${community.slug} (${communityId})`);
    return community;
  }

  /**
   * Soft-delete a community. Requires ADMIN role in the community.
   */
  async deleteCommunity(clerkId: string, communityId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user has admin role in this community
    const role = await this.communityRepository.getMemberRole(communityId, user.id);
    if (role !== "ADMIN") {
      throw new ApiError(403, "Forbidden: only community admins can delete");
    }

    await this.communityRepository.deleteCommunity(communityId);
    logger.info(`Community deleted by service: ${communityId}`);
  }

  /**
   * Join a community.
   */
  async joinCommunity(clerkId: string, communityId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check if already a member
    const existing = await this.communityRepository.findCommunityMember(communityId, user.id);
    if (existing) {
      throw new ApiError(409, "Already a member of this community");
    }

    const member = await this.communityRepository.joinCommunity(communityId, user.id);
    logger.info(`User ${user.id} joined community ${communityId} via service`);
    return member;
  }

  /**
   * Leave a community.
   */
  async leaveCommunity(clerkId: string, communityId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    const left = await this.communityRepository.leaveCommunity(communityId, user.id);
    if (!left) {
      throw new ApiError(400, "Not a member of this community");
    }
    logger.info(`User ${user.id} left community ${communityId} via service`);
  }

  /**
   * List members of a community.
   */
  async listCommunityMembers(communityId: string, limit: number, offset: number) {
    // Ensure community exists
    await this.getCommunityById(communityId);
    return this.communityRepository.listCommunityMembers(communityId, limit, offset);
  }

  /**
   * Update a member's role in a community. Requires ADMIN role.
   */
  async updateMemberRole(
    clerkId: string,
    communityId: string,
    targetUserId: string,
    role: CommunityMemberRole,
  ) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user has admin role in this community
    const adminRole = await this.communityRepository.getMemberRole(communityId, user.id);
    if (adminRole !== "ADMIN") {
      throw new ApiError(403, "Forbidden: only community admins can update roles");
    }

    // Ensure target user is a member
    const targetMember = await this.communityRepository.findCommunityMember(communityId, targetUserId);
    if (!targetMember) {
      throw new ApiError(404, "Target user is not a member of this community");
    }

    const member = await this.communityRepository.updateMemberRole(communityId, targetUserId, role);
    logger.info(`Member ${targetUserId} role updated to ${role} in ${communityId} via service`);
    return member;
  }

  // ==================== CHANNEL METHODS ====================

  /**
   * List channels for a community.
   */
  async listChannels(communityId: string) {
    // Ensure community exists
    await this.getCommunityById(communityId);
    return this.communityRepository.listChannels(communityId);
  }

  /**
   * Create a channel in a community. Requires ADMIN / MODERATOR role.
   */
  async createChannel(clerkId: string, communityId: string, data: CreateChannelInput) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user has admin/moderator role in this community
    const role = await this.communityRepository.getMemberRole(communityId, user.id);
    if (role !== "ADMIN" && role !== "MODERATOR") {
      throw new ApiError(403, "Forbidden: insufficient community permissions");
    }

    // Check channel slug uniqueness within community
    const channels = await this.communityRepository.listChannels(communityId);
    if (channels.some((c) => c.slug === data.slug)) {
      throw new ApiError(409, `Channel with slug "${data.slug}" already exists in this community`);
    }

    const channel = await this.communityRepository.createChannel(communityId, data);
    logger.info(`Channel created by service: ${channel.slug} (${channel.id})`);
    return channel;
  }

  /**
   * Update a channel. Requires ADMIN / MODERATOR role.
   */
  async updateChannel(clerkId: string, communityId: string, channelId: string, data: UpdateChannelInput) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user has admin/moderator role in this community
    const role = await this.communityRepository.getMemberRole(communityId, user.id);
    if (role !== "ADMIN" && role !== "MODERATOR") {
      throw new ApiError(403, "Forbidden: insufficient community permissions");
    }

    // Ensure channel exists and belongs to this community
    const channel = await this.communityRepository.findChannelById(channelId);
    if (!channel || channel.communityId !== communityId) {
      throw new ApiError(404, "Channel not found");
    }

    // If slug is changing, check uniqueness within community
    if (data.slug && data.slug !== channel.slug) {
      const channels = await this.communityRepository.listChannels(communityId);
      if (channels.some((c) => c.slug === data.slug && c.id !== channelId)) {
        throw new ApiError(409, `Channel with slug "${data.slug}" already exists in this community`);
      }
    }

    const updated = await this.communityRepository.updateChannel(channelId, data);
    logger.info(`Channel updated by service: ${updated.slug} (${channelId})`);
    return updated;
  }

  /**
   * Delete a channel. Requires ADMIN / MODERATOR role.
   */
  async deleteChannel(clerkId: string, communityId: string, channelId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user has admin/moderator role in this community
    const role = await this.communityRepository.getMemberRole(communityId, user.id);
    if (role !== "ADMIN" && role !== "MODERATOR") {
      throw new ApiError(403, "Forbidden: insufficient community permissions");
    }

    // Ensure channel exists and belongs to this community
    const channel = await this.communityRepository.findChannelById(channelId);
    if (!channel || channel.communityId !== communityId) {
      throw new ApiError(404, "Channel not found");
    }

    await this.communityRepository.deleteChannel(channelId);
    logger.info(`Channel deleted by service: ${channelId}`);
  }

  // ==================== POST METHODS ====================

  /**
   * List posts in a community.
   */
  async listPosts(
    communityId: string,
    options: { limit: number; offset: number; channelId?: string; query?: string },
  ) {
    // Ensure community exists
    await this.getCommunityById(communityId);
    return this.communityRepository.listPosts(communityId, options);
  }

  /**
   * Get a single post by ID.
   */
  async getPostById(communityId: string, postId: string) {
    // Ensure community exists
    await this.getCommunityById(communityId);

    const post = await this.communityRepository.getPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }
    return post;
  }

  /**
   * Create a post in a community. Requires membership.
   */
  async createPost(clerkId: string, communityId: string, data: CreatePostInput) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user is a member
    const member = await this.communityRepository.findCommunityMember(communityId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: must be a member to post");
    }

    // If channelId is provided, verify it belongs to this community
    if (data.channelId) {
      const channel = await this.communityRepository.findChannelById(data.channelId);
      if (!channel || channel.communityId !== communityId) {
        throw new ApiError(400, "Channel does not belong to this community");
      }
    }

    const post = await this.communityRepository.createPost(communityId, user.id, data);
    logger.info(`Post created by service: ${post.id}`);
    return post;
  }

  /**
   * Update a post. Requires author or ADMIN / MODERATOR role.
   */
  async updatePost(clerkId: string, communityId: string, postId: string, data: UpdatePostInput) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // Check permission: author or admin/moderator
    const role = await this.communityRepository.getMemberRole(communityId, user.id);
    const isAuthor = post.authorId === user.id;
    if (!isAuthor && role !== "ADMIN" && role !== "MODERATOR") {
      throw new ApiError(403, "Forbidden: only the author or moderators can update this post");
    }

    // If channelId is changing, verify it belongs to this community
    if (data.channelId) {
      const channel = await this.communityRepository.findChannelById(data.channelId);
      if (!channel || channel.communityId !== communityId) {
        throw new ApiError(400, "Channel does not belong to this community");
      }
    }

    const updated = await this.communityRepository.updatePost(postId, data);
    logger.info(`Post updated by service: ${postId}`);
    return updated;
  }

  /**
   * Soft-delete a post. Requires author or ADMIN / MODERATOR role.
   */
  async deletePost(clerkId: string, communityId: string, postId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // Check permission: author or admin/moderator
    const role = await this.communityRepository.getMemberRole(communityId, user.id);
    const isAuthor = post.authorId === user.id;
    if (!isAuthor && role !== "ADMIN" && role !== "MODERATOR") {
      throw new ApiError(403, "Forbidden: only the author or moderators can delete this post");
    }

    await this.communityRepository.deletePost(postId);
    logger.info(`Post deleted by service: ${postId}`);
  }

  // ==================== COMMENT METHODS ====================

  /**
   * List comments for a post.
   */
  async listComments(communityId: string, postId: string, limit: number, offset: number) {
    // Ensure community exists
    await this.getCommunityById(communityId);

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    return this.communityRepository.listComments(postId, limit, offset);
  }

  /**
   * Add a comment to a post. Requires membership.
   */
  async addComment(clerkId: string, communityId: string, postId: string, data: CreateCommentInput) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user is a member
    const member = await this.communityRepository.findCommunityMember(communityId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: must be a member to comment");
    }

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // If parentId is provided, verify it belongs to the same post
    if (data.parentId) {
      const parent = await this.communityRepository.findCommentById(postId, data.parentId);
      if (!parent) {
        throw new ApiError(400, "Parent comment not found in this post");
      }
    }

    const comment = await this.communityRepository.createComment(postId, user.id, data);
    logger.info(`Comment created by service: ${comment.id}`);
    return comment;
  }

  /**
   * Update a comment. Requires author or ADMIN / MODERATOR role.
   */
  async updateComment(clerkId: string, communityId: string, postId: string, commentId: string, data: UpdateCommentInput) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // Ensure comment exists in this post
    const comment = await this.communityRepository.findCommentById(postId, commentId);
    if (!comment) {
      throw new ApiError(404, "Comment not found");
    }

    // Check permission: author or admin/moderator
    const role = await this.communityRepository.getMemberRole(communityId, user.id);
    const isAuthor = comment.authorId === user.id;
    if (!isAuthor && role !== "ADMIN" && role !== "MODERATOR") {
      throw new ApiError(403, "Forbidden: only the author or moderators can update this comment");
    }

    const updated = await this.communityRepository.updateComment(commentId, data);
    logger.info(`Comment updated by service: ${commentId}`);
    return updated;
  }

  /**
   * Soft-delete a comment. Requires author or ADMIN / MODERATOR role.
   */
  async deleteComment(clerkId: string, communityId: string, postId: string, commentId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // Ensure comment exists in this post
    const comment = await this.communityRepository.findCommentById(postId, commentId);
    if (!comment) {
      throw new ApiError(404, "Comment not found");
    }

    // Check permission: author or admin/moderator
    const role = await this.communityRepository.getMemberRole(communityId, user.id);
    const isAuthor = comment.authorId === user.id;
    if (!isAuthor && role !== "ADMIN" && role !== "MODERATOR") {
      throw new ApiError(403, "Forbidden: only the author or moderators can delete this comment");
    }

    await this.communityRepository.deleteComment(commentId);
    logger.info(`Comment deleted by service: ${commentId}`);
  }

  // ==================== LIKE METHODS ====================

  /**
   * Like a post. Requires membership.
   */
  async likePost(clerkId: string, communityId: string, postId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user is a member
    const member = await this.communityRepository.findCommunityMember(communityId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: must be a member to like posts");
    }

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // Check if already liked
    const existing = await this.communityRepository.findPostLike(postId, user.id);
    if (existing) {
      throw new ApiError(409, "Post already liked");
    }

    const like = await this.communityRepository.likePost(postId, user.id);
    logger.info(`Post ${postId} liked by ${user.id} via service`);
    return like;
  }

  /**
   * Unlike a post.
   */
  async unlikePost(clerkId: string, communityId: string, postId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    const unliked = await this.communityRepository.unlikePost(postId, user.id);
    if (!unliked) {
      throw new ApiError(400, "Post not liked");
    }
    logger.info(`Post ${postId} unliked by ${user.id} via service`);
  }

  /**
   * Like a comment. Requires membership.
   */
  async likeComment(clerkId: string, communityId: string, postId: string, commentId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Check user is a member
    const member = await this.communityRepository.findCommunityMember(communityId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: must be a member to like comments");
    }

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // Ensure comment exists in this post
    const comment = await this.communityRepository.findCommentById(postId, commentId);
    if (!comment) {
      throw new ApiError(404, "Comment not found");
    }

    // Check if already liked
    const existing = await this.communityRepository.findCommentLike(commentId, user.id);
    if (existing) {
      throw new ApiError(409, "Comment already liked");
    }

    const like = await this.communityRepository.likeComment(commentId, user.id);
    logger.info(`Comment ${commentId} liked by ${user.id} via service`);
    return like;
  }

  /**
   * Unlike a comment.
   */
  async unlikeComment(clerkId: string, communityId: string, postId: string, commentId: string) {
    const user = await this.communityRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Ensure community exists
    await this.getCommunityById(communityId);

    // Ensure post exists in this community
    const post = await this.communityRepository.findPostById(communityId, postId);
    if (!post) {
      throw new ApiError(404, "Post not found");
    }

    // Ensure comment exists in this post
    const comment = await this.communityRepository.findCommentById(postId, commentId);
    if (!comment) {
      throw new ApiError(404, "Comment not found");
    }

    const unliked = await this.communityRepository.unlikeComment(commentId, user.id);
    if (!unliked) {
      throw new ApiError(400, "Comment not liked");
    }
    logger.info(`Comment ${commentId} unliked by ${user.id} via service`);
  }
}
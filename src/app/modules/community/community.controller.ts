import { Request, Response } from "express";
import { CommunityService } from "./community.service";
import { AsyncHandler } from "../../lib/AsyncHandler";
import { ApiResponse } from "../../lib/ApiResponse";
import { ApiError } from "../../lib/ApiError";
import logger from "../../lib/logger";

function param(req: Request, key: string): string {
  const value = req.params[key];
  if (Array.isArray(value)) {
    throw new ApiError(400, `Invalid ${key} parameter`);
  }
  return value;
}

function parseIntParam(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export class CommunityController {
  private communityService = new CommunityService();

  // ==================== COMMUNITY METHODS ====================

  /**
   * GET /communities - List all communities (with search & pagination).
   */
  listCommunities = AsyncHandler(async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q : undefined;
    const limit = Math.min(
      parseIntParam(req.query.limit as string | undefined, 20),
      100,
    );
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.communityService.listCommunities(
      query,
      limit,
      offset,
    );
    res.status(200).json(new ApiResponse(200, result, "Communities fetched"));
  });

  /**
   * GET /communities/:slug - Get a community by slug.
   */
  getCommunityBySlug = AsyncHandler(async (req: Request, res: Response) => {
    const slug = param(req, "slug");
    const community = await this.communityService.getCommunityBySlug(slug);
    res.status(200).json(new ApiResponse(200, community, "Community fetched"));
  });

  /**
   * POST /communities - Create a new community.
   */
  createCommunity = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const { name, slug, description, imageUrl, isPrivate } = req.body;
    const community = await this.communityService.createCommunity(clerkId, {
      name,
      slug,
      description,
      imageUrl,
      isPrivate,
    });

    logger.info(`Community created: ${community.slug} (${community.id})`);
    res.status(201).json(new ApiResponse(201, community, "Community created"));
  });

  /**
   * PATCH /communities/:id - Update a community.
   */
  updateCommunity = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const id = param(req, "id");
    const { name, slug, description, imageUrl, isPrivate } = req.body;

    const community = await this.communityService.updateCommunity(clerkId, id, {
      name,
      slug,
      description,
      imageUrl,
      isPrivate,
    });

    logger.info(`Community updated: ${community.slug} (${id})`);
    res.status(200).json(new ApiResponse(200, community, "Community updated"));
  });

  /**
   * DELETE /communities/:id - Soft-delete a community.
   */
  deleteCommunity = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const id = param(req, "id");
    await this.communityService.deleteCommunity(clerkId, id);
    logger.info(`Community deleted: ${id}`);
    res.status(200).json(new ApiResponse(200, null, "Community deleted"));
  });

  /**
   * POST /communities/:id/join - Join a community.
   */
  joinCommunity = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const id = param(req, "id");
    const member = await this.communityService.joinCommunity(clerkId, id);
    logger.info(`User ${clerkId} joined community ${id}`);
    res.status(201).json(new ApiResponse(201, member, "Joined community"));
  });

  /**
   * DELETE /communities/:id/leave - Leave a community.
   */
  leaveCommunity = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const id = param(req, "id");
    await this.communityService.leaveCommunity(clerkId, id);
    logger.info(`User ${clerkId} left community ${id}`);
    res.status(200).json(new ApiResponse(200, null, "Left community"));
  });

  /**
   * GET /communities/:id/members - List community members.
   */
  listCommunityMembers = AsyncHandler(async (req: Request, res: Response) => {
    const id = param(req, "id");
    const limit = Math.min(
      parseIntParam(req.query.limit as string | undefined, 20),
      100,
    );
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.communityService.listCommunityMembers(
      id,
      limit,
      offset,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Community members fetched"));
  });

  /**
   * PATCH /communities/:id/members/:userId - Update a member's role.
   */
  updateMemberRole = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const id = param(req, "id");
    const targetUserId = param(req, "userId");
    const { role } = req.body;

    if (!role) {
      throw new ApiError(400, "role is required");
    }

    const member = await this.communityService.updateMemberRole(
      clerkId,
      id,
      targetUserId,
      role,
    );
    logger.info(`Member ${targetUserId} role updated to ${role} in ${id}`);
    res.status(200).json(new ApiResponse(200, member, "Member role updated"));
  });

  // ==================== CHANNEL METHODS ====================

  /**
   * GET /communities/:communityId/channels - List channels in a community.
   */
  listChannels = AsyncHandler(async (req: Request, res: Response) => {
    const communityId = param(req, "communityId");
    const channels = await this.communityService.listChannels(communityId);
    res.status(200).json(new ApiResponse(200, channels, "Channels fetched"));
  });

  /**
   * POST /communities/:communityId/channels - Create a channel.
   */
  createChannel = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const { name, slug, description, sortOrder } = req.body;

    const channel = await this.communityService.createChannel(
      clerkId,
      communityId,
      {
        name,
        slug,
        description,
        sortOrder,
      },
    );

    logger.info(`Channel created: ${channel.slug} (${channel.id})`);
    res.status(201).json(new ApiResponse(201, channel, "Channel created"));
  });

  /**
   * PATCH /communities/:communityId/channels/:channelId - Update a channel.
   */
  updateChannel = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const channelId = param(req, "channelId");
    const { name, slug, description, sortOrder } = req.body;

    const channel = await this.communityService.updateChannel(
      clerkId,
      communityId,
      channelId,
      {
        name,
        slug,
        description,
        sortOrder,
      },
    );

    logger.info(`Channel updated: ${channel.slug} (${channelId})`);
    res.status(200).json(new ApiResponse(200, channel, "Channel updated"));
  });

  /**
   * DELETE /communities/:communityId/channels/:channelId - Delete a channel.
   */
  deleteChannel = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const channelId = param(req, "channelId");

    await this.communityService.deleteChannel(clerkId, communityId, channelId);
    logger.info(`Channel deleted: ${channelId}`);
    res.status(200).json(new ApiResponse(200, null, "Channel deleted"));
  });

  // ==================== POST METHODS ====================

  /**
   * GET /communities/:communityId/posts - List posts in a community.
   */
  listPosts = AsyncHandler(async (req: Request, res: Response) => {
    const communityId = param(req, "communityId");
    const limit = Math.min(
      parseIntParam(req.query.limit as string | undefined, 20),
      100,
    );
    const offset = parseIntParam(req.query.offset as string | undefined, 0);
    const channelId =
      typeof req.query.channelId === "string" ? req.query.channelId : undefined;
    const query = typeof req.query.q === "string" ? req.query.q : undefined;

    const result = await this.communityService.listPosts(communityId, {
      limit,
      offset,
      channelId,
      query,
    });
    res.status(200).json(new ApiResponse(200, result, "Posts fetched"));
  });

  /**
   * GET /communities/:communityId/posts/:postId - Get a single post.
   */
  getPostById = AsyncHandler(async (req: Request, res: Response) => {
    const communityId = param(req, "communityId");
    const postId = param(req, "postId");

    const post = await this.communityService.getPostById(communityId, postId);
    res.status(200).json(new ApiResponse(200, post, "Post fetched"));
  });

  /**
   * POST /communities/:communityId/posts - Create a post.
   */
  createPost = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const { channelId, title, content } = req.body;

    const post = await this.communityService.createPost(clerkId, communityId, {
      channelId,
      title,
      content,
    });

    logger.info(`Post created: ${post.id}`);
    res.status(201).json(new ApiResponse(201, post, "Post created"));
  });

  /**
   * PATCH /communities/:communityId/posts/:postId - Update a post.
   */
  updatePost = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const postId = param(req, "postId");
    const { channelId, title, content } = req.body;

    const post = await this.communityService.updatePost(
      clerkId,
      communityId,
      postId,
      {
        channelId,
        title,
        content,
      },
    );

    logger.info(`Post updated: ${postId}`);
    res.status(200).json(new ApiResponse(200, post, "Post updated"));
  });

  /**
   * DELETE /communities/:communityId/posts/:postId - Soft-delete a post.
   */
  deletePost = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const postId = param(req, "postId");

    await this.communityService.deletePost(clerkId, communityId, postId);
    logger.info(`Post deleted: ${postId}`);
    res.status(200).json(new ApiResponse(200, null, "Post deleted"));
  });

  // ==================== COMMENT METHODS ====================

  /**
   * GET /communities/:communityId/posts/:postId/comments - List comments.
   */
  listComments = AsyncHandler(async (req: Request, res: Response) => {
    const communityId = param(req, "communityId");
    const postId = param(req, "postId");
    const limit = Math.min(
      parseIntParam(req.query.limit as string | undefined, 20),
      100,
    );
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.communityService.listComments(
      communityId,
      postId,
      limit,
      offset,
    );
    res.status(200).json(new ApiResponse(200, result, "Comments fetched"));
  });

  /**
   * POST /communities/:communityId/posts/:postId/comments - Add a comment.
   */
  addComment = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const postId = param(req, "postId");
    const { content, parentId } = req.body;

    const comment = await this.communityService.addComment(
      clerkId,
      communityId,
      postId,
      {
        content,
        parentId,
      },
    );

    logger.info(`Comment created: ${comment.id}`);
    res.status(201).json(new ApiResponse(201, comment, "Comment added"));
  });

  /**
   * PATCH /communities/:communityId/posts/:postId/comments/:commentId - Update a comment.
   */
  updateComment = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const postId = param(req, "postId");
    const commentId = param(req, "commentId");
    const { content } = req.body;

    const comment = await this.communityService.updateComment(
      clerkId,
      communityId,
      postId,
      commentId,
      {
        content,
      },
    );

    logger.info(`Comment updated: ${commentId}`);
    res.status(200).json(new ApiResponse(200, comment, "Comment updated"));
  });

  /**
   * DELETE /communities/:communityId/posts/:postId/comments/:commentId - Delete a comment.
   */
  deleteComment = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const postId = param(req, "postId");
    const commentId = param(req, "commentId");

    await this.communityService.deleteComment(
      clerkId,
      communityId,
      postId,
      commentId,
    );
    logger.info(`Comment deleted: ${commentId}`);
    res.status(200).json(new ApiResponse(200, null, "Comment deleted"));
  });

  // ==================== LIKE METHODS ====================

  /**
   * POST /communities/:communityId/posts/:postId/like - Like a post.
   */
  likePost = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const postId = param(req, "postId");

    const like = await this.communityService.likePost(
      clerkId,
      communityId,
      postId,
    );
    logger.info(`Post ${postId} liked by ${clerkId}`);
    res.status(201).json(new ApiResponse(201, like, "Post liked"));
  });

  /**
   * DELETE /communities/:communityId/posts/:postId/like - Unlike a post.
   */
  unlikePost = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const postId = param(req, "postId");

    await this.communityService.unlikePost(clerkId, communityId, postId);
    logger.info(`Post ${postId} unliked by ${clerkId}`);
    res.status(200).json(new ApiResponse(200, null, "Post unliked"));
  });

  /**
   * POST /communities/:communityId/posts/:postId/comments/:commentId/like - Like a comment.
   */
  likeComment = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const postId = param(req, "postId");
    const commentId = param(req, "commentId");

    const like = await this.communityService.likeComment(
      clerkId,
      communityId,
      postId,
      commentId,
    );
    logger.info(`Comment ${commentId} liked by ${clerkId}`);
    res.status(201).json(new ApiResponse(201, like, "Comment liked"));
  });

  /**
   * DELETE /communities/:communityId/posts/:postId/comments/:commentId/like - Unlike a comment.
   */
  unlikeComment = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const communityId = param(req, "communityId");
    const postId = param(req, "postId");
    const commentId = param(req, "commentId");

    await this.communityService.unlikeComment(
      clerkId,
      communityId,
      postId,
      commentId,
    );
    logger.info(`Comment ${commentId} unliked by ${clerkId}`);
    res.status(200).json(new ApiResponse(200, null, "Comment unliked"));
  });
}

import { Request, Response } from "express";
import { UserService } from "./user.service";
import { AsyncHandler } from "../../lib/AsyncHandler";
import { ApiResponse } from "../../lib/ApiResponse";
import { ApiError } from "../../lib/ApiError";
import { prisma } from "../../lib/prisma";
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

export class UserController {
  private userService = new UserService();

  /**
   * GET /users - List all non-deleted users (with search & pagination).
   */
  listUsers = AsyncHandler(async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q : undefined;
    const limit = Math.min(parseIntParam(req.query.limit as string | undefined, 20), 100);
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.userService.listUsers(query, limit, offset);
    res.status(200).json(new ApiResponse(200, result, "Users fetched"));
  });

  /**
   * GET /users/leaderboard - Global XP leaderboard.
   */
  getLeaderboard = AsyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseIntParam(req.query.limit as string | undefined, 20), 100);
    const leaderboard = await this.userService.leaderboard(limit);
    res.status(200).json(new ApiResponse(200, leaderboard, "Leaderboard fetched"));
  });

  /**
   * GET /users/me - Returns the authenticated user's profile.
   */
  getMe = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const user = await this.userService.getByClerkId(clerkId);
    res.status(200).json(new ApiResponse(200, user, "User fetched"));
  });

  /**
   * GET /users/:id - Get a user by database ID.
   */
  getUserById = AsyncHandler(async (req: Request, res: Response) => {
    const id = param(req, "id");
    // Protect /me route from being matched here
    if (id === "me") {
      const clerkId = req.userId;
      if (!clerkId) {
        throw new ApiError(401, "Unauthorized");
      }
      const user = await this.userService.getByClerkId(clerkId);
      return res.status(200).json(new ApiResponse(200, user, "User fetched"));
    }

    const user = await this.userService.getById(id);
    res.status(200).json(new ApiResponse(200, user, "User fetched"));
  });

  /**
   * GET /users/by-username/:username - Get a user by username.
   */
  getUserByUsername = AsyncHandler(async (req: Request, res: Response) => {
    const username = param(req, "username");
    const user = await this.userService.getByUsername(username);
    res.status(200).json(new ApiResponse(200, user, "User fetched"));
  });

  /**
   * PATCH /users/profile - Update the authenticated user's profile.
   */
  updateProfile = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const { username, firstName, lastName, bio, imageUrl } = req.body;

    const user = await this.userService.updateProfile(clerkId, {
      username,
      firstName,
      lastName,
      bio,
      imageUrl,
    });

    logger.info(`Profile updated for user: ${user.id}`);
    res.status(200).json(new ApiResponse(200, user, "Profile updated"));
  });

  /**
   * PATCH /users/avatar - Update the authenticated user's avatar.
   */
  updateAvatar = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const { imageUrl } = req.body;

    const user = await this.userService.updateAvatar(clerkId, imageUrl);
    logger.info(`Avatar updated for user: ${user.id}`);
    res.status(200).json(new ApiResponse(200, user, "Avatar updated"));
  });

  /**
   * POST /users/:id/follow - Make the current user follow :id.
   */
  followUser = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const targetUserId = param(req, "id");
    const follow = await this.userService.follow(clerkId, targetUserId);
    logger.info(`User ${clerkId} followed ${targetUserId}`);
    res.status(200).json(new ApiResponse(200, follow, "User followed"));
  });

  /**
   * DELETE /users/:id/follow - Unfollow user :id.
   */
  unfollowUser = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const targetUserId = param(req, "id");
    await this.userService.unfollow(clerkId, targetUserId);
    logger.info(`User ${clerkId} unfollowed ${targetUserId}`);
    res.status(200).json(new ApiResponse(200, null, "User unfollowed"));
  });

  /**
   * GET /users/:id/followers - List followers of a user.
   */
  listFollowers = AsyncHandler(async (req: Request, res: Response) => {
    const userId = param(req, "id");
    const limit = Math.min(parseIntParam(req.query.limit as string | undefined, 20), 100);
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.userService.listFollowers(userId, limit, offset);
    res.status(200).json(new ApiResponse(200, result, "Followers fetched"));
  });

  /**
   * GET /users/:id/following - List users that :id is following.
   */
  listFollowing = AsyncHandler(async (req: Request, res: Response) => {
    const userId = param(req, "id");
    const limit = Math.min(parseIntParam(req.query.limit as string | undefined, 20), 100);
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.userService.listFollowing(userId, limit, offset);
    res.status(200).json(new ApiResponse(200, result, "Following fetched"));
  });

  /**
   * GET /users/:id/friends - List friends of a user.
   */
  listFriends = AsyncHandler(async (req: Request, res: Response) => {
    const userId = param(req, "id");
    const limit = Math.min(parseIntParam(req.query.limit as string | undefined, 20), 100);
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.userService.listFriends(userId, limit, offset);
    res.status(200).json(new ApiResponse(200, result, "Friends fetched"));
  });

  /**
   * POST /users/friend-requests - Send a friend request to a user.
   */
  sendFriendRequest = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const { userId } = req.body;
    if (!userId) {
      throw new ApiError(400, "userId is required");
    }

    const friendship = await this.userService.sendFriendRequest(clerkId, userId);
    logger.info(`Friend request sent by ${clerkId} to ${userId}`);
    res.status(201).json(new ApiResponse(201, friendship, "Friend request sent"));
  });

  /**
   * POST /users/friend-requests/:friendshipId/accept - Accept a friend request.
   */
  acceptFriendRequest = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const friendshipId = param(req, "friendshipId");
    const friendship = await this.userService.handleFriendshipAction(clerkId, friendshipId, "accept");
    logger.info(`Friend request accepted: ${friendshipId} by ${clerkId}`);
    res.status(200).json(new ApiResponse(200, friendship, "Friend request accepted"));
  });

  /**
   * POST /users/friend-requests/:friendshipId/reject - Reject a friend request.
   */
  rejectFriendRequest = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const friendshipId = param(req, "friendshipId");
    const friendship = await this.userService.handleFriendshipAction(clerkId, friendshipId, "reject");
    logger.info(`Friend request rejected: ${friendshipId} by ${clerkId}`);
    res.status(200).json(new ApiResponse(200, friendship, "Friend request rejected"));
  });

  /**
   * DELETE /users/friend-requests/:friendshipId - Cancel a pending friend request (as requester).
   */
  cancelFriendRequest = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const friendshipId = param(req, "friendshipId");
    const friendship = await this.userService.handleFriendshipAction(clerkId, friendshipId, "cancel");
    logger.info(`Friend request cancelled: ${friendshipId} by ${clerkId}`);
    res.status(200).json(new ApiResponse(200, friendship, "Friend request cancelled"));
  });

  /**
   * DELETE /users/friends/:friendshipId - Unfriend (remove friendship).
   */
  unfriend = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const friendshipId = param(req, "friendshipId");
    const friendship = await this.userService.handleFriendshipAction(clerkId, friendshipId, "unfriend");
    logger.info(`User ${clerkId} unfriended: ${friendshipId}`);
    res.status(200).json(new ApiResponse(200, friendship, "Friendship removed"));
  });

  /**
   * GET /users/friend-requests/pending - List pending friend requests for the current user.
   */
  listPendingFriendRequests = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const limit = Math.min(parseIntParam(req.query.limit as string | undefined, 20), 100);
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.userService.listPendingFriendRequests(clerkId, limit, offset);
    res.status(200).json(new ApiResponse(200, result, "Pending friend requests fetched"));
  });

  /**
   * POST /users/:id/award-xp - Award XP to a user (ADMIN / MODERATOR only).
   */
  awardXP = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const targetUserId = param(req, "id");
    const { amount } = req.body;
    if (!amount) {
      throw new ApiError(400, "amount is required");
    }

    const user = await this.userService.awardXP(targetUserId, Number(amount));
    logger.info(`Awarded ${amount} XP to user ${user.id} by ${clerkId}`);
    res.status(200).json(new ApiResponse(200, user, "XP awarded"));
  });

  /**
   * POST /users/touch-streak - Touch the current user's streak.
   */
  touchStreak = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const user = await this.userService.touchStreak(clerkId);
    logger.info(`Streak touched for user ${user.id}: ${user.streakCount}`);
    res.status(200).json(new ApiResponse(200, user, "Streak updated"));
  });

  /**
   * GET /users/:id/badges - Get badges earned by a user.
   */
  getUserBadges = AsyncHandler(async (req: Request, res: Response) => {
    const userId = param(req, "id");
    const badges = await this.userService.getUserBadges(userId);
    res.status(200).json(new ApiResponse(200, badges, "User badges fetched"));
  });

  // ==================== BADGE METHODS ====================

  /**
   * POST /users/badges - Create a new badge (ADMIN / MODERATOR only).
   */
  createBadge = AsyncHandler(async (req: Request, res: Response) => {
    const { slug, name, description, iconUrl, rarity, xpReward, condition, isActive } = req.body;

    if (!slug || !name) {
      throw new ApiError(400, "slug and name are required");
    }

    const badge = await this.userService.createBadge({
      slug,
      name,
      description,
      iconUrl,
      rarity,
      xpReward,
      condition,
      isActive,
    });

    logger.info(`Badge created: ${badge.slug}`);
    res.status(201).json(new ApiResponse(201, badge, "Badge created"));
  });

  /**
   * GET /users/badges - List all badges (public sees only active, admin sees all).
   */
  listBadges = AsyncHandler(async (req: Request, res: Response) => {
    // Public users only see active badges; authenticated admins can see all
    const onlyActive = !req.userId;

    // For authenticated users, check if admin to bypass active filter
    let seeAll = false;
    if (req.userId) {
      // Keep it simple - non-admin authenticated users still only see active badges
      // Only when query parameter ?all=true is passed with admin role, show all
      const user = await prisma.user.findUnique({
        where: { clerkId: req.userId, deletedAt: null },
        select: { role: true },
      });
      const role = user?.role ?? "MEMBER";
      seeAll = role === "ADMIN" || role === "MODERATOR";
    }

    const badges = await this.userService.listBadges(
      onlyActive && !(seeAll && String(req.query.all) === "true"),
    );
    res.status(200).json(new ApiResponse(200, badges, "Badges fetched"));
  });

  /**
   * GET /users/badges/:id - Get a single badge by id.
   */
  getBadgeById = AsyncHandler(async (req: Request, res: Response) => {
    const id = param(req, "id");
    const badge = await this.userService.getBadgeById(id);
    res.status(200).json(new ApiResponse(200, badge, "Badge fetched"));
  });

  /**
   * GET /users/badges/slug/:slug - Get a single badge by slug.
   */
  getBadgeBySlug = AsyncHandler(async (req: Request, res: Response) => {
    const slug = param(req, "slug");
    const badge = await this.userService.getBadgeBySlug(slug);
    res.status(200).json(new ApiResponse(200, badge, "Badge fetched"));
  });

  /**
   * PATCH /users/badges/:id - Update a badge (ADMIN / MODERATOR only).
   */
  updateBadge = AsyncHandler(async (req: Request, res: Response) => {
    const id = param(req, "id");
    const { slug, name, description, iconUrl, rarity, xpReward, condition, isActive } = req.body;

    const badge = await this.userService.updateBadge(id, {
      slug,
      name,
      description,
      iconUrl,
      rarity,
      xpReward,
      condition,
      isActive,
    });

    logger.info(`Badge updated: ${badge.slug} (${id})`);
    res.status(200).json(new ApiResponse(200, badge, "Badge updated"));
  });

  /**
   * DELETE /users/badges/:id - Delete a badge (ADMIN only).
   */
  deleteBadge = AsyncHandler(async (req: Request, res: Response) => {
    const id = param(req, "id");
    await this.userService.deleteBadge(id);
    res.status(200).json(new ApiResponse(200, null, "Badge deleted"));
  });
}

import {
  UserRepository,
  UpdateProfileInput,
  FriendshipAction,
  CreateBadgeInput,
  UpdateBadgeInput,
} from "./user.repository";
import { ApiError } from "../../lib/ApiError";
import logger from "../../lib/logger";

export class UserService {
  private userRepository = new UserRepository();

  /**
   * Get a user by their database ID.
   */
  async getById(id: string) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return user;
  }

  /**
   * Get a user by their Clerk ID.
   */
  async getByClerkId(clerkId: string) {
    const user = await this.userRepository.findByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return user;
  }

  /**
   * Get a user by username.
   */
  async getByUsername(username: string) {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return user;
  }

  /**
   * Update the current user's profile.
   */
  async updateProfile(clerkId: string, data: UpdateProfileInput) {
    // If username is being updated, check uniqueness
    if (data.username) {
      const existing = await this.userRepository.findByUsername(data.username);
      if (existing && existing.clerkId !== clerkId) {
        throw new ApiError(409, "Username is already taken");
      }
    }

    const user = await this.userRepository.updateProfile(clerkId, data);
    logger.info(`User profile updated via service: ${user.id}`);
    return user;
  }

  /**
   * Update the current user's avatar.
   */
  async updateAvatar(clerkId: string, imageUrl: string) {
    if (!imageUrl) {
      throw new ApiError(400, "imageUrl is required");
    }
    const user = await this.userRepository.updateAvatar(clerkId, imageUrl);
    logger.info(`User avatar updated via service: ${user.id}`);
    return user;
  }

  /**
   * List users with search and pagination.
   */
  async listUsers(query: string | undefined, limit: number, offset: number) {
    const result = await this.userRepository.listUsers({
      query,
      limit,
      offset,
    });
    return result;
  }

  /**
   * Get the global leaderboard.
   */
  async leaderboard(limit: number) {
    return this.userRepository.getLeaderboard(limit);
  }

  /**
   * Make the current user follow another user.
   */
  async follow(clerkId: string, targetUserId: string) {
    try {
      const follow = await this.userRepository.follow(clerkId, targetUserId);
      return follow;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to follow";
      if (
        message === "Cannot follow yourself" ||
        message === "Target user not found"
      ) {
        throw new ApiError(400, message);
      }
      // Unique constraint violation - already following
      if (message.includes("Unique constraint failed")) {
        throw new ApiError(409, "Already following this user");
      }
      throw new ApiError(500, message);
    }
  }

  /**
   * Unfollow a user.
   */
  async unfollow(clerkId: string, targetUserId: string) {
    const result = await this.userRepository.unfollow(clerkId, targetUserId);
    if (!result) {
      throw new ApiError(400, "Not following this user");
    }
    return result;
  }

  /**
   * List followers of a user (by userId - either a DB id or username lookup).
   */
  async listFollowers(userId: string, limit: number, offset: number) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return this.userRepository.listFollowers(user.id, limit, offset);
  }

  /**
   * List users that a user is following.
   */
  async listFollowing(userId: string, limit: number, offset: number) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return this.userRepository.listFollowing(user.id, limit, offset);
  }

  /**
   * Award XP to a user. Only ADMINS / MODERATORS should call this.
   * The targetUserId is the database ID of the user to award XP to.
   */
  async awardXP(targetUserId: string, amount: number) {
    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      throw new ApiError(400, "amount must be a positive integer");
    }

    // Verify target user exists and get their clerkId
    const target = await this.userRepository.findById(targetUserId);
    if (!target) {
      throw new ApiError(404, "User not found");
    }

    const user = await this.userRepository.awardXP(target.clerkId, amount);
    logger.info(`Awarded ${amount} XP to ${user.id}`);
    return user;
  }

  /**
   * Touch the current user's streak.
   */
  async touchStreak(clerkId: string) {
    const user = await this.userRepository.touchStreak(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return user;
  }

  /**
   * Send a friend request.
   */
  async sendFriendRequest(clerkId: string, targetUserId: string) {
    try {
      return await this.userRepository.sendFriendRequest(clerkId, targetUserId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Cannot send friend request to yourself") {
        throw new ApiError(400, message);
      }
      if (
        message === "You are already friends" ||
        message === "Friend request already exists"
      ) {
        throw new ApiError(409, message);
      }
      throw new ApiError(500, message);
    }
  }

  /**
   * Handle a friendship action: accept, reject, cancel, unfriend.
   */
  async handleFriendshipAction(clerkId: string, friendshipId: string, action: FriendshipAction) {
    try {
      switch (action) {
        case "accept":
          return await this.userRepository.acceptFriendRequest(clerkId, friendshipId);
        case "reject":
          return await this.userRepository.rejectFriendRequest(clerkId, friendshipId);
        case "cancel":
          return await this.userRepository.cancelFriendRequest(clerkId, friendshipId);
        case "unfriend":
          return await this.userRepository.unfriend(clerkId, friendshipId);
        default:
          throw new ApiError(400, "Invalid friendship action");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const message = error instanceof Error ? error.message : "Unknown error";
      if (
        message === "Friend request not found or already handled" ||
        message === "Friendship not found"
      ) {
        throw new ApiError(404, message);
      }
      throw new ApiError(500, message);
    }
  }

  /**
   * List a user's friends.
   */
  async listFriends(userId: string, limit: number, offset: number) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return this.userRepository.listFriends(user.id, limit, offset);
  }

  /**
   * List pending friend requests for the current user.
   */
  async listPendingFriendRequests(clerkId: string, limit: number, offset: number) {
    const user = await this.userRepository.findByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return this.userRepository.listPendingFriendRequests(user.id, limit, offset);
  }

  /**
   * Get a user's badges by user ID.
   */
  async getUserBadges(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    return this.userRepository.findBadgesForUser(user.id);
  }

  // ==================== BADGE METHODS ====================

  /**
   * Create a new badge. Requires ADMIN / MODERATOR.
   */
  async createBadge(data: CreateBadgeInput) {
    // Validate slug uniqueness
    const existing = await this.userRepository.findBadgeBySlug(data.slug);
    if (existing) {
      throw new ApiError(409, `Badge with slug "${data.slug}" already exists`);
    }

    const badge = await this.userRepository.createBadge(data);
    logger.info(`Badge created by service: ${badge.slug}`);
    return badge;
  }

  /**
   * Get a badge by ID.
   */
  async getBadgeById(id: string) {
    const badge = await this.userRepository.findBadgeById(id);
    if (!badge) {
      throw new ApiError(404, "Badge not found");
    }
    return badge;
  }

  /**
   * Get a badge by slug.
   */
  async getBadgeBySlug(slug: string) {
    const badge = await this.userRepository.findBadgeBySlug(slug);
    if (!badge) {
      throw new ApiError(404, `Badge with slug "${slug}" not found`);
    }
    return badge;
  }

  /**
   * List all badges. Public can only see active badges; admins see all.
   */
  async listBadges(onlyActive = true) {
    return this.userRepository.listBadges(onlyActive);
  }

  /**
   * Update a badge. Requires ADMIN / MODERATOR.
   */
  async updateBadge(id: string, data: UpdateBadgeInput) {
    // Ensure badge exists
    await this.getBadgeById(id);

    // If slug is changing, check for uniqueness
    if (data.slug) {
      const existing = await this.userRepository.findBadgeBySlug(data.slug);
      if (existing && existing.id !== id) {
        throw new ApiError(409, `Badge with slug "${data.slug}" already exists`);
      }
    }

    const badge = await this.userRepository.updateBadge(id, data);
    logger.info(`Badge updated by service: ${badge.slug} (${id})`);
    return badge;
  }

  /**
   * Delete a badge. Requires ADMIN.
   */
  async deleteBadge(id: string) {
    await this.userRepository.deleteBadge(id);
    logger.info(`Badge deleted by service: ${id}`);
  }
}

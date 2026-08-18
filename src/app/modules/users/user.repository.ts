import { prisma } from "../../lib/prisma";
import type { BadgeRarity } from "../../../generated/prisma/client";
import logger from "../../lib/logger";

export type ClerkUserPayload = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  updatedAt?: Date;
};

export type UpdateProfileInput = {
  username?: string;
  firstName?: string | null;
  lastName?: string | null;
  bio?: string | null;
  imageUrl?: string | null;
};

export type FriendshipAction =
  | "send"
  | "accept"
  | "reject"
  | "cancel"
  | "unfriend";

export type CreateBadgeInput = {
  slug: string;
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  rarity?: BadgeRarity;
  xpReward?: number;
  condition?: string | null;
  isActive?: boolean;
};

export type UpdateBadgeInput = Partial<CreateBadgeInput>;

export class UserRepository {
  /**
   * Find a user by their Clerk ID. Returns null if not found.
   */
  async findByClerkId(clerkId: string) {
    return prisma.user.findUnique({
      where: { clerkId, deletedAt: null },
    });
  }

  /**
   * Find a user by their email address. Returns null if not found.
   */
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email, deletedAt: null },
    });
  }

  /**
   * Find a user by their database ID (cuid).
   */
  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id, deletedAt: null },
    });
  }

  /**
   * Find a user by their username.
   */
  async findByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username, deletedAt: null },
    });
  }

  /**
   * Create a user record in our database from Clerk's data.
   * Used by the webhook handler when a user signs up in Clerk.
   */
  async upsertClerkUser(payload: ClerkUserPayload) {
    return prisma.user.upsert({
      where: { clerkId: payload.id },
      update: {
        email: payload.email,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        imageUrl: payload.imageUrl ?? null,
        clerkUpdatedAt: payload.updatedAt ?? new Date(),
      },
      create: {
        clerkId: payload.id,
        email: payload.email,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        imageUrl: payload.imageUrl ?? null,
      },
    });
  }

  /**
   * Soft-delete a user (sets deletedAt) when a Clerk user is deleted.
   */
  async softDeleteByClerkId(clerkId: string) {
    const user = await prisma.user.update({
      where: { clerkId },
      data: { deletedAt: new Date() },
    });
    logger.info(`User soft-deleted: ${user.id} (${clerkId})`);
    return user;
  }

  /**
   * Get current user by Clerk ID.
   */
  async getCurrentUser(clerkId: string) {
    return prisma.user.findUnique({
      where: {
        clerkId,
        deletedAt: null,
      },
    });
  }

  /**
   * List all non-deleted users with a search query and pagination.
   */
  async listUsers(options: { query?: string; limit: number; offset: number }) {
    const { query, limit, offset } = options;

    const where = {
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { username: { contains: query, mode: "insensitive" as const } },
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          _count: {
            select: { followers: true, following: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  /**
   * Update a user's profile fields.
   */
  async updateProfile(clerkId: string, data: UpdateProfileInput) {
    const user = await prisma.user.update({
      where: { clerkId, deletedAt: null },
      data: {
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        bio: data.bio,
        imageUrl: data.imageUrl,
      },
    });
    logger.info(`User profile updated: ${user.id} (${clerkId})`);
    return user;
  }

  /**
   * Update a user's avatar / image URL.
   */
  async updateAvatar(clerkId: string, imageUrl: string) {
    const user = await prisma.user.update({
      where: { clerkId, deletedAt: null },
      data: { imageUrl },
    });
    logger.info(`User avatar updated: ${user.id} (${clerkId})`);
    return user;
  }

  /**
   * Get the global leaderboard, sorted by XP.
   */
  async getLeaderboard(limit: number) {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ xp: "desc" }, { streakCount: "desc" }, { createdAt: "asc" }],
      take: limit,
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        imageUrl: true,
        xp: true,
        streakCount: true,
        createdAt: true,
      },
    });
    return users;
  }

  /**
   * Award XP to a user.
   */
  async awardXP(clerkId: string, amount: number) {
    const user = await prisma.user.update({
      where: { clerkId, deletedAt: null },
      data: { xp: { increment: amount } },
    });
    logger.info(`User XP awarded: ${user.id} +${amount} = ${user.xp}`);
    return user;
  }

  /**
   * Touch the user's streak - increments streakCount if lastActiveAt was yesterday
   * or earlier, resets to 1 if it was more than a day ago, or keeps it if today.
   */
  async touchStreak(clerkId: string) {
    const user = await prisma.user.findUnique({
      where: { clerkId, deletedAt: null },
    });

    if (!user) {
      return null;
    }

    const now = new Date();
    const lastActive = user.lastActiveAt;

    let streakCount = user.streakCount;

    if (lastActive) {
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysSinceActive = Math.floor(
        (now.getTime() - lastActive.getTime()) / msPerDay,
      );

      if (daysSinceActive === 0) {
        // Same day - keep streak
        streakCount = user.streakCount;
      } else if (daysSinceActive === 1) {
        // Yesterday - increment streak
        streakCount = user.streakCount + 1;
      } else {
        // Gap > 1 day - reset streak
        streakCount = 1;
      }
    } else {
      // First activity
      streakCount = 1;
    }

    const updated = await prisma.user.update({
      where: { clerkId },
      data: {
        streakCount,
        lastActiveAt: now,
      },
    });

    logger.info(
      `User streak touched: ${user.id} streak=${updated.streakCount} lastActive=${now.toISOString()}`,
    );

    return updated;
  }

  /**
   * Make the current user follow another user.
   */
  async follow(followerClerkId: string, followingId: string) {
    // Get follower from Clerk ID
    const follower = await prisma.user.findUnique({
      where: { clerkId: followerClerkId, deletedAt: null },
    });

    if (!follower) {
      return null;
    }

    if (follower.id === followingId) {
      throw new Error("Cannot follow yourself");
    }

    // Verify the target user exists
    const target = await prisma.user.findUnique({
      where: { id: followingId, deletedAt: null },
    });

    if (!target) {
      throw new Error("Target user not found");
    }

    // Create the follow relationship
    const follow = await prisma.follow.create({
      data: {
        followerId: follower.id,
        followingId,
      },
    });

    logger.info(`User ${follower.id} followed ${followingId}`);
    return follow;
  }

  /**
   * Unfollow a user.
   */
  async unfollow(followerClerkId: string, followingId: string) {
    const follower = await prisma.user.findUnique({
      where: { clerkId: followerClerkId, deletedAt: null },
    });

    if (!follower) {
      return null;
    }

    const deleted = await prisma.follow.deleteMany({
      where: {
        followerId: follower.id,
        followingId,
      },
    });

    logger.info(
      `User ${follower.id} unfollowed ${followingId} (${deleted.count} removed)`,
    );
    return deleted.count > 0;
  }

  /**
   * List followers of a user.
   */
  async listFollowers(userId: string, limit: number, offset: number) {
    const [follows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
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
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.follow.count({ where: { followingId: userId } }),
    ]);

    return {
      users: follows.map((f) => f.follower),
      total,
    };
  }

  /**
   * List users that a user is following.
   */
  async listFollowing(userId: string, limit: number, offset: number) {
    const [follows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          following: {
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
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);

    return {
      users: follows.map((f) => f.following),
      total,
    };
  }

  /**
   * Send a friend request (requester -> addressee).
   */
  async sendFriendRequest(requesterClerkId: string, addresseeId: string) {
    const requester = await prisma.user.findUnique({
      where: { clerkId: requesterClerkId, deletedAt: null },
    });

    if (!requester) {
      return null;
    }

    if (requester.id === addresseeId) {
      throw new Error("Cannot send friend request to yourself");
    }

    // Check if a friendship already exists (either direction)
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: requester.id, addresseeId },
          { requesterId: addresseeId, addresseeId: requester.id },
        ],
      },
    });

    if (existing) {
      if (existing.status === "ACCEPTED") {
        throw new Error("You are already friends");
      }
      throw new Error("Friend request already exists");
    }

    const friendship = await prisma.friendship.create({
      data: {
        requesterId: requester.id,
        addresseeId,
      },
    });

    logger.info(
      `Friend request sent: ${requester.id} -> ${addresseeId} (${friendship.id})`,
    );
    return friendship;
  }

  /**
   * Accept a friend request (as the addressee).
   */
  async acceptFriendRequest(addresseeClerkId: string, friendshipId: string) {
    const addressee = await prisma.user.findUnique({
      where: { clerkId: addresseeClerkId, deletedAt: null },
    });

    if (!addressee) {
      return null;
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        addresseeId: addressee.id,
        status: "PENDING",
      },
    });

    if (!friendship) {
      throw new Error("Friend request not found or already handled");
    }

    const updated = await prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: "ACCEPTED" },
    });

    logger.info(
      `Friend request accepted: ${friendship.requesterId} -> ${friendship.addresseeId} (${friendship.id})`,
    );
    return updated;
  }

  /**
   * Reject / decline a friend request (as the addressee).
   */
  async rejectFriendRequest(addresseeClerkId: string, friendshipId: string) {
    const addressee = await prisma.user.findUnique({
      where: { clerkId: addresseeClerkId, deletedAt: null },
    });

    if (!addressee) {
      return null;
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        addresseeId: addressee.id,
        status: "PENDING",
      },
    });

    if (!friendship) {
      throw new Error("Friend request not found or already handled");
    }

    const deleted = await prisma.friendship.delete({
      where: { id: friendship.id },
    });

    logger.info(
      `Friend request rejected: ${friendship.requesterId} -> ${friendship.addresseeId} (${friendship.id})`,
    );
    return deleted;
  }

  /**
   * Cancel a friend request (as the requester).
   */
  async cancelFriendRequest(requesterClerkId: string, friendshipId: string) {
    const requester = await prisma.user.findUnique({
      where: { clerkId: requesterClerkId, deletedAt: null },
    });

    if (!requester) {
      return null;
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        requesterId: requester.id,
        status: "PENDING",
      },
    });

    if (!friendship) {
      throw new Error("Friend request not found or already handled");
    }

    const deleted = await prisma.friendship.delete({
      where: { id: friendship.id },
    });

    logger.info(
      `Friend request cancelled: ${friendship.requesterId} -> ${friendship.addresseeId} (${friendship.id})`,
    );
    return deleted;
  }

  /**
   * Remove a friend (unfriend) - either party can do it.
   */
  async unfriend(userClerkId: string, friendshipId: string) {
    const user = await prisma.user.findUnique({
      where: { clerkId: userClerkId, deletedAt: null },
    });

    if (!user) {
      return null;
    }

    const friendship = await prisma.friendship.findFirst({
      where: {
        id: friendshipId,
        OR: [
          { requesterId: user.id },
          { addresseeId: user.id },
        ],
      },
    });

    if (!friendship) {
      throw new Error("Friendship not found");
    }

    const deleted = await prisma.friendship.delete({
      where: { id: friendship.id },
    });

    logger.info(
      `User ${user.id} unfriended ${friendship.requesterId === user.id ? friendship.addresseeId : friendship.requesterId} (${friendship.id})`,
    );
    return deleted;
  }

  /**
   * List a user's friends.
   */
  async listFriends(userId: string, limit: number, offset: number) {
    const [friendships, total] = await Promise.all([
      prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
        include: {
          requester: {
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
          addressee: {
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
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.friendship.count({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: userId }, { addresseeId: userId }],
        },
      }),
    ]);

    const friends = friendships.map((f) =>
      f.requesterId === userId ? f.addressee : f.requester,
    );

    return { users: friends, total };
  }

  /**
   * List pending friend requests for a user (received requests).
   */
  async listPendingFriendRequests(userId: string, limit: number, offset: number) {
    const [friendships, total] = await Promise.all([
      prisma.friendship.findMany({
        where: {
          addresseeId: userId,
          status: "PENDING",
        },
        include: {
          requester: {
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
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.friendship.count({
        where: { addresseeId: userId, status: "PENDING" },
      }),
    ]);

    return {
      requests: friendships.map((f) => ({
        id: f.id,
        status: f.status,
        createdAt: f.createdAt,
        user: f.requester,
      })),
      total,
    };
  }

  // ==================== BADGE METHODS ====================

  /**
   * Create a new badge.
   */
  async createBadge(data: CreateBadgeInput) {
    const badge = await prisma.badge.create({
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
        iconUrl: data.iconUrl ?? null,
        rarity: data.rarity ?? "COMMON",
        xpReward: data.xpReward ?? 0,
        condition: data.condition ?? null,
        isActive: data.isActive ?? true,
      },
    });
    logger.info(`Badge created: ${badge.slug}`);
    return badge;
  }

  /**
   * Get a badge by id.
   */
  async findBadgeById(id: string) {
    return prisma.badge.findUnique({ where: { id } });
  }

  /**
   * Get a badge by slug.
   */
  async findBadgeBySlug(slug: string) {
    return prisma.badge.findUnique({ where: { slug } });
  }

  /**
   * List all badges, optionally filtered by active status.
   */
  async listBadges(onlyActive = false) {
    return prisma.badge.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Update a badge by id.
   */
  async updateBadge(id: string, data: UpdateBadgeInput) {
    const badge = await prisma.badge.update({
      where: { id },
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description,
        iconUrl: data.iconUrl,
        rarity: data.rarity,
        xpReward: data.xpReward,
        condition: data.condition,
        isActive: data.isActive,
      },
    });
    logger.info(`Badge updated: ${badge.slug} (${id})`);
    return badge;
  }

  /**
   * Delete a badge permanently by id.
   */
  async deleteBadge(id: string) {
    await prisma.badge.delete({ where: { id } });
    logger.info(`Badge deleted: ${id}`);
  }

  /**
   * List all badges owned by a given user.
   */
  async findBadgesForUser(userId: string) {
    return prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { awardedAt: "desc" },
    });
  }
}

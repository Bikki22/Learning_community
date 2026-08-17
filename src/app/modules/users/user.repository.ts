import { prisma } from "../../lib/prisma";

export type ClerkUserPayload = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  updatedAt?: Date;
};

export class UserRepository {
  /**
   * Find a user by their Clerk ID. Returns null if not found.
   */
  async findByClerkId(clerkId: string) {
    return prisma.user.findUnique({
      where: { clerkId },
    });
  }

  /**
   * Find a user by their email address. Returns null if not found.
   */
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
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
    return prisma.user.update({
      where: { clerkId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * GetAll users from the database (non-deleted).
   */
  async getAllUsers() {
    return prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get the current authenticated user from our database using Clerk ID.
   */
  async getCurrentUser(clerkId: string) {
    return prisma.user.findUnique({
      where: {
        clerkId,
        deletedAt: null,
      },
    });
  }
}

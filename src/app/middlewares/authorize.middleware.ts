import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import logger from "../lib/logger";

export type Role = "MEMBER" | "MODERATOR" | "ADMIN";

/**
 * Middleware factory that restricts access to users with the specified roles.
 * Must be used AFTER requireUser so req.userId is populated.
 *
 * Example:
 *   router.delete("/:id", requireUser, authorize("ADMIN", "MODERATOR"), handler)
 */
export function authorize(...allowedRoles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clerkId = req.userId;
      if (!clerkId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }

      const user = await prisma.user.findUnique({
        where: { clerkId, deletedAt: null },
        select: { role: true },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (!allowedRoles.includes(user.role)) {
        logger.warn("Forbidden access attempt", {
          clerkId,
          role: user.role,
          path: req.originalUrl,
        });
        return res.status(403).json({
          success: false,
          message: "Forbidden: insufficient permissions",
        });
      }

      next();
    } catch (error) {
      logger.error("Authorization middleware error", { error });
      next(error);
    }
  };
}

/**
 * Middleware that restricts access to ADMIN role only.
 */
export const requireAdmin = authorize("ADMIN");

/**
 * Middleware that restricts access to ADMIN or MODERATOR roles.
 */
export const requireModerator = authorize("ADMIN", "MODERATOR");
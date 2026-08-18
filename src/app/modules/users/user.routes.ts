import { Router } from "express";
import { UserController } from "./user.controller";
import { requireUser } from "../../middlewares/auth.middleware";
import { authorize, requireModerator } from "../../middlewares/authorize.middleware";

const router = Router();
const userController = new UserController();

// ==================== BADGE ROUTES ====================
// Must be defined before user routes with :id params to avoid shadowing

// Public badge routes (no auth required)
router.get("/badges", userController.listBadges);
router.get("/badges/slug/:slug", userController.getBadgeBySlug);

// Admin / Moderator badge routes
router.post(
  "/badges",
  requireUser,
  authorize("ADMIN", "MODERATOR"),
  userController.createBadge,
);

router.patch(
  "/badges/:id",
  requireUser,
  authorize("ADMIN", "MODERATOR"),
  userController.updateBadge,
);

router.delete(
  "/badges/:id",
  requireUser,
  requireModerator,
  userController.deleteBadge,
);

// GET /users/badges/:id - get badge by id (must be after /badges/slug/:slug)
router.get("/badges/:id", userController.getBadgeById);

// ==================== USER ROUTES ====================

// Public routes
router.get("/", userController.listUsers);
router.get("/leaderboard", userController.getLeaderboard);
router.get("/by-username/:username", userController.getUserByUsername);
router.get("/:id/badges", userController.getUserBadges);
router.get("/:id/followers", userController.listFollowers);
router.get("/:id/following", userController.listFollowing);
router.get("/:id/friends", userController.listFriends);

// Auth-protected routes
router.get("/me", requireUser, userController.getMe);
router.get("/friend-requests/pending", requireUser, userController.listPendingFriendRequests);

// Profile update routes
router.patch("/profile", requireUser, userController.updateProfile);
router.patch("/avatar", requireUser, userController.updateAvatar);

// Follow routes
router.post("/:id/follow", requireUser, userController.followUser);
router.delete("/:id/follow", requireUser, userController.unfollowUser);

// Friendship routes
router.post("/friend-requests", requireUser, userController.sendFriendRequest);
router.post("/friend-requests/:friendshipId/accept", requireUser, userController.acceptFriendRequest);
router.post("/friend-requests/:friendshipId/reject", requireUser, userController.rejectFriendRequest);
router.delete("/friend-requests/:friendshipId", requireUser, userController.cancelFriendRequest);
router.delete("/friends/:friendshipId", requireUser, userController.unfriend);

// User enhancement routes
router.post("/touch-streak", requireUser, userController.touchStreak);
router.post(
  "/:id/award-xp",
  requireUser,
  authorize("ADMIN", "MODERATOR"),
  userController.awardXP,
);

// GET /users/:id - must be last so it doesn't shadow specific routes
router.get("/:id", userController.getUserById);

export default router;
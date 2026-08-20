import { Router } from "express";
import { CommunityController } from "./community.controller";
import { requireUser } from "../../middlewares/auth.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  createCommunitySchema,
  updateCommunitySchema,
  createChannelSchema,
  updateChannelSchema,
  createPostSchema,
  updatePostSchema,
  createCommentSchema,
  updateCommentSchema,
  updateMemberRoleSchema,
  paginationQuerySchema,
} from "./community.validator";

const router = Router();
const communityController = new CommunityController();

// ==================== COMMUNITY ROUTES ====================

// Public routes
router.get("/", validate(paginationQuerySchema, "query"), communityController.listCommunities);

// Auth-protected routes
router.post(
  "/",
  requireUser,
  validate(createCommunitySchema),
  communityController.createCommunity,
);

// Membership routes (must be before /:slug and /:id routes)
router.post("/:id/join", requireUser, communityController.joinCommunity);
router.delete("/:id/leave", requireUser, communityController.leaveCommunity);
router.get("/:id/members", communityController.listCommunityMembers);
router.patch(
  "/:id/members/:userId",
  requireUser,
  validate(updateMemberRoleSchema),
  communityController.updateMemberRole,
);

// ==================== CHANNEL ROUTES ====================

router.get("/:communityId/channels", communityController.listChannels);
router.post(
  "/:communityId/channels",
  requireUser,
  validate(createChannelSchema),
  communityController.createChannel,
);
router.patch(
  "/:communityId/channels/:channelId",
  requireUser,
  validate(updateChannelSchema),
  communityController.updateChannel,
);
router.delete(
  "/:communityId/channels/:channelId",
  requireUser,
  communityController.deleteChannel,
);

// ==================== POST ROUTES ====================

router.get(
  "/:communityId/posts",
  validate(paginationQuerySchema, "query"),
  communityController.listPosts,
);
router.get("/:communityId/posts/:postId", communityController.getPostById);

router.post(
  "/:communityId/posts",
  requireUser,
  validate(createPostSchema),
  communityController.createPost,
);
router.patch(
  "/:communityId/posts/:postId",
  requireUser,
  validate(updatePostSchema),
  communityController.updatePost,
);
router.delete(
  "/:communityId/posts/:postId",
  requireUser,
  communityController.deletePost,
);

// ==================== COMMENT ROUTES ====================

router.get(
  "/:communityId/posts/:postId/comments",
  validate(paginationQuerySchema, "query"),
  communityController.listComments,
);
router.post(
  "/:communityId/posts/:postId/comments",
  requireUser,
  validate(createCommentSchema),
  communityController.addComment,
);
router.patch(
  "/:communityId/posts/:postId/comments/:commentId",
  requireUser,
  validate(updateCommentSchema),
  communityController.updateComment,
);
router.delete(
  "/:communityId/posts/:postId/comments/:commentId",
  requireUser,
  communityController.deleteComment,
);

// ==================== LIKE ROUTES ====================

router.post(
  "/:communityId/posts/:postId/like",
  requireUser,
  communityController.likePost,
);
router.delete(
  "/:communityId/posts/:postId/like",
  requireUser,
  communityController.unlikePost,
);

router.post(
  "/:communityId/posts/:postId/comments/:commentId/like",
  requireUser,
  communityController.likeComment,
);
router.delete(
  "/:communityId/posts/:postId/comments/:commentId/like",
  requireUser,
  communityController.unlikeComment,
);

// Community update/delete (must be after specific routes)
router.patch(
  "/:id",
  requireUser,
  validate(updateCommunitySchema),
  communityController.updateCommunity,
);
router.delete("/:id", requireUser, communityController.deleteCommunity);

// Get community by slug (must be last to avoid shadowing)
router.get("/:slug", communityController.getCommunityBySlug);

export default router;

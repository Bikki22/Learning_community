import { Router } from "express";
import { ChatController } from "./chat.controller";
import { requireUser } from "../../middlewares/auth.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  createConversationSchema,
  addParticipantSchema,
  createMessageSchema,
  updateMessageSchema,
  createGroupSchema,
  updateGroupSchema,
  addGroupMemberSchema,
  updateGroupMemberRoleSchema,
  createGroupMessageSchema,
  updateGroupMessageSchema,
  paginationQuerySchema,
} from "./chat.validator";

const router = Router();
const chatController = new ChatController();

// ==================== CONVERSATION ROUTES ====================

router.get(
  "/conversations",
  requireUser,
  validate(paginationQuerySchema, "query"),
  chatController.listConversations,
);

router.get(
  "/conversations/:conversationId",
  requireUser,
  chatController.getConversation,
);

router.post(
  "/conversations",
  requireUser,
  validate(createConversationSchema),
  chatController.createConversation,
);

router.delete(
  "/conversations/:conversationId",
  requireUser,
  chatController.deleteConversation,
);

router.post(
  "/conversations/:conversationId/participants",
  requireUser,
  validate(addParticipantSchema),
  chatController.addParticipant,
);

router.delete(
  "/conversations/:conversationId/participants/:userId",
  requireUser,
  chatController.removeParticipant,
);

router.post(
  "/conversations/:conversationId/read",
  requireUser,
  chatController.markConversationRead,
);

// ==================== MESSAGE ROUTES ====================

router.get(
  "/conversations/:conversationId/messages",
  requireUser,
  validate(paginationQuerySchema, "query"),
  chatController.listMessages,
);

router.post(
  "/conversations/:conversationId/messages",
  requireUser,
  validate(createMessageSchema),
  chatController.sendMessage,
);

router.patch(
  "/conversations/:conversationId/messages/:messageId",
  requireUser,
  validate(updateMessageSchema),
  chatController.editMessage,
);

router.delete(
  "/conversations/:conversationId/messages/:messageId",
  requireUser,
  chatController.deleteMessage,
);

router.post(
  "/conversations/:conversationId/messages/:messageId/read",
  requireUser,
  chatController.markMessageRead,
);

// ==================== GROUP ROUTES ====================

router.get(
  "/groups",
  requireUser,
  validate(paginationQuerySchema, "query"),
  chatController.listGroups,
);

router.get(
  "/groups/:groupId",
  requireUser,
  chatController.getGroup,
);

router.post(
  "/groups",
  requireUser,
  validate(createGroupSchema),
  chatController.createGroup,
);

router.patch(
  "/groups/:groupId",
  requireUser,
  validate(updateGroupSchema),
  chatController.updateGroup,
);

router.delete(
  "/groups/:groupId",
  requireUser,
  chatController.deleteGroup,
);

router.post(
  "/groups/:groupId/members",
  requireUser,
  validate(addGroupMemberSchema),
  chatController.addGroupMember,
);

router.delete(
  "/groups/:groupId/members/:userId",
  requireUser,
  chatController.removeGroupMember,
);

router.patch(
  "/groups/:groupId/members/:userId",
  requireUser,
  validate(updateGroupMemberRoleSchema),
  chatController.updateGroupMemberRole,
);

router.post(
  "/groups/:groupId/read",
  requireUser,
  chatController.markGroupRead,
);

// ==================== GROUP MESSAGE ROUTES ====================

router.get(
  "/groups/:groupId/messages",
  requireUser,
  validate(paginationQuerySchema, "query"),
  chatController.listGroupMessages,
);

router.post(
  "/groups/:groupId/messages",
  requireUser,
  validate(createGroupMessageSchema),
  chatController.sendGroupMessage,
);

router.patch(
  "/groups/:groupId/messages/:messageId",
  requireUser,
  validate(updateGroupMessageSchema),
  chatController.editGroupMessage,
);

router.delete(
  "/groups/:groupId/messages/:messageId",
  requireUser,
  chatController.deleteGroupMessage,
);

router.post(
  "/groups/:groupId/messages/:messageId/read",
  requireUser,
  chatController.markGroupMessageRead,
);

export default router;
import { Request, Response } from "express";
import { ChatService } from "./chat.service";
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

export class ChatController {
  private chatService = new ChatService();

  // ==================== CONVERSATION METHODS ====================

  /**
   * GET /chats/conversations - List conversations for the user.
   */
  listConversations = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const limit = Math.min(
      parseIntParam(req.query.limit as string | undefined, 20),
      100,
    );
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.chatService.listConversations(clerkId, limit, offset);
    res.status(200).json(new ApiResponse(200, result, "Conversations fetched"));
  });

  /**
   * GET /chats/conversations/:conversationId - Get a single conversation.
   */
  getConversation = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    const conversation = await this.chatService.getConversation(clerkId, conversationId);
    res.status(200).json(new ApiResponse(200, conversation, "Conversation fetched"));
  });

  /**
   * POST /chats/conversations - Create a new conversation.
   */
  createConversation = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const { type, participantIds } = req.body;
    const conversation = await this.chatService.createConversation(clerkId, {
      type,
      participantIds,
    });

    if (!conversation) {
      throw new ApiError(500, "Failed to create conversation");
    }

    logger.info(`Conversation created: ${conversation.id}`);
    res.status(201).json(new ApiResponse(201, conversation, "Conversation created"));
  });

  /**
   * DELETE /chats/conversations/:conversationId - Delete a conversation.
   */
  deleteConversation = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    await this.chatService.deleteConversation(clerkId, conversationId);
    logger.info(`Conversation deleted: ${conversationId}`);
    res.status(200).json(new ApiResponse(200, null, "Conversation deleted"));
  });

  /**
   * POST /chats/conversations/:conversationId/participants - Add a participant.
   */
  addParticipant = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    const { userId } = req.body;

    const participant = await this.chatService.addParticipant(
      clerkId,
      conversationId,
      userId,
    );
    logger.info(`Participant ${userId} added to ${conversationId}`);
    res.status(201).json(new ApiResponse(201, participant, "Participant added"));
  });

  /**
   * DELETE /chats/conversations/:conversationId/participants/:userId - Remove a participant.
   */
  removeParticipant = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    const userId = param(req, "userId");

    await this.chatService.removeParticipant(clerkId, conversationId, userId);
    logger.info(`Participant ${userId} removed from ${conversationId}`);
    res.status(200).json(new ApiResponse(200, null, "Participant removed"));
  });

  /**
   * POST /chats/conversations/:conversationId/read - Mark conversation as read.
   */
  markConversationRead = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    const result = await this.chatService.markConversationRead(clerkId, conversationId);
    res.status(200).json(new ApiResponse(200, result, "Conversation marked as read"));
  });

  // ==================== MESSAGE METHODS ====================

  /**
   * GET /chats/conversations/:conversationId/messages - List messages.
   */
  listMessages = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    const limit = Math.min(
      parseIntParam(req.query.limit as string | undefined, 50),
      100,
    );
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.chatService.listMessages(clerkId, conversationId, limit, offset);
    res.status(200).json(new ApiResponse(200, result, "Messages fetched"));
  });

  /**
   * POST /chats/conversations/:conversationId/messages - Send a message.
   */
  sendMessage = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    const { content, type, attachmentUrl, replyToId } = req.body;

    const message = await this.chatService.sendMessage(clerkId, conversationId, {
      content,
      type,
      attachmentUrl,
      replyToId,
    });

    logger.info(`Message sent: ${message.id}`);
    res.status(201).json(new ApiResponse(201, message, "Message sent"));
  });

  /**
   * PATCH /chats/conversations/:conversationId/messages/:messageId - Edit a message.
   */
  editMessage = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    const messageId = param(req, "messageId");
    const { content } = req.body;

    const message = await this.chatService.editMessage(clerkId, conversationId, messageId, {
      content,
    });

    logger.info(`Message edited: ${messageId}`);
    res.status(200).json(new ApiResponse(200, message, "Message updated"));
  });

  /**
   * DELETE /chats/conversations/:conversationId/messages/:messageId - Delete a message.
   */
  deleteMessage = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    const messageId = param(req, "messageId");

    await this.chatService.deleteMessage(clerkId, conversationId, messageId);
    logger.info(`Message deleted: ${messageId}`);
    res.status(200).json(new ApiResponse(200, null, "Message deleted"));
  });

  /**
   * POST /chats/conversations/:conversationId/messages/:messageId/read - Mark message as read.
   */
  markMessageRead = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const conversationId = param(req, "conversationId");
    const messageId = param(req, "messageId");

    const receipt = await this.chatService.markMessageRead(clerkId, conversationId, messageId);
    res.status(200).json(new ApiResponse(200, receipt, "Message marked as read"));
  });

  // ==================== GROUP METHODS ====================

  /**
   * GET /chats/groups - List groups for the user.
   */
  listGroups = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const limit = Math.min(
      parseIntParam(req.query.limit as string | undefined, 20),
      100,
    );
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.chatService.listGroups(clerkId, limit, offset);
    res.status(200).json(new ApiResponse(200, result, "Groups fetched"));
  });

  /**
   * GET /chats/groups/:groupId - Get a single group.
   */
  getGroup = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const group = await this.chatService.getGroup(clerkId, groupId);
    res.status(200).json(new ApiResponse(200, group, "Group fetched"));
  });

  /**
   * POST /chats/groups - Create a new group.
   */
  createGroup = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const { name, description, imageUrl, memberIds } = req.body;
    const group = await this.chatService.createGroup(clerkId, {
      name,
      description,
      imageUrl,
      memberIds,
    });

    logger.info(`Group created: ${group.name} (${group.id})`);
    res.status(201).json(new ApiResponse(201, group, "Group created"));
  });

  /**
   * PATCH /chats/groups/:groupId - Update a group.
   */
  updateGroup = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const { name, description, imageUrl } = req.body;

    const group = await this.chatService.updateGroup(clerkId, groupId, {
      name,
      description,
      imageUrl,
    });

    logger.info(`Group updated: ${groupId}`);
    res.status(200).json(new ApiResponse(200, group, "Group updated"));
  });

  /**
   * DELETE /chats/groups/:groupId - Delete a group.
   */
  deleteGroup = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    await this.chatService.deleteGroup(clerkId, groupId);
    logger.info(`Group deleted: ${groupId}`);
    res.status(200).json(new ApiResponse(200, null, "Group deleted"));
  });

  /**
   * POST /chats/groups/:groupId/members - Add a member to a group.
   */
  addGroupMember = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const { userId } = req.body;

    const member = await this.chatService.addGroupMember(clerkId, groupId, userId);
    logger.info(`Member ${userId} added to group ${groupId}`);
    res.status(201).json(new ApiResponse(201, member, "Member added"));
  });

  /**
   * DELETE /chats/groups/:groupId/members/:userId - Remove a member from a group.
   */
  removeGroupMember = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const userId = param(req, "userId");

    await this.chatService.removeGroupMember(clerkId, groupId, userId);
    logger.info(`Member ${userId} removed from group ${groupId}`);
    res.status(200).json(new ApiResponse(200, null, "Member removed"));
  });

  /**
   * PATCH /chats/groups/:groupId/members/:userId - Update member role.
   */
  updateGroupMemberRole = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const userId = param(req, "userId");
    const { role } = req.body;

    const member = await this.chatService.updateGroupMemberRole(clerkId, groupId, userId, role);
    logger.info(`Member ${userId} role updated to ${role} in group ${groupId}`);
    res.status(200).json(new ApiResponse(200, member, "Member role updated"));
  });

  /**
   * POST /chats/groups/:groupId/read - Mark group as read.
   */
  markGroupRead = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const result = await this.chatService.markGroupRead(clerkId, groupId);
    res.status(200).json(new ApiResponse(200, result, "Group marked as read"));
  });

  // ==================== GROUP MESSAGE METHODS ====================

  /**
   * GET /chats/groups/:groupId/messages - List group messages.
   */
  listGroupMessages = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const limit = Math.min(
      parseIntParam(req.query.limit as string | undefined, 50),
      100,
    );
    const offset = parseIntParam(req.query.offset as string | undefined, 0);

    const result = await this.chatService.listGroupMessages(clerkId, groupId, limit, offset);
    res.status(200).json(new ApiResponse(200, result, "Group messages fetched"));
  });

  /**
   * POST /chats/groups/:groupId/messages - Send a group message.
   */
  sendGroupMessage = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const { content, type, attachmentUrl, replyToId } = req.body;

    const message = await this.chatService.sendGroupMessage(clerkId, groupId, {
      content,
      type,
      attachmentUrl,
      replyToId,
    });

    logger.info(`Group message sent: ${message.id}`);
    res.status(201).json(new ApiResponse(201, message, "Group message sent"));
  });

  /**
   * PATCH /chats/groups/:groupId/messages/:messageId - Edit a group message.
   */
  editGroupMessage = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const messageId = param(req, "messageId");
    const { content } = req.body;

    const message = await this.chatService.editGroupMessage(clerkId, groupId, messageId, {
      content,
    });

    logger.info(`Group message edited: ${messageId}`);
    res.status(200).json(new ApiResponse(200, message, "Group message updated"));
  });

  /**
   * DELETE /chats/groups/:groupId/messages/:messageId - Delete a group message.
   */
  deleteGroupMessage = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const messageId = param(req, "messageId");

    await this.chatService.deleteGroupMessage(clerkId, groupId, messageId);
    logger.info(`Group message deleted: ${messageId}`);
    res.status(200).json(new ApiResponse(200, null, "Group message deleted"));
  });

  /**
   * POST /chats/groups/:groupId/messages/:messageId/read - Mark group message as read.
   */
  markGroupMessageRead = AsyncHandler(async (req: Request, res: Response) => {
    const clerkId = req.userId;
    if (!clerkId) {
      throw new ApiError(401, "Unauthorized");
    }

    const groupId = param(req, "groupId");
    const messageId = param(req, "messageId");

    const receipt = await this.chatService.markGroupMessageRead(clerkId, groupId, messageId);
    res.status(200).json(new ApiResponse(200, receipt, "Group message marked as read"));
  });
}
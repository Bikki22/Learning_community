import {
  ChatRepository,
  CreateConversationInput,
  CreateMessageInput,
  UpdateMessageInput,
  CreateGroupInput,
  UpdateGroupInput,
  CreateGroupMessageInput,
  UpdateGroupMessageInput,
} from "./chat.repository";
import { ApiError } from "../../lib/ApiError";
import logger from "../../lib/logger";
import type { ParticipantRole } from "../../../generated/prisma/client";

export class ChatService {
  private chatRepository = new ChatRepository();

  // ==================== CONVERSATION METHODS ====================

  /**
   * List conversations for the authenticated user.
   */
  async listConversations(clerkId: string, limit: number, offset: number) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return this.chatRepository.listConversations(user.id, limit, offset);
  }

  /**
   * Get a single conversation by ID.
   */
  async getConversation(clerkId: string, conversationId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.getConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is a participant
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    return conversation;
  }

  /**
   * Create a new conversation (direct or group).
   */
  async createConversation(clerkId: string, data: CreateConversationInput) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Validate all participant IDs exist
    const participantIds = [...new Set([...data.participantIds, user.id])];
    for (const id of participantIds) {
      const target = await this.chatRepository.findUserById(id);
      if (!target) {
        throw new ApiError(400, `User ${id} not found`);
      }
    }

    // For DIRECT conversations, check if one already exists
    if (data.type === "DIRECT" && participantIds.length === 2) {
      const otherUserId = participantIds.find((id) => id !== user.id);
      if (otherUserId) {
        const existing = await this.chatRepository.findDirectConversation(
          user.id,
          otherUserId,
        );
        if (existing) {
          return this.chatRepository.getConversationById(existing.id);
        }
      }
    }

    const conversation = await this.chatRepository.createConversation(user.id, {
      type: data.type,
      participantIds,
    });

    logger.info(`Conversation created by service: ${conversation.id}`);
    return conversation;
  }

  /**
   * Delete a conversation (soft delete).
   */
  async deleteConversation(clerkId: string, conversationId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is the creator or has OWNER role
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    if (conversation.createdById !== user.id && participant.role !== "OWNER") {
      throw new ApiError(403, "Forbidden: only the conversation owner can delete it");
    }

    await this.chatRepository.deleteConversation(conversationId);
    logger.info(`Conversation deleted by service: ${conversationId}`);
  }

  /**
   * Add a participant to a conversation.
   */
  async addParticipant(clerkId: string, conversationId: string, targetUserId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is a participant
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    // Check target user exists
    const targetUser = await this.chatRepository.findUserById(targetUserId);
    if (!targetUser) {
      throw new ApiError(404, "Target user not found");
    }

    // Check if already a participant
    const existing = await this.chatRepository.findParticipant(conversationId, targetUserId);
    if (existing) {
      throw new ApiError(409, "User is already a participant of this conversation");
    }

    const added = await this.chatRepository.addParticipant(conversationId, targetUserId);
    logger.info(`Participant ${targetUserId} added to ${conversationId} by ${user.id} via service`);
    return added;
  }

  /**
   * Remove a participant from a conversation.
   */
  async removeParticipant(clerkId: string, conversationId: string, targetUserId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is a participant
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    // Cannot remove owner
    if (targetUserId === conversation.createdById) {
      throw new ApiError(400, "Cannot remove the conversation owner");
    }

    // Check target is a participant
    const targetParticipant = await this.chatRepository.findParticipant(conversationId, targetUserId);
    if (!targetParticipant) {
      throw new ApiError(404, "Target user is not a participant of this conversation");
    }

    // Permission: owner or self-removal
    const isOwner = conversation.createdById === user.id || participant.role === "OWNER";
    if (!isOwner && user.id !== targetUserId) {
      throw new ApiError(403, "Forbidden: only the owner can remove other participants");
    }

    const removed = await this.chatRepository.removeParticipant(conversationId, targetUserId);
    if (!removed) {
      throw new ApiError(400, "Failed to remove participant");
    }
    logger.info(`Participant ${targetUserId} removed from ${conversationId} by ${user.id} via service`);
  }

  // ==================== MESSAGE METHODS ====================

  /**
   * List messages in a conversation with pagination.
   */
  async listMessages(clerkId: string, conversationId: string, limit: number, offset: number) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is a participant
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    return this.chatRepository.listMessages(conversationId, limit, offset);
  }

  /**
   * Send a message in a conversation.
   */
  async sendMessage(clerkId: string, conversationId: string, data: CreateMessageInput) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is a participant
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    // If replyToId is provided, verify it belongs to this conversation
    if (data.replyToId) {
      const replyTo = await this.chatRepository.findMessageById(data.replyToId);
      if (!replyTo || replyTo.conversationId !== conversationId) {
        throw new ApiError(400, "Reply message not found in this conversation");
      }
    }

    const message = await this.chatRepository.createMessage(conversationId, user.id, data);
    logger.info(`Message sent by service: ${message.id}`);

    // Sort by createdAt desc in repository, return the message with sender info
    return message;
  }

  /**
   * Edit a message.
   */
  async editMessage(clerkId: string, conversationId: string, messageId: string, data: UpdateMessageInput) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is a participant
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    const message = await this.chatRepository.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new ApiError(404, "Message not found");
    }

    // Only the sender can edit their own message
    if (message.senderId !== user.id) {
      throw new ApiError(403, "Forbidden: only the sender can edit this message");
    }

    const updated = await this.chatRepository.updateMessage(messageId, data);
    logger.info(`Message edited by service: ${messageId}`);
    return updated;
  }

  /**
   * Delete a message (soft delete).
   */
  async deleteMessage(clerkId: string, conversationId: string, messageId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is a participant
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    const message = await this.chatRepository.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new ApiError(404, "Message not found");
    }

    // Sender can delete own message, owner can delete any message
    const isOwner = conversation.createdById === user.id || participant.role === "OWNER";
    if (message.senderId !== user.id && !isOwner) {
      throw new ApiError(403, "Forbidden: only the sender or owner can delete this message");
    }

    await this.chatRepository.deleteMessage(messageId);
    logger.info(`Message deleted by service: ${messageId}`);
  }

  /**
   * Mark a message as read.
   */
  async markMessageRead(clerkId: string, conversationId: string, messageId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is a participant
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    const message = await this.chatRepository.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new ApiError(404, "Message not found");
    }

    // Don't mark own messages as read
    if (message.senderId === user.id) {
      throw new ApiError(400, "Cannot mark your own message as read");
    }

    const receipt = await this.chatRepository.markMessageRead(messageId, user.id);
    logger.info(`Message ${messageId} marked as read by ${user.id} via service`);
    return receipt;
  }

  /**
   * Mark all messages in a conversation as read.
   */
  async markConversationRead(clerkId: string, conversationId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await this.chatRepository.findConversationById(conversationId);
    if (!conversation) {
      throw new ApiError(404, "Conversation not found");
    }

    // Check user is a participant
    const participant = await this.chatRepository.findParticipant(conversationId, user.id);
    if (!participant) {
      throw new ApiError(403, "Forbidden: you are not a participant of this conversation");
    }

    const count = await this.chatRepository.markConversationRead(conversationId, user.id);
    logger.info(`Conversation ${conversationId} marked as read by ${user.id} via service`);
    return { readCount: count };
  }

  // ==================== GROUP METHODS ====================

  /**
   * List groups for the authenticated user.
   */
  async listGroups(clerkId: string, limit: number, offset: number) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    return this.chatRepository.listGroups(user.id, limit, offset);
  }

  /**
   * Get a single group by ID.
   */
  async getGroup(clerkId: string, groupId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.getGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Check user is a member
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    return group;
  }

  /**
   * Create a new group.
   */
  async createGroup(clerkId: string, data: CreateGroupInput) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Validate all member IDs exist
    const memberIds = [...new Set([...data.memberIds, user.id])];
    for (const id of memberIds) {
      const target = await this.chatRepository.findUserById(id);
      if (!target) {
        throw new ApiError(400, `User ${id} not found`);
      }
    }

    const group = await this.chatRepository.createGroup(user.id, {
      name: data.name,
      description: data.description,
      imageUrl: data.imageUrl,
      memberIds,
    });

    logger.info(`Group created by service: ${group.name} (${group.id})`);
    return group;
  }

  /**
   * Update a group.
   */
  async updateGroup(clerkId: string, groupId: string, data: UpdateGroupInput) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Check user has permission
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    if (group.createdById !== user.id && member.role !== "ADMIN" && member.role !== "OWNER") {
      throw new ApiError(403, "Forbidden: only the group admin or owner can update the group");
    }

    const updated = await this.chatRepository.updateGroup(groupId, data);
    logger.info(`Group updated by service: ${groupId}`);
    return updated;
  }

  /**
   * Delete a group (soft delete).
   */
  async deleteGroup(clerkId: string, groupId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Only creator can delete the group
    if (group.createdById !== user.id) {
      throw new ApiError(403, "Forbidden: only the group creator can delete it");
    }

    await this.chatRepository.deleteGroup(groupId);
    logger.info(`Group deleted by service: ${groupId}`);
  }

  /**
   * Add a member to a group.
   */
  async addGroupMember(clerkId: string, groupId: string, targetUserId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Check user has permission (creator or admin)
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    if (member.role !== "OWNER" && member.role !== "ADMIN") {
      throw new ApiError(403, "Forbidden: only group admins can add members");
    }

    // Check target user exists
    const targetUser = await this.chatRepository.findUserById(targetUserId);
    if (!targetUser) {
      throw new ApiError(404, "Target user not found");
    }

    // Check if already a member
    const existing = await this.chatRepository.findGroupMember(groupId, targetUserId);
    if (existing) {
      throw new ApiError(409, "User is already a member of this group");
    }

    const added = await this.chatRepository.addGroupMember(groupId, targetUserId);
    logger.info(`Member ${targetUserId} added to group ${groupId} by ${user.id} via service`);
    return added;
  }

  /**
   * Remove a member from a group.
   */
  async removeGroupMember(clerkId: string, groupId: string, targetUserId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Cannot remove the group creator
    if (targetUserId === group.createdById) {
      throw new ApiError(400, "Cannot remove the group creator");
    }

    // Check user has permission or is removing self
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    // Check target member exists
    const targetMember = await this.chatRepository.findGroupMember(groupId, targetUserId);
    if (!targetMember) {
      throw new ApiError(404, "Target user is not a member of this group");
    }

    // Permission: admin can remove others, user can remove self
    const isAdmin = member.role === "OWNER" || member.role === "ADMIN";
    if (!isAdmin && user.id !== targetUserId) {
      throw new ApiError(403, "Forbidden: only group admins can remove other members");
    }

    const removed = await this.chatRepository.removeGroupMember(groupId, targetUserId);
    if (!removed) {
      throw new ApiError(400, "Failed to remove member");
    }
    logger.info(`Member ${targetUserId} removed from group ${groupId} by ${user.id} via service`);
  }

  /**
   * Update a group member's role.
   */
  async updateGroupMemberRole(
    clerkId: string,
    groupId: string,
    targetUserId: string,
    role: ParticipantRole,
  ) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Only group creator can change roles
    if (group.createdById !== user.id) {
      throw new ApiError(403, "Forbidden: only the group creator can change roles");
    }

    const targetMember = await this.chatRepository.findGroupMember(groupId, targetUserId);
    if (!targetMember) {
      throw new ApiError(404, "Target user is not a member of this group");
    }

    const updated = await this.chatRepository.updateGroupMemberRole(groupId, targetUserId, role);
    logger.info(`Member ${targetUserId} role updated to ${role} in group ${groupId} by service`);
    return updated;
  }

  // ==================== GROUP MESSAGE METHODS ====================

  /**
   * List messages in a group with pagination.
   */
  async listGroupMessages(clerkId: string, groupId: string, limit: number, offset: number) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Check user is a member
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    return this.chatRepository.listGroupMessages(groupId, limit, offset);
  }

  /**
   * Send a message in a group.
   */
  async sendGroupMessage(clerkId: string, groupId: string, data: CreateGroupMessageInput) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Check user is a member
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    // If replyToId is provided, verify it belongs to this group
    if (data.replyToId) {
      const replyTo = await this.chatRepository.findGroupMessageById(data.replyToId);
      if (!replyTo || replyTo.groupId !== groupId) {
        throw new ApiError(400, "Reply message not found in this group");
      }
    }

    const message = await this.chatRepository.createGroupMessage(groupId, user.id, data);
    logger.info(`Group message sent by service: ${message.id}`);
    return message;
  }

  /**
   * Edit a group message.
   */
  async editGroupMessage(
    clerkId: string,
    groupId: string,
    messageId: string,
    data: UpdateGroupMessageInput,
  ) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Check user is a member
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    const message = await this.chatRepository.findGroupMessageById(messageId);
    if (!message || message.groupId !== groupId) {
      throw new ApiError(404, "Group message not found");
    }

    // Only sender can edit their own message
    if (message.senderId !== user.id) {
      throw new ApiError(403, "Forbidden: only the sender can edit this message");
    }

    const updated = await this.chatRepository.updateGroupMessage(messageId, data);
    logger.info(`Group message edited by service: ${messageId}`);
    return updated;
  }

  /**
   * Delete a group message (soft delete).
   */
  async deleteGroupMessage(clerkId: string, groupId: string, messageId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Check user is a member
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    const message = await this.chatRepository.findGroupMessageById(messageId);
    if (!message || message.groupId !== groupId) {
      throw new ApiError(404, "Group message not found");
    }

    // Sender can delete own message, creator or admin can delete any
    const isAdmin = member.role === "OWNER" || member.role === "ADMIN";
    if (message.senderId !== user.id && !isAdmin && group.createdById !== user.id) {
      throw new ApiError(403, "Forbidden: only the sender or group admin can delete this message");
    }

    await this.chatRepository.deleteGroupMessage(messageId);
    logger.info(`Group message deleted by service: ${messageId}`);
  }

  /**
   * Mark a group message as read.
   */
  async markGroupMessageRead(clerkId: string, groupId: string, messageId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Check user is a member
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    const message = await this.chatRepository.findGroupMessageById(messageId);
    if (!message || message.groupId !== groupId) {
      throw new ApiError(404, "Group message not found");
    }

    // Don't mark own messages as read
    if (message.senderId === user.id) {
      throw new ApiError(400, "Cannot mark your own message as read");
    }

    const receipt = await this.chatRepository.markGroupMessageRead(messageId, user.id);
    logger.info(`Group message ${messageId} marked as read by ${user.id} via service`);
    return receipt;
  }

  /**
   * Mark all messages in a group as read.
   */
  async markGroupRead(clerkId: string, groupId: string) {
    const user = await this.chatRepository.findUserByClerkId(clerkId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const group = await this.chatRepository.findGroupById(groupId);
    if (!group) {
      throw new ApiError(404, "Group not found");
    }

    // Check user is a member
    const member = await this.chatRepository.findGroupMember(groupId, user.id);
    if (!member) {
      throw new ApiError(403, "Forbidden: you are not a member of this group");
    }

    const count = await this.chatRepository.markGroupRead(groupId, user.id);
    logger.info(`Group ${groupId} marked as read by ${user.id} via service`);
    return { readCount: count };
  }
}
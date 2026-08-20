import { prisma } from "../../lib/prisma";
import logger from "../../lib/logger";
import type {
  ConversationType,
  MessageType,
  ParticipantRole,
} from "../../../generated/prisma/client";

// ==================== INPUT TYPES ====================

export type CreateConversationInput = {
  type: ConversationType;
  participantIds: string[];
};

export type CreateMessageInput = {
  content: string;
  type?: MessageType;
  attachmentUrl?: string | null;
  replyToId?: string | null;
};

export type UpdateMessageInput = {
  content: string;
};

export type CreateGroupInput = {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  memberIds: string[];
};

export type UpdateGroupInput = {
  name?: string;
  description?: string | null;
  imageUrl?: string | null;
};

export type CreateGroupMessageInput = {
  content: string;
  type?: MessageType;
  attachmentUrl?: string | null;
  replyToId?: string | null;
};

export type UpdateGroupMessageInput = {
  content: string;
};

export class ChatRepository {
  // ==================== USER HELPER METHODS ====================

  /**
   * Find a user by their Clerk ID.
   */
  async findUserByClerkId(clerkId: string) {
    return prisma.user.findUnique({
      where: { clerkId, deletedAt: null },
    });
  }

  /**
   * Find a user by their database ID.
   */
  async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id, deletedAt: null },
    });
  }

  // ==================== CONVERSATION METHODS ====================

  /**
   * Find a conversation by its database ID.
   */
  async findConversationById(id: string) {
    return prisma.conversation.findUnique({
      where: { id, deletedAt: null },
    });
  }

  /**
   * Find a direct conversation between two users.
   */
  async findDirectConversation(userId1: string, userId2: string) {
    // Find conversations where both users are participants
    const conversations = await prisma.conversation.findMany({
      where: {
        type: "DIRECT",
        deletedAt: null,
        participants: {
          every: {
            userId: { in: [userId1, userId2] },
          },
        },
      },
      include: {
        participants: true,
      },
    });

    // Filter to exactly 2 participants
    return conversations.find(
      (c) =>
        c.participants.length === 2 &&
        c.participants.some((p) => p.userId === userId1) &&
        c.participants.some((p) => p.userId === userId2),
    );
  }

  /**
   * List conversations for a user with pagination.
   */
  async listConversations(userId: string, limit: number, offset: number) {
    const where = {
      deletedAt: null,
      participants: {
        some: { userId },
      },
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  imageUrl: true,
                },
              },
            },
          },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              sender: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  imageUrl: true,
                },
              },
            },
          },
          _count: {
            select: {
              messages: {
                where: { deletedAt: null },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.conversation.count({ where }),
    ]);

    return { conversations, total };
  }

  /**
   * Get a single conversation with full details.
   */
  async getConversationById(conversationId: string) {
    return prisma.conversation.findFirst({
      where: {
        id: conversationId,
        deletedAt: null,
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                imageUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            messages: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });
  }

  /**
   * Create a new conversation with participants.
   */
  async createConversation(creatorId: string, data: CreateConversationInput) {
    const conversation = await prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          type: data.type,
          createdById: creatorId,
          participants: {
            create: [
              {
                userId: creatorId,
                role: "OWNER" as ParticipantRole,
              },
              ...data.participantIds
                .filter((id) => id !== creatorId)
                .map((id) => ({
                  userId: id,
                  role: "MEMBER" as ParticipantRole,
                })),
            ],
          },
        },
        include: {
          participants: true,
        },
      });

      return created;
    });

    logger.info(`Conversation created: ${conversation.id} by ${creatorId}`);
    return conversation;
  }

  /**
   * Soft-delete a conversation.
   */
  async deleteConversation(id: string) {
    const conversation = await prisma.conversation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    logger.info(`Conversation soft-deleted: ${id}`);
    return conversation;
  }

  /**
   * Check if a user is a participant in a conversation.
   */
  async findParticipant(conversationId: string, userId: string) {
    return prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });
  }

  /**
   * Add a participant to a conversation.
   */
  async addParticipant(conversationId: string, userId: string) {
    const participant = await prisma.conversationParticipant.create({
      data: {
        conversationId,
        userId,
        role: "MEMBER" as ParticipantRole,
      },
    });
    logger.info(`User ${userId} added to conversation ${conversationId}`);
    return participant;
  }

  /**
   * Remove a participant from a conversation.
   */
  async removeParticipant(conversationId: string, userId: string) {
    const deleted = await prisma.conversationParticipant.deleteMany({
      where: {
        conversationId,
        userId,
      },
    });
    logger.info(
      `User ${userId} removed from conversation ${conversationId} (${deleted.count} removed)`,
    );
    return deleted.count > 0;
  }

  /**
   * Update last read timestamp for a participant.
   */
  async updateLastReadAt(conversationId: string, userId: string) {
    const participant = await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: { lastReadAt: new Date() },
    });
    return participant;
  }

  // ==================== MESSAGE METHODS ====================

  /**
   * Find a message by its database ID.
   */
  async findMessageById(id: string) {
    return prisma.message.findUnique({
      where: { id, deletedAt: null },
    });
  }

  /**
   * List messages in a conversation with pagination.
   */
  async listMessages(conversationId: string, limit: number, offset: number) {
    const where = {
      conversationId,
      deletedAt: null,
    };

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              imageUrl: true,
            },
          },
          replyTo: {
            select: {
              id: true,
              content: true,
              sender: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          readReceipts: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.message.count({ where }),
    ]);

    return { messages, total };
  }

  /**
   * Create a new message in a conversation.
   */
  async createMessage(
    conversationId: string,
    senderId: string,
    data: CreateMessageInput,
  ) {
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: data.content,
        type: data.type ?? "TEXT",
        attachmentUrl: data.attachmentUrl ?? null,
        replyToId: data.replyToId ?? null,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    // Update conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    logger.info(`Message created: ${message.id} in conversation ${conversationId}`);
    return message;
  }

  /**
   * Update a message.
   */
  async updateMessage(id: string, data: UpdateMessageInput) {
    const message = await prisma.message.update({
      where: { id },
      data: {
        content: data.content,
        editedAt: new Date(),
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
          },
        },
      },
    });
    logger.info(`Message updated: ${id}`);
    return message;
  }

  /**
   * Soft-delete a message.
   */
  async deleteMessage(id: string) {
    const message = await prisma.message.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    logger.info(`Message soft-deleted: ${id}`);
    return message;
  }

  /**
   * Mark a message as read by a user.
   */
  async markMessageRead(messageId: string, userId: string) {
    const receipt = await prisma.messageReadReceipt.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      update: {},
      create: {
        messageId,
        userId,
      },
    });

    // Update message status to READ if not already
    await prisma.message.update({
      where: { id: messageId },
      data: { status: "READ" },
    });

    logger.info(`Message ${messageId} marked as read by ${userId}`);
    return receipt;
  }

  /**
   * Mark all messages in a conversation as read by a user.
   */
  async markConversationRead(conversationId: string, userId: string) {
    // Get all unread messages in the conversation
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        senderId: { not: userId },
        readReceipts: {
          none: {
            userId,
          },
        },
      },
      select: { id: true },
    });

    // Create read receipts for all messages
    if (messages.length > 0) {
      await prisma.messageReadReceipt.createMany({
        data: messages.map((m) => ({
          messageId: m.id,
          userId,
        })),
      });

      // Update message statuses
      await prisma.message.updateMany({
        where: {
          id: { in: messages.map((m) => m.id) },
        },
        data: { status: "READ" },
      });
    }

    // Update participant lastReadAt
    await this.updateLastReadAt(conversationId, userId);

    logger.info(`Conversation ${conversationId} marked as read by ${userId}`);
    return messages.length;
  }

  // ==================== GROUP METHODS ====================

  /**
   * Find a group by its database ID.
   */
  async findGroupById(id: string) {
    return prisma.group.findUnique({
      where: { id, deletedAt: null },
    });
  }

  /**
   * List groups for a user with pagination.
   */
  async listGroups(userId: string, limit: number, offset: number) {
    const where = {
      deletedAt: null,
      members: {
        some: { userId },
      },
    };

    const [groups, total] = await Promise.all([
      prisma.group.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              imageUrl: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  imageUrl: true,
                },
              },
            },
          },
          _count: {
            select: {
              members: true,
              messages: {
                where: { deletedAt: null },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.group.count({ where }),
    ]);

    return { groups, total };
  }

  /**
   * Get a single group with full details.
   */
  async getGroupById(groupId: string) {
    return prisma.group.findUnique({
      where: {
        id: groupId,
        deletedAt: null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                imageUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            messages: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });
  }

  /**
   * Create a new group with members.
   */
  async createGroup(creatorId: string, data: CreateGroupInput) {
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          imageUrl: data.imageUrl ?? null,
          createdById: creatorId,
          members: {
            create: [
              {
                userId: creatorId,
                role: "OWNER" as ParticipantRole,
              },
              ...data.memberIds
                .filter((id) => id !== creatorId)
                .map((id) => ({
                  userId: id,
                  role: "MEMBER" as ParticipantRole,
                })),
            ],
          },
        },
        include: {
          members: true,
        },
      });

      return created;
    });

    logger.info(`Group created: ${group.name} (${group.id}) by ${creatorId}`);
    return group;
  }

  /**
   * Update a group.
   */
  async updateGroup(id: string, data: UpdateGroupInput) {
    const group = await prisma.group.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
      },
    });
    logger.info(`Group updated: ${group.name} (${id})`);
    return group;
  }

  /**
   * Soft-delete a group.
   */
  async deleteGroup(id: string) {
    const group = await prisma.group.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    logger.info(`Group soft-deleted: ${group.name} (${id})`);
    return group;
  }

  /**
   * Check if a user is a member of a group.
   */
  async findGroupMember(groupId: string, userId: string) {
    return prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });
  }

  /**
   * Add a member to a group.
   */
  async addGroupMember(groupId: string, userId: string) {
    const member = await prisma.groupMember.create({
      data: {
        groupId,
        userId,
        role: "MEMBER" as ParticipantRole,
      },
    });
    logger.info(`User ${userId} added to group ${groupId}`);
    return member;
  }

  /**
   * Remove a member from a group.
   */
  async removeGroupMember(groupId: string, userId: string) {
    const deleted = await prisma.groupMember.deleteMany({
      where: {
        groupId,
        userId,
      },
    });
    logger.info(`User ${userId} removed from group ${groupId} (${deleted.count} removed)`);
    return deleted.count > 0;
  }

  /**
   * Update a group member's role.
   */
  async updateGroupMemberRole(groupId: string, userId: string, role: ParticipantRole) {
    const member = await prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      data: { role },
    });
    logger.info(`Member ${userId} role updated to ${role} in group ${groupId}`);
    return member;
  }

  // ==================== GROUP MESSAGE METHODS ====================

  /**
   * Find a group message by its database ID.
   */
  async findGroupMessageById(id: string) {
    return prisma.groupMessage.findUnique({
      where: { id, deletedAt: null },
    });
  }

  /**
   * List messages in a group with pagination.
   */
  async listGroupMessages(groupId: string, limit: number, offset: number) {
    const where = {
      groupId,
      deletedAt: null,
    };

    const [messages, total] = await Promise.all([
      prisma.groupMessage.findMany({
        where,
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              imageUrl: true,
            },
          },
          replyTo: {
            select: {
              id: true,
              content: true,
              sender: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          readReceipts: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.groupMessage.count({ where }),
    ]);

    return { messages, total };
  }

  /**
   * Create a new message in a group.
   */
  async createGroupMessage(
    groupId: string,
    senderId: string,
    data: CreateGroupMessageInput,
  ) {
    const message = await prisma.groupMessage.create({
      data: {
        groupId,
        senderId,
        content: data.content,
        type: data.type ?? "TEXT",
        attachmentUrl: data.attachmentUrl ?? null,
        replyToId: data.replyToId ?? null,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    // Update group updatedAt
    await prisma.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });

    logger.info(`Group message created: ${message.id} in group ${groupId}`);
    return message;
  }

  /**
   * Update a group message.
   */
  async updateGroupMessage(id: string, data: UpdateGroupMessageInput) {
    const message = await prisma.groupMessage.update({
      where: { id },
      data: {
        content: data.content,
        editedAt: new Date(),
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            imageUrl: true,
          },
        },
      },
    });
    logger.info(`Group message updated: ${id}`);
    return message;
  }

  /**
   * Soft-delete a group message.
   */
  async deleteGroupMessage(id: string) {
    const message = await prisma.groupMessage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    logger.info(`Group message soft-deleted: ${id}`);
    return message;
  }

  /**
   * Mark a group message as read by a user.
   */
  async markGroupMessageRead(messageId: string, userId: string) {
    const receipt = await prisma.groupMessageReadReceipt.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      update: {},
      create: {
        messageId,
        userId,
      },
    });

    logger.info(`Group message read ${messageId} by ${userId}`);
    return receipt;
  }

  /**
   * Mark all messages in a group as read by a user.
   */
  async markGroupRead(groupId: string, userId: string) {
    // Get all unread messages in the group
    const messages = await prisma.groupMessage.findMany({
      where: {
        groupId,
        deletedAt: null,
        senderId: { not: userId },
        readReceipts: {
          none: {
            userId,
          },
        },
      },
      select: { id: true },
    });

    // Create read receipts for all messages
    if (messages.length > 0) {
      await prisma.groupMessageReadReceipt.createMany({
        data: messages.map((m) => ({
          messageId: m.id,
          userId,
        })),
      });
    }

    logger.info(`Group ${groupId} marked as read by ${userId}`);
    return messages.length;
  }
}
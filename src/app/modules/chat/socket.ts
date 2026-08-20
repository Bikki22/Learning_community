import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "node:http";
import { ChatService } from "./chat.service";
import { ChatRepository } from "./chat.repository";
import logger from "../../lib/logger";

// Map to track user socket connections: userId -> Set of socket IDs
const userSockets = new Map<string, Set<string>>();

// Map to track socketId -> userId
const socketToUser = new Map<string, string>();

export class ChatSocketServer {
  private io: SocketIOServer;
  private chatService = new ChatService();
  private chatRepository = new ChatRepository();

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.setupHandlers();
  }

  private setupHandlers() {
    this.io.on("connection", (socket) => {
      logger.info(`Socket connected: ${socket.id}`);

      // Authenticate the socket connection via auth token in handshake
      const authToken = socket.handshake.auth?.token as string | undefined;
      const userId = authToken || (socket.handshake.headers.authorization?.replace("Bearer ", "") as string | undefined);

      if (!userId) {
        socket.emit("error", { message: "Unauthorized" });
        socket.disconnect();
        return;
      }

      // Map the socket to the user
      socketToUser.set(socket.id, userId);
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)?.add(socket.id);

      // Join user's personal room
      socket.join(`user:${userId}`);

      // Handle events
      this.handleEvents(socket, userId);

      // Handle disconnect
      socket.on("disconnect", () => {
        this.handleDisconnect(socket.id);
      });
    });
  }

  private handleEvents(socket: any, userId: string) {
    // ==================== CONVERSATION EVENTS ====================

    socket.on("conversation:create", async (data: any) => {
      try {
        const conversation = await this.chatService.createConversation(userId, {
          type: data?.type ?? "DIRECT",
          participantIds: data?.participantIds ?? [],
        });

        if (!conversation) {
          socket.emit("error", { message: "Failed to create conversation" });
          return;
        }

        // Join the conversation room
        socket.join(`conversation:${conversation.id}`);

        // Notify all participants
        this.emitToConversation(conversation.id, "conversation:created", conversation);

        socket.emit("conversation:created", conversation);
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("conversation:join", async (data: any) => {
      try {
        const conversationId = data?.conversationId;
        if (!conversationId) {
          socket.emit("error", { message: "conversationId is required" });
          return;
        }

        // Verify user is a participant
        const user = await this.chatRepository.findUserByClerkId(userId);
        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        const participant = await this.chatRepository.findParticipant(conversationId, user.id);
        if (!participant) {
          socket.emit("error", { message: "Forbidden: not a participant" });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        socket.emit("conversation:joined", { conversationId });
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("conversation:leave", (data: any) => {
      const conversationId = data?.conversationId;
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
        socket.emit("conversation:left", { conversationId });
      }
    });

    // ==================== MESSAGE EVENTS ====================

    socket.on("message:send", async (data: any) => {
      try {
        const conversationId = data?.conversationId;
        if (!conversationId) {
          socket.emit("error", { message: "conversationId is required" });
          return;
        }

        const message = await this.chatService.sendMessage(userId, conversationId, {
          content: data?.content,
          type: data?.type,
          attachmentUrl: data?.attachmentUrl,
          replyToId: data?.replyToId,
        });

        // Emit to all participants in the conversation
        this.emitToConversation(conversationId, "message:new", message);

        // Also emit to the sender
        socket.emit("message:sent", message);
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("message:edit", async (data: any) => {
      try {
        const conversationId = data?.conversationId;
        const messageId = data?.messageId;
        if (!conversationId || !messageId) {
          socket.emit("error", { message: "conversationId and messageId are required" });
          return;
        }

        const message = await this.chatService.editMessage(userId, conversationId, messageId, {
          content: data?.content,
        });

        this.emitToConversation(conversationId, "message:edited", message);
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("message:delete", async (data: any) => {
      try {
        const conversationId = data?.conversationId;
        const messageId = data?.messageId;
        if (!conversationId || !messageId) {
          socket.emit("error", { message: "conversationId and messageId are required" });
          return;
        }

        await this.chatService.deleteMessage(userId, conversationId, messageId);
        this.emitToConversation(conversationId, "message:deleted", { messageId });
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("message:read", async (data: any) => {
      try {
        const conversationId = data?.conversationId;
        const messageId = data?.messageId;
        if (!conversationId || !messageId) {
          socket.emit("error", { message: "conversationId and messageId are required" });
          return;
        }

        const receipt = await this.chatService.markMessageRead(userId, conversationId, messageId);
        this.emitToConversation(conversationId, "message:read", {
          messageId,
          userId,
          readAt: receipt.readAt,
        });
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("conversation:read", async (data: any) => {
      try {
        const conversationId = data?.conversationId;
        if (!conversationId) {
          socket.emit("error", { message: "conversationId is required" });
          return;
        }

        const result = await this.chatService.markConversationRead(userId, conversationId);
        this.emitToConversation(conversationId, "conversation:read", {
          conversationId,
          userId,
          readCount: result.readCount,
        });
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    // ==================== GROUP EVENTS ====================

    socket.on("group:create", async (data: any) => {
      try {
        const group = await this.chatService.createGroup(userId, {
          name: data?.name,
          description: data?.description,
          imageUrl: data?.imageUrl,
          memberIds: data?.memberIds ?? [],
        });

        // Join the group room
        socket.join(`group:${group.id}`);

        // Notify all members
        this.emitToGroup(group.id, "group:created", group);

        socket.emit("group:created", group);
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("group:join", async (data: any) => {
      try {
        const groupId = data?.groupId;
        if (!groupId) {
          socket.emit("error", { message: "groupId is required" });
          return;
        }

        // Verify user is a member
        const user = await this.chatRepository.findUserByClerkId(userId);
        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        const member = await this.chatRepository.findGroupMember(groupId, user.id);
        if (!member) {
          socket.emit("error", { message: "Forbidden: not a member" });
          return;
        }

        socket.join(`group:${groupId}`);
        socket.emit("group:joined", { groupId });
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("group:leave", (data: any) => {
      const groupId = data?.groupId;
      if (groupId) {
        socket.leave(`group:${groupId}`);
        socket.emit("group:left", { groupId });
      }
    });

    // ==================== GROUP MESSAGE EVENTS ====================

    socket.on("group:message:send", async (data: any) => {
      try {
        const groupId = data?.groupId;
        if (!groupId) {
          socket.emit("error", { message: "groupId is required" });
          return;
        }

        const message = await this.chatService.sendGroupMessage(userId, groupId, {
          content: data?.content,
          type: data?.type,
          attachmentUrl: data?.attachmentUrl,
          replyToId: data?.replyToId,
        });

        // Emit to all group members
        this.emitToGroup(groupId, "group:message:new", message);

        // Emit to sender
        socket.emit("group:message:sent", message);
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("group:message:edit", async (data: any) => {
      try {
        const groupId = data?.groupId;
        const messageId = data?.messageId;
        if (!groupId || !messageId) {
          socket.emit("error", { message: "groupId and messageId are required" });
          return;
        }

        const message = await this.chatService.editGroupMessage(userId, groupId, messageId, {
          content: data?.content,
        });

        this.emitToGroup(groupId, "group:message:edited", message);
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("group:message:delete", async (data: any) => {
      try {
        const groupId = data?.groupId;
        const messageId = data?.messageId;
        if (!groupId || !messageId) {
          socket.emit("error", { message: "groupId and messageId are required" });
          return;
        }

        await this.chatService.deleteGroupMessage(userId, groupId, messageId);
        this.emitToGroup(groupId, "group:message:deleted", { messageId });
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("group:message:read", async (data: any) => {
      try {
        const groupId = data?.groupId;
        const messageId = data?.messageId;
        if (!groupId || !messageId) {
          socket.emit("error", { message: "groupId and messageId are required" });
          return;
        }

        const receipt = await this.chatService.markGroupMessageRead(userId, groupId, messageId);
        this.emitToGroup(groupId, "group:message:read", {
          messageId,
          userId,
          readAt: receipt.readAt,
        });
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("group:read", async (data: any) => {
      try {
        const groupId = data?.groupId;
        if (!groupId) {
          socket.emit("error", { message: "groupId is required" });
          return;
        }

        const result = await this.chatService.markGroupRead(userId, groupId);
        this.emitToGroup(groupId, "group:read", {
          groupId,
          userId,
          readCount: result.readCount,
        });
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    // ==================== TYPING EVENTS ====================

    socket.on("typing:start", (data: any) => {
      const conversationId = data?.conversationId;
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("typing:start", {
          conversationId,
          userId,
        });
      }
    });

    socket.on("typing:stop", (data: any) => {
      const conversationId = data?.conversationId;
      if (conversationId) {
        socket.to(`conversation:${conversationId}`).emit("typing:stop", {
          conversationId,
          userId,
        });
      }
    });

    socket.on("group:typing:start", (data: any) => {
      const groupId = data?.groupId;
      if (groupId) {
        socket.to(`group:${groupId}`).emit("group:typing:start", {
          groupId,
          userId,
        });
      }
    });

    socket.on("group:typing:stop", (data: any) => {
      const groupId = data?.groupId;
      if (groupId) {
        socket.to(`group:${groupId}`).emit("group:typing:stop", {
          groupId,
          userId,
        });
      }
    });
  }

  private handleDisconnect(socketId: string) {
    const userId = socketToUser.get(socketId);
    if (userId) {
      const sockets = userSockets.get(userId);
      sockets?.delete(socketId);
      if (sockets?.size === 0) {
        userSockets.delete(userId);
      }
      socketToUser.delete(socketId);
    }
    logger.info(`Socket disconnected: ${socketId}`);
  }

  /**
   * Emit an event to all participants of a conversation.
   */
  private emitToConversation(conversationId: string, event: string, data: any) {
    this.io.to(`conversation:${conversationId}`).emit(event, data);
  }

  /**
   * Emit an event to all members of a group.
   */
  private emitToGroup(groupId: string, event: string, data: any) {
    this.io.to(`group:${groupId}`).emit(event, data);
  }

  /**
   * Emit an event to a specific user across all their sockets.
   */
  private emitToUser(userId: string, event: string, data: any) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        this.io.to(socketId).emit(event, data);
      }
    }
  }

  /**
   * Get the Socket.IO server instance.
   */
  getIO() {
    return this.io;
  }
}
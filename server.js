import { createServer } from "http";
import { Server } from "socket.io";
import { connectDB } from "./config/db.js";
import app from "./app.js";
import { startReminderCron } from "./services/reminderService.js";
import jwt from "jsonwebtoken";
import { Message } from "./models/message.js";

connectDB();

const PORT = process.env.PORT || 4000;
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ── Auth middleware ───────────────────────────────────────────────────────────
io.use((socket, next) => {
  // Try auth.token first, then cookie header
  const tokenFromAuth = socket.handshake.auth?.token;
  const tokenFromCookie = socket.handshake.headers?.cookie
    ?.split("; ")
    .find(c => c.startsWith("token="))
    ?.split("=")[1];

  const token = tokenFromAuth || tokenFromCookie;
  if (!token) return next(new Error("Authentication error: no token"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch {
    next(new Error("Authentication error: invalid token"));
  }
});

// ── Online users: userId (string) → Set of socketIds (for multi-tab support) ─
const onlineUsers = new Map(); // userId → socketId

const broadcastOnlineUsers = () => {
  io.emit("online_users", Array.from(onlineUsers.keys()));
};

// ── Connection handler ────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  const userId = String(socket.userId);
  onlineUsers.set(userId, socket.id);
  broadcastOnlineUsers();

  console.log(`[Socket] Connected: ${userId} (${socket.id})`);

  // ── Join a project room ───────────────────────────────────────────────────
  // Client emits: join_project(projectId)
  socket.on("join_project", (projectId) => {
    if (!projectId) return;
    socket.join(`project:${projectId}`);
    console.log(`[Socket] ${userId} joined room project:${projectId}`);
  });

  // ── Send message ──────────────────────────────────────────────────────────
  // Client emits: send_message({ projectId, receiverId, text })
  socket.on("send_message", async (data) => {
    try {
      const { projectId, receiverId, text } = data;
      if (!projectId || !receiverId || !text?.trim()) return;

      // Persist to DB
      const message = await Message.create({
        project:  projectId,
        sender:   userId,
        receiver: receiverId,
        text:     text.trim(),
      });
      await message.populate("sender", "name role");

      const payload = { message: message.toObject() };

      // Emit to everyone in the project room (sender + receiver if in room)
      io.to(`project:${projectId}`).emit("new_message", payload);

      // Also direct-emit to receiver if they're online but not in this room
      const receiverSocketId = onlineUsers.get(String(receiverId));
      if (receiverSocketId) {
        const receiverSocket = io.sockets.sockets.get(receiverSocketId);
        const inRoom = receiverSocket?.rooms?.has(`project:${projectId}`);
        if (!inRoom) {
          io.to(receiverSocketId).emit("new_message", payload);
          // Also send a notification ping
          io.to(receiverSocketId).emit("message_notification", {
            projectId,
            senderId:   userId,
            senderName: message.sender?.name || "Someone",
            preview:    text.slice(0, 60),
          });
        }
      }
    } catch (err) {
      console.error("[Socket] send_message error:", err.message);
      socket.emit("message_error", { error: "Failed to send message" });
    }
  });

  // ── Typing indicators ─────────────────────────────────────────────────────
  // Client emits: typing({ projectId, receiverId })
  socket.on("typing", ({ projectId, receiverId }) => {
    if (!projectId) return;
    // Emit to everyone in room EXCEPT sender
    socket.to(`project:${projectId}`).emit("user_typing", { userId });
    // Also direct if receiver not in room
    if (receiverId) {
      const rid = onlineUsers.get(String(receiverId));
      if (rid) io.to(rid).emit("user_typing", { userId });
    }
  });

  // Client emits: stop_typing({ projectId, receiverId })
  socket.on("stop_typing", ({ projectId, receiverId }) => {
    if (!projectId) return;
    socket.to(`project:${projectId}`).emit("user_stop_typing", { userId });
    if (receiverId) {
      const rid = onlineUsers.get(String(receiverId));
      if (rid) io.to(rid).emit("user_stop_typing", { userId });
    }
  });

  // ── Mark messages as read ─────────────────────────────────────────────────
  // Client emits: mark_read({ projectId, senderId })
  socket.on("mark_read", async ({ projectId, senderId }) => {
    try {
      if (!projectId || !senderId) return;
      await Message.updateMany(
        { project: projectId, sender: senderId, receiver: userId, isRead: false },
        { isRead: true, readAt: new Date() }
      );
      // Notify sender their messages were read
      const senderSocketId = onlineUsers.get(String(senderId));
      if (senderSocketId) {
        io.to(senderSocketId).emit("messages_read", { projectId, readBy: userId });
      }
    } catch (err) {
      console.error("[Socket] mark_read error:", err.message);
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    broadcastOnlineUsers();
    console.log(`[Socket] Disconnected: ${userId}`);
  });
});

app.set("io", io);

httpServer.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  startReminderCron();
});

process.on("unhandledRejection", (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  httpServer.close(() => process.exit(1));
});
process.on("uncaughtException", (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  process.exit(1);
});

export default httpServer;

import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { Message } from "../models/message.js";
import { Project } from "../models/project.js";

// ── GET /chat/project/:projectId — load full history ─────────────────────────
export const getChatHistory = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;
  const userId = req.user._id.toString();

  const project = await Project.findById(projectId)
    .populate("student", "_id")
    .populate("members", "_id")
    .populate("supervisor", "_id");

  if (!project) return next(new ErrorHandler("Project not found", 404));

  const memberIds = (project.members || []).map(m => m._id.toString());
  const isStudent    = project.student?._id.toString() === userId || memberIds.includes(userId);
  const isSupervisor = project.supervisor?._id?.toString() === userId;
  const isAdmin      = req.user.role === "Admin";

  if (!isStudent && !isSupervisor && !isAdmin)
    return next(new ErrorHandler("Not authorized", 403));

  const messages = await Message.find({ project: projectId })
    .populate("sender", "name role")
    .sort({ createdAt: 1 })
    .limit(300);

  // Mark as read for current user
  await Message.updateMany(
    { project: projectId, receiver: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  res.status(200).json({ success: true, data: { messages } });
});

// ── POST /chat/send — REST fallback (used when socket not connected) ──────────
export const sendMessage = asyncHandler(async (req, res, next) => {
  const { projectId, text, receiverId } = req.body;
  if (!projectId || !text?.trim() || !receiverId)
    return next(new ErrorHandler("projectId, text, receiverId are required", 400));

  const message = await Message.create({
    project:  projectId,
    sender:   req.user._id,
    receiver: receiverId,
    text:     text.trim(),
  });
  await message.populate("sender", "name role");

  // Emit via socket if available
  const io = req.app.get("io");
  if (io) {
    io.to(`project:${projectId}`).emit("new_message", { message: message.toObject() });
  }

  res.status(201).json({ success: true, data: { message } });
});

// ── GET /chat/unread — count unread messages for current user ─────────────────
export const getUnreadCount = asyncHandler(async (req, res, next) => {
  const count = await Message.countDocuments({
    receiver: req.user._id,
    isRead: false,
  });
  res.status(200).json({ success: true, data: { count } });
});

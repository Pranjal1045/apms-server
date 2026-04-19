import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxLength: [2000, "Message too long"],
  },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: null },
}, { timestamps: true });

messageSchema.index({ project: 1, createdAt: 1 });
messageSchema.index({ sender: 1, receiver: 1 });

export const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);

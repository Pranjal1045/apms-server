import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Title is required"],
    trim: true,
    maxLength: [200, "Title cannot exceed 200 characters"],
  },
  content: {
    type: String,
    required: [true, "Content is required"],
    trim: true,
    maxLength: [2000, "Content cannot exceed 2000 characters"],
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  targetRole: {
    type: String,
    enum: ["All", "Student", "Teacher"],
    default: "All",
  },
  priority: {
    type: String,
    enum: ["normal", "important", "urgent"],
    default: "normal",
  },
  isPinned: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });

announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ targetRole: 1 });

export const Announcement = mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema);

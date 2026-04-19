import mongoose from "mongoose";

// ── Per-member log entry (replaces paper logbook entries) ─────────────────────
const logEntrySchema = new mongoose.Schema({
  member: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  workDone: {
    type: String,
    required: true,
    trim: true,
    maxLength: [2000, "Work description cannot exceed 2000 characters"],
  },
  hoursSpent: { type: Number, default: 0, min: 0, max: 168 },
  challenges:  { type: String, trim: true, maxLength: [1000, "Challenges cannot exceed 1000 characters"], default: "" },
  submittedAt: { type: Date, default: Date.now },
}, { _id: true });

// ── Weekly milestone (one per project per week) ────────────────────────────────
const milestoneSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: [true, "Project is required"],
  },
  // Group reference (for group projects)
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    default: null,
  },
  // Week identification
  weekNumber: {
    type: Number,
    required: [true, "Week number is required"],
    min: [1, "Week number must be at least 1"],
  },
  weekStartDate: {
    type: Date,
    required: [true, "Week start date is required"],
  },
  weekEndDate: {
    type: Date,
    required: [true, "Week end date is required"],
  },
  // Milestone details (set by supervisor)
  title: {
    type: String,
    required: [true, "Milestone title is required"],
    trim: true,
    maxLength: [120, "Title cannot exceed 120 characters"],
  },
  description: {
    type: String,
    trim: true,
    maxLength: [1000, "Description cannot exceed 1000 characters"],
    default: "",
  },
  order: { type: Number, default: 0 },

  // Lifecycle status
  // upcoming  → week hasn't started yet
  // active    → week is in progress, students can log
  // submitted → student submitted for supervisor sign-off
  // approved  → supervisor signed off (permanent)
  // rejected  → supervisor returned for revision (student revises & resubmits)
  status: {
    type: String,
    enum: ["upcoming", "active", "submitted", "approved", "rejected"],
    default: "upcoming",
  },

  // Student log entries (array — one per group member)
  logEntries: [logEntrySchema],

  // Submission (by student/group leader)
  submittedAt:      { type: Date, default: null },
  submittedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  submissionNote:   { type: String, trim: true, maxLength: [1000, "Note too long"], default: "" },

  // Supervisor sign-off
  signedOffAt:      { type: Date, default: null },
  signedOffBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  supervisorNote:   { type: String, trim: true, maxLength: [1000, "Note too long"], default: "" },

  // Legacy fields (kept for backward compat)
  dueDate:          { type: Date, default: null },
  completedAt:      { type: Date, default: null },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
}, { timestamps: true });

// Compound index — unique week per project
milestoneSchema.index({ project: 1, weekNumber: 1 }, { unique: true });
milestoneSchema.index({ project: 1, order: 1 });
milestoneSchema.index({ weekStartDate: 1 });
milestoneSchema.index({ status: 1 });

export const Milestone = mongoose.models.Milestone || mongoose.model("Milestone", milestoneSchema);

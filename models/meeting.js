import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
  },
  student: {
    // The student who requested the meeting
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  supervisor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // All group members (including leader) — so everyone can see the meeting
  groupMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  title: {
    type: String,
    required: [true, "Meeting title is required"],
    trim: true,
    maxLength: [150, "Title too long"],
  },
  agenda: {
    type: String,
    trim: true,
    maxLength: [500, "Agenda too long"],
    default: "",
  },
  proposedDate: {
    type: Date,
    required: [true, "Proposed date is required"],
  },
  confirmedDate: { type: Date, default: null },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "completed", "cancelled"],
    default: "pending",
  },
  location: { type: String, default: "Online / TBD", maxLength: 200 },
  notes: { type: String, default: "", maxLength: 1000 },
  meetingLink: { type: String, default: "", maxLength: 300 },
  rejectionReason: { type: String, default: "" },
}, { timestamps: true });

meetingSchema.index({ project: 1 });
meetingSchema.index({ student: 1 });
meetingSchema.index({ supervisor: 1 });
meetingSchema.index({ proposedDate: 1 });
meetingSchema.index({ groupMembers: 1 });

export const Meeting = mongoose.models.Meeting || mongoose.model("Meeting", meetingSchema);

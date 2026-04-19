import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema({
    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    supervisorName: { type: String },
    type: { type: String, enum: ["positive","negative","general"], default: "general" },
    title: { type: String, required: true },
    message: { type: String, required: true, maxLength: [1000,"Feedback message cannot be more than 1000 characters"] },
}, { timestamps: true });

const projectSchema = new mongoose.Schema({
    // ── Single student (legacy) or group leader
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: [true,"Student/Leader ID is required"] },
    // ── Group reference (optional – populated when project is group-based)
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
    // ── All group members for quick access (includes leader)
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isGroupProject: { type: Boolean, default: false },
    supervisor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    title: { type: String, required: [true,"Project title is required"], trim: true, maxLength: [200,"Title cannot be more than 200 characters"] },
    description: { type: String, required: [true,"Project description is required"], trim: true, maxLength: [2000,"Description cannot be more than 2000 characters"] },
    status: { type: String, default: "pending", enum: ["pending","approved","rejected","completed"] },
    files: [{
        fileType: { type: String, required: true },
        fileUrl: { type: String, required: true },
        originalName: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    }],
    feedback: [feedbackSchema],
    deadline: { type: Date },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    tags: [{ type: String, trim: true }],
}, { timestamps: true });

projectSchema.index({ student: 1 });
projectSchema.index({ supervisor: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ group: 1 });

export const Project = mongoose.models.Project || mongoose.model("Project", projectSchema);

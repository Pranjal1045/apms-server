import mongoose from "mongoose";

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Group name is required"],
        trim: true,
        maxLength: [100, "Group name cannot exceed 100 characters"]
    },
    groupLeader: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Group leader is required"]
    },
    members: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    ],
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
        default: null
    },
    supervisor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    inviteCode: {
        type: String,
        unique: true,
        sparse: true
    },
    maxMembers: {
        type: Number,
        default: 4,
        min: [1, "Group must have at least 1 member"],
        max: [6, "Group cannot exceed 6 members"]
    },
    status: {
        type: String,
        enum: ["forming", "active", "completed"],
        default: "forming"
    }
}, {
    timestamps: true
});

groupSchema.index({ groupLeader: 1 });
groupSchema.index({ inviteCode: 1 });
groupSchema.index({ members: 1 });

export const Group = mongoose.models.Group || mongoose.model("Group", groupSchema);

import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { Group } from "../models/group.js";
import { User } from "../models/user.js";
import { Project } from "../models/project.js";
import crypto from "crypto";

// ── Create group ──────────────────────────────────────────────────────────────
export const createGroup = asyncHandler(async (req, res, next) => {
    const { name, maxMembers } = req.body;
    const leaderId = req.user._id;

    if (!name) return next(new ErrorHandler("Group name is required", 400));

    // Check if student already in a group
    const existing = await Group.findOne({ members: leaderId });
    if (existing) return next(new ErrorHandler("You are already in a group", 400));

    const inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();

    const group = await Group.create({
        name,
        groupLeader: leaderId,
        members: [leaderId],
        maxMembers: maxMembers || 4,
        inviteCode,
    });

    await User.findByIdAndUpdate(leaderId, { group: group._id });

    res.status(201).json({
        success: true,
        message: "Group created successfully",
        data: { group },
    });
});

// ── Join group by invite code ─────────────────────────────────────────────────
export const joinGroup = asyncHandler(async (req, res, next) => {
    const { inviteCode } = req.body;
    const studentId = req.user._id;

    if (!inviteCode) return next(new ErrorHandler("Invite code is required", 400));

    // Check if already in a group
    const existingGroup = await Group.findOne({ members: studentId });
    if (existingGroup) return next(new ErrorHandler("You are already in a group", 400));

    const group = await Group.findOne({ inviteCode: inviteCode.toUpperCase() });
    if (!group) return next(new ErrorHandler("Invalid invite code", 404));

    if (group.members.length >= group.maxMembers) {
        return next(new ErrorHandler("Group is full", 400));
    }

    if (group.status !== "forming") {
        return next(new ErrorHandler("Group is no longer accepting new members", 400));
    }

    group.members.push(studentId);
    await group.save();

    await User.findByIdAndUpdate(studentId, { group: group._id });

    const populatedGroup = await Group.findById(group._id)
        .populate("members", "name email rollNumber")
        .populate("groupLeader", "name email");

    res.status(200).json({
        success: true,
        message: "Joined group successfully",
        data: { group: populatedGroup },
    });
});

// ── Get my group ──────────────────────────────────────────────────────────────
export const getMyGroup = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;

    const group = await Group.findOne({ members: studentId })
        .populate("members", "name email rollNumber department")
        .populate("groupLeader", "name email")
        .populate("supervisor", "name email department")
        .populate("project");

    if (!group) {
        return res.status(200).json({
            success: true,
            data: { group: null },
            message: "You are not in any group yet",
        });
    }

    res.status(200).json({
        success: true,
        data: { group },
    });
});

// ── Leave group ───────────────────────────────────────────────────────────────
export const leaveGroup = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;

    const group = await Group.findOne({ members: studentId });
    if (!group) return next(new ErrorHandler("You are not in any group", 404));

    if (group.groupLeader.toString() === studentId.toString()) {
        return next(new ErrorHandler("Group leader cannot leave. Transfer leadership or disband the group.", 400));
    }

    group.members = group.members.filter(m => m.toString() !== studentId.toString());
    await group.save();
    await User.findByIdAndUpdate(studentId, { group: null });

    res.status(200).json({
        success: true,
        message: "Left group successfully",
    });
});

// ── Remove member (leader only) ───────────────────────────────────────────────
export const removeMember = asyncHandler(async (req, res, next) => {
    const { memberId } = req.params;
    const leaderId = req.user._id;

    const group = await Group.findOne({ groupLeader: leaderId });
    if (!group) return next(new ErrorHandler("You are not a group leader", 403));

    if (memberId === leaderId.toString()) {
        return next(new ErrorHandler("Leader cannot remove themselves", 400));
    }

    group.members = group.members.filter(m => m.toString() !== memberId);
    await group.save();
    await User.findByIdAndUpdate(memberId, { group: null });

    res.status(200).json({
        success: true,
        message: "Member removed from group",
    });
});

// ── Get all groups (admin) ────────────────────────────────────────────────────
export const getAllGroups = asyncHandler(async (req, res, next) => {
    const groups = await Group.find()
        .populate("members", "name email rollNumber")
        .populate("groupLeader", "name email")
        .populate("supervisor", "name email")
        .populate("project", "title status")
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        data: { groups, total: groups.length },
    });
});

// ── Regenerate invite code ────────────────────────────────────────────────────
export const regenerateInviteCode = asyncHandler(async (req, res, next) => {
    const leaderId = req.user._id;
    const group = await Group.findOne({ groupLeader: leaderId });

    if (!group) return next(new ErrorHandler("You are not a group leader", 403));

    group.inviteCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    await group.save();

    res.status(200).json({
        success: true,
        message: "Invite code regenerated",
        data: { inviteCode: group.inviteCode },
    });
});

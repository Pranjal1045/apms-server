import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { Milestone } from "../models/milestone.js";
import { Project } from "../models/project.js";
import * as notificationServices from "../services/notificationServices.js";

const fmtDate = (d) => d ? new Date(d).toDateString() : "—";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const assertProjectAccess = async (projectId, userId, role) => {
  const project = await Project.findById(projectId)
    .populate("members", "_id name")
    .populate("student", "_id name")
    .populate("supervisor", "_id name");
  if (!project) throw new ErrorHandler("Project not found", 404);

  const memberIds = (project.members || []).map(m => m._id.toString());
  const studentId = project.student?._id?.toString();
  const supervisorId = project.supervisor?._id?.toString();
  const uid = userId.toString();

  const isMember     = memberIds.includes(uid) || studentId === uid;
  const isSupervisor = supervisorId === uid;
  const isAdmin      = role === "Admin";

  return { project, isMember, isSupervisor, isAdmin };
};

// ─── TEACHER: Create weekly milestone ────────────────────────────────────────
export const createMilestone = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;
  const { title, description, weekNumber, weekStartDate, weekEndDate, order } = req.body;

  if (!title || !weekNumber || !weekStartDate || !weekEndDate)
    return next(new ErrorHandler("Title, week number, start date and end date are required", 400));

  const { project, isSupervisor, isAdmin } = await assertProjectAccess(projectId, req.user._id, req.user.role);
  if (!isSupervisor && !isAdmin)
    return next(new ErrorHandler("Only the project supervisor can create milestones", 403));

  // No duplicate week numbers
  const exists = await Milestone.findOne({ project: projectId, weekNumber });
  if (exists) return next(new ErrorHandler(`Week ${weekNumber} milestone already exists for this project`, 400));

  const now = new Date();
  const start = new Date(weekStartDate);
  const end   = new Date(weekEndDate);
  let status = "upcoming";
  if (now >= start && now <= end) status = "active";
  else if (now > end) status = "active"; // Past weeks start as active so student can still log

  const milestone = await Milestone.create({
    project: projectId,
    group: project.group || null,
    weekNumber,
    title,
    description: description || "",
    weekStartDate: start,
    weekEndDate:   end,
    status,
    order: order ?? weekNumber,
    createdBy: req.user._id,
    logEntries: [],
  });

  // Notify all members
  const recipients = project.members?.length ? project.members.map(m => m._id) : [project.student._id];
  for (const uid of recipients) {
    await notificationServices.notifyUser(
      uid,
      `📋 Week ${weekNumber} milestone set: "${title}" (${fmtDate(weekStartDate)} – ${fmtDate(weekEndDate)}). Log your work each day and submit at week end.`,
      "deadline", "/student/milestones", "medium"
    );
  }

  res.status(201).json({ success: true, message: "Weekly milestone created", data: { milestone } });
});

// ─── GET: All milestones for a project (student or teacher view) ──────────────
export const getMilestones = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;
  const { project, isMember, isSupervisor, isAdmin } = await assertProjectAccess(projectId, req.user._id, req.user.role);

  if (!isMember && !isSupervisor && !isAdmin)
    return next(new ErrorHandler("Not authorized", 403));

  // Auto-activate upcoming milestones whose week has started
  const now = new Date();
  await Milestone.updateMany(
    { project: projectId, status: "upcoming", weekStartDate: { $lte: now } },
    { status: "active" }
  );

  const milestones = await Milestone.find({ project: projectId })
    .populate("createdBy", "name role")
    .populate("submittedBy", "name")
    .populate("signedOffBy", "name")
    .populate("logEntries.member", "name email rollNumber")
    .sort({ weekNumber: 1 });

  res.status(200).json({ success: true, data: { milestones, project } });
});

// ─── STUDENT: Save/update own log entry for a milestone ──────────────────────
export const saveLogEntry = asyncHandler(async (req, res, next) => {
  const { milestoneId } = req.params;
  const { workDone, hoursSpent, challenges } = req.body;

  if (!workDone?.trim())
    return next(new ErrorHandler("Work done description is required", 400));

  const milestone = await Milestone.findById(milestoneId).populate("project");
  if (!milestone) return next(new ErrorHandler("Milestone not found", 404));

  const { isMember } = await assertProjectAccess(milestone.project._id, req.user._id, req.user.role);
  if (!isMember)
    return next(new ErrorHandler("Only project members can log work", 403));

  if (["approved"].includes(milestone.status))
    return next(new ErrorHandler("Cannot edit log — this milestone has been signed off by supervisor", 400));

  // Upsert: update own entry if exists, else push
  const uid = req.user._id.toString();
  const existing = milestone.logEntries.find(e => e.member.toString() === uid);

  if (existing) {
    existing.workDone   = workDone.trim();
    existing.hoursSpent = hoursSpent || 0;
    existing.challenges = challenges?.trim() || "";
    existing.submittedAt = new Date();
  } else {
    milestone.logEntries.push({
      member:      req.user._id,
      workDone:    workDone.trim(),
      hoursSpent:  hoursSpent || 0,
      challenges:  challenges?.trim() || "",
      submittedAt: new Date(),
    });
  }

  await milestone.save();
  await milestone.populate("logEntries.member", "name email rollNumber");

  res.status(200).json({ success: true, message: "Work log saved", data: { milestone } });
});

// ─── STUDENT: Submit milestone to supervisor for sign-off ────────────────────
export const submitMilestone = asyncHandler(async (req, res, next) => {
  const { milestoneId } = req.params;
  const { submissionNote } = req.body;

  const milestone = await Milestone.findById(milestoneId)
    .populate({ path: "project", populate: { path: "supervisor members student", select: "name email _id" } });
  if (!milestone) return next(new ErrorHandler("Milestone not found", 404));

  const project = milestone.project;
  const uid = req.user._id.toString();
  const memberIds = (project.members || []).map(m => m._id.toString());
  const studentId = project.student?._id?.toString();
  const isMember  = memberIds.includes(uid) || studentId === uid;

  if (!isMember) return next(new ErrorHandler("Only project members can submit milestones", 403));
  if (milestone.status === "submitted") return next(new ErrorHandler("Already submitted for sign-off", 400));
  if (milestone.status === "approved") return next(new ErrorHandler("Already signed off by supervisor", 400));

  // Must have at least one log entry
  if (!milestone.logEntries.length)
    return next(new ErrorHandler("Log at least one work entry before submitting", 400));

  // For group projects — all members should have logged (warn but don't block)
  const loggedMemberIds = milestone.logEntries.map(e => e.member.toString());
  const allMemberIds    = memberIds.length ? memberIds : [studentId];
  const unloggedCount   = allMemberIds.filter(id => !loggedMemberIds.includes(id)).length;

  milestone.status         = "submitted";
  milestone.submittedAt    = new Date();
  milestone.submittedBy    = req.user._id;
  milestone.submissionNote = submissionNote?.trim() || "";

  await milestone.save();

  // Notify supervisor
  if (project.supervisor) {
    await notificationServices.notifyUser(
      project.supervisor._id,
      `📝 Week ${milestone.weekNumber} logbook submitted for sign-off: "${milestone.title}" by ${req.user.name}. ${unloggedCount > 0 ? `(${unloggedCount} member(s) haven't logged yet)` : "All members logged."}`,
      "general", "/teacher/milestones", "high"
    );
  }

  await milestone.populate("logEntries.member", "name email rollNumber");
  res.status(200).json({
    success: true,
    message: unloggedCount > 0
      ? `Submitted! Note: ${unloggedCount} group member(s) haven't added their log entry yet.`
      : "Week logbook submitted for supervisor sign-off!",
    data: { milestone },
  });
});

// ─── TEACHER: Sign off (approve) or return milestone ─────────────────────────
export const reviewMilestone = asyncHandler(async (req, res, next) => {
  const { milestoneId } = req.params;
  const { action, supervisorNote } = req.body; // action: "approve" | "reject"

  if (!["approve", "reject"].includes(action))
    return next(new ErrorHandler("Action must be 'approve' or 'reject'", 400));

  const milestone = await Milestone.findById(milestoneId)
    .populate({ path: "project", populate: { path: "supervisor members student", select: "_id name" } });
  if (!milestone) return next(new ErrorHandler("Milestone not found", 404));

  const project = milestone.project;
  if (req.user.role === "Teacher" && project.supervisor?._id.toString() !== req.user._id.toString())
    return next(new ErrorHandler("Only the project supervisor can sign off milestones", 403));

  if (milestone.status !== "submitted")
    return next(new ErrorHandler("Milestone must be submitted before it can be reviewed", 400));

  const recipients = project.members?.length
    ? project.members.map(m => m._id)
    : [project.student._id];

  if (action === "approve") {
    milestone.status       = "approved";
    milestone.signedOffBy  = req.user._id;
    milestone.signedOffAt  = new Date();
    milestone.supervisorNote = supervisorNote?.trim() || "";

    for (const uid of recipients) {
      await notificationServices.notifyUser(uid,
        `✅ Week ${milestone.weekNumber} logbook signed off by ${req.user.name}! ${supervisorNote ? `Note: "${supervisorNote}"` : ""}`,
        "general", "/student/milestones", "low"
      );
    }
  } else {
    milestone.status         = "active"; // Back to active — student revises and resubmits
    milestone.supervisorNote = supervisorNote?.trim() || "Please revise your log entries and resubmit.";
    milestone.submittedAt    = null;
    milestone.submittedBy    = null;

    for (const uid of recipients) {
      await notificationServices.notifyUser(uid,
        `🔄 Week ${milestone.weekNumber} logbook returned for revision by ${req.user.name}. ${supervisorNote || "Please update your entries and resubmit."}`,
        "general", "/student/milestones", "high"
      );
    }
  }

  await milestone.save();
  await milestone.populate([
    { path: "signedOffBy", select: "name" },
    { path: "logEntries.member", select: "name email rollNumber" },
  ]);

  res.status(200).json({
    success: true,
    message: action === "approve" ? `Week ${milestone.weekNumber} signed off!` : "Returned for revision",
    data: { milestone },
  });
});

// ─── TEACHER/ADMIN: Edit milestone ───────────────────────────────────────────
export const editMilestone = asyncHandler(async (req, res, next) => {
  const { milestoneId } = req.params;
  const { title, description, weekStartDate, weekEndDate } = req.body;

  const milestone = await Milestone.findById(milestoneId).populate("project");
  if (!milestone) return next(new ErrorHandler("Milestone not found", 404));

  const { isSupervisor, isAdmin } = await assertProjectAccess(milestone.project._id, req.user._id, req.user.role);
  if (!isSupervisor && !isAdmin) return next(new ErrorHandler("Not authorized", 403));
  if (milestone.status === "approved") return next(new ErrorHandler("Cannot edit a signed-off milestone", 400));

  if (title) milestone.title = title;
  if (description !== undefined) milestone.description = description;
  if (weekStartDate) milestone.weekStartDate = new Date(weekStartDate);
  if (weekEndDate)   milestone.weekEndDate   = new Date(weekEndDate);

  await milestone.save();

  const project = milestone.project;
  const recipients = project.members?.length ? project.members : [project.student];
  for (const uid of recipients) {
    await notificationServices.notifyUser(uid,
      `Week ${milestone.weekNumber} milestone updated by your supervisor.`,
      "general", "/student/milestones", "low"
    );
  }

  res.status(200).json({ success: true, message: "Milestone updated", data: { milestone } });
});

// ─── TEACHER/ADMIN: Delete milestone ─────────────────────────────────────────
export const deleteMilestone = asyncHandler(async (req, res, next) => {
  const { milestoneId } = req.params;
  const milestone = await Milestone.findById(milestoneId).populate("project");
  if (!milestone) return next(new ErrorHandler("Milestone not found", 404));

  const { isSupervisor, isAdmin } = await assertProjectAccess(milestone.project._id, req.user._id, req.user.role);
  if (!isSupervisor && !isAdmin) return next(new ErrorHandler("Not authorized", 403));

  await milestone.deleteOne();
  res.status(200).json({ success: true, message: "Milestone deleted" });
});

// ─── TEACHER: All milestones across all supervised projects ───────────────────
export const getTeacherMilestones = asyncHandler(async (req, res, next) => {
  const teacherId = req.user._id;

  const projects = await Project.find({ supervisor: teacherId })
    .populate("student", "name email rollNumber")
    .populate("members", "name email rollNumber")
    .populate("group", "name")
    .select("title student members isGroupProject group");

  if (!projects.length)
    return res.status(200).json({ success: true, data: { projects: [] } });

  const projectIds = projects.map(p => p._id);
  const milestones = await Milestone.find({ project: { $in: projectIds } })
    .populate("submittedBy", "name")
    .populate("signedOffBy", "name")
    .populate("logEntries.member", "name email rollNumber")
    .sort({ weekNumber: 1 });

  const projectsWithMilestones = projects.map(p => ({
    ...p.toObject(),
    milestones: milestones.filter(m => m.project.toString() === p._id.toString()),
  }));

  res.status(200).json({ success: true, data: { projects: projectsWithMilestones } });
});

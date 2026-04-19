import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { Meeting } from "../models/meeting.js";
import { Project } from "../models/project.js";
import { Group } from "../models/group.js";
import * as notificationServices from "../services/notificationServices.js";

// Student: request a meeting
export const requestMeeting = asyncHandler(async (req, res, next) => {
  const { projectId, title, agenda, proposedDate, location } = req.body;
  if (!projectId || !title || !proposedDate) return next(new ErrorHandler("Project, title, and proposed date are required", 400));

  const project = await Project.findById(projectId);
  if (!project) return next(new ErrorHandler("Project not found", 404));
  if (!project.supervisor) return next(new ErrorHandler("No supervisor assigned yet", 400));

  // Verify requester is part of the project (leader or any member)
  const userId = req.user._id.toString();
  const isLeader = project.student?.toString() === userId;
  const isMember = (project.members || []).some(m => m.toString() === userId);
  if (!isLeader && !isMember) return next(new ErrorHandler("You are not part of this project", 403));

  const meeting = await Meeting.create({
    project: projectId, student: req.user._id,
    supervisor: project.supervisor, title,
    agenda: agenda || "", proposedDate: new Date(proposedDate),
    location: location || "Online / TBD",
    // Store all group members so they can all see the meeting
    groupMembers: project.members?.length ? project.members : [project.student],
  });

  await notificationServices.notifyUser(
    project.supervisor, `Meeting request from ${req.user.name}: "${title}"`,
    "meeting", "/teacher/meetings", "medium"
  );

  // Notify all group members about the new meeting request
  const allMembers = [...new Set([
    ...(project.members || []).map(m => m.toString()),
    project.student?.toString()
  ])].filter(id => id !== userId);

  for (const memberId of allMembers) {
    await notificationServices.notifyUser(
      memberId, `${req.user.name} requested a meeting: "${title}"`,
      "meeting", "/student/meetings", "low"
    );
  }

  res.status(201).json({ success: true, message: "Meeting requested", data: { meeting } });
});

// Teacher: get all meeting requests — includes all members of group projects
export const getTeacherMeetings = asyncHandler(async (req, res, next) => {
  const teacherId = req.user._id;

  // Get all projects supervised by this teacher, with full member info
  const projects = await Project.find({ supervisor: teacherId })
    .populate("student", "_id name email")
    .populate("members", "_id name email");

  // Collect all student IDs (leaders + all group members) for this teacher's projects
  const projectMap = new Map(); // studentId -> { project, allMembers }
  const allStudentIds = new Set();

  for (const proj of projects) {
    const leaderId = proj.student?._id?.toString();
    const memberIds = (proj.members || []).map(m => m._id?.toString() || m.toString());
    const allIds = [...new Set([leaderId, ...memberIds].filter(Boolean))];
    for (const id of allIds) {
      allStudentIds.add(id);
      if (!projectMap.has(id)) projectMap.set(id, { project: proj, allMembers: allIds });
    }
  }

  const meetings = await Meeting.find({ supervisor: teacherId })
    .populate("student", "name email")
    .populate("project", "title members student")
    .sort({ createdAt: -1 });

  // For each meeting, also attach group info if it's a group project
  const enrichedMeetings = await Promise.all(meetings.map(async (m) => {
    const mObj = m.toObject();
    const project = await Project.findById(m.project?._id || m.project)
      .populate("members", "name email")
      .populate("student", "name email");
    if (project) {
      mObj.groupMembers = [
        ...(project.members || []),
        project.student
      ].filter(Boolean);
      mObj.isGroupProject = project.isGroupProject;
    }
    return mObj;
  }));

  res.status(200).json({ success: true, data: { meetings: enrichedMeetings } });
});

// Student: get their meetings — all members of a group see the same meetings
export const getStudentMeetings = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  // Find the project this student belongs to (as leader or member)
  const project = await Project.findOne({
    $or: [{ student: userId }, { members: userId }]
  });

  if (!project) {
    return res.status(200).json({ success: true, data: { meetings: [] } });
  }

  // Get ALL meetings for this project (not just the ones this student created)
  const meetings = await Meeting.find({ project: project._id })
    .populate("student", "name email")
    .populate("supervisor", "name email")
    .populate("project", "title")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, data: { meetings } });
});

// Teacher: accept meeting
export const acceptMeeting = asyncHandler(async (req, res, next) => {
  const { meetingId } = req.params;
  const { confirmedDate, meetingLink, notes } = req.body;
  const meeting = await Meeting.findOne({ _id: meetingId, supervisor: req.user._id });
  if (!meeting) return next(new ErrorHandler("Meeting not found", 404));

  meeting.status = "accepted";
  meeting.confirmedDate = confirmedDate ? new Date(confirmedDate) : meeting.proposedDate;
  if (meetingLink) meeting.meetingLink = meetingLink;
  if (notes) meeting.notes = notes;
  await meeting.save();

  // Notify the meeting requester
  await notificationServices.notifyUser(
    meeting.student, `Your meeting "${meeting.title}" has been accepted! Date: ${meeting.confirmedDate.toDateString()}`,
    "approval", "/student/meetings", "medium"
  );

  // Also notify other group members
  const project = await Project.findById(meeting.project);
  if (project) {
    const allMembers = [...new Set([
      ...(project.members || []).map(m => m.toString()),
      project.student?.toString()
    ])].filter(id => id !== meeting.student?.toString());

    for (const memberId of allMembers) {
      await notificationServices.notifyUser(
        memberId, `Meeting "${meeting.title}" has been accepted. Date: ${meeting.confirmedDate.toDateString()}`,
        "approval", "/student/meetings", "low"
      );
    }
  }

  res.status(200).json({ success: true, data: { meeting } });
});

// Teacher: reject meeting
export const rejectMeeting = asyncHandler(async (req, res, next) => {
  const { meetingId } = req.params;
  const { rejectionReason } = req.body;
  const meeting = await Meeting.findOne({ _id: meetingId, supervisor: req.user._id });
  if (!meeting) return next(new ErrorHandler("Meeting not found", 404));

  meeting.status = "rejected";
  meeting.rejectionReason = rejectionReason || "No reason provided";
  await meeting.save();

  await notificationServices.notifyUser(
    meeting.student, `Your meeting "${meeting.title}" was declined.`,
    "rejection", "/student/meetings", "low"
  );

  // Also notify other group members
  const project = await Project.findById(meeting.project);
  if (project) {
    const allMembers = [...new Set([
      ...(project.members || []).map(m => m.toString()),
      project.student?.toString()
    ])].filter(id => id !== meeting.student?.toString());
    for (const memberId of allMembers) {
      await notificationServices.notifyUser(
        memberId, `Meeting "${meeting.title}" was declined by the supervisor.`,
        "rejection", "/student/meetings", "low"
      );
    }
  }

  res.status(200).json({ success: true, data: { meeting } });
});

// Teacher/Student: mark meeting completed
export const completeMeeting = asyncHandler(async (req, res, next) => {
  const { meetingId } = req.params;
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) return next(new ErrorHandler("Meeting not found", 404));
  meeting.status = "completed";
  await meeting.save();
  res.status(200).json({ success: true, data: { meeting } });
});

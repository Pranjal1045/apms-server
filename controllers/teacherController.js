import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { User } from "../models/user.js";
import * as userServices from "../services/userServices.js";
import * as projectServices from "../services/projectServices.js";
import * as requestServices from "../services/requestServices.js";
import * as notificationServices from "../services/notificationServices.js";
import { Project } from "../models/project.js";
import { Notification } from "../models/notification.js";
import { SupervisorRequest } from "../models/supervisorRequest.js";
import * as fileServices from "../services/fileServices.js";
import { sendEmail } from "../services/emailService.js";
import {
  generateRequestAcceptedTemplate,
  generateRequestRejectedTemplate,
} from "../utils/emailTemplates.js";

export const getTeacherDashboardStats = asyncHandler(async (req, res, next) => {
  const teacherId = req.user._id;

  const totalPendingRequests = await SupervisorRequest.countDocuments({
    supervisor: teacherId,
    status: "pending",
  });

  const completedProjects = await Project.countDocuments({
    supervisor: teacherId,
    status: "completed",
  });

  const recentNotifications = await Notification.find({
    user: teacherId,
  })
    .sort({ createdAt: -1 })
    .limit(5);

  const dashboardStats = {
    totalPendingRequests,
    completedProjects,
    recentNotifications,
  };

  res.status(200).json({
    success: true,
    message: "Dashboard stats fetched for teacher successfully",
    data: { dashboardStats },
  });
});

export const getRequests = asyncHandler(async (req, res, next) => {
  const { supervisor } = req.query;

  const filters = {};
  if (supervisor) filters.supervisor = supervisor;

  const { requests, total } = await requestServices.getAllRequests(filters);

  const updatedRequests = await Promise.all(
    requests.map(async (reqObj) => {
      const requestObj = reqObj.toObject ? reqObj.toObject() : reqObj;
      if (requestObj?.student?._id) {
        const latestProject = await Project.findOne({
          student: requestObj.student._id,
        })
          .sort({ createdAt: -1 })
          .lean();

        return { ...requestObj, latestProject };
      }
      return requestObj;
    })
  );

  res.status(200).json({
    success: true,
    message: "Requests fetched successfully",
    data: {
      requests: updatedRequests,
      total,
    },
  });
});

// acceptRequest removed — supervisor assignment is done by Admin only

export const rejectRequest = asyncHandler(async (req, res, next) => {
  const { requestId } = req.params;
  const teacherId = req.user._id;

  const request = await requestServices.rejectRequest(requestId, teacherId);
  if (!request) return next(new ErrorHandler("Request not found", 404));

  // Notify the student
  await notificationServices.notifyUser(
    request.student._id,
    `Your supervisor request has been rejected by ${req.user.name}`,
    "rejection",
    "/student/supervisor",
    "high"
  );

  // ── FIX: Notify ALL admins about the rejection so they don't re-assign ──
  const admins = await User.find({ role: "Admin" }).select("_id");
  for (const admin of admins) {
    await notificationServices.notifyUser(
      admin._id,
      `Supervisor ${req.user.name} rejected request from student ${request.student?.name || "Unknown"}. They may need a new supervisor assignment.`,
      "rejection",
      "/admin/assign-supervisor",
      "high"
    );
  }

  const student = await User.findById(request.student._id);
  const studentEmail = student?.email;
  if (studentEmail) {
    const message = generateRequestRejectedTemplate(req.user.name);
    await sendEmail({
      to: studentEmail,
      subject: "FYP SYSTEM - Your Supervisor Request Has Been Rejected",
      message,
    });
  }

  res.status(200).json({
    success: true,
    message: "Request rejected",
    data: { request },
  });
});

// ── Get assigned students — includes ALL group members, not just leader ──
export const getAssignedStudents = asyncHandler(async (req, res, next) => {
  const teacherId = req.user._id;

  // Get all projects supervised by this teacher
  const projects = await Project.find({ supervisor: teacherId })
    .populate("student", "name email department rollNumber project group supervisor")
    .populate("members", "name email department rollNumber project group supervisor")
    .populate("group", "name groupLeader")
    .sort({ createdAt: -1 });

  // Build a flat list of all unique students (leader + all members)
  const studentMap = new Map();

  for (const project of projects) {
    const leader = project.student;
    if (leader && !studentMap.has(leader._id.toString())) {
      const leaderObj = leader.toObject ? leader.toObject() : leader;
      studentMap.set(leader._id.toString(), {
        ...leaderObj,
        project: { _id: project._id, title: project.title, status: project.status },
        isGroupLeader: project.isGroupProject,
        groupName: project.group?.name,
      });
    }

    // Add all group members
    for (const member of (project.members || [])) {
      if (member && !studentMap.has(member._id.toString())) {
        const memberObj = member.toObject ? member.toObject() : member;
        studentMap.set(member._id.toString(), {
          ...memberObj,
          project: { _id: project._id, title: project.title, status: project.status },
          isGroupLeader: false,
          groupName: project.group?.name,
        });
      }
    }
  }

  const students = Array.from(studentMap.values());

  res.status(200).json({
    success: true,
    data: {
      students,
      total: students.length,
    },
  });
});
 
export const markComplete = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;
  const teacherId = req.user._id;
 
  const project = await projectServices.getProjectById(projectId);
 
  if (!project) return next(new ErrorHandler("Project not found", 404));
  if (project.supervisor._id.toString() !== teacherId.toString()) {
    return next(new ErrorHandler("Not authorized to mark complete", 403));
  }
 
  const updatedProject = await projectServices.markComplete(projectId);
 
  // Notify all group members
  const allMemberIds = [
    ...(project.members || []).map(m => m._id?.toString() || m.toString()),
    project.student?._id?.toString() || project.student?.toString()
  ].filter(Boolean);
  const uniqueIds = [...new Set(allMemberIds)];

  for (const uid of uniqueIds) {
    await notificationServices.notifyUser(
      uid,
      `Your project has been marked as completed by your supervisor (${req.user.name})`,
      "general",
      "/student/group",
      "low"
    );
  }
 
  res.status(200).json({
    success: true,
    data: {
      project: updatedProject,
    },
    message: "Project marked as completed",
  });
});
 
export const addFeedback = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;
  const teacherId = req.user._id;
  const { message, title, type } = req.body;
 
  const project = await projectServices.getProjectById(projectId);
  if (!project) return next(new ErrorHandler("Project not found", 404));
  if (project.supervisor._id.toString() !== teacherId.toString()) {
    return next(new ErrorHandler("Not authorized to add feedback", 403));
  }
 
  if (!message || !title)
    return next(new ErrorHandler("Feedback title and message are required", 400));
 
  const {project : updatedProject , latestFeedback} = await projectServices.addFeedback(
    projectId,
    teacherId,
    message,
    title,
    type
  );
 
  // Notify all group members about feedback
  const allMemberIds = [
    ...(project.members || []).map(m => m._id?.toString() || m.toString()),
    project.student?._id?.toString() || project.student?.toString()
  ].filter(Boolean);
  const uniqueIds = [...new Set(allMemberIds)];

  for (const uid of uniqueIds) {
    await notificationServices.notifyUser(
      uid,
      `New feedback from your supervisor (${req.user.name})`,
      "feedback",
      "/student/feedback",
      type === "positive" ? "low" : type === "negative" ? "high" : "low"
    );
  }
 
  res.status(200).json({
    success: true,
    message: "Feedback posted successfully",
    data: { project: updatedProject, feedback: latestFeedback },
  });
});

// ─── GET FILES ───────────────────────────────────────────────────────────────
export const getFiles = asyncHandler(async (req, res, next) => {
  const teacherId = req.user._id;

  const projects = await projectServices.getProjectsBySupervisor(teacherId);

  const allFiles = projects.flatMap((project) =>
    project.files.map((file) => ({
      ...file.toObject(),
      projectId: project._id,
      projectTitle: project.title,
      studentName: project.student?.name,
      studentEmail: project.student?.email,
    }))
  );

  res.status(200).json({
    success: true,
    message: "Files fetched",
    data: {
      files: allFiles,
    },
  });
});

// ─── DOWNLOAD FILE ────────────────────────────────────────────────────────────


import axios from "axios";

export const downloadFile = asyncHandler(async (req, res, next) => {
    const { projectId, fileId } = req.params;

    const project = await projectServices.getProjectById(projectId);
    if (!project) return next(new ErrorHandler("Project not found", 404));

    const file = project.files.id(fileId);
    if (!file) return next(new ErrorHandler("File not found", 404));

    try {
        const response = await axios.get(file.fileUrl, {
            responseType: "stream"
        });

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${file.originalName}"`
        );

        res.setHeader(
            "Content-Type",
            response.headers["content-type"]
        );

        response.data.pipe(res);

    } catch (error) {
        console.error("Download error:", error.message);
        return next(new ErrorHandler("File download failed", 500));
    }
});

import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { User } from "../models/user.js";
import { Project } from "../models/project.js";
import { Notification } from "../models/notification.js";
import { Group } from "../models/group.js";
import * as userServices from "../services/userServices.js";
import * as projectServices from "../services/projectServices.js";
import * as requestServices from "../services/requestServices.js";
import * as notificationServices from "../services/notificationServices.js";
import * as fileServices from "../services/fileServices.js";

export const getStudentProject = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;
    const project = await projectServices.getProjectByStudent(studentId);
    if (!project) {
        return res.status(200).json({
            success: true,
            data: { project: null },
            message: "No project found for this student"
        });
    }
    res.status(200).json({ success: true, data: { project } });
});

export const submitProposal = asyncHandler(async (req, res, next) => {
    const { title, description, isGroupProject } = req.body;
    const studentId = req.user._id;

    const existingProject = await projectServices.getProjectByStudent(studentId);
    if (existingProject && existingProject.status !== "rejected") {
        return next(new ErrorHandler("You already have an active project. You can only submit a new proposal if the previous one was rejected.", 400));
    }
    if (existingProject && existingProject.status === "rejected") {
        await Project.findByIdAndDelete(existingProject._id);
    }

    let projectData = { student: studentId, title, description };

    // ── Group project support ──────────────────────────────────────────────────
    if (isGroupProject) {
        const group = await Group.findOne({ members: studentId }).populate("members", "_id name");
        if (!group) return next(new ErrorHandler("You must be in a group to submit a group project", 400));
        if (group.groupLeader.toString() !== studentId.toString()) {
            return next(new ErrorHandler("Only the group leader can submit the project proposal", 403));
        }
        projectData.isGroupProject = true;
        projectData.group = group._id;
        projectData.members = group.members.map(m => m._id);
        group.status = "active";
        await group.save();
    }

    const project = await projectServices.createProject(projectData);
    await User.findByIdAndUpdate(studentId, { project: project._id });

    res.status(201).json({
        success: true,
        data: { project },
        message: "Project proposal submitted successfully",
    });
});

export const uploadFiles = asyncHandler(async (req, res, next) => {
    const { projectId } = req.params;
    const studentId = req.user._id;

    // BUG FIX: validate projectId before querying
    if (!projectId || projectId === "undefined") {
        return next(new ErrorHandler("Invalid project ID", 400));
    }

    const project = await projectServices.getProjectById(projectId);

    const isMember = project.members?.some(m => m._id?.toString() === studentId.toString())
        || project.student._id.toString() === studentId.toString();

    if (!project || !isMember || project.status === "rejected") {
        return next(new ErrorHandler("Not authorized to upload files to this project", 403));
    }

    // multer-storage-cloudinary already uploaded each file to Cloudinary before this
    // handler runs. file.path = Cloudinary secure URL, file.filename = public_id
    const uploadFiles = req.files.map(file => ({
        fileType: file.mimetype,
        fileUrl: file.path,           // Cloudinary secure URL set by multer-storage-cloudinary
        originalName: file.originalname,
    }));
    const updatedProject = await projectServices.addFilesToProject(projectId, uploadFiles);
    res.status(200).json({
        success: true,
        message: "File uploaded successfully",
        data: { project: updatedProject },
    });
});

export const getAvailableSupervisors = asyncHandler(async (req, res, next) => {
    const supervisors = await User.find({ role: "Teacher" })
        .select("name email department experties maxStudents assignedStudents")
        .lean();

    const enriched = supervisors.map(s => ({
        ...s,
        currentLoad: s.assignedStudents?.length || 0,
        available: (s.assignedStudents?.length || 0) < (s.maxStudents || 10),
    }));

    res.status(200).json({
        success: true,
        data: { supervisors: enriched },
        message: "Available supervisors fetched successfully",
    });
});

export const getSupervisor = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;
    const student = await User.findById(studentId).populate("supervisor", "name email department experties");
    if (!student.supervisor) {
        return res.status(200).json({
            success: true,
            data: { supervisor: null },
            message: "No supervisor assigned yet.",
        });
    }
    res.status(200).json({ success: true, data: { supervisor: student.supervisor } });
});

export const requestSupervisor = asyncHandler(async (req, res, next) => {
    const { teacherId, message } = req.body;
    const studentId = req.user._id;

    const student = await User.findById(studentId);

    // Block if already has a supervisor assigned
    if (student.supervisor) {
        return next(new ErrorHandler("You already have a supervisor assigned. You cannot send further requests.", 400));
    }

    // Block if student has no approved project
    const { Project } = await import("../models/project.js");
    const project = await Project.findOne({ $or: [{ student: studentId }, { members: studentId }] });
    if (!project || project.status !== "approved") {
        return next(new ErrorHandler("Your project must be approved before requesting a supervisor.", 400));
    }

    const supervisor = await User.findById(teacherId);
    if (!supervisor || supervisor.role !== "Teacher") {
        return next(new ErrorHandler("Invalid supervisor selected", 400));
    }

    if ((supervisor.assignedStudents?.length || 0) >= (supervisor.maxStudents || 10)) {
        return next(new ErrorHandler("This supervisor has reached maximum student capacity", 400));
    }

    const requestData = { student: studentId, supervisor: teacherId, message: message || `${student.name} has requested you to be their supervisor.` };

    // createRequest throws if duplicate/pending exists — error middleware will handle it
    const request = await requestServices.createRequest(requestData);

    await notificationServices.notifyUser(
        teacherId,
        `${student.name} has sent you a supervisor request.`,
        "request",
        "/teacher/pending-requests",
        "medium",
    );

    // Notify all admins about the new supervisor request (with teacher name, not "you")
    const { User: UserModel } = await import("../models/user.js");
    const admins = await UserModel.find({ role: "Admin" }).select("_id");
    for (const admin of admins) {
        await notificationServices.notifyUser(
            admin._id,
            `${student.name} has requested ${supervisor.name} as their supervisor.`,
            "request",
            "/admin/assign-supervisor",
            "medium",
        );
    }

    res.status(201).json({
        success: true,
        data: { request },
        message: "Supervisor request submitted successfully",
    });
});

// Get all requests sent by this student
export const getMyRequests = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;
    const requests = await requestServices.getStudentRequests(studentId);
    res.status(200).json({
        success: true,
        data: { requests },
        message: "Requests fetched successfully",
    });
});

export const getDashboardStats = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;

    const project = await Project.findOne({ $or: [{ student: studentId }, { members: studentId }] })
        .sort({ createdAt: -1 })
        .populate("supervisor", "name")
        .populate("members", "name email")
        .lean();

    const now = new Date();
    const upcomingDeadlines = await Project.find({
        $or: [{ student: studentId }, { members: studentId }],
        deadline: { $gte: now }
    }).select("title description deadline").sort({ deadline: 1 }).limit(3).lean();

    const topNotifications = await Notification.find({ user: studentId })
        .sort({ createdAt: -1 })
        .limit(3)
        .lean();

    const feedbackNotifications = project?.feedback?.length > 0
        ? project.feedback.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 2)
        : [];

    const group = await Group.findOne({ members: studentId })
        .populate("members", "name email rollNumber")
        .populate("groupLeader", "name email")
        .lean();

    res.status(200).json({
        success: true,
        message: "Dashboard stats fetched successfully",
        data: {
            project,
            upcomingDeadlines,
            topNotifications,
            feedbackNotifications,
            supervisorName: project?.supervisor?.name || null,
            group,
        }
    });
});

// BUG FIX: removed duplicate res.json call — only one response sent now
export const getFeedback = asyncHandler(async (req, res, next) => {
    const { projectId } = req.params;

    const project = await Project.findById(projectId).populate("feedback.supervisorId", "name email");
    if (!project) return next(new ErrorHandler("Project not found", 404));

    const sortedFeedback = project.feedback
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((f) => ({
            _id: f._id,
            title: f.title,
            message: f.message,
            type: f.type,
            createdAt: f.createdAt,
            supervisorName: f.supervisorId?.name || f.supervisorName,
            supervisorEmail: f.supervisorId?.email,
        }));

    res.status(200).json({
        success: true,
        data: { feedback: sortedFeedback },
    });
});



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
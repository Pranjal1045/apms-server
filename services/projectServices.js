import ErrorHandler from "../middlewares/error.js";
import { Project } from "../models/project.js";
import { User } from "../models/user.js";

export const getProjectByStudent = async (studentId) => {
    return await Project.findOne({
        $or: [{ student: studentId }, { members: studentId }]
    })
    .sort({ createdAt: -1 })
    .populate("supervisor", "name email")
    .populate("members", "name email rollNumber")
    .populate("group");
};

export const createProject = async (projectData) => {
    const project = new Project(projectData);
    await project.save();
    return project;
};

export const getProjectById = async (id) => {
    const project = await Project.findById(id)
        .populate("student", "name email")
        .populate("supervisor", "name email")
        .populate("members", "name email rollNumber")
        .populate("group")
        .populate("feedback.supervisorId", "name email");

    if (!project) throw new ErrorHandler("Project not found", 404);
    return project;
};

// BUG FIX: uploadedBy field now saved properly
export const addFilesToProject = async (projectId, files, uploadedBy) => {
    const project = await Project.findById(projectId);
    if (!project) throw new ErrorHandler("Project not found", 404);

    const fileMetaData = files.map((file) => ({
        fileType: file.fileType,
        fileUrl: file.secure_url || file.fileUrl,
        originalName: file.originalName,
        uploadedAt: new Date(),
        uploadedBy: uploadedBy || null,
    }));

    project.files.push(...fileMetaData);
    await project.save();
    return project;
};

export const getAllProjects = async (filters = {}) => {
    return await Project.find(filters)
        .populate("student", "name email")
        .populate("supervisor", "name email")
        .populate("members", "name email")
        .populate("group", "name")
        .sort({ createdAt: -1 });
};

export const markComplete = async (projectId) => {
    const project = await Project.findByIdAndUpdate(
        projectId,
        { status: "completed", progress: 100 },
        { new: true, runValidators: true }
    )
        .populate("student", "name email")
        .populate("supervisor", "name email");

    if (!project) throw new ErrorHandler("Project not found", 404);
    return project;
};

export const addFeedback = async (projectId, supervisorId, message, title, type) => {
    const project = await Project.findById(projectId);
    if (!project) throw new ErrorHandler("Project not found", 404);

    const teacher = await User.findById(supervisorId).select("name");
    project.feedback.push({
        supervisorId,
        supervisorName: teacher?.name || "Supervisor",
        message,
        title,
        type,
    });

    await project.save();
    const latestFeedback = project.feedback[project.feedback.length - 1];
    return { project, latestFeedback };
};

export const getFeedback = async (projectId) => {
    const project = await Project.findById(projectId).populate("feedback.supervisorId", "name");
    if (!project) throw new ErrorHandler("Project not found", 404);
    return project.feedback;
};

export const getProjectsBySupervisor = async (supervisorId) => {
    return await getAllProjects({ supervisor: supervisorId });
};

export const updateProject = async (id, updatedData) => {
    const project = await Project.findByIdAndUpdate(id, updatedData, {
        new: true,
        runValidators: true,
    })
        .populate("student", "name email")
        .populate("supervisor", "name email")
        .populate("members", "name email");

    if (!project) throw new ErrorHandler("Project not found", 404);
    return project;
};

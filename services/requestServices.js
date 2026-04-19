import { SupervisorRequest } from "../models/supervisorRequest.js";
import { User } from "../models/user.js";

// Create a new supervisor request — one pending request per student allowed at a time
export const createRequest = async (requestData) => {
    // Block if student already has ANY pending request (to any supervisor)
    const anyPending = await SupervisorRequest.findOne({
        student: requestData.student,
        status: "pending",
    });
    if (anyPending) {
        throw new Error("You already have a pending request. Wait for it to be resolved before sending another.");
    }

    // Block duplicate to same supervisor
    const dupRequest = await SupervisorRequest.findOne({
        student: requestData.student,
        supervisor: requestData.supervisor,
        status: { $in: ["pending", "accepted"] },
    });
    if (dupRequest) {
        throw new Error("You have already sent a request to this supervisor.");
    }

    const request = await SupervisorRequest.create(requestData);
    return request;
};

export const getAllRequests = async (filters) => {
    const requests = await SupervisorRequest.find(filters)
        .populate("student", "name email supervisor")
        .populate("supervisor", "name email assignedStudents maxStudents")
        .sort({ createdAt: -1 });
    const total = await SupervisorRequest.countDocuments(filters);
    return { requests, total };
};

// Teacher can ONLY reject — cannot accept (that is admin's job via assignSupervisor)
export const rejectRequest = async (requestId, supervisorId) => {
    const request = await SupervisorRequest.findById(requestId)
        .populate("student", "name email")
        .populate("supervisor", "name email");

    if (!request) throw new Error("Request not found");
    if (request.supervisor._id.toString() !== supervisorId.toString()) {
        throw new Error("Not authorized to reject this request");
    }
    if (request.status !== "pending") {
        throw new Error("Request has already been processed");
    }

    request.status = "rejected";
    await request.save();
    return request;
};

// Called ONLY by admin's assignSupervisor — marks the matching request as accepted, rejects others
export const acceptRequestByAdmin = async (studentId, supervisorId) => {
    // Mark the matching request (if any) as accepted
    await SupervisorRequest.updateOne(
        { student: studentId, supervisor: supervisorId, status: "pending" },
        { status: "accepted" }
    );

    // Reject all other pending requests from this student
    await SupervisorRequest.updateMany(
        { student: studentId, status: "pending" },
        { status: "rejected" }
    );
};

// Get all pending requests for a student (to show on their supervisor page)
export const getStudentRequests = async (studentId) => {
    return await SupervisorRequest.find({ student: studentId })
        .populate("supervisor", "name email department experties")
        .sort({ createdAt: -1 });
};

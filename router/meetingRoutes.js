import express from "express";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import { requestMeeting, getTeacherMeetings, getStudentMeetings, acceptMeeting, rejectMeeting, completeMeeting } from "../controllers/meetingController.js";

const router = express.Router();
router.use(isAuthenticated);

router.post("/request",         isAuthorized("Student"),           requestMeeting);
router.get("/student",          isAuthorized("Student"),           getStudentMeetings);
router.get("/teacher",          isAuthorized("Teacher"),           getTeacherMeetings);
router.put("/:meetingId/accept",isAuthorized("Teacher"),           acceptMeeting);
router.put("/:meetingId/reject",isAuthorized("Teacher"),           rejectMeeting);
router.put("/:meetingId/complete", isAuthorized("Student","Teacher"), completeMeeting);

export default router;

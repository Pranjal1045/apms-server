import express from "express";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import {
  createMilestone,
  getMilestones,
  saveLogEntry,
  submitMilestone,
  reviewMilestone,
  editMilestone,
  deleteMilestone,
  getTeacherMilestones,
} from "../controllers/milestoneController.js";

const router = express.Router();
router.use(isAuthenticated);

// Teacher: overview of all supervised projects' milestones
router.get("/teacher/all",               isAuthorized("Teacher", "Admin"),             getTeacherMilestones);

// Project-scoped
router.post("/:projectId",               isAuthorized("Teacher", "Admin"),             createMilestone);
router.get("/:projectId",                isAuthorized("Student", "Teacher", "Admin"),  getMilestones);

// Milestone-scoped
router.patch("/:milestoneId/log",        isAuthorized("Student"),                      saveLogEntry);
router.post("/:milestoneId/submit",      isAuthorized("Student"),                      submitMilestone);
router.patch("/:milestoneId/review",     isAuthorized("Teacher", "Admin"),             reviewMilestone);
router.put("/:milestoneId",              isAuthorized("Teacher", "Admin"),             editMilestone);
router.delete("/:milestoneId",           isAuthorized("Teacher", "Admin"),             deleteMilestone);

export default router;

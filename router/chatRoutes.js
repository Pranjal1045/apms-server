import express from "express";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import { getChatHistory, sendMessage, getUnreadCount } from "../controllers/chatController.js";

const router = express.Router();
router.use(isAuthenticated);

router.get("/project/:projectId", isAuthorized("Student", "Teacher", "Admin"), getChatHistory);
router.post("/send",              isAuthorized("Student", "Teacher", "Admin"), sendMessage);
router.get("/unread",             isAuthorized("Student", "Teacher", "Admin"), getUnreadCount);

export default router;

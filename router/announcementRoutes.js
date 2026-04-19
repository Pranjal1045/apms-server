import express from "express";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import { createAnnouncement, getAnnouncements, deleteAnnouncement, updateAnnouncement } from "../controllers/announcementController.js";

const router = express.Router();
router.use(isAuthenticated);

router.post("/",    isAuthorized("Admin"), createAnnouncement);
router.get("/",     isAuthorized("Student", "Teacher", "Admin"), getAnnouncements);
router.put("/:id",  isAuthorized("Admin"), updateAnnouncement);
router.delete("/:id", isAuthorized("Admin"), deleteAnnouncement);

export default router;

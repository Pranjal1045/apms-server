import express from "express";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import { exportProjectPDF, exportAllProjectsPDF } from "../controllers/exportController.js";

const router = express.Router();
router.use(isAuthenticated);

router.get("/project/:projectId",  isAuthorized("Student", "Teacher", "Admin"), exportProjectPDF);
router.get("/all-projects",        isAuthorized("Admin"), exportAllProjectsPDF);

export default router;

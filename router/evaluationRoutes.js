import express from "express";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import { upsertEvaluation, getEvaluation, getAllEvaluations } from "../controllers/evaluationController.js";

const router = express.Router();
router.use(isAuthenticated);

router.put("/:projectId",  isAuthorized("Teacher", "Admin"), upsertEvaluation);
router.get("/:projectId",  isAuthorized("Student", "Teacher", "Admin"), getEvaluation);
router.get("/",            isAuthorized("Admin"), getAllEvaluations);

export default router;

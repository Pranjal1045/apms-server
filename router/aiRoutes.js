import express from "express";
import multer from "multer";
import path from "path";
import {
  analyzeProgress,
  checkPlagiarism,
  generateAIFeedback,
  chatbot,
  summarizeReport,
  gradeReport,
  generateVivaQuestions,
  analyzeMilestoneRisk,
  predictEvaluationScore,
  generateEvaluationReport,
} from "../controllers/aiController.js";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Multer config for AI report uploads (PDF, DOCX, TXT only, max 10MB)
// Uses memoryStorage so files are kept in buffer — no local disk writes needed
const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".docx", ".txt"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Only PDF, DOCX, and TXT files are allowed."));
  },
});

// 1. Progress Risk Analyzer (now includes real milestone data)
router.get("/analyze-progress/:projectId",    isAuthenticated, isAuthorized("Student","Teacher","Admin"), analyzeProgress);

// 2. Plagiarism Checker
router.get("/check-plagiarism/:projectId",    isAuthenticated, isAuthorized("Teacher","Admin"),           checkPlagiarism);

// 3. AI Feedback Generator
router.post("/generate-feedback/:projectId",  isAuthenticated, isAuthorized("Teacher","Admin"),           generateAIFeedback);

// 4. Smart Chatbot
router.post("/chatbot",                       isAuthenticated, isAuthorized("Student","Teacher","Admin"), chatbot);

// 5. Report Summarizer (supports file upload OR text paste)
router.post("/summarize-report", isAuthenticated, isAuthorized("Student","Teacher","Admin"), reportUpload.single("reportFile"), summarizeReport);

// 6. Report Grader (supports file upload OR text paste)
router.post("/grade-report", isAuthenticated, isAuthorized("Student","Teacher","Admin"), reportUpload.single("reportFile"), gradeReport);

// 7. Viva Question Generator
router.post("/viva-questions/:projectId",     isAuthenticated, isAuthorized("Student","Teacher","Admin"), generateVivaQuestions);

// 8. Milestone Risk Predictor  ← NEW
router.get("/milestone-risk/:projectId",      isAuthenticated, isAuthorized("Teacher","Admin"),           analyzeMilestoneRisk);

// 9. Evaluation Score Predictor  ← NEW
router.get("/predict-evaluation/:projectId",  isAuthenticated, isAuthorized("Teacher","Admin"),           predictEvaluationScore);

// 10. Auto-generate Evaluation Report  ← NEW
router.get("/eval-report/:projectId",         isAuthenticated, isAuthorized("Teacher","Admin"),           generateEvaluationReport);

export default router;
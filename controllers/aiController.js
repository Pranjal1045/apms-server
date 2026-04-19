import { Project }    from "../models/project.js";
import { Deadline }   from "../models/deadline.js";
import { Milestone }  from "../models/milestone.js";
import { Evaluation } from "../models/evaluation.js";
import { Notification } from "../models/notification.js";
import path from "path";

const AI_SERVICE = process.env.AI_SERVICE_URL || "http://localhost:8001";

// ── Extract plain text from an uploaded file (PDF or DOCX) ───────────────────
// Uses multer memoryStorage — file.buffer is in RAM, no local disk writes needed
const extractTextFromFile = async (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const buffer = file.buffer; // provided by multer memoryStorage

  if (!buffer || buffer.length === 0) {
    throw new Error("File buffer is empty. Ensure memoryStorage is configured for AI uploads.");
  }

  if (ext === ".pdf") {
    // Use createRequire to avoid pdf-parse test-file side-effect on dynamic import
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const data = await pdfParse(buffer);
    return data.text;
  } else if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } else if (ext === ".txt") {
    return buffer.toString("utf-8");
  } else {
    throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
  }
};

const callAI = async (endpoint, body) => {
  const res = await fetch(`${AI_SERVICE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `AI service error at ${endpoint}`);
  }
  return res.json();
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. PLAGIARISM CHECKER
// ─────────────────────────────────────────────────────────────────────────────
export const checkPlagiarism = async (req, res) => {
  try {
    const { projectId } = req.params;
    const targetProject = await Project.findById(projectId).populate("student", "name");
    if (!targetProject) return res.status(404).json({ success: false, message: "Project not found" });

    const otherProjects = await Project.find({
      _id: { $ne: projectId },
      status: { $in: ["approved", "pending", "completed"] },
    }).populate("student", "name").select("title description student");

    if (otherProjects.length === 0) {
      return res.status(200).json({
        success: true,
        targetProject: { title: targetProject.title, student: targetProject.student?.name },
        overallRisk: "Low",
        summary: "No other projects found to compare against.",
        comparisons: [],
        algorithm: "TF-IDF + Cosine Similarity",
      });
    }

    const aiResult = await callAI("/plagiarism", {
      target_title: targetProject.title,
      target_description: targetProject.description,
      other_projects: otherProjects.map((p) => ({
        id: p._id.toString(),
        title: p.title,
        description: p.description,
        studentName: p.student?.name || "Unknown",
      })),
    });

    if (aiResult.overallRisk === "High" && targetProject.supervisor) {
      await Notification.create({
        user: targetProject.supervisor,
        message: `🚨 Plagiarism Alert: "${targetProject.title}" has HIGH similarity with other projects.`,
        type: "system", priority: "high", link: `/teacher/ai-features`,
      });
    }

    res.status(200).json({
      success: true,
      targetProject: { title: targetProject.title, student: targetProject.student?.name },
      overallRisk: aiResult.overallRisk,
      summary: aiResult.summary,
      comparisons: aiResult.comparisons,
      algorithm: aiResult.algorithm,
    });
  } catch (error) {
    console.error("Plagiarism Error:", error.message);
    res.status(500).json({ success: false, message: `Plagiarism check failed: ${error.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. PROGRESS RISK ANALYZER  ← now includes real Milestone data
// ─────────────────────────────────────────────────────────────────────────────
export const analyzeProgress = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId)
      .populate("student", "name email")
      .populate("supervisor", "name email");
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const userId = req.user._id.toString();
    const isStudent    = project.student._id.toString() === userId;
    const isSupervisor = project.supervisor && project.supervisor._id.toString() === userId;
    const isAdmin      = req.user.role === "Admin";
    if (!isStudent && !isSupervisor && !isAdmin)
      return res.status(403).json({ success: false, message: "Access denied" });

    // ── Legacy deadlines ──────────────────────────────────────────────────────
    const deadlines = await Deadline.find({ Project: projectId }).sort({ dueDate: 1 });
    const now = new Date();
    const overdueDeadlines  = deadlines.filter((d) => new Date(d.dueDate) < now);
    const upcomingDeadlines = deadlines.filter((d) => new Date(d.dueDate) >= now);

    // ── Real Milestones ───────────────────────────────────────────────────────
    const milestones = await Milestone.find({ project: projectId }).sort({ weekNumber: 1 });
    const totalMilestones    = milestones.length;
    const approvedMilestones = milestones.filter(m => m.status === "approved").length;
    const submittedMilestones= milestones.filter(m => m.status === "submitted").length;
    const rejectedMilestones = milestones.filter(m => m.status === "rejected").length;
    const activeMilestones   = milestones.filter(m => m.status === "active").length;
    const upcomingMilestones = milestones.filter(m => m.status === "upcoming").length;

    // "Overdue" = active milestones whose week has ended and still not approved
    const overdueMilestones = milestones.filter(m =>
      (m.status === "active" || m.status === "rejected") &&
      m.weekEndDate && new Date(m.weekEndDate) < now
    ).length;

    const milestoneCompletionRate = totalMilestones > 0
      ? Math.round((approvedMilestones / totalMilestones) * 100)
      : 0;

    // ── Project deadline ──────────────────────────────────────────────────────
    let daysUntilDeadline = null;
    let deadlineStatus = "No deadline set";
    if (project.deadline) {
      daysUntilDeadline = Math.ceil((new Date(project.deadline) - now) / (1000 * 60 * 60 * 24));
      deadlineStatus = daysUntilDeadline > 0
        ? `${daysUntilDeadline} days remaining`
        : `Overdue by ${Math.abs(daysUntilDeadline)} days`;
    }

    let daysSinceLastUpload = null;
    if (project.files.length > 0) {
      const lastUpload = project.files[project.files.length - 1].uploadedAt;
      daysSinceLastUpload = Math.floor((now - new Date(lastUpload)) / (1000 * 60 * 60 * 24));
    }

    const aiResult = await callAI("/risk-predict", {
      projectStatus:        project.status,
      filesCount:           project.files.length,
      feedbackCount:        project.feedback.length,
      // Legacy deadline counts kept for backward compatibility
      totalDeadlines:       deadlines.length,
      overdueCount:         overdueDeadlines.length,
      upcomingCount:        upcomingDeadlines.length,
      daysUntilDeadline,
      daysSinceLastUpload,
      // New milestone signals
      totalMilestones,
      approvedMilestones,
      submittedMilestones,
      rejectedMilestones,
      overdueMilestones,
      milestoneCompletionRate,
    });

    if (aiResult.riskLevel === "High") {
      await Notification.create({
        user: project.student._id,
        message: `⚠️ AI Risk Alert: Your project "${project.title}" is at HIGH risk. Take action now!`,
        type: "deadline", priority: "high", link: `/student/ai-features`,
      });
    }

    res.status(200).json({
      success: true,
      projectTitle:  project.title,
      projectStatus: project.status,
      stats: {
        // Legacy
        totalDeadlines:    deadlines.length,
        overdueCount:      overdueDeadlines.length,
        upcomingCount:     upcomingDeadlines.length,
        filesUploaded:     project.files.length,
        feedbackCount:     project.feedback.length,
        daysUntilDeadline,
        deadlineStatus,
        // New milestone stats
        totalMilestones,
        approvedMilestones,
        submittedMilestones,
        rejectedMilestones,
        activeMilestones,
        upcomingMilestones,
        overdueMilestones,
        milestoneCompletionRate,
      },
      riskScore:      aiResult.riskScore,
      riskLevel:      aiResult.riskLevel,
      riskColor:      aiResult.riskColor,
      prediction:     aiResult.prediction,
      description:    aiResult.description,
      actionRequired: aiResult.actionRequired,
      factors:        aiResult.factors,
      algorithm:      aiResult.algorithm,
    });
  } catch (error) {
    console.error("Progress Analyzer Error:", error.message);
    res.status(500).json({ success: false, message: `Analysis failed: ${error.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. AI FEEDBACK GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
export const generateAIFeedback = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { feedbackType = "general" } = req.body;

    const project = await Project.findById(projectId)
      .populate("student", "name")
      .populate("supervisor", "name");
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const userId = req.user._id.toString();
    const isSupervisor = project.supervisor && project.supervisor._id.toString() === userId;
    const isAdmin = req.user.role === "Admin";
    if (!isSupervisor && !isAdmin)
      return res.status(403).json({ success: false, message: "Only supervisor can generate feedback" });

    const deadlines = await Deadline.find({ Project: projectId });
    const milestones = await Milestone.find({ project: projectId });
    const now = new Date();
    const overdueCount  = deadlines.filter((d) => new Date(d.dueDate) < now).length;
    const filesCount    = project.files.length;
    const studentName   = project.student?.name || "Student";
    const projectTitle  = project.title;

    const approvedMilestones = milestones.filter(m => m.status === "approved").length;
    const overdueMilestones  = milestones.filter(m =>
      (m.status === "active" || m.status === "rejected") && m.weekEndDate && new Date(m.weekEndDate) < now
    ).length;

    let title = "", message = "";
    if (feedbackType === "positive") {
      title = `Commendable Progress on "${projectTitle}"`;
      message = `Dear ${studentName}, I am pleased to acknowledge the excellent progress on "${projectTitle}". ` +
        (filesCount > 0 ? `You have uploaded ${filesCount} file(s) showing commitment to documentation. ` : "") +
        (approvedMilestones > 0 ? `${approvedMilestones} milestone(s) have been approved — excellent work. ` : "") +
        `Your proposal shows clear understanding of research objectives. ` +
        (overdueCount === 0 && deadlines.length > 0 ? `Timely completion of all milestones is commendable. ` : "") +
        `Keep up the excellent work!`;
    } else if (feedbackType === "negative") {
      title = `Areas Requiring Immediate Improvement — "${projectTitle}"`;
      message = `Dear ${studentName}, after reviewing "${projectTitle}", several areas need immediate attention. ` +
        (overdueMilestones > 0 ? `You have ${overdueMilestones} overdue weekly milestone(s) that require immediate submission. ` : "") +
        (overdueCount > 0 ? `${overdueCount} deadline(s) are overdue. ` : "") +
        (filesCount === 0 ? `No project files uploaded yet, suggesting insufficient progress. ` : "") +
        `Please schedule a meeting to discuss a remediation plan urgently.`;
    } else {
      title = `General Progress Review — "${projectTitle}"`;
      message = `Dear ${studentName}, here is a review of "${projectTitle}". Status: ${project.status}. ` +
        (filesCount > 0 ? `${filesCount} file(s) submitted. ` : `No files uploaded yet. `) +
        (approvedMilestones > 0 ? `${approvedMilestones}/${milestones.length} weekly milestones approved. ` : "") +
        (overdueMilestones > 0 ? `${overdueMilestones} overdue milestone(s) need attention. ` : `Weekly milestones on track. `) +
        `Maintain regular communication with your supervisor.`;
    }

    project.feedback.push({ supervisorId: req.user._id, type: feedbackType, title: `[AI] ${title}`, message });
    await project.save();

    await Notification.create({
      user: project.student._id,
      message: `📝 New AI feedback on your project "${project.title}" from your supervisor.`,
      type: "feedback", priority: "medium", link: `/student/feedback`,
    });

    res.status(200).json({
      success: true,
      message: "AI feedback generated and saved",
      feedback: { type: feedbackType, title: `[AI] ${title}`, message },
    });
  } catch (error) {
    console.error("Feedback Error:", error.message);
    res.status(500).json({ success: false, message: `Feedback generation failed: ${error.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. CHATBOT
// ─────────────────────────────────────────────────────────────────────────────
export const chatbot = async (req, res) => {
  try {
    const { message, projectId } = req.body;
    if (!message?.trim()) return res.status(400).json({ success: false, message: "Message is required" });

    let project = null;
    let deadlines = [];
    if (projectId) {
      project = await Project.findById(projectId).populate("supervisor", "name email").lean();
      if (project) deadlines = await Deadline.find({ Project: projectId }).sort({ dueDate: 1 }).lean();
    }

    const aiResult = await callAI("/chatbot", { message, project, deadlines });
    res.status(200).json({ success: true, reply: aiResult.reply, intent: aiResult.intent, timestamp: aiResult.timestamp });
  } catch (error) {
    console.error("Chatbot Error:", error.message);
    res.status(500).json({ success: false, message: `Chatbot failed: ${error.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. REPORT SUMMARIZER
// ─────────────────────────────────────────────────────────────────────────────
export const summarizeReport = async (req, res) => {
  try {
    let text = req.body.text || "";
    const numSentences = parseInt(req.body.numSentences) || 5;
    const projectTitle = req.body.projectTitle || "";

    // If a file was uploaded, extract text from it
    if (req.file) {
      text = await extractTextFromFile(req.file);
    }

    if (!text?.trim()) return res.status(400).json({ success: false, message: "Report text is required" });

    const aiResult = await callAI("/summarize", { text, num_sentences: numSentences, project_title: projectTitle });
    res.status(200).json({
      success: true,
      summary: aiResult.summary,
      keyTopics: aiResult.keyTopics,
      stats: aiResult.stats,
      algorithm: aiResult.algorithm,
    });
  } catch (error) {
    console.error("Summarizer Error:", error.message);
    res.status(500).json({ success: false, message: `Summarization failed: ${error.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. REPORT GRADER
// ─────────────────────────────────────────────────────────────────────────────
export const gradeReport = async (req, res) => {
  try {
    let text = req.body.text || "";
    const projectId = req.body.projectId;

    // If a file was uploaded, extract text from it
    if (req.file) {
      text = await extractTextFromFile(req.file);
    }

    if (!text || text.trim().length < 100) {
      return res.status(400).json({ success: false, message: "Report text is required (minimum 100 characters)." });
    }

    let projectTitle = "", studentName = "";
    if (projectId) {
      const project = await Project.findById(projectId).populate("student", "name").lean();
      if (project) { projectTitle = project.title || ""; studentName = project.student?.name || ""; }
    }

    const aiResult = await callAI("/smart-grade", { text: text.trim(), project_title: projectTitle, student_name: studentName });
    res.status(200).json({ success: true, ...aiResult });
  } catch (error) {
    console.error("Report Grader Error:", error.message);
    res.status(500).json({ success: false, message: `Grading failed: ${error.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. VIVA QUESTION GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
export const generateVivaQuestions = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { reportText } = req.body;
    const project = await Project.findById(projectId)
      .populate("student", "name")
      .populate("supervisor", "name");
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const aiResult = await callAI("/viva-questions", {
      title: project.title,
      description: project.description,
      report_text: reportText || "",
      status: project.status,
    });

    res.status(200).json({
      success: true,
      projectTitle: project.title,
      questions: aiResult.questions,
      categories: aiResult.categories,
      tips: aiResult.tips,
    });
  } catch (error) {
    console.error("Viva Generator Error:", error.message);
    res.status(500).json({ success: false, message: `Viva generation failed: ${error.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. MILESTONE RISK PREDICTOR  
// ─────────────────────────────────────────────────────────────────────────────
export const analyzeMilestoneRisk = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId)
      .populate("student", "name email")
      .populate("supervisor", "name email");
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const userId = req.user._id.toString();
    const isSupervisor = project.supervisor && project.supervisor._id.toString() === userId;
    const isAdmin      = req.user.role === "Admin";
    if (!isSupervisor && !isAdmin)
      return res.status(403).json({ success: false, message: "Access denied" });

    const milestones = await Milestone.find({ project: projectId })
      .sort({ weekNumber: 1 })
      .populate("submittedBy", "name")
      .populate("signedOffBy", "name")
      .lean();

    const now = new Date();
    const stats = {
      total:      milestones.length,
      approved:   milestones.filter(m => m.status === "approved").length,
      submitted:  milestones.filter(m => m.status === "submitted").length,
      rejected:   milestones.filter(m => m.status === "rejected").length,
      active:     milestones.filter(m => m.status === "active").length,
      upcoming:   milestones.filter(m => m.status === "upcoming").length,
      overdue:    milestones.filter(m =>
        (m.status === "active" || m.status === "rejected") &&
        m.weekEndDate && new Date(m.weekEndDate) < now
      ).length,
    };
    stats.completionRate = stats.total > 0
      ? Math.round((stats.approved / stats.total) * 100) : 0;

    // Count milestones that have log entries (students actually worked)
    stats.withLogs = milestones.filter(m => m.logEntries && m.logEntries.length > 0).length;

    const aiResult = await callAI("/milestone-risk", {
      total:           stats.total,
      approved:        stats.approved,
      submitted:       stats.submitted,
      rejected:        stats.rejected,
      overdue:         stats.overdue,
      active:          stats.active,
      upcoming:        stats.upcoming,
      completionRate:  stats.completionRate,
      withLogs:        stats.withLogs,
      projectStatus:   project.status,
    });

    res.status(200).json({
      success: true,
      projectTitle: project.title,
      studentName:  project.student?.name,
      stats,
      milestones: milestones.map(m => ({
        weekNumber:   m.weekNumber,
        title:        m.title,
        status:       m.status,
        weekStartDate:m.weekStartDate,
        weekEndDate:  m.weekEndDate,
        logCount:     m.logEntries?.length || 0,
        isOverdue:    (m.status === "active" || m.status === "rejected") &&
                      m.weekEndDate && new Date(m.weekEndDate) < now,
      })),
      riskScore:      aiResult.riskScore,
      riskLevel:      aiResult.riskLevel,
      prediction:     aiResult.prediction,
      description:    aiResult.description,
      actionRequired: aiResult.actionRequired,
      factors:        aiResult.factors,
    });
  } catch (error) {
    console.error("Milestone Risk Error:", error.message);
    res.status(500).json({ success: false, message: `Milestone risk analysis failed: ${error.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. EVALUATION SCORE PREDICTOR  
// ─────────────────────────────────────────────────────────────────────────────
export const predictEvaluationScore = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId)
      .populate("student", "name email")
      .populate("supervisor", "name email");
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const userId = req.user._id.toString();
    const isSupervisor = project.supervisor && project.supervisor._id.toString() === userId;
    const isAdmin      = req.user.role === "Admin";
    if (!isSupervisor && !isAdmin)
      return res.status(403).json({ success: false, message: "Access denied" });

    const milestones = await Milestone.find({ project: projectId });
    const now = new Date();
    const milestoneStats = {
      total:           milestones.length,
      approved:        milestones.filter(m => m.status === "approved").length,
      overdue:         milestones.filter(m =>
        (m.status === "active" || m.status === "rejected") &&
        m.weekEndDate && new Date(m.weekEndDate) < now
      ).length,
      completionRate:  milestones.length > 0
        ? Math.round((milestones.filter(m => m.status === "approved").length / milestones.length) * 100) : 0,
      withLogs:        milestones.filter(m => m.logEntries?.length > 0).length,
    };

    // Existing evaluation if any
    const existingEval = await Evaluation.findOne({ project: projectId }).lean();

    const aiResult = await callAI("/predict-evaluation", {
      projectStatus:    project.status,
      filesCount:       project.files.length,
      feedbackCount:    project.feedback.length,
      milestoneStats,
      existingScores:   existingEval ? existingEval.scores : null,
      existingTotal:    existingEval ? existingEval.totalScore : null,
      isFinalized:      existingEval ? existingEval.isFinalized : false,
    });

    res.status(200).json({
      success: true,
      projectTitle:  project.title,
      studentName:   project.student?.name,
      milestoneStats,
      existingEvaluation: existingEval ? {
        scores:      existingEval.scores,
        totalScore:  existingEval.totalScore,
        grade:       existingEval.grade,
        isFinalized: existingEval.isFinalized,
        remarks:     existingEval.remarks,
      } : null,
      prediction: aiResult.prediction,
    });
  } catch (error) {
    console.error("Eval Predictor Error:", error.message);
    res.status(500).json({ success: false, message: `Evaluation prediction failed: ${error.message}` });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. AUTO-GENERATE EVALUATION REPORT  ← NEW
// ─────────────────────────────────────────────────────────────────────────────
export const generateEvaluationReport = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId)
      .populate("student", "name email")
      .populate("supervisor", "name email");
    if (!project) return res.status(404).json({ success: false, message: "Project not found" });

    const userId = req.user._id.toString();
    const isSupervisor = project.supervisor && project.supervisor._id.toString() === userId;
    const isAdmin      = req.user.role === "Admin";
    if (!isSupervisor && !isAdmin)
      return res.status(403).json({ success: false, message: "Access denied" });

    const milestones  = await Milestone.find({ project: projectId }).sort({ weekNumber: 1 }).lean();
    const evaluation  = await Evaluation.findOne({ project: projectId }).lean();
    const now = new Date();

    const milestoneStats = {
      total:           milestones.length,
      approved:        milestones.filter(m => m.status === "approved").length,
      submitted:       milestones.filter(m => m.status === "submitted").length,
      rejected:        milestones.filter(m => m.status === "rejected").length,
      overdue:         milestones.filter(m =>
        (m.status === "active" || m.status === "rejected") &&
        m.weekEndDate && new Date(m.weekEndDate) < now
      ).length,
      completionRate:  milestones.length > 0
        ? Math.round((milestones.filter(m => m.status === "approved").length / milestones.length) * 100) : 0,
      totalHoursLogged: milestones.reduce((sum, m) =>
        sum + (m.logEntries || []).reduce((s, e) => s + (e.hoursSpent || 0), 0), 0
      ),
    };

    const aiResult = await callAI("/generate-eval-report", {
      projectTitle:    project.title,
      projectStatus:   project.status,
      studentName:     project.student?.name || "Student",
      supervisorName:  project.supervisor?.name || "Supervisor",
      filesCount:      project.files.length,
      feedbackCount:   project.feedback.length,
      milestoneStats,
      evaluation: evaluation ? {
        scores:      evaluation.scores,
        totalScore:  evaluation.totalScore,
        grade:       evaluation.grade,
        remarks:     evaluation.remarks,
        isFinalized: evaluation.isFinalized,
      } : null,
      milestones: milestones.map(m => ({
        weekNumber:  m.weekNumber,
        title:       m.title,
        status:      m.status,
        logCount:    m.logEntries?.length || 0,
        hoursLogged: (m.logEntries || []).reduce((s, e) => s + (e.hoursSpent || 0), 0),
      })),
    });

    res.status(200).json({
      success: true,
      projectTitle:   project.title,
      studentName:    project.student?.name,
      supervisorName: project.supervisor?.name,
      milestoneStats,
      evaluation: evaluation ? {
        scores:      evaluation.scores,
        totalScore:  evaluation.totalScore,
        grade:       evaluation.grade,
        isFinalized: evaluation.isFinalized,
      } : null,
      report: aiResult.report,
    });
  } catch (error) {
    console.error("Eval Report Error:", error.message);
    res.status(500).json({ success: false, message: `Report generation failed: ${error.message}` });
  }
};
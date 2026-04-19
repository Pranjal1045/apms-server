import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { Evaluation } from "../models/evaluation.js";
import { Project } from "../models/project.js";
import * as notificationServices from "../services/notificationServices.js";

function computeGrade(t) {
  if (t >= 90) return "A+";
  if (t >= 80) return "A";
  if (t >= 70) return "B+";
  if (t >= 60) return "B";
  if (t >= 50) return "C+";
  if (t >= 40) return "C";
  if (t >= 33) return "D";
  return "F";
}

// Teacher: create or update evaluation (supports per-member scoring for groups)
export const upsertEvaluation = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;
  const { scores, memberEvaluations, remarks, isFinalized } = req.body;

  const project = await Project.findById(projectId)
    .populate("members", "_id name")
    .populate("student", "_id name");

  if (!project) return next(new ErrorHandler("Project not found", 404));
  if (project.supervisor?.toString() !== req.user._id.toString() && req.user.role !== "Admin")
    return next(new ErrorHandler("Not authorized", 403));

  // Compute overall scores
  const computedScores = {
    proposalQuality:   Math.min(25, Math.max(0, scores?.proposalQuality  || 0)),
    progressAndEffort: Math.min(25, Math.max(0, scores?.progressAndEffort|| 0)),
    reportQuality:     Math.min(25, Math.max(0, scores?.reportQuality    || 0)),
    technicalSkill:    Math.min(25, Math.max(0, scores?.technicalSkill   || 0)),
  };
  const totalScore = Object.values(computedScores).reduce((a, b) => a + b, 0);
  const grade = computeGrade(totalScore);

  // Process per-member evaluations if provided
  let processedMemberEvals = [];
  if (memberEvaluations && memberEvaluations.length > 0) {
    processedMemberEvals = memberEvaluations.map(me => {
      const ms = {
        proposalQuality:   Math.min(25, Math.max(0, me.scores?.proposalQuality  || 0)),
        progressAndEffort: Math.min(25, Math.max(0, me.scores?.progressAndEffort|| 0)),
        reportQuality:     Math.min(25, Math.max(0, me.scores?.reportQuality    || 0)),
        technicalSkill:    Math.min(25, Math.max(0, me.scores?.technicalSkill   || 0)),
      };
      const mt = Object.values(ms).reduce((a, b) => a + b, 0);
      return {
        student: me.student,
        scores: ms,
        totalScore: mt,
        grade: computeGrade(mt),
        remarks: me.remarks || "",
      };
    });
  }

  // Use findOne + save to ensure pre("save") hooks run
  let evaluation = await Evaluation.findOne({ project: projectId });

  if (evaluation) {
    evaluation.supervisor = req.user._id;
    evaluation.student = project.student._id || project.student;
    evaluation.scores = computedScores;
    evaluation.totalScore = totalScore;
    evaluation.grade = grade;
    evaluation.remarks = remarks || evaluation.remarks || "";
    evaluation.isFinalized = isFinalized !== undefined ? isFinalized : evaluation.isFinalized;
    if (processedMemberEvals.length > 0) evaluation.memberEvaluations = processedMemberEvals;
  } else {
    evaluation = new Evaluation({
      project: projectId,
      supervisor: req.user._id,
      student: project.student._id || project.student,
      scores: computedScores,
      totalScore,
      grade,
      remarks: remarks || "",
      isFinalized: isFinalized || false,
      memberEvaluations: processedMemberEvals,
    });
  }

  await evaluation.save();

  if (isFinalized) {
    // Get all members to notify
    const allMemberIds = [
      ...(project.members || []).map(m => m._id?.toString() || m.toString()),
      project.student?._id?.toString() || project.student?.toString()
    ].filter(Boolean);
    const uniqueIds = [...new Set(allMemberIds)];

    for (const uid of uniqueIds) {
      // Find this member's individual score if available
      const memberEval = evaluation.memberEvaluations?.find(
        me => me.student?.toString() === uid
      );
      const scoreToShow = memberEval
        ? `${memberEval.totalScore}/100 (${memberEval.grade})`
        : `${evaluation.totalScore}/100 (${evaluation.grade})`;

      await notificationServices.notifyUser(uid,
        `Your project evaluation is finalized. Score: ${scoreToShow}`,
        "approval", "/student/evaluation", "high"
      );
    }
  }

  res.status(200).json({ success: true, data: { evaluation } });
});

// Get evaluation for a project (students see their own member eval if it exists)
export const getEvaluation = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;
  const evaluation = await Evaluation.findOne({ project: projectId })
    .populate("supervisor", "name email")
    .populate("student", "name email")
    .populate("memberEvaluations.student", "name email");

  if (!evaluation) return res.status(200).json({ success: true, data: { evaluation: null } });
  res.status(200).json({ success: true, data: { evaluation } });
});

// Admin: get all evaluations — populated with all scores
export const getAllEvaluations = asyncHandler(async (req, res, next) => {
  const evaluations = await Evaluation.find({ isFinalized: true })
    .populate("project", "title isGroupProject")
    .populate("supervisor", "name")
    .populate("student", "name email department")
    .populate("memberEvaluations.student", "name email department")
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, data: { evaluations, total: evaluations.length } });
});

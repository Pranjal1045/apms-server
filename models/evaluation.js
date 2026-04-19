import mongoose from "mongoose";

const memberEvaluationSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  scores: {
    proposalQuality:    { type: Number, min: 0, max: 25, default: 0 },
    progressAndEffort:  { type: Number, min: 0, max: 25, default: 0 },
    reportQuality:      { type: Number, min: 0, max: 25, default: 0 },
    technicalSkill:     { type: Number, min: 0, max: 25, default: 0 },
  },
  totalScore: { type: Number, default: 0 },
  grade: { type: String, enum: ["A+", "A", "B+", "B", "C+", "C", "D", "F", ""], default: "" },
  remarks: { type: String, default: "", maxLength: 1000 },
}, { _id: true });

const evaluationSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Project",
    required: true,
    unique: true,
  },
  supervisor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Primary student (group leader or solo student) — kept for backward compatibility
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Per-member evaluations (for group projects)
  memberEvaluations: [memberEvaluationSchema],
  // Overall project scores (applies to all or as fallback)
  scores: {
    proposalQuality:    { type: Number, min: 0, max: 25, default: 0 },
    progressAndEffort:  { type: Number, min: 0, max: 25, default: 0 },
    reportQuality:      { type: Number, min: 0, max: 25, default: 0 },
    technicalSkill:     { type: Number, min: 0, max: 25, default: 0 },
  },
  totalScore: { type: Number, default: 0 },
  grade: {
    type: String,
    enum: ["A+", "A", "B+", "B", "C+", "C", "D", "F", ""],
    default: "",
  },
  remarks: { type: String, default: "", maxLength: 1000 },
  isFinalized: { type: Boolean, default: false },
}, { timestamps: true });

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

evaluationSchema.pre("save", function () {
  const s = this.scores;
  this.totalScore = (s.proposalQuality || 0) + (s.progressAndEffort || 0) +
                    (s.reportQuality || 0) + (s.technicalSkill || 0);
  this.grade = computeGrade(this.totalScore);

  // Also compute totalScore and grade for each member evaluation
  if (this.memberEvaluations && this.memberEvaluations.length > 0) {
    this.memberEvaluations.forEach(me => {
      const ms = me.scores;
      me.totalScore = (ms.proposalQuality || 0) + (ms.progressAndEffort || 0) +
                      (ms.reportQuality || 0) + (ms.technicalSkill || 0);
      me.grade = computeGrade(me.totalScore);
    });
  }
});

// Also handle findOneAndUpdate by using a post hook to recompute scores
evaluationSchema.pre("findOneAndUpdate", async function () {
  const update = this.getUpdate();
  if (update?.$set?.scores) {
    const s = update.$set.scores;
    const total = (s.proposalQuality || 0) + (s.progressAndEffort || 0) +
                  (s.reportQuality || 0) + (s.technicalSkill || 0);
    update.$set.totalScore = total;
    update.$set.grade = computeGrade(total);
  }
  // Recompute member evaluation totals
  if (update?.$set?.memberEvaluations) {
    update.$set.memberEvaluations = update.$set.memberEvaluations.map(me => {
      const ms = me.scores || {};
      const t = (ms.proposalQuality || 0) + (ms.progressAndEffort || 0) +
                (ms.reportQuality || 0) + (ms.technicalSkill || 0);
      return { ...me, totalScore: t, grade: computeGrade(t) };
    });
  }
});

evaluationSchema.index({ project: 1 });
evaluationSchema.index({ supervisor: 1 });
evaluationSchema.index({ "memberEvaluations.student": 1 });

export const Evaluation = mongoose.models.Evaluation || mongoose.model("Evaluation", evaluationSchema);

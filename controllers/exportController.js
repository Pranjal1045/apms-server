import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { Project } from "../models/project.js";
import { Milestone } from "../models/milestone.js";
import { Evaluation } from "../models/evaluation.js";
import PDFDocument from "pdfkit";

export const exportProjectPDF = asyncHandler(async (req, res, next) => {
  const { projectId } = req.params;
  const project = await Project.findById(projectId)
    .populate("student", "name email department rollNumber")
    .populate("supervisor", "name email department")
    .populate("members", "name email rollNumber");
  if (!project) return next(new ErrorHandler("Project not found", 404));

  const milestones = await Milestone.find({ project: projectId }).sort({ order: 1 });
  const evaluation = await Evaluation.findOne({ project: projectId });

  const doc = new PDFDocument({ margin: 50, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=project-${projectId}.pdf`);
  doc.pipe(res);

  // Header bar
  doc.rect(0, 0, doc.page.width, 80).fill("#0d0f14");
  doc.fill("#00d4ff").font("Helvetica-Bold").fontSize(22).text("FYP System", 50, 20);
  doc.fill("#8b94a8").font("Helvetica").fontSize(11).text("Final Year Project Management Platform", 50, 46);
  doc.fill("#ffffff").font("Helvetica-Bold").fontSize(10).text("PROJECT REPORT", doc.page.width - 160, 32);
  doc.moveDown(3);

  const titleY = 100;
  doc.fill("#0d0f14").rect(50, titleY, doc.page.width - 100, 60).fill();
  doc.fill("#ffffff").font("Helvetica-Bold").fontSize(16).text(project.title, 60, titleY + 10, { width: doc.page.width - 120 });
  doc.fill("#00d4ff").font("Helvetica").fontSize(10).text(`Status: ${project.status.toUpperCase()}   |   Submitted: ${new Date(project.createdAt).toLocaleDateString()}`, 60, titleY + 38);
  doc.y = titleY + 75;

  const section = (label) => {
    doc.moveDown(0.5);
    doc.rect(50, doc.y, doc.page.width - 100, 22).fill("#1e2230");
    doc.fill("#00d4ff").font("Helvetica-Bold").fontSize(11).text(label, 58, doc.y - 17);
    doc.moveDown(0.6);
    doc.fill("#333333");
  };

  const row = (key, value) => {
    doc.fill("#555555").font("Helvetica-Bold").fontSize(9).text(key + ":", 55, doc.y, { continued: true, width: 130 });
    doc.fill("#222222").font("Helvetica").text(" " + (value || "—"), { width: doc.page.width - 190 });
    doc.moveDown(0.2);
  };

  // Project Info
  section("PROJECT INFORMATION");
  row("Title", project.title);
  row("Description", project.description?.slice(0, 200) + (project.description?.length > 200 ? "..." : ""));
  row("Status", project.status);
  row("Type", project.isGroupProject ? "Group Project" : "Individual Project");
  row("Deadline", project.deadline ? new Date(project.deadline).toLocaleDateString() : "Not set");

  // Student Info
  section("STUDENT DETAILS");
  if (project.isGroupProject && project.members?.length) {
    project.members.forEach((m, i) => {
      row(`Member ${i + 1}`, `${m.name} (${m.email})${m.rollNumber ? " — " + m.rollNumber : ""}`);
    });
  } else {
    row("Name", project.student?.name);
    row("Email", project.student?.email);
    row("Department", project.student?.department || "—");
    row("Roll No.", project.student?.rollNumber || "—");
  }

  // Supervisor Info
  section("SUPERVISOR DETAILS");
  row("Name", project.supervisor?.name || "Not assigned");
  row("Email", project.supervisor?.email || "—");
  row("Department", project.supervisor?.department || "—");

  // Milestones
  if (milestones.length) {
    section("MILESTONES");
    milestones.forEach((m, i) => {
      const statusColors = { completed: "✓", overdue: "✗", "in-progress": "⟳", pending: "○" };
      row(`${i + 1}. ${m.title}`, `${statusColors[m.status] || "○"} ${m.status.toUpperCase()} — Due: ${new Date(m.dueDate).toLocaleDateString()}`);
    });
  }

  // Evaluation
  if (evaluation) {
    section("EVALUATION / GRADING");
    row("Proposal Quality", `${evaluation.scores.proposalQuality}/25`);
    row("Progress & Effort", `${evaluation.scores.progressAndEffort}/25`);
    row("Report Quality", `${evaluation.scores.reportQuality}/25`);
    row("Technical Skill", `${evaluation.scores.technicalSkill}/25`);
    doc.fill("#0d0f14").rect(50, doc.y + 4, doc.page.width - 100, 30).fill();
    doc.fill("#00d4ff").font("Helvetica-Bold").fontSize(13)
      .text(`TOTAL: ${evaluation.totalScore}/100   GRADE: ${evaluation.grade}   (${evaluation.isFinalized ? "FINALIZED" : "Draft"})`, 58, doc.y + 10);
    doc.moveDown(2.5);
    if (evaluation.remarks) row("Remarks", evaluation.remarks);
  }

  // Files
  if (project.files?.length) {
    section("UPLOADED FILES");
    project.files.forEach((f, i) => {
      row(`File ${i + 1}`, `${f.originalName} — ${new Date(f.uploadedAt).toLocaleDateString()}`);
    });
  }

  // Footer
  doc.moveDown(2);
  doc.rect(50, doc.y, doc.page.width - 100, 1).fill("#cccccc");
  doc.moveDown(0.5);
  doc.fill("#888888").font("Helvetica").fontSize(8)
    .text(`Generated by FYP System on ${new Date().toLocaleString()}   |   Confidential Academic Document`, 50, doc.y, { align: "center", width: doc.page.width - 100 });

  doc.end();
});

// Export all projects as PDF (admin only)
export const exportAllProjectsPDF = asyncHandler(async (req, res, next) => {
  const projects = await Project.find()
    .populate("student", "name email department")
    .populate("supervisor", "name")
    .sort({ createdAt: -1 });

  const evaluations = await Evaluation.find({ isFinalized: true });
  const evalMap = {};
  evaluations.forEach(e => { evalMap[e.project?.toString()] = e; });

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=all-projects-report.pdf");
  doc.pipe(res);

  // Cover
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0d0f14");
  doc.fill("#00d4ff").font("Helvetica-Bold").fontSize(32).text("FYP System", 50, 200, { align: "center" });
  doc.fill("#ffffff").font("Helvetica-Bold").fontSize(18).text("All Projects Report", 50, 250, { align: "center" });
  doc.fill("#8b94a8").font("Helvetica").fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, 50, 290, { align: "center" });
  doc.fill("#8b94a8").text(`Total Projects: ${projects.length}`, 50, 310, { align: "center" });
  doc.addPage();

  projects.forEach((p, i) => {
    if (i > 0) doc.addPage();
    const ev = evalMap[p._id?.toString()];
    doc.fill("#0d0f14").rect(50, 50, doc.page.width - 100, 50).fill();
    doc.fill("#00d4ff").font("Helvetica-Bold").fontSize(13).text(`${i + 1}. ${p.title}`, 58, 60, { width: doc.page.width - 130 });
    doc.fill("#8b94a8").font("Helvetica").fontSize(9).text(p.status.toUpperCase(), 58, 80);
    doc.y = 115;
    const row = (k, v) => {
      doc.fill("#666").font("Helvetica-Bold").fontSize(9).text(k + ": ", 55, doc.y, { continued: true, width: 130 });
      doc.fill("#222").font("Helvetica").text(v || "—", { width: doc.page.width - 190 });
      doc.moveDown(0.2);
    };
    row("Student", p.student?.name || "—");
    row("Supervisor", p.supervisor?.name || "Not assigned");
    row("Department", p.student?.department || "—");
    row("Deadline", p.deadline ? new Date(p.deadline).toLocaleDateString() : "Not set");
    row("Files", String(p.files?.length || 0));
    if (ev) {
      row("Grade", `${ev.grade} (${ev.totalScore}/100)`);
    }
  });

  doc.end();
});

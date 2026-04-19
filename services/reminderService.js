import cron from "node-cron";
import { Milestone } from "../models/milestone.js";
import { Meeting } from "../models/meeting.js";
import { User } from "../models/user.js";
import { sendEmail } from "./emailService.js";

const emailTemplate = (heading, body, cta, ctaUrl) => `
<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#0d0f14;margin:0;padding:0}
  .wrap{max-width:600px;margin:40px auto;background:#13161e;border-radius:12px;overflow:hidden;border:1px solid #252a38}
  .header{background:linear-gradient(135deg,#00d4ff,#7c5cfc);padding:30px 40px}
  .header h1{color:#fff;margin:0;font-size:22px}
  .header p{color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px}
  .body{padding:32px 40px}
  .body p{color:#8b94a8;font-size:15px;line-height:1.7;margin:0 0 16px}
  .cta{display:inline-block;background:linear-gradient(135deg,#00d4ff,#7c5cfc);color:#fff!important;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;margin-top:8px}
  .footer{padding:20px 40px;border-top:1px solid #252a38;color:#5a6175;font-size:12px;text-align:center}
</style></head><body>
<div class="wrap">
  <div class="header"><h1>FYP System</h1><p>Final Year Project Management Platform</p></div>
  <div class="body">
    <p style="color:#e8ecf4;font-size:18px;font-weight:bold;margin-bottom:16px">${heading}</p>
    ${body}
    <a class="cta" href="${ctaUrl || '#'}">${cta}</a>
  </div>
  <div class="footer">This is an automated reminder from FYP System. Do not reply to this email.</div>
</div></body></html>`;

// Runs every day at 8:00 AM
export const startReminderCron = () => {
  cron.schedule("0 8 * * *", async () => {
    console.log("[CRON] Running daily reminder job...");
    await sendMilestoneReminders();
    await sendMeetingReminders();
    await markOverdueMilestones();
    console.log("[CRON] Reminder job complete.");
  });
  console.log("[CRON] Deadline reminder scheduler started (daily at 8AM).");
};

async function sendMilestoneReminders() {
  const now = new Date();
  const in7  = new Date(now); in7.setDate(in7.getDate() + 7);
  const in3  = new Date(now); in3.setDate(in3.getDate() + 3);
  const in1  = new Date(now); in1.setDate(in1.getDate() + 1);

  const upcomingMilestones = await Milestone.find({
    status: { $in: ["pending", "in-progress"] },
    dueDate: { $lte: in7, $gte: now },
  }).populate({ path: "project", populate: [{ path: "student", select: "name email" }, { path: "members", select: "name email" }] });

  for (const ms of upcomingMilestones) {
    const daysLeft = Math.ceil((new Date(ms.dueDate) - now) / 86400000);
    if (![1, 3, 7].includes(daysLeft)) continue;

    const project = ms.project;
    const recipients = project.members?.length ? project.members : [project.student];

    for (const student of recipients) {
      if (!student?.email) continue;
      try {
        const body = `
          <p>You have a milestone due in <strong style="color:#f59e0b">${daysLeft} day${daysLeft > 1 ? "s" : ""}</strong>.</p>
          <p><strong style="color:#e8ecf4">Milestone:</strong> <span style="color:#00d4ff">${ms.title}</span></p>
          <p><strong style="color:#e8ecf4">Project:</strong> ${project.title}</p>
          <p><strong style="color:#e8ecf4">Due Date:</strong> ${new Date(ms.dueDate).toDateString()}</p>
          <p>Please ensure your work is on track. Log in to update your milestone status.</p>`;

        await sendEmail({
          to: student.email,
          subject: `⏰ Milestone Due in ${daysLeft} Day${daysLeft > 1 ? "s" : ""}: ${ms.title}`,
          message: emailTemplate(`Milestone Reminder — ${daysLeft} Day${daysLeft > 1 ? "s" : ""} Left`, body, "View My Project", `${process.env.FRONTEND_URL}/student`),
        });
      } catch (e) { console.error(`[CRON] Email failed for ${student.email}:`, e.message); }
    }
  }
}

async function sendMeetingReminders() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const meetings = await Meeting.find({
    status: "accepted",
    confirmedDate: { $gte: now, $lte: in24h },
  })
    .populate("student", "name email")
    .populate("supervisor", "name email")
    .populate("project", "title");

  for (const m of meetings) {
    const body = `
      <p>You have a scheduled meeting in approximately <strong style="color:#00d4ff">24 hours</strong>.</p>
      <p><strong style="color:#e8ecf4">Meeting:</strong> ${m.title}</p>
      <p><strong style="color:#e8ecf4">Date:</strong> ${new Date(m.confirmedDate).toLocaleString()}</p>
      <p><strong style="color:#e8ecf4">Location:</strong> ${m.location}</p>
      ${m.meetingLink ? `<p><strong style="color:#e8ecf4">Link:</strong> <a href="${m.meetingLink}" style="color:#00d4ff">${m.meetingLink}</a></p>` : ""}`;

    for (const person of [m.student, m.supervisor]) {
      if (!person?.email) continue;
      try {
        await sendEmail({
          to: person.email,
          subject: `📅 Meeting Reminder: ${m.title}`,
          message: emailTemplate("Meeting Reminder — Tomorrow", body, "Open FYP System", process.env.FRONTEND_URL),
        });
      } catch (e) { console.error(`[CRON] Meeting email failed:`, e.message); }
    }
  }
}

async function markOverdueMilestones() {
  const result = await Milestone.updateMany(
    { status: { $in: ["pending", "in-progress"] }, dueDate: { $lt: new Date() } },
    { status: "overdue" }
  );
  if (result.modifiedCount > 0) console.log(`[CRON] Marked ${result.modifiedCount} milestones as overdue.`);
}

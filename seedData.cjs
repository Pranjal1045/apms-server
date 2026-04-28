/**
 * ============================================================
 *  SEED SCRIPT — Academic Project Management System
 *  RTU Kota — B.Tech CS Final Year Projects
 * ============================================================
 *  HOW TO RUN:
 *  1. Place this file inside your  server/  folder
 *  2. Open terminal INSIDE the server/ folder
 *  3. Run:   node seedData.js
 *  4. Wait for "ALL DONE!" message
 *  5. Delete this file after running
 * ============================================================
 */

const mongoose = require("mongoose");
const bcrypt   = require("bcrypt");
const crypto   = require("crypto");
const path     = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/fyp_management_system";
console.log("Connecting to:", MONGO_URI);

// ─── Schemas ──────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:             { type: String },
  email:            { type: String, unique: true },
  password:         { type: String },
  role:             { type: String, default: "Student" },
  department:       { type: String, default: "CSE" },
  experties:        { type: [String], default: [] },
  maxStudents:      { type: Number, default: 10 },
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  supervisor:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  project:          { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
  group:            { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
  rollNumber:       { type: String, default: null },
}, { timestamps: true });

const groupSchema = new mongoose.Schema({
  name:        { type: String },
  groupLeader: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  project:     { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
  supervisor:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  inviteCode:  { type: String, unique: true, sparse: true },
  maxMembers:  { type: Number, default: 6 },
  status:      { type: String, default: "active" },
}, { timestamps: true });

const projectSchema = new mongoose.Schema({
  student:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  group:          { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
  members:        [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  isGroupProject: { type: Boolean, default: true },
  supervisor:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  title:          { type: String },
  description:    { type: String },
  status:         { type: String, default: "approved" },
  files:          { type: Array, default: [] },
  feedback:       { type: Array, default: [] },
  progress:       { type: Number, default: 0 },
}, { timestamps: true });

const User    = mongoose.model("User",    userSchema);
const Group   = mongoose.model("Group",   groupSchema);
const Project = mongoose.model("Project", projectSchema);

// ─── Helpers ──────────────────────────────────────────────────
function makeInviteCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function getFirstName(fullName) {
  return fullName.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── DATA ─────────────────────────────────────────────────────
const TEACHERS = [
  { name: "Dr. Harish Sharma",     experties: ["Cloud Computing", "AI"] },
  { name: "Mr. Chotu Lal",         experties: ["Cloud Computing"] },
  { name: "Mr. Yogesh Sharma",     experties: ["Machine Learning"] },
  { name: "Dr. Ved Mitra",         experties: ["AI", "IoT", "Security"] },
  { name: "Ms. Richa Tiwari",      experties: ["AI", "Behavioral Analysis"] },
  { name: "Dr. Nirmala Sharma",    experties: ["AI", "Healthcare"] },
  { name: "Mrs. Mithilesh Sharma", experties: ["Healthcare", "AI"] },
  { name: "Dr. Gowri Choudhary",   experties: ["Computer Vision", "Blockchain"] },
  { name: "Mr. Vishal Lodhwal",    experties: ["Security", "Voting Systems"] },
  { name: "Ms. Sarita Naruka",     experties: ["AI", "Operating Systems"] },
  { name: "Mr. Dhirendra Singh",   experties: ["IoT", "Cybersecurity"] },
  { name: "Ms. Priti Sharma",      experties: ["Recommendation Systems"] },
  { name: "Mr. R. S. Sharma",      experties: ["Data Analytics"] },
  { name: "Mr. Ankush Sharma",     experties: ["Deep Learning"] },
  { name: "Mr. Amit Shringi",      experties: ["AI", "Fake News Detection"] },
  { name: "Mr. Prashant Singh",    experties: ["Multimodal AI", "RAG"] },
  { name: "Ms. Amrata Pupneja",    experties: ["AI", "Finance"] },
  { name: "Mr. Dinesh Soni",       experties: ["Machine Learning", "Nutrition"] },
  { name: "Dr. R. K. Banyal",      experties: ["Cloud", "Machine Learning"] },
  { name: "Ms. Kritika Sharma",    experties: ["Data Security", "Encryption"] },
  { name: "Mr. Vishal Namdev",     experties: ["Distributed Systems"] },
  { name: "Mr. Manoj Nagar",       experties: ["AI", "Project Management"] },
  { name: "Ms. Ritu Tiwari",       experties: ["AI", "Deep Learning"] },
];

const GROUPS = [
  { groupNo: 1,  projectTitle: "An Efficient Optimization Approach for Task Scheduling in Cloud Computing", students: ["Bhairavi Chauhan", "Maninder Kaur"], supervisors: ["Dr. Harish Sharma", "Mr. Chotu Lal"] },
  { groupNo: 2,  projectTitle: "CerebrAI: An Intelligent Machine Learning-Based System for Early Mental Health Screening and Risk Assessment", students: ["Krish Khandelwal", "Mayank Yadav", "Manish Gupta", "Harshul Sagar"], supervisors: ["Dr. Harish Sharma", "Mr. Yogesh Sharma"] },
  { groupNo: 3,  projectTitle: "AI-Based Mock Interview Platform with Behavioral and Emotional Analysis", students: ["Shreeyansh Agrawal", "Sahil Khudaniya", "Diya Singh", "Parth Soni"], supervisors: ["Dr. Ved Mitra", "Ms. Richa Tiwari"] },
  { groupNo: 4,  projectTitle: "HealthBotX - An AI-Powered Healthcare Assistant", students: ["Siya Copra", "Poonam Sharma", "Shweta Sharma", "Soniya Sharma"], supervisors: ["Dr. Nirmala Sharma", "Mrs. Mithilesh Sharma"] },
  { groupNo: 5,  projectTitle: "IoT-Based Smart Home Automation System", students: ["Gunadya Ratawal", "Akshat Krishan", "Jatin Manhoriya", "Lakshya Bhati"], supervisors: ["Dr. Ved Mitra"] },
  { groupNo: 6,  projectTitle: "Gesture Calculator using Computer Vision and AI", students: ["Adhikar Choudhary", "Dhruv Khandelwal", "Deepak Agrawal", "Ankit Jhajhariya"], supervisors: ["Dr. Nirmala Sharma", "Dr. Gowri Choudhary"] },
  { groupNo: 7,  projectTitle: "AID ALERT - Intelligent Disaster Management System", students: ["Mridul Sharma", "Jitesh Kumawat", "Nikhil Verma", "Chitransh Porwal"], supervisors: ["Dr. Nirmala Sharma", "Mrs. Mithilesh Sharma"] },
  { groupNo: 8,  projectTitle: "Design and Implementation of IoT-Based Smart Dustbin", students: ["Amandeep Barwar", "Pradeep Benda", "Ankit Gurjar", "Rahul Saini"], supervisors: ["Dr. Ved Mitra", "Mr. Dhirendra Singh"] },
  { groupNo: 9,  projectTitle: "AI Prompt Optimization Tool using Small Language Model and Novel Optimization Frameworks", students: ["Abhay Malav", "Vikas Gangwal", "Rajas Khandal"], supervisors: ["Mr. Vishal Lodhwal"] },
  { groupNo: 10, projectTitle: "Design and Implementation of an AI Operating System (AI-OS) for Autonomous Task Execution", students: ["Yamini Hada", "Harshita Narban", "Yogesh Gujjar"], supervisors: ["Ms. Sarita Naruka"] },
  { groupNo: 11, projectTitle: "IoT Based - Two Station Wireless Car Charging System", students: ["Raghuveer Swami", "Ankit Swami"], supervisors: ["Dr. Ved Mitra"] },
  { groupNo: 12, projectTitle: "Secure Digital Voting System for Modern Democracies", students: ["Abhishek Suman", "Abhishek Jain", "Aryan Kumar Raj", "Brijesh Suman"], supervisors: ["Mr. Vishal Lodhwal"] },
  { groupNo: 13, projectTitle: "IoT-Based Security System for Mine Workers", students: ["Vikash Kumar Kumawat", "Ankit Kumar Mishra", "Hemant Kumar", "Mahendra Singh"], supervisors: ["Dr. Ved Mitra"] },
  { groupNo: 14, projectTitle: "A Unified Universal Recommendation System with User Specific Personalization", students: ["Tarun Singodia", "Tripati Sharma", "Shashaank Sharma", "Zakiya"], supervisors: ["Ms. Priti Sharma"] },
  { groupNo: 15, projectTitle: "Vendor Performance Data Analyzer", students: ["Tarun Gautam", "Vikas Kumar", "Vibhanshu Mudgal", "Virendra Kumar"], supervisors: ["Mr. R. S. Sharma", "Dr. Ved Mitra"] },
  { groupNo: 16, projectTitle: "Deep Learning-Based Ethnicity Classification: A Web Application for Refugee Wellness and Healthcare Support", students: ["Aditya Kumar Bagdi", "Ankit Kumar", "Dhruv Pratap Singh", "Harsh Singh"], supervisors: ["Mr. Ankush Sharma"] },
  { groupNo: 17, projectTitle: "Fake News and Deepfake Detector: AI-Based Browser Extension and Web Application", students: ["Kajal Yaduvanshi", "Shabana Mughal", "Altaf Maniyar", "Anurag Kumawat"], supervisors: ["Mr. Amit Shringi"] },
  { groupNo: 18, projectTitle: "Advanced Multimodal AI Assistant: Integrating RAG, Computer Vision, and Voice Synthesis", students: ["Parth Goyal", "Rohit", "Hemant Kumar", "Harshvardhan Singh"], supervisors: ["Mr. Prashant Singh"] },
  { groupNo: 19, projectTitle: "AI-Based Smart Loan System", students: ["Himani Sharma", "Diya Jangid", "Komal Agrawal", "Nishu"], supervisors: ["Ms. Amrata Pupneja"] },
  { groupNo: 20, projectTitle: "Intelligent Nutrition Support System using Machine Learning", students: ["Happy Saini", "Palak Kumari", "Khushi Jorwal", "Munish Kumar"], supervisors: ["Mr. Dinesh Soni"] },
  { groupNo: 21, projectTitle: "CyberSentinel: An Unsupervised Machine Learning-Based System for Anomaly Detection in Network Traffic", students: ["Nitesh Yadav", "Manish Singh", "Rajendra Patidar", "Ayushman Mukherjee"], supervisors: ["Mr. Dhirendra Singh"] },
  { groupNo: 22, projectTitle: "Customer Churn Prediction using Cloud-Based Data Analytics and Machine Learning", students: ["Chetan Kokcha", "Mohd. Arman Ansari", "Pankaj Kumar"], supervisors: ["Dr. R. K. Banyal"] },
  { groupNo: 23, projectTitle: "AI-Based Automated Code Review and Vulnerability Detection System", students: ["Priya Patidar", "Lavishka Tanwar", "Parv Ankodia"], supervisors: ["Dr. R. K. Banyal"] },
  { groupNo: 24, projectTitle: "AI-Based Cyber Crime Detection and Investigation System", students: ["Priyank Choudhary", "Ronak Tailor"], supervisors: ["Dr. Gowri Choudhary"] },
  { groupNo: 25, projectTitle: "Military-Grade Data Security System using AES-256 Encryption", students: ["Vikram Singh Fojdar", "Vishal Kumar"], supervisors: ["Dr. Ved Mitra", "Ms. Kritika Sharma"] },
  { groupNo: 26, projectTitle: "Detection of Fake Products using Blockchain", students: ["Anjali Jha", "Roshani Mahawar", "Manish Mahawar", "Udayveer Singh"], supervisors: ["Dr. Gowri Choudhary"] },
  { groupNo: 27, projectTitle: "Offline-First Distributed College Network System with Internet Synchronization", students: ["Amit Kumar Pancholi", "Puneet Kumar Mishra", "Ashish Meena"], supervisors: ["Mr. Vishal Namdev"] },
  { groupNo: 28, projectTitle: "ProjectHub: AI-Enabled Smart Deadline Prediction and Project Tracking System", students: ["Pranjal Porwal", "Parmita Dhara", "Simran Jain"], supervisors: ["Mr. Manoj Nagar"] },
  { groupNo: 29, projectTitle: "Hybrid Machine Learning Framework for Phishing URL Detection", students: ["Manish Kumar Saini", "Mangilal", "Himanshu Jain", "Animesh Zeminder"], supervisors: ["Mr. Yogesh Sharma"] },
  { groupNo: 30, projectTitle: "Paper2Motion - AI-Based PDF to Video Converter", students: ["Prince Khandelwal", "Prakhar Pareek", "Raunak Parashar", "Rohit Kumar Meena"], supervisors: ["Ms. Ritu Tiwari"] },
  { groupNo: 31, projectTitle: "Recipe Generation from Food Images using Deep Learning", students: ["Rahul Rathore", "Shadab Khan"], supervisors: ["Ms. Ritu Tiwari"] },
];

// ─── MAIN ─────────────────────────────────────────────────────
async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB!\n");
  } catch (err) {
    console.error("FAILED to connect:", err.message);
    console.error("Make sure MongoDB is running. Open another terminal and run: mongod");
    process.exit(1);
  }

  console.log("Clearing old data...");
  await User.deleteMany({});
  await Group.deleteMany({});
  await Project.deleteMany({});
  console.log("Done.\n");

  // 1. Admin
  const adminPass = await bcrypt.hash("Admin@1234", 10);
  await User.create({ name: "Admin RTU", email: "admin@rtu.ac.in", password: adminPass, role: "Admin", department: "CSE" });
  console.log("Admin created: admin@rtu.ac.in / Admin@1234\n");

  // 2. Teachers
  console.log("Creating teachers...");
  const teacherPass = await bcrypt.hash("Teacher@1234", 10);
  const teacherMap  = {};
  const usedEmails  = new Set(["admin@rtu.ac.in"]);

  for (const t of TEACHERS) {
    const firstName = getFirstName(t.name);
    let email = `${firstName}@rtu.ac.in`;
    let counter = 2;
    while (usedEmails.has(email)) { email = `${firstName}${counter}@rtu.ac.in`; counter++; }
    usedEmails.add(email);

    const teacher = await User.create({ name: t.name, email, password: teacherPass, role: "Teacher", department: "CSE", experties: t.experties, maxStudents: 20 });
    teacherMap[t.name] = teacher;
    console.log(`  ${t.name}  =>  ${email}  /  Teacher@1234`);
  }

  // 3. Students + Groups + Projects
  console.log("\nCreating students, groups, projects...\n");
  const studentPass = await bcrypt.hash("Student@1234", 10);

  for (const g of GROUPS) {
    const studentDocs = [];

    for (const studentName of g.students) {
      const firstName = getFirstName(studentName);
      let email = `${firstName}@rtu.ac.in`;
      let counter = 2;
      while (usedEmails.has(email)) { email = `${firstName}${counter}@rtu.ac.in`; counter++; }
      usedEmails.add(email);

      const student = await User.create({ name: studentName, email, password: studentPass, role: "Student", department: "CSE" });
      studentDocs.push(student);
      console.log(`  Student: ${studentName}  =>  ${email}  /  Student@1234`);
    }

    const primarySupervisor = teacherMap[g.supervisors[0]];
    const leader = studentDocs[0];

    const group = await Group.create({
      name: `Group ${g.groupNo}`,
      groupLeader: leader._id,
      members: studentDocs.map(s => s._id),
      supervisor: primarySupervisor ? primarySupervisor._id : null,
      inviteCode: makeInviteCode(),
      maxMembers: 6,
      status: "active",
    });

    const project = await Project.create({
      student: leader._id,
      group: group._id,
      members: studentDocs.map(s => s._id),
      isGroupProject: studentDocs.length > 1,
      supervisor: primarySupervisor ? primarySupervisor._id : null,
      title: g.projectTitle,
      description: `B.Tech Final Year Project. Dept. of CSE, Rajasthan Technical University, Kota.`,
      status: "approved",
      progress: 0,
    });

    await Group.findByIdAndUpdate(group._id, { project: project._id });

    for (const s of studentDocs) {
      await User.findByIdAndUpdate(s._id, { group: group._id, project: project._id, supervisor: primarySupervisor ? primarySupervisor._id : null });
    }

    if (primarySupervisor) {
      await User.findByIdAndUpdate(primarySupervisor._id, { $addToSet: { assignedStudents: { $each: studentDocs.map(s => s._id) } } });
    }

    console.log(`  --> Group ${g.groupNo} created: "${g.projectTitle.substring(0, 55)}..."\n`);
  }

  // 4. Summary
  const totalS = await User.countDocuments({ role: "Student" });
  const totalT = await User.countDocuments({ role: "Teacher" });
  const totalG = await Group.countDocuments();
  const totalP = await Project.countDocuments();

  console.log("==================================================");
  console.log("ALL DONE!");
  console.log("==================================================");
  console.log(`  Admin    : 1`);
  console.log(`  Teachers : ${totalT}`);
  console.log(`  Students : ${totalS}`);
  console.log(`  Groups   : ${totalG}`);
  console.log(`  Projects : ${totalP}`);
  console.log("==================================================");
  console.log("LOGIN CREDENTIALS:");
  console.log("  admin@rtu.ac.in    /  Admin@1234");
  console.log("  ved@rtu.ac.in      /  Teacher@1234  (Dr. Ved Mitra)");
  console.log("  harish@rtu.ac.in   /  Teacher@1234  (Dr. Harish Sharma)");
  console.log("  pranjal@rtu.ac.in  /  Student@1234  (Pranjal Porwal - Grp 28)");
  console.log("  krish@rtu.ac.in    /  Student@1234  (Krish Khandelwal - Grp 2)");
  console.log("==================================================");
  console.log("DELETE seedData.js after running!");
  console.log("==================================================");

  await mongoose.disconnect();
}

seed();

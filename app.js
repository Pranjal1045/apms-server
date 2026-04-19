import { config } from "dotenv";
config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middlewares/error.js";

// Routers
import authRouter         from "./router/userRoutes.js";
import adminRouter        from "./router/adminRoutes.js";
import studentRouter      from "./router/studentRoutes.js";
import teacherRouter      from "./router/teacherRoutes.js";
import notificationRouter from "./router/notificationRoutes.js";
import projectRouter      from "./router/projectRoutes.js";
import deadlineRouter     from "./router/deadlineRoutes.js";
import aiRouter           from "./router/aiRoutes.js";
import groupRouter        from "./router/groupRoutes.js";
import milestoneRouter    from "./router/milestoneRoutes.js";
import meetingRouter      from "./router/meetingRoutes.js";
import evaluationRouter   from "./router/evaluationRoutes.js";
import announcementRouter from "./router/announcementRoutes.js";
import chatRouter         from "./router/chatRoutes.js";
import exportRouter       from "./router/exportRoutes.js";

const app = express();

app.use(cors({
  origin: [process.env.FRONTEND_URL || "http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/v1/auth",         authRouter);
app.use("/api/v1/admin",        adminRouter);
app.use("/api/v1/student",      studentRouter);
app.use("/api/v1/teacher",      teacherRouter);
app.use("/api/v1/notification", notificationRouter);
app.use("/api/v1/project",      projectRouter);
app.use("/api/v1/deadline",     deadlineRouter);
app.use("/api/v1/ai",           aiRouter);
app.use("/api/v1/group",        groupRouter);
app.use("/api/v1/milestone",    milestoneRouter);
app.use("/api/v1/meeting",      meetingRouter);
app.use("/api/v1/evaluation",   evaluationRouter);
app.use("/api/v1/announcement", announcementRouter);
app.use("/api/v1/chat",         chatRouter);
app.use("/api/v1/export",       exportRouter);

// Health check
app.get("/health", (_, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use(errorMiddleware);
export default app;
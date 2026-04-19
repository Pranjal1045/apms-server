import express from "express";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddleware.js";
import {
    createGroup,
    joinGroup,
    getMyGroup,
    leaveGroup,
    removeMember,
    getAllGroups,
    regenerateInviteCode,
} from "../controllers/groupController.js";

const router = express.Router();

router.use(isAuthenticated);

router.post("/create", isAuthorized("Student"), createGroup);
router.post("/join", isAuthorized("Student"), joinGroup);
router.get("/my-group", isAuthorized("Student"), getMyGroup);
router.delete("/leave", isAuthorized("Student"), leaveGroup);
router.delete("/remove/:memberId", isAuthorized("Student"), removeMember);
router.put("/regenerate-code", isAuthorized("Student"), regenerateInviteCode);
router.get("/all", isAuthorized("Admin"), getAllGroups);

export default router;

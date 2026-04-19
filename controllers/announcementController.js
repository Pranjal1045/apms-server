import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { Announcement } from "../models/announcement.js";

// Admin: create announcement
export const createAnnouncement = asyncHandler(async (req, res, next) => {
  const { title, content, targetRole, priority, isPinned, expiresAt } = req.body;
  if (!title || !content) return next(new ErrorHandler("Title and content required", 400));

  const announcement = await Announcement.create({
    title, content, postedBy: req.user._id,
    targetRole: targetRole || "All",
    priority: priority || "normal",
    isPinned: isPinned || false,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  });
  await announcement.populate("postedBy", "name role");
  res.status(201).json({ success: true, data: { announcement } });
});

// Get announcements (filtered by role)
export const getAnnouncements = asyncHandler(async (req, res, next) => {
  const role = req.user.role;
  const now = new Date();
  const filter = {
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    targetRole: { $in: ["All", role] },
  };
  const announcements = await Announcement.find(filter)
    .populate("postedBy", "name role")
    .sort({ isPinned: -1, createdAt: -1 })
    .limit(20);
  res.status(200).json({ success: true, data: { announcements } });
});

// Admin: delete announcement
export const deleteAnnouncement = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const a = await Announcement.findByIdAndDelete(id);
  if (!a) return next(new ErrorHandler("Announcement not found", 404));
  res.status(200).json({ success: true, message: "Deleted" });
});

// Admin: update announcement
export const updateAnnouncement = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const a = await Announcement.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!a) return next(new ErrorHandler("Announcement not found", 404));
  res.status(200).json({ success: true, data: { announcement: a } });
});

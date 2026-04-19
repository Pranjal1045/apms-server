import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
        let folder = "temp";

        if(req.route.path.includes("/upload/:projectId")){
            folder = `projects/${req.params.projectId}`;
        } else if(req.route.path.includes("/upload/:userId")){
            folder = `users/${req.params.userId}`;
        }
        return {
            folder,
            resource_type: "auto",
            public_id: `${Date.now()}-${file.originalname}`,
        }
    }
})
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
        "application/x-zip-compressed",
        "application/x-rar-compressed",
        "application/x-rar",
        "application/vnd.rar",
        // REMOVED: "application/octet-stream" — too broad, bypasses filter entirely
        "image/jpeg",
        "image/png",
        "image/gif",
        "text/plain",
        "application/javascript",
        "text/css",
        "text/html",
        "application/json",
    ];

    const allowedExtensions = [
        ".pdf", ".doc", ".docx", ".ppt", ".pptx",
        ".zip", ".rar", ".jpg", ".jpeg", ".png",
        ".gif", ".txt", ".js", ".css", ".html", ".json",
    ];

    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type. Only PDF, DOC, DOCX, PPTX, ZIP, RAR, IMAGES, and code files are allowed."), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 10,
    }
});

const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ success: false, error: "File too large. Maximum size is 10MB." });
        }
        if (err.code === "LIMIT_FILE_COUNT") {
            return res.status(400).json({ success: false, error: "Too many files. Maximum 10 files allowed." });
        }
        // FIX: catch any other MulterError not handled above
        return res.status(400).json({ success: false, error: err.message });
    }
    if (err && err.message && err.message.includes("Invalid file type")) {
        return res.status(400).json({ success: false, error: err.message });
    }
    next(err);
};

export { upload, handleUploadError };

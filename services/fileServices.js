// fileServices.js
// NOTE: File storage has been migrated to Cloudinary.
// Files are accessed via their Cloudinary URLs stored in the database (file.fileUrl).
// The streamDownload function is kept for backward compatibility but is no longer used
// since downloads are handled by proxying the Cloudinary URL directly in controllers.

export const streamDownload = (fileUrl, res, originalName) => {
  // Redirect to Cloudinary URL instead of streaming from local disk
  res.redirect(fileUrl);
};
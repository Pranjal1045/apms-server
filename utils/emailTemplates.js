export function generateForgotPasswordEmailTemplate(resetPasswordUrl) {
        return `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8" />
              <title>Reset Your Password</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  background-color: #f4f6f8;
                  margin: 0;
                  padding: 0;
                }
                .container {
                  max-width: 600px;
                  margin: 40px auto;
                  background-color: #ffffff;
                  padding: 30px;
                  border-radius: 8px;
                  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }
                .button {
                  display: inline-block;
                  margin-top: 20px;
                  padding: 12px 20px;
                  background-color: #2563eb;
                  color: #ffffff !important;
                  text-decoration: none;
                  border-radius: 6px;
                  font-weight: bold;
                }
                .footer {
                  margin-top: 30px;
                  font-size: 12px;
                  color: #6b7280;
                  text-align: center;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>FYP SYSTEM -🔒Password Reset Request</h2>
      
                <p>Dear User,</p>
      
                <p>
                  We received a request to reset your password. Click the button below
                  to set a new password.
                </p>
      
                <a href="${resetPasswordUrl}" class="button">
                  Reset Password
                </a>
      
                <p style="margin-top: 20px;">
                  This link is valid for a limited time. If you did not request a
                  password reset, please ignore this email.
                </p>
      
               <p>Regards,<br />Final Year Project Management System Support Team</p>

      
                <div class="footer">
                  <p>
                    If the button doesn't work, copy and paste this link into your
                    browser:
                  </p>
                  <p>${resetPasswordUrl}</p>
                </div>
              </div>
            </body>
          </html>
        `;
      }
      
/**
 * Request Accepted Email
 */
export function generateRequestAcceptedTemplate(supervisorName) {
  return `
    <div style="font-family: Arial; padding:20px; background:#fff; border:1px solid #ddd; border-radius:8px;">
      <h2 style="color:#10b981;">✅ Supervisor Request Accepted</h2>
      <p>Your supervisor request has been accepted by <strong>${supervisorName}</strong>.</p>
      <p>You can now start working on your project and upload files.</p>
    </div>
  `;
}

/**
 * Request Rejected Email
 */
export function generateRequestRejectedTemplate(supervisorName) {
  return `
    <div style="font-family: Arial; padding:20px; background:#fff; border:1px solid #ddd; border-radius:8px;">
      <h2 style="color:#ef4444;">❌ Supervisor Request Rejected</h2>
      <p>Your supervisor request has been rejected by <strong>${supervisorName}</strong>.</p>
      <p>You can try requesting another supervisor.</p>
    </div>
  `;
}
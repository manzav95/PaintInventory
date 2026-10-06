const DEFAULT_TO = "manuelzavala@precisioncabinets.com";

function buildFeedbackEmail({ message, userName, platform }) {
  const who = String(userName || "").trim() || "Anonymous";
  const body = String(message || "").trim();
  const subject = `CURE app feedback — ${who}`;
  const text = [
    `Feedback from ${who}`,
    `When: ${new Date().toLocaleString()}`,
    platform ? `Platform: ${platform}` : null,
    "",
    body,
  ]
    .filter((line) => line != null)
    .join("\n");
  const html = text.replace(/\n/g, "<br>\n");
  const to = process.env.FEEDBACK_EMAIL || process.env.LOW_STOCK_ALERT_EMAIL || DEFAULT_TO;
  return { to, subject, text, html };
}

async function sendViaSmtp({ to, subject, text, html }) {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    throw new Error("Email is not configured on the server (nodemailer missing).");
  }

  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  const from =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "paint-inventory@localhost";

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    replyTo: undefined,
  });
  return true;
}

/**
 * Send in-app feedback as email (server-side SMTP — no mailto / SMS client).
 */
async function sendFeedbackEmail({ message, userName, platform }) {
  const body = String(message || "").trim();
  if (!body) {
    return { success: false, error: "Message is required" };
  }
  if (body.length > 5000) {
    return { success: false, error: "Message is too long (max 5000 characters)" };
  }

  const { to, subject, text, html } = buildFeedbackEmail({
    message: body,
    userName,
    platform,
  });

  try {
    const sent = await sendViaSmtp({ to, subject, text, html });
    if (sent) {
      return {
        success: true,
        message: `Sent to ${to}.`,
      };
    }
  } catch (e) {
    console.error("SMTP feedback email failed:", e.message);
    return {
      success: false,
      error: e.message || "SMTP send failed",
    };
  }

  return {
    success: false,
    error:
      "Email is not set up on the server yet. Add SMTP_HOST / SMTP_USER / SMTP_PASS (and restart), then try again.",
    needsSmtp: true,
  };
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && String(process.env.SMTP_HOST).trim());
}

module.exports = {
  sendFeedbackEmail,
  buildFeedbackEmail,
  isSmtpConfigured,
  DEFAULT_TO,
};

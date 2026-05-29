const DEFAULT_TO = "manuelzavala@precisioncabinets.com";

function buildEmailContent(items, requestedBy) {
  const list = Array.isArray(items) ? items : [];
  const subject = `Low paint stock — ${list.length} item${list.length === 1 ? "" : "s"}`;
  const lines = list.map((it) => {
    const name = it.name || "Unnamed";
    const id = it.id != null ? String(it.id) : "—";
    const qty = it.quantity ?? 0;
    const min = it.minQuantity ?? 30;
    return `• ${name} (ID ${id}): ${qty} gal on hand (min ${min} gal)`;
  });
  const text = [
    `Low stock reported by ${requestedBy || "Inventory user"}.`,
    `Date: ${new Date().toLocaleString()}`,
    "",
    ...lines,
  ].join("\n");
  const html = text.replace(/\n/g, "<br>\n");
  return { subject, text, html, to: process.env.LOW_STOCK_ALERT_EMAIL || DEFAULT_TO };
}

function buildMailtoUrl({ subject, text, to }) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
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
  });
  return true;
}

async function sendLowStockAlertEmail({ items, requestedBy }) {
  const { subject, text, html, to } = buildEmailContent(items, requestedBy);
  const mailtoUrl = buildMailtoUrl({ subject, text, to });

  try {
    const sent = await sendViaSmtp({ to, subject, text, html });
    if (sent) {
      return {
        success: true,
        message: `Email sent to ${to}.`,
      };
    }
  } catch (e) {
    console.error("SMTP low-stock alert failed:", e.message);
    return {
      success: false,
      mailtoUrl,
      error: e.message || "SMTP send failed",
    };
  }

  return {
    success: false,
    mailtoUrl,
    message: "SMTP not configured — use mailto fallback on client.",
  };
}

module.exports = { sendLowStockAlertEmail, buildEmailContent, DEFAULT_TO };

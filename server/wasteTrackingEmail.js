const DEFAULT_TO = "manuelzavala@precisioncabinets.com";

function formatMonthDayYear(dateStr) {
  const raw = String(dateStr ?? "").trim();
  if (!raw) return "—";
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let d;
  if (ymd) {
    d = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T12:00:00`);
  } else {
    d = new Date(raw);
  }
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function buildEmailContent(entry) {
  const dateLabel = formatMonthDayYear(entry.entry_date);
  const subject = `Waste tracking — ${dateLabel} — ${entry.user_name || "unknown"}`;
  const text = [
    "VOC / Waste tracking entry",
    "",
    `Date: ${dateLabel}`,
    `Name: ${entry.user_name || "—"}`,
    "",
    "Inches → Gallons (5-gal bucket @ 0.37 gal/in)",
    `Paint: ${entry.paint_inches ?? 0}" → ${entry.paint_gallons ?? 0} gal`,
    `Clear/Toner: ${entry.clear_toner_inches ?? 0}" → ${entry.clear_toner_gallons ?? 0} gal`,
    `Primer: ${entry.primer_inches ?? 0}" → ${entry.primer_gallons ?? 0} gal`,
    `Acetone: ${entry.acetone_inches ?? 0}" → ${entry.acetone_gallons ?? 0} gal`,
    "",
    `Total: ${
      Math.round(
        ((Number(entry.paint_gallons) || 0) +
          (Number(entry.clear_toner_gallons) || 0) +
          (Number(entry.primer_gallons) || 0) +
          (Number(entry.acetone_gallons) || 0)) *
          100,
      ) / 100
    } gal`,
  ].join("\n");
  const html = text.replace(/\n/g, "<br>\n");
  return {
    subject,
    text,
    html,
    to: process.env.WASTE_TRACKING_EMAIL || DEFAULT_TO,
  };
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

  await transporter.sendMail({ from, to, subject, text, html });
  return true;
}

async function sendWasteTrackingEmail(entry) {
  const { subject, text, html, to } = buildEmailContent(entry);
  const mailtoUrl = buildMailtoUrl({ subject, text, to });

  try {
    const sent = await sendViaSmtp({ to, subject, text, html });
    if (sent) {
      return { success: true, message: `Email sent to ${to}.` };
    }
  } catch (e) {
    console.error("SMTP waste tracking email failed:", e.message);
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

module.exports = { sendWasteTrackingEmail, buildEmailContent, DEFAULT_TO };

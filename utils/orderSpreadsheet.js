import { Platform, Linking } from "react-native";
import * as XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import * as MailComposer from "expo-mail-composer";
import { MIXING_TYPES, getItemApMixingFlags } from "./poItemLabels";

/** Explicit REX from item details, else Paint ID + external code (no separator). */
function getResolvedRexForExport(item) {
  const manual =
    item?.rex != null && String(item.rex).trim() !== ""
      ? String(item.rex).trim()
      : "";
  if (manual) return manual;
  return `${String(item?.id ?? "")}${String(item?.external_code ?? "").trim()}`;
}

function getItemUom(item) {
  const t = (item.type || "").toLowerCase();
  if (
    MIXING_TYPES.includes(t) ||
    ["clear", "primer", "catalyst"].includes(t)
  ) {
    return "gal";
  }
  return "ea";
}

function escapeCell(s) {
  return String(s ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ");
}

export function buildOrderSheetAoa(lines) {
  const header = [
    "Item name",
    "REX",
    "UOM",
    "Price",
    "Qty",
    "Line total",
    "Job Number",
  ];
  const aoa = [header];
  let grand = 0;
  for (const { item, quantity, job_name } of lines) {
    const price =
      item.price != null && !isNaN(Number(item.price))
        ? Number(item.price)
        : null;
    const lineTotal =
      price != null ? Math.round(price * quantity * 100) / 100 : null;
    if (lineTotal != null) grand += lineTotal;
    aoa.push([
      escapeCell(item.name || item.id),
      escapeCell(getResolvedRexForExport(item)),
      getItemUom(item),
      price != null ? price : "",
      quantity,
      lineTotal != null ? lineTotal : "",
      escapeCell(job_name || ""),
    ]);
  }
  aoa.push(["Grand total", "", "", "", "", grand, ""]);
  return { aoa, grandTotal: grand };
}

function aoaToXlsxBase64(aoa) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "Order");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

function lineIsApOnly(item) {
  const { hasAp, hasMixing } = getItemApMixingFlags(item);
  return hasAp && !hasMixing;
}

function lineIsMixing(item) {
  return getItemApMixingFlags(item).hasMixing;
}

/** Safe segment for a filename (no path separators or reserved chars). */
function sanitizeFilenameBase(s) {
  return String(s ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Item";
}

function orderDateStamp() {
  const ymd = new Date();
  return `${ymd.getFullYear()}-${String(ymd.getMonth() + 1).padStart(2, "0")}-${String(ymd.getDate()).padStart(2, "0")}`;
}

/**
 * One line → "{Item name} Order YYYY-MM-DD".
 * Multiple AP-only lines → "AP Order YYYY-MM-DD".
 * Multiple mixing lines → "Paint Order YYYY-MM-DD".
 * Otherwise → "Order-{id}-YYYY-MM-DD".
 */
function orderSpreadsheetBaseName(orderId, lines) {
  const stamp = orderDateStamp();
  if (lines.length === 1) {
    const raw = (lines[0].item?.name || lines[0].item?.id || "Item").trim();
    return `${sanitizeFilenameBase(raw)} Order ${stamp}`;
  }
  const allAp =
    lines.length > 0 && lines.every((l) => lineIsApOnly(l.item));
  const allMixing =
    lines.length > 0 && lines.every((l) => lineIsMixing(l.item));
  if (allAp) return `AP Order ${stamp}`;
  if (allMixing) return `Paint Order ${stamp}`;
  const idPart =
    orderId != null ? String(orderId).replace(/[^\w.-]+/g, "") : "pending";
  return `Order-${idPart}-${stamp}`;
}

/**
 * Builds .xlsx and opens email (native: attachment when supported).
 * Recipients are left blank so the user chooses who to email.
 * Web: tries Web Share with the file; otherwise downloads the workbook and opens mailto (no attachment — browsers cannot attach via mailto).
 */
export async function openEmailWithOrderSpreadsheet({ orderId, lines }) {
  const { aoa } = buildOrderSheetAoa(lines);
  const base64 = aoaToXlsxBase64(aoa);
  const basename = orderSpreadsheetBaseName(orderId, lines);
  const filename = `${basename}.xlsx`;
  const subject = `Paint order request${orderId != null ? ` #${orderId}` : ""} (PO pending)`;
  const bodyCore = [
    "Attached: order lines as an Excel workbook (.xlsx).",
    orderId != null ? `App order id: ${orderId}` : null,
    "PO number: (to be assigned by accounting)",
    "",
    "Add recipients and any notes, then send.",
  ]
    .filter(Boolean)
    .join("\n");

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const mime =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const bin = atob(base64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const file = new File([blob], filename, { type: mime });

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        const sharePayload = { files: [file], title: subject, text: bodyCore };
        if (!navigator.canShare || navigator.canShare(sharePayload)) {
          await navigator.share(sharePayload);
          return { mode: "web_share" };
        }
      } catch {
        // User dismissed share or error — fall through to download + mailto.
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);

    const shortBody =
      `${bodyCore}\n\nThe Excel file was downloaded to your device. Add it as an attachment if your mail app did not receive it from Share.`;
    await MailComposer.composeAsync({
      subject,
      body: shortBody,
    });
    return { mode: "web_download_mailto" };
  }

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) {
    await Linking.openURL(
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyCore)}`,
    );
    return { mode: "mailto_no_cache" };
  }

  const cacheUri = `${cacheRoot}${filename}`;
  await FileSystem.writeAsStringAsync(cacheUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let attachUri = cacheUri;
  if (Platform.OS === "android") {
    try {
      attachUri = await FileSystem.getContentUriAsync(cacheUri);
    } catch {
      attachUri = cacheUri;
    }
  }

  const available = await MailComposer.isAvailableAsync();
  if (!available) {
    await Linking.openURL(
      `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyCore + "\n\n(Attach the order .xlsx from app cache if your client supports it.)")}`,
    );
    return { mode: "mailto_fallback" };
  }

  await MailComposer.composeAsync({
    subject,
    body: bodyCore,
    attachments: [attachUri],
  });
  return { mode: "native_attachment" };
}

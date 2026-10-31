"use strict";

const REPORT_TZ = "America/Los_Angeles";
const WEEK_COUNT = 8;

function todayPacificIso(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function weekMondayIso(dateStr) {
  const key = String(dateStr || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  const [y, mo, day] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, day, 12));
  const dow = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() - ((dow + 6) % 7));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function addDaysIso(iso, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, mo, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, day, 12));
  utc.setUTCDate(utc.getUTCDate() + days);
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function formatShortMonthDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatWeekRangeLabel(mondayIso) {
  if (!mondayIso) return "Week";
  const sunday = addDaysIso(mondayIso, 6);
  return `${formatShortMonthDay(mondayIso)} – ${formatShortMonthDay(sunday)}`;
}

function pacificDayFromTimestamp(ts) {
  const d = new Date(ts);
  if (!Number.isNaN(d.getTime())) return todayPacificIso(d);
  const s = String(ts || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function round1(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 10) / 10;
}

function emptyUsage() {
  return { paint: 0, stain: 0, dye: 0, primer: 0, clear: 0, other: 0, total: 0 };
}

function emptyWaste() {
  return { paint: 0, clear: 0, primer: 0, acetone: 0, coatings: 0, total: 0 };
}

function coatingsUsage(u) {
  return round1((u?.paint || 0) + (u?.primer || 0) + (u?.clear || 0));
}

function coatingsWaste(w) {
  return round1((w?.paint || 0) + (w?.primer || 0) + (w?.clear || 0));
}

function isMainAdminName(name) {
  const n = String(name || "")
    .toLowerCase()
    .trim();
  return n === "admin" || n === "admin123";
}

function emptySchedule() {
  return { paint: 0, stain: 0, dye: 0, primer: 0, clear: 0, other: 0, jobs: 0, qty: 0 };
}

function usageBucket(type) {
  const t = String(type || "").toLowerCase().trim();
  if (t === "paint" || t === "custom_paint" || t === "precat") return "paint";
  if (t === "stain" || t === "custom_stain") return "stain";
  if (t === "dye") return "dye";
  if (t === "primer") return "primer";
  if (t === "clear") return "clear";
  return "other";
}

function parseLooseDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdy) {
    let y = Number(mdy[3]);
    if (y < 100) y += 2000;
    const mo = String(Number(mdy[1])).padStart(2, "0");
    const d = String(Number(mdy[2])).padStart(2, "0");
    const iso = `${y}-${mo}-${d}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";
  return todayPacificIso(new Date(t));
}

function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    if (row.some((c) => String(c).trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === "," || ch === "\t") {
      pushCell();
      continue;
    }
    if (ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  pushCell();
  pushRow();
  return rows;
}

function headerKind(name) {
  const h = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!h) return "";
  if (/\b(date|scheduled|ship date|due date|week of|start date|prod date)\b/.test(h)) {
    return "date";
  }
  if (/\b(type|finish|process|material|coat|stain paint|paint stain)\b/.test(h)) {
    return "type";
  }
  if (/\b(color|stain name|paint name|finish color)\b/.test(h)) return "color";
  if (/\b(job|work order|\bwo\b|sales order|\bso\b)\b/.test(h)) return "job";
  if (/\b(species|wood)\b/.test(h)) return "species";
  if (/\b(lf|linear|cars|qty|quantity|pieces|cabinets)\b/.test(h)) return "qty";
  return "";
}

function inferMaterial(parts) {
  const t = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\bdye\b/.test(t)) return "dye";
  if (/\bstain\b/.test(t) && !/\bpaint\b/.test(t)) return "stain";
  if (/\bprimer\b/.test(t)) return "primer";
  if (/\b(clear|sealer|top\s*coat|lacquer|toner)\b/.test(t)) return "clear";
  if (/\b(paint|precat|enamel)\b/.test(t)) return "paint";
  return "other";
}

function parseQty(raw) {
  const n = parseFloat(String(raw || "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseProductionCsv(text, filename, fallbackMonday) {
  const table = parseCsv(text);
  if (!table.length) {
    return { rows: [], weekTotals: {}, error: "That file did not have any rows." };
  }
  const header = table[0].map((h) => String(h || "").trim());
  const kinds = header.map(headerKind);
  const hasHeader = kinds.some(Boolean);
  const body = hasHeader ? table.slice(1) : table;
  const col = {
    date: kinds.indexOf("date"),
    type: kinds.indexOf("type"),
    color: kinds.indexOf("color"),
    job: kinds.indexOf("job"),
    species: kinds.indexOf("species"),
    qty: kinds.indexOf("qty"),
  };
  const parsedRows = [];
  const weekTotals = {};
  for (const cells of body) {
    const get = (kind) => {
      const i = col[kind];
      return i >= 0 ? String(cells[i] || "").trim() : "";
    };
    const date = parseLooseDate(get("date")) || "";
    const monday = weekMondayIso(date) || fallbackMonday;
    const type = get("type");
    const color = get("color");
    const job = get("job");
    const species = get("species");
    const qty = parseQty(get("qty"));
    const material = inferMaterial([type, color, cells.join(" ")]);
    parsedRows.push({
      date: date || monday,
      monday,
      material,
      type,
      color,
      job,
      species,
      qty,
    });
    if (!weekTotals[monday]) weekTotals[monday] = emptySchedule();
    const w = weekTotals[monday];
    w.jobs += 1;
    w.qty = round1(w.qty + qty);
    if (w[material] != null) w[material] += 1;
    else w.other += 1;
  }
  if (!parsedRows.length) {
    return { rows: [], weekTotals: {}, error: "Could not read jobs from that CSV." };
  }
  return {
    rows: parsedRows,
    weekTotals,
    filename: String(filename || "schedule.csv"),
  };
}

function pctChange(now, then) {
  const a = Number(now) || 0;
  const b = Number(then) || 0;
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 1000) / 10;
}

function mixShare(part, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.round(((Number(part) || 0) / t) * 1000) / 10;
}

function buildTalkingPoints({
  thisWeek,
  lastWeek,
  priorAvg,
  scheduleThis,
  scheduleLast,
  booth2Stain,
  adjustmentsThis,
  adjustmentsAll,
  daysIntoWeek = 7,
  nowLabel = "this week",
  prevLabel = "last week",
}) {
  const points = [];
  const usageNow = thisWeek.usage;
  const usageAvg = priorAvg.usage;
  const usageLast = lastWeek.usage;
  const wasteNow = thisWeek.waste;
  const wasteAvg = priorAvg.waste;

  const materialLabels = [
    ["paint", "Paint"],
    ["stain", "Stain"],
    ["dye", "Dye"],
    ["primer", "Primer"],
    ["clear", "Clear"],
  ];

  for (const [key, label] of materialLabels) {
    const now = usageNow[key] || 0;
    const avg = usageAvg[key] || 0;
    const last = usageLast[key] || 0;
    const vsAvg = pctChange(now, avg);
    const vsLast = pctChange(now, last);
    const deltaAvg = round1(now - avg);
    if (Math.abs(deltaAvg) < 2 && Math.abs(vsAvg) < 20) continue;
    if (vsAvg >= 15 && deltaAvg >= 2) {
      let why = "";
      if (scheduleThis && scheduleLast) {
        const jobsNow = scheduleThis[key] || 0;
        const jobsLast = scheduleLast[key] || 0;
        const jobChange = pctChange(jobsNow, jobsLast);
        if (jobsNow > jobsLast && jobChange >= 10) {
          why = ` Production schedule has ${jobsNow} ${label.toLowerCase()} jobs ${nowLabel} vs ${jobsLast} ${prevLabel}, so the increase is expected.`;
        } else if (jobsNow <= jobsLast) {
          why = ` The production schedule does not show more ${label.toLowerCase()} work (${jobsNow} jobs vs ${jobsLast} ${prevLabel}) — ask the booths why ${label.toLowerCase()} volume climbed.`;
        }
      } else {
        why = ` Upload ${nowLabel}'s production schedule CSV if you want to check whether the extra work was planned.`;
      }
      points.push({
        severity: vsAvg >= 30 || deltaAvg >= 8 ? "high" : "medium",
        title: `${label} consumption is up`,
        body: `${label} usage is ${round1(now)} gal ${nowLabel} vs ${round1(avg)} gal average over the last 4 weeks (${vsAvg > 0 ? "+" : ""}${vsAvg}%, ${vsLast > 0 ? "+" : ""}${vsLast}% vs ${prevLabel}).${why}`,
      });
    } else if (
      daysIntoWeek >= 4 &&
      vsAvg <= -20 &&
      deltaAvg <= -2
    ) {
      points.push({
        severity: "info",
        title: `${label} usage is down`,
        body: `${label} is ${round1(now)} gal ${nowLabel} vs ${round1(avg)} gal average (−${Math.abs(vsAvg)}%). Confirm the line actually ran less ${label.toLowerCase()}, not that entries were missed.`,
      });
    }
  }

  const paintShareNow = mixShare(usageNow.paint, usageNow.total);
  const stainShareNow = mixShare(usageNow.stain, usageNow.total);
  const paintShareAvg = mixShare(usageAvg.paint, usageAvg.total);
  const stainShareAvg = mixShare(usageAvg.stain, usageAvg.total);
  const paintShift = round1(paintShareNow - paintShareAvg);
  const stainShift = round1(stainShareNow - stainShareAvg);
  if (Math.abs(paintShift) >= 8 || Math.abs(stainShift) >= 8) {
    let why = "";
    if (scheduleThis && scheduleLast) {
      const schPaintNow = mixShare(scheduleThis.paint, scheduleThis.jobs);
      const schStainNow = mixShare(scheduleThis.stain, scheduleThis.jobs);
      why = ` Schedule mix ${nowLabel} is ${schPaintNow}% paint jobs / ${schStainNow}% stain jobs.`;
    }
    points.push({
      severity: "medium",
      title: "Paint vs stain mix shifted",
      body: `Usage mix is ${paintShareNow}% paint / ${stainShareNow}% stain ${nowLabel}, vs ${paintShareAvg}% / ${stainShareAvg}% over the last 4 weeks.${why} Worth a quick check with mixing and the booths.`,
    });
  }

  const wasteNowCoat = coatingsWaste(wasteNow);
  const wasteAvgCoat = coatingsWaste(wasteAvg);
  const wasteDelta = round1(wasteNowCoat - wasteAvgCoat);
  const wastePct = pctChange(wasteNowCoat, wasteAvgCoat);
  if ((wastePct >= 20 && wasteDelta >= 1) || wasteDelta >= 4) {
    const hot = [];
    for (const [key, label] of [
      ["paint", "paint"],
      ["clear", "clear"],
      ["primer", "primer"],
    ]) {
      const d = round1((wasteNow[key] || 0) - (wasteAvg[key] || 0));
      if (d >= 1) hot.push(`${label} +${d} gal`);
    }
    points.push({
      severity: wasteDelta >= 6 || wastePct >= 40 ? "high" : "medium",
      title: `Excess waste ${nowLabel}`,
      body: `Paint, primer, and clear waste is ${round1(wasteNowCoat)} gal ${nowLabel} vs ${round1(wasteAvgCoat)} gal average (${wastePct > 0 ? "+" : ""}${wastePct}%). That is material mixed but not sprayed.${hot.length ? ` Biggest jumps: ${hot.join(", ")}.` : ""} Talk with the booths about leftover cups and gun dumps.`,
    });
  }

  const mixedCoatings = coatingsUsage(usageNow);
  if (mixedCoatings >= 8 && wasteNowCoat >= 2) {
    const ratio = mixShare(wasteNowCoat, mixedCoatings);
    if (ratio >= 25) {
      points.push({
        severity: "high",
        title: "Waste is high versus what was mixed",
        body: `${round1(mixedCoatings)} gal of paint, primer, and clear were mixed ${nowLabel}, and ${round1(wasteNowCoat)} gal (${ratio}%) went to waste — that is what was not sprayed. Acetone is left out of this comparison.`,
      });
    }
  }

  if ((booth2Stain?.gallons || 0) > 0 || (booth2Stain?.count || 0) > 0) {
    points.push({
      severity: "high",
      title: "Booth 2 logged stain",
      body: `Booth 2 has ${booth2Stain.count} stain ${booth2Stain.count === 1 ? "entry" : "entries"} (${round1(booth2Stain.gallons)} gal). Stain almost never runs in Booth 2 — confirm these should have been dye.`,
    });
  }

  if ((adjustmentsThis?.count || 0) > 0) {
    const top = (adjustmentsThis.items || [])
      .slice(0, 3)
      .map((it) => `${it.name} ${it.delta > 0 ? "+" : ""}${round1(it.delta)} gal`)
      .join("; ");
    const high = adjustmentsThis.count >= 4 || adjustmentsThis.absGallons >= 5;
    points.push({
      severity: high ? "high" : "medium",
      title: "Count was off",
      body: `ADMIN changed on-hand gallons ${adjustmentsThis.count} ${adjustmentsThis.count === 1 ? "time" : "times"} ${nowLabel} (${round1(adjustmentsThis.absGallons)} gal absolute, net ${adjustmentsThis.netGallons > 0 ? "+" : ""}${round1(adjustmentsThis.netGallons)} gal), so the count was off.${top ? ` ${top}.` : ""} All-time: ${adjustmentsAll.count} count-off adjustments totaling ${round1(adjustmentsAll.absGallons)} gal moved.`,
    });
  } else if ((adjustmentsAll?.count || 0) > 0) {
    points.push({
      severity: "info",
      title: `No count-off corrections ${nowLabel}`,
      body: `ADMIN did not change on-hand gallons ${nowLabel}. All-time: ${adjustmentsAll.count} count-off adjustments totaling ${round1(adjustmentsAll.absGallons)} gal moved.`,
    });
  }

  if (!points.length) {
    points.push({
      severity: "info",
      title: daysIntoWeek < 7 ? "Quiet week so far" : "Quiet week",
      body: "Usage and waste are in line with the last few weeks. Nothing jumps out to bring to the team yet.",
    });
  }
  return points;
}

function avgWeeks(weeks) {
  const n = weeks.length || 1;
  const usage = emptyUsage();
  const waste = emptyWaste();
  for (const w of weeks) {
    for (const k of Object.keys(usage)) usage[k] += Number(w.usage?.[k]) || 0;
    for (const k of Object.keys(waste)) waste[k] += Number(w.waste?.[k]) || 0;
  }
  for (const k of Object.keys(usage)) usage[k] = round1(usage[k] / n);
  for (const k of Object.keys(waste)) waste[k] = round1(waste[k] / n);
  return { usage, waste };
}

async function ensureOverviewTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_schedules (
      id SERIAL PRIMARY KEY,
      uploaded_at TIMESTAMPTZ DEFAULT NOW(),
      uploaded_by TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL DEFAULT '',
      csv_text TEXT NOT NULL DEFAULT '',
      rows jsonb NOT NULL DEFAULT '[]'::jsonb,
      week_totals jsonb NOT NULL DEFAULT '{}'::jsonb
    )
  `);
}

function emptyWeek(monday) {
  return {
    monday,
    label: formatWeekRangeLabel(monday),
    usage: emptyUsage(),
    waste: emptyWaste(),
    schedule: emptySchedule(),
    adjustments: { count: 0, absGallons: 0, netGallons: 0 },
    booth2Stain: { count: 0, gallons: 0 },
  };
}

async function getOverview(pool) {
  const today = todayPacificIso();
  const thisMonday = weekMondayIso(today);
  const fromMonday = addDaysIso(thisMonday, -7 * (WEEK_COUNT - 1));
  const monthStart = `${today.slice(0, 7)}-01`;
  const fromDate = monthStart < fromMonday ? monthStart : fromMonday;
  const weekEnd = addDaysIso(thisMonday, 6);
  const mondays = [];
  for (let i = 0; i < WEEK_COUNT; i += 1) {
    mondays.push(addDaysIso(fromMonday, 7 * i));
  }
  const byMonday = {};
  for (const m of mondays) byMonday[m] = emptyWeek(m);
  const thisMonth = {
    key: today.slice(0, 7),
    usage: emptyUsage(),
    waste: emptyWaste(),
  };

  const usageRes = await pool.query(
    `SELECT entry_date, material_type, qty_gallons, booth
     FROM material_usage
     WHERE entry_date >= $1
       AND entry_date <= $2
       AND (user_name IS NULL OR LOWER(TRIM(COALESCE(user_name, ''))) NOT IN ('admin123', 'admin'))`,
    [fromDate, weekEnd],
  );
  for (const row of usageRes.rows) {
    const gal = Number(row.qty_gallons) || 0;
    const bucket = usageBucket(row.material_type);
    const monday = weekMondayIso(row.entry_date);
    const week = byMonday[monday];
    if (week) {
      week.usage[bucket] = round1(week.usage[bucket] + gal);
      week.usage.total = round1(week.usage.total + gal);
      const booth = String(row.booth || "").trim();
      if (booth === "Booth 2" && bucket === "stain") {
        week.booth2Stain.count += 1;
        week.booth2Stain.gallons = round1(week.booth2Stain.gallons + gal);
      }
    }
    if (String(row.entry_date || "").slice(0, 7) === thisMonth.key) {
      thisMonth.usage[bucket] = round1(thisMonth.usage[bucket] + gal);
      thisMonth.usage.total = round1(thisMonth.usage.total + gal);
    }
  }

  const wasteRes = await pool.query(
    `SELECT entry_date, paint_gallons, clear_toner_gallons, primer_gallons, acetone_gallons
     FROM waste_tracking
     WHERE entry_date >= $1 AND entry_date <= $2`,
    [fromDate, weekEnd],
  );
  for (const row of wasteRes.rows) {
    const paint = Number(row.paint_gallons) || 0;
    const clear = Number(row.clear_toner_gallons) || 0;
    const primer = Number(row.primer_gallons) || 0;
    const acetone = Number(row.acetone_gallons) || 0;
    const addWaste = (target) => {
      target.paint = round1(target.paint + paint);
      target.clear = round1(target.clear + clear);
      target.primer = round1(target.primer + primer);
      target.acetone = round1(target.acetone + acetone);
      target.coatings = round1(target.paint + target.clear + target.primer);
      target.total = target.coatings;
    };
    const monday = weekMondayIso(row.entry_date);
    if (byMonday[monday]) addWaste(byMonday[monday].waste);
    if (String(row.entry_date || "").slice(0, 7) === thisMonth.key) {
      addWaste(thisMonth.waste);
    }
  }

  const adjRes = await pool.query(
    `SELECT a.id, a.action, a."itemId" AS item_id, a."userName" AS user_name,
            a.details, a.timestamp, i.name AS item_name, i.type AS item_type
     FROM audit_log a
     LEFT JOIN items i ON i.id = a."itemId"
     WHERE a.action = 'qty_adjust'
        OR (
          LOWER(TRIM(COALESCE(a."userName", ''))) IN ('admin', 'admin123')
          AND COALESCE(a.action, '') NOT IN
            ('check_in', 'check_out', 'receiving', 'recycled', 'location_change', 'add', 'delete')
          AND COALESCE(
            CASE
              WHEN a.details IS NULL OR trim(a.details::text) = '' THEN ''
              WHEN left(trim(a.details::text), 1) = '{' THEN a.details::jsonb->>'_actionType'
              ELSE ''
            END,
            ''
          ) NOT IN ('check_in', 'check_out', 'receiving', 'recycled', 'location_change')
          AND a.details IS NOT NULL
          AND left(trim(a.details::text), 1) = '{'
          AND (
            (a.details::jsonb ? 'oldQuantity' AND a.details::jsonb ? 'newQuantity')
            OR (a.details::jsonb ? 'quantityChange')
            OR (a.details::jsonb ? 'quantity')
          )
        )`
  );

  const lastMonday = addDaysIso(thisMonday, -7);
  const adjItemMaps = {
    [thisMonday]: {},
    [lastMonday]: {},
  };
  const adjustmentsAll = { count: 0, absGallons: 0, netGallons: 0 };
  for (const row of adjRes.rows) {
    const action = String(row.action || "").toLowerCase();
    if (action !== "qty_adjust" && !isMainAdminName(row.user_name)) continue;
    if (
      action === "check_in" ||
      action === "check_out" ||
      action === "receiving" ||
      action === "recycled" ||
      action === "location_change"
    ) {
      continue;
    }
    let details = row.details;
    if (typeof details === "string") {
      try {
        details = JSON.parse(details || "{}");
      } catch {
        details = {};
      }
    }
    details = details || {};
    const oldQ = parseFloat(details.oldQuantity);
    const newQ = parseFloat(details.newQuantity);
    let delta = 0;
    if (Number.isFinite(oldQ) && Number.isFinite(newQ)) {
      delta = newQ - oldQ;
    } else {
      const q = parseFloat(details.quantityChange);
      if (!Number.isFinite(q) || q === 0) continue;
      delta = q;
    }
    if (delta === 0) continue;
    const abs = Math.abs(delta);
    adjustmentsAll.count += 1;
    adjustmentsAll.absGallons = round1(adjustmentsAll.absGallons + abs);
    adjustmentsAll.netGallons = round1(adjustmentsAll.netGallons + delta);
    const day = pacificDayFromTimestamp(row.timestamp);
    const monday = weekMondayIso(day);
    const week = byMonday[monday];
    if (week) {
      week.adjustments.count += 1;
      week.adjustments.absGallons = round1(week.adjustments.absGallons + abs);
      week.adjustments.netGallons = round1(week.adjustments.netGallons + delta);
    }
    const itemMap = adjItemMaps[monday];
    if (itemMap) {
      const key = String(row.item_id || row.item_name || "item");
      if (!itemMap[key]) {
        itemMap[key] = {
          itemId: row.item_id,
          name: row.item_name || row.item_id || "Unknown",
          type: row.item_type || "",
          delta: 0,
          abs: 0,
          count: 0,
        };
      }
      itemMap[key].delta = round1(itemMap[key].delta + delta);
      itemMap[key].abs = round1(itemMap[key].abs + abs);
      itemMap[key].count += 1;
    }
  }
  const sortAdjItems = (map) =>
    Object.values(map || {}).sort((a, b) => b.abs - a.abs);
  const adjustmentsThisItems = sortAdjItems(adjItemMaps[thisMonday]);
  const adjustmentsLastItems = sortAdjItems(adjItemMaps[lastMonday]);

  await ensureOverviewTables(pool);
  const schedRes = await pool.query(
    `SELECT id, uploaded_at, uploaded_by, filename, week_totals
     FROM production_schedules
     ORDER BY uploaded_at DESC
     LIMIT 20`,
  );
  const scheduleFiles = schedRes.rows.map((r) => ({
    id: r.id,
    uploadedAt: r.uploaded_at,
    uploadedBy: r.uploaded_by,
    filename: r.filename,
  }));
  for (const row of schedRes.rows) {
    const totals = row.week_totals || {};
    for (const [monday, mix] of Object.entries(totals)) {
      const week = byMonday[monday];
      if (!week) continue;
      const incoming = { ...emptySchedule(), ...mix };
      week.schedule.jobs += Number(incoming.jobs) || 0;
      week.schedule.qty = round1(week.schedule.qty + (Number(incoming.qty) || 0));
      for (const k of ["paint", "stain", "dye", "primer", "clear", "other"]) {
        week.schedule[k] += Number(incoming[k]) || 0;
      }
    }
  }

  const weeks = mondays.map((m) => byMonday[m]);
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2] || emptyWeek(lastMonday);
  const weekBeforeLast =
    weeks[weeks.length - 3] || emptyWeek(addDaysIso(thisMonday, -14));
  const priorWeeks = weeks.slice(0, -1).slice(-4);
  const priorAvg = avgWeeks(priorWeeks.length ? priorWeeks : [lastWeek]);
  const lastWeekPriorWeeks = weeks.slice(0, -2).slice(-4);
  const lastWeekPriorAvg = avgWeeks(
    lastWeekPriorWeeks.length ? lastWeekPriorWeeks : [weekBeforeLast],
  );
  const daysIntoWeek = Math.max(
    0,
    Math.round(
      (new Date(`${today}T12:00:00`).getTime() -
        new Date(`${thisMonday}T12:00:00`).getTime()) /
        86400000,
    ),
  );
  const talkingPoints = buildTalkingPoints({
    thisWeek,
    lastWeek,
    priorAvg,
    scheduleThis: thisWeek.schedule.jobs ? thisWeek.schedule : null,
    scheduleLast: lastWeek.schedule.jobs ? lastWeek.schedule : null,
    booth2Stain: thisWeek.booth2Stain,
    adjustmentsThis: {
      ...thisWeek.adjustments,
      items: adjustmentsThisItems,
    },
    adjustmentsAll,
    daysIntoWeek,
  });
  const lastWeekTalkingPoints = buildTalkingPoints({
    thisWeek: lastWeek,
    lastWeek: weekBeforeLast,
    priorAvg: lastWeekPriorAvg,
    scheduleThis: lastWeek.schedule.jobs ? lastWeek.schedule : null,
    scheduleLast: weekBeforeLast.schedule.jobs ? weekBeforeLast.schedule : null,
    booth2Stain: lastWeek.booth2Stain,
    adjustmentsThis: {
      ...lastWeek.adjustments,
      items: adjustmentsLastItems,
    },
    adjustmentsAll,
    daysIntoWeek: 7,
    nowLabel: "last week",
    prevLabel: "the week before",
  });

  return {
    today,
    thisMonday,
    weekLabel: formatWeekRangeLabel(thisMonday),
    lastWeekLabel: formatWeekRangeLabel(lastWeek.monday),
    inProgress: true,
    weeks,
    thisWeek,
    lastWeek,
    weekBeforeLast,
    thisMonth,
    priorAvg,
    lastWeekPriorAvg,
    talkingPoints,
    lastWeekTalkingPoints,
    adjustmentsThis: {
      ...thisWeek.adjustments,
      items: adjustmentsThisItems,
    },
    adjustmentsLast: {
      ...lastWeek.adjustments,
      items: adjustmentsLastItems,
    },
    adjustmentsAll,
    scheduleFiles,
  };
}

async function saveProductionSchedule(pool, { csvText, filename, uploadedBy }) {
  await ensureOverviewTables(pool);
  const text = String(csvText || "");
  if (!text.trim()) {
    return { success: false, error: "CSV was empty." };
  }
  if (text.length > 1_500_000) {
    return { success: false, error: "CSV is too large (1.5 MB max)." };
  }
  const today = todayPacificIso();
  const parsed = parseProductionCsv(text, filename, weekMondayIso(today));
  if (parsed.error) return { success: false, error: parsed.error };
  const result = await pool.query(
    `INSERT INTO production_schedules (uploaded_by, filename, csv_text, rows, week_totals)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
     RETURNING id, uploaded_at, uploaded_by, filename`,
    [
      String(uploadedBy || "").trim() || "Admin",
      String(filename || "schedule.csv").slice(0, 180),
      text,
      JSON.stringify(parsed.rows.slice(0, 5000)),
      JSON.stringify(parsed.weekTotals),
    ],
  );
  return { success: true, file: result.rows[0], weekTotals: parsed.weekTotals };
}

module.exports = {
  ensureOverviewTables,
  getOverview,
  saveProductionSchedule,
  parseProductionCsv,
};

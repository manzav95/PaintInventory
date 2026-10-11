const TYPES = [
  ["paint", "Paint"],
  ["primer", "Primer"],
  ["clear", "Clear"],
  ["stain", "Stain"],
];

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString()}`;
}

function gal(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  return `${v.toLocaleString()} gal`;
}

function pct(now, before) {
  if (!before) return now ? "up from nothing" : "flat";
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return "about the same";
  return change > 0 ? `up ${change}%` : `down ${Math.abs(change)}%`;
}

function finishedBuckets(summary) {
  const rows = Array.isArray(summary?.bucketDetails) ? summary.bucketDetails : [];
  if (rows.length < 3) return rows;
  return rows.slice(0, -1);
}

function windows(summary) {
  const rows = finishedBuckets(summary);
  const size = summary?.groupBy === "month" ? 2 : summary?.groupBy === "day" ? 14 : 4;
  return {
    size,
    recent: rows.slice(-size),
    prior: rows.slice(-size * 2, -size),
    unit: summary?.groupBy === "month" ? "months" : summary?.groupBy === "day" ? "days" : "weeks",
  };
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + (Number(row?.[field]) || 0), 0);
}

function sumType(rows, key, field) {
  return rows.reduce((sum, row) => sum + (Number(row?.[field]?.[key]) || 0), 0);
}

function typeMoves(recent, prior) {
  return TYPES.map(([key, label]) => {
    const gallons = sumType(recent, key, "materialUsageByType");
    const beforeGallons = sumType(prior, key, "materialUsageByType");
    const value = sumType(recent, key, "materialUsageValueByType");
    const beforeValue = sumType(prior, key, "materialUsageValueByType");
    return {
      key,
      label,
      gallons,
      beforeGallons,
      value,
      beforeValue,
      gallonDelta: gallons - beforeGallons,
      valueDelta: value - beforeValue,
    };
  }).filter((row) => row.gallons > 0 || row.beforeGallons > 0);
}

function moneyAnswer(summary) {
  const { recent, prior, size, unit } = windows(summary);
  if (!recent.length) {
    return "There isn't enough material usage in this date range to say where the money is going.";
  }
  const spent = sumField(recent, "materialUsageValue");
  const spentBefore = sumField(prior, "materialUsageValue");
  const moves = typeMoves(recent, prior).sort((a, b) => b.valueDelta - a.valueDelta);
  const top = moves[0];
  const lines = [
    prior.length
      ? `The last ${recent.length} full ${unit} of material cost ${money(spent)}, ${pct(spent, spentBefore)} versus the ${prior.length} ${unit} before that (${money(spentBefore)}).`
      : `The last ${recent.length} full ${unit} of material cost ${money(spent)}.`,
  ];
  if (top && top.valueDelta > 0) {
    lines.push(
      `${top.label} is the first place to cut back. It cost ${money(top.value)} (${gal(top.gallons)}), ${money(top.valueDelta)} more than the period before.`,
    );
  } else if (top) {
    lines.push(
      `No type jumped in cost. ${top.label} is still the largest recent spend at ${money(top.value)} for ${gal(top.gallons)}.`,
    );
  }
  const dropped = [...moves].sort((a, b) => a.valueDelta - b.valueDelta)[0];
  if (dropped && dropped.valueDelta < 0 && dropped !== top) {
    lines.push(
      `${dropped.label} already came down, to ${money(dropped.value)} from ${money(dropped.beforeValue)}.`,
    );
  }
  if (!prior.length) {
    lines.push(`Widen the date range if you want a before-and-after. This view has fewer than ${size * 2} full ${unit}.`);
  }
  return lines.join(" ");
}

function changeAnswer(summary) {
  const { recent, prior, unit } = windows(summary);
  if (!recent.length || !prior.length) {
    return "I need at least two stretches of weeks in this range before I can call a change. Set the report to Week and include a couple of months.";
  }
  const moves = typeMoves(recent, prior).sort((a, b) => Math.abs(b.gallonDelta) - Math.abs(a.gallonDelta));
  const paint = moves.find((row) => row.key === "paint");
  const stain = moves.find((row) => row.key === "stain");
  const lines = moves.slice(0, 3).map((row) => {
    const direction = row.gallonDelta > 0.5 ? "more" : row.gallonDelta < -0.5 ? "less" : "about the same amount of";
    return `${row.label}: ${gal(row.gallons)} recently versus ${gal(row.beforeGallons)} before, so ${direction} ${row.label.toLowerCase()} (${pct(row.gallons, row.beforeGallons)}).`;
  });
  if (paint && stain) {
    if (paint.gallonDelta > 1 && stain.gallonDelta <= 0) {
      lines.unshift("Yes. Recent use shifted toward paint, not stain.");
    } else if (stain.gallonDelta > 1 && paint.gallonDelta <= 0) {
      lines.unshift("Yes. Recent use shifted toward stain, not paint.");
    } else if (Math.abs(paint.gallonDelta) < 1 && Math.abs(stain.gallonDelta) < 1) {
      lines.unshift(`Paint and stain are steady across the last ${recent.length} ${unit}.`);
    } else {
      lines.unshift("Both paint and stain moved. The larger swing is listed first.");
    }
  }
  return lines.join(" ");
}

function stockAnswer(items, summary) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return "I don't have on-hand quantities for this range yet. Ask again in a moment.";
  }
  const weeks = Math.max(finishedBuckets(summary).length, 1);
  const ranked = list
    .map((item) => {
      const onHand = Number(item.quantity) || 0;
      const used = Number(item.usageGallons) || 0;
      const perWeek = used / weeks;
      const cover = perWeek > 0 ? onHand / perWeek : onHand > 0 ? 99 : 0;
      const tiedUp = onHand * (Number(item.price) || 0);
      return { ...item, onHand, used, cover, tiedUp };
    })
    .filter((item) => item.onHand > 0 && (item.cover >= 8 || item.used === 0))
    .sort((a, b) => b.tiedUp - a.tiedUp)
    .slice(0, 4);
  if (!ranked.length) {
    return "Nothing on the shelf looks overstocked against the usage in this date range. On-hand quantities are within about 8 weeks of what was used.";
  }
  const lines = ranked.map((item) => {
    if (item.used <= 0) {
      return `${item.name} has ${item.onHand} on hand and was not used in this range${item.tiedUp ? ` (about ${money(item.tiedUp)} at the current price)` : ""}.`;
    }
    return `${item.name} has ${item.onHand} on hand, about ${Math.round(item.cover)} weeks of cover based on recent use${item.tiedUp ? `, roughly ${money(item.tiedUp)}` : ""}.`;
  });
  return `These are the quantities I would stop reordering first. ${lines.join(" ")}`;
}

function overview(summary) {
  return `${moneyAnswer(summary)} ${changeAnswer(summary)}`;
}

export function answerReportQuestion(question, { summary, items } = {}) {
  const q = String(question || "").toLowerCase();
  if (!summary?.bucketDetails?.length) {
    return "The report has not loaded yet, so I don't have numbers to answer from.";
  }
  if (/stock|inventor|on hand|sitting|reorder|shelf/.test(q)) {
    return stockAnswer(items, summary);
  }
  if (/paint|stain|primer|clear|change|recent|shift|more /.test(q)) {
    return changeAnswer(summary);
  }
  if (/save|money|cut|cost|expensive|spend|price|waste/.test(q)) {
    return moneyAnswer(summary);
  }
  return overview(summary);
}

export const REPORT_CHAT_PROMPTS = [
  "Where should we save money?",
  "What can be cut back?",
  "More paint or more stain lately?",
  "Which stock is sitting too high?",
];

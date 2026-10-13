"use strict";

/**
 * Shop pigments, stain colorants, dyes, and Opti colorants.
 * Handwritten formulas use the short code (B70, N72, Y83, W85).
 */
const COLORANTS = [
  { code: "D59B70", name: "D59B70 Black Stain Colorant", kind: "stain", color: "Black" },
  { code: "D59L86", name: "D59L86 Blue Stain Colorant", kind: "stain", color: "Blue" },
  { code: "D59B71", name: "D59B71 Burnt Umber Stain Colorant", kind: "stain", color: "Burnt Umber" },
  { code: "D59N72", name: "D59N72 Raw Umber Stain Colorant", kind: "stain", color: "Raw Umber" },
  { code: "D59N73", name: "D59N73 Van Dyke Brown Stain Colorant", kind: "stain", color: "Van Dyke Brown" },
  { code: "D59N74", name: "D59N74 Burnt Sienna Stain Colorant", kind: "stain", color: "Burnt Sienna" },
  { code: "D59R75", name: "D59R75 Red Oxide Stain Colorant", kind: "stain", color: "Red Oxide" },
  { code: "D59R76", name: "D59R76 Transoxide Red Stain Colorant", kind: "stain", color: "Transoxide Red" },
  { code: "D59R77", name: "D59R77 Brite Red Stain Colorant", kind: "stain", color: "Brite Red" },
  { code: "D59R78", name: "D59R78 Deep Red Stain Colorant", kind: "stain", color: "Deep Red" },
  { code: "D59R79", name: "D59R79 Magenta Stain Colorant", kind: "stain", color: "Magenta" },
  { code: "D59Y81", name: "D59Y81 Yellow Oxide Stain Colorant", kind: "stain", color: "Yellow Oxide" },
  { code: "D59Y82", name: "D59Y82 Transoxide Yellow Stain Colorant", kind: "stain", color: "Transoxide Yellow" },
  { code: "D59Y83", name: "D59Y83 Raw Sienna Stain Colorant", kind: "stain", color: "Raw Sienna" },
  { code: "D59Y84", name: "D59Y84 Bright Yellow Stain Colorant", kind: "stain", color: "Bright Yellow" },
  { code: "D59Y85", name: "D59Y85 White Stain Colorant", kind: "stain", color: "White", aliases: ["W85"] },
  { code: "", name: "Nerosol Dark Brown Dye Quart", kind: "nerosol", color: "Dark Brown", size: "Quart" },
  { code: "", name: "Nerosol Dark Brown Dye Gallon", kind: "nerosol", color: "Dark Brown", size: "Gallon", shopCode: "330-452-42", aliases: ["330-452-42"] },
  { code: "", name: "Nerosol Red Brown Dye Gallon", kind: "nerosol", color: "Red Brown", size: "Gallon" },
  { code: "S61L505", name: "S61L505 Dye Stain Concentrate", kind: "dye" },
  { code: "S61E050", name: "S61E050 Dye Stain Concentrate", kind: "dye" },
  { code: "S61R503", name: "S61R503 Dye Stain Concentrate", kind: "dye" },
  { code: "S61R506", name: "S61R506 Dye Stain Concentrate", kind: "dye" },
  { code: "S61Y504", name: "S61Y504 Dye Stain Concentrate", kind: "dye", color: "Yellow" },
  { code: "S61N502", name: "S61N502 Brown Dye Stain Concentrate", kind: "dye", color: "Brown" },
  { code: "S61B500", name: "S61B500 Black Dye Stain Concentrate", kind: "dye", color: "Black" },
  { code: "S61E501", name: "S61E501 Orange Dye Stain Concentrate", kind: "dye", color: "Orange" },
  { code: "TW", name: "TW Titanium White 4100", kind: "opti", color: "Titanium White", shopCode: "4100", aliases: ["4100"] },
  { code: "", name: "Green Shade Yellow", kind: "opti", color: "Green Shade Yellow" },
  { code: "OY", name: "OY Organic Yellow", kind: "opti", color: "Organic Yellow" },
  { code: "", name: "Med Yellow", kind: "opti", color: "Med Yellow" },
  { code: "", name: "Red Shade Yellow", kind: "opti", color: "Red Shade Yellow" },
  { code: "PG", name: "PG Phthalo", kind: "opti", color: "Phthalo" },
  { code: "", name: "Phthalo Blue", kind: "opti", color: "Phthalo Blue" },
  { code: "QV", name: "QV Quinacridone Violet", kind: "opti", color: "Quinacridone Violet" },
  { code: "", name: "Red Iron Oxide", kind: "opti", color: "Red Iron Oxide" },
  { code: "BU", name: "BU Burnt Umber 4188", kind: "opti", color: "Burnt Umber", shopCode: "4188", aliases: ["4188"] },
  { code: "", name: "Raw Umber 4183", kind: "opti", color: "Raw Umber", shopCode: "4183", aliases: ["4183"] },
  { code: "", name: "Orange", kind: "opti", color: "Orange" },
  { code: "", name: "Orange Red Shade", kind: "opti", color: "Orange Red Shade" },
  { code: "", name: "Lamp Black OptiColor XP", kind: "opti", color: "Lamp Black", shopCode: "4191", aliases: ["4191", "LB"] },
];

function squash(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\brave\b|\brau\b|\brax\b/g, "raw")
    .replace(/\bburut\b|\bburned\b/g, "burnt")
    .replace(/sieun\w*|siena+/g, "sienna")
    .replace(/\bwhit\w*\b/g, "white")
    .replace(/\bumbel\b/g, "umber")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortCode(code) {
  const match = String(code || "").match(/([A-Z]\d{2,3})$/);
  return match ? match[1] : "";
}

const BY_CODE = new Map();
COLORANTS.forEach((item) => {
  const full = String(item.code || "").toUpperCase();
  const short = shortCode(full);
  if (full) BY_CODE.set(full, item);
  if (short) BY_CODE.set(short, item);
  (item.aliases || []).forEach((alias) => BY_CODE.set(String(alias).toUpperCase(), item));
});

function colorWords(item) {
  return squash(item.name)
    .replace(squash(item.code), "")
    .replace(/\b(stain colorant|dye stain concentrate|dye quart|dye gallon|opticolor xp)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findByCode(text) {
  const raw = String(text || "").toUpperCase();
  const full = raw.match(/\b(D59[A-Z]\d{2}|S61[A-Z]\d{3})\b/);
  if (full && BY_CODE.has(full[1])) return BY_CODE.get(full[1]);
  const dashed = raw.match(/\b\d{3}-\d{3}-\d{2}\b/);
  if (dashed && BY_CODE.has(dashed[0])) return BY_CODE.get(dashed[0]);
  const alias = raw.match(/\b(W85|4100|4188|4183|4191|LB)\b/);
  if (alias && BY_CODE.has(alias[1])) return BY_CODE.get(alias[1]);
  const short = raw.match(/\b([BDNRYL]\d{2})\b/);
  if (short && BY_CODE.has(short[1])) return BY_CODE.get(short[1]);
  const dye = raw.match(/\b([BERYNL]\d{3})\b/);
  if (dye && BY_CODE.has(dye[1])) return BY_CODE.get(dye[1]);
  const opti = raw.match(/\b(TW|OY|PG|QV|BU)\b/);
  if (opti && BY_CODE.has(opti[1])) return BY_CODE.get(opti[1]);
  const misread = raw.match(/\b([1-9]\d{2})\b/);
  if (misread) {
    const digits = misread[1].slice(-2);
    const named = [...BY_CODE.entries()].find(([code, item]) => code.endsWith(digits) && colorWords(item) && wordsMatch(squash(text), colorWords(item)));
    if (named) return named[1];
  }
  return null;
}

function wordsMatch(haystack, phrase) {
  const words = phrase.split(" ").filter((word) => word.length > 2);
  if (!words.length) return false;
  return words.every((word) => haystack.includes(word));
}

const GENERIC_COLOR = new Set(["black", "brown", "white", "red", "yellow", "orange", "blue"]);

function findByName(text) {
  const key = squash(text);
  if (!key || /\b(base|sealer|topcoat|toner|glaze)\b/.test(key)) return null;
  let best = null;
  let bestScore = 0;
  COLORANTS.forEach((item) => {
    const phrase = colorWords(item);
    if (!phrase) return;
    const phraseWords = phrase.split(" ").filter((word) => word.length > 2);
    if (phraseWords.length === 1 && GENERIC_COLOR.has(phraseWords[0])) return;
    const exact = key === phrase || key.endsWith(` ${phrase}`) || key.startsWith(`${phrase} `) || key.includes(` ${phrase} `);
    const contained = wordsMatch(key, phrase);
    if (!exact && !contained) return;
    const extra = key.replace(phrase, "").trim();
    const score = (exact ? 100 : 40) + phrase.length - extra.length + (squash(item.name) === key ? 50 : 0);
    const stain = /stain colorant/i.test(item.name);
    const dyeAsked = /\bdye\b|\bconcentrate\b|\bnerosol\b/i.test(text);
    const prefer = score > bestScore || (score === bestScore && stain && !dyeAsked);
    if (prefer) {
      best = item;
      bestScore = score;
    }
  });
  return best;
}

function formatItem(item) {
  if (!item) return "";
  if (item.kind === "stain") return `${String(item.code).slice(-3)} ${item.color}`.trim();
  if (item.kind === "dye") {
    const short = String(item.code).slice(-4);
    return item.color ? `${short} ${item.color} Dye` : `${short} Dye`;
  }
  if (item.kind === "nerosol") {
    if (item.shopCode) return `${item.shopCode} ${item.color}`;
    return `${item.color} Dye${item.size ? ` ${item.size}` : ""}`.trim();
  }
  if (item.kind === "opti") {
    return `${item.color}${item.shopCode ? ` ${item.shopCode}` : ""} OPTI`;
  }
  return String(item.name || "").trim();
}

function productLabel(name) {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const hit = findByCode(text) || findByName(text);
  return hit ? formatItem(hit) : text;
}

function matchColorant(text) {
  const hit = findByCode(text) || findByName(text);
  return hit ? { code: hit.code, name: formatItem(hit) } : null;
}

const BASES = [
  { test: /\bsap\b/i, needs: /\b(base|dye|clear)\b/i, name: "SAP clear dye base" },
  { test: /\bt72\b/i, needs: /\b(base|stain|clear)\b/i, name: "T72 clear stain base" },
  { test: /\bfh\s*143\b/i, needs: /\b(coat|top|clear)\b/i, name: "FH 143 clear top coat" },
];

function tidyOcrMaterial(text) {
  return String(text || "")
    .replace(/\bclea[vr]\w*\b/gi, "clear")
    .replace(/\bstia[nr]\w*\b|\bstaun\w*\b/gi, "stain")
    .replace(/\bdy[e3]\b/gi, "dye")
    .replace(/\bgal+o[nu]\w*\b/gi, "gallon")
    .replace(/\btop\s*co[a-z]{2,8}\b/gi, "top coat")
    .replace(/\s+/g, " ")
    .trim();
}

function promoteMisreadCode(text) {
  const key = squash(text);
  const mis = String(text || "").match(/\b([1-9]\d{2})\b/);
  if (!mis) return text;
  const digits = mis[1].slice(-2);
  const named = [...BY_CODE.entries()].find(([code, item]) => {
    if (!String(code).endsWith(digits)) return false;
    const phrase = colorWords(item);
    return phrase && wordsMatch(key, phrase);
  });
  if (!named) return text;
  const code = named[0];
  return String(text).replace(mis[1], code);
}

/** A photo line becomes a shop material, or nothing. Unknown OCR text is not kept. */
function resolveShopMaterial(text) {
  const tidy = tidyOcrMaterial(text);
  if (!tidy || /^(?:i\s*)?g[vrn]?am[s]?$/i.test(tidy)) return "";
  const base = BASES.find((item) => item.test.test(tidy) && item.needs.test(tidy));
  if (base) return base.name;
  if (/\bclear\s+stain\s+base\b/i.test(tidy)) return "clear stain base";
  if (/\bclear\s+dye\s+base\b/i.test(tidy)) return "clear dye base";
  if (/\bclear\s+top\s+coat\b/i.test(tidy)) return "clear top coat";
  const hit = matchColorant(promoteMisreadCode(tidy));
  return hit ? hit.name : "";
}

module.exports = {
  COLORANTS,
  matchColorant,
  productLabel,
  resolveShopMaterial,
};

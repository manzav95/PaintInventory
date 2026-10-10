"use strict";

/**
 * Shop pigments, stain colorants, dyes, and Opti colorants.
 * Handwritten formulas use the short code (B70, N72, Y83, W85).
 */
const COLORANTS = [
  { code: "D59B70", name: "D59B70 Black Stain Colorant" },
  { code: "D59L86", name: "D59L86 Blue Stain Colorant" },
  { code: "D59B71", name: "D59B71 Burnt Umber Stain Colorant" },
  { code: "D59N72", name: "D59N72 Raw Umber Stain Colorant" },
  { code: "D59N73", name: "D59N73 Van Dyke Brown Stain Colorant" },
  { code: "D59N74", name: "D59N74 Burnt Sienna Stain Colorant" },
  { code: "D59R75", name: "D59R75 Red Oxide Stain Colorant" },
  { code: "D59R76", name: "D59R76 Transoxide Red Stain Colorant" },
  { code: "D59R77", name: "D59R77 Brite Red Stain Colorant" },
  { code: "D59R78", name: "D59R78 Deep Red Stain Colorant" },
  { code: "D59R79", name: "D59R79 Magenta Stain Colorant" },
  { code: "D59Y81", name: "D59Y81 Yellow Oxide Stain Colorant" },
  { code: "D59Y82", name: "D59Y82 Transoxide Yellow Stain Colorant" },
  { code: "D59Y83", name: "D59Y83 Raw Sienna Stain Colorant" },
  { code: "D59Y84", name: "D59Y84 Bright Yellow Stain Colorant" },
  { code: "D59Y85", name: "D59Y85 White Stain Colorant", aliases: ["W85"] },
  { code: "", name: "Nerosol Dark Brown Dye Quart" },
  { code: "", name: "Nerosol Dark Brown Dye Gallon" },
  { code: "", name: "Nerosol Red Brown Dye Gallon" },
  { code: "S61L505", name: "S61L505 Dye Stain Concentrate" },
  { code: "S61E050", name: "S61E050 Dye Stain Concentrate" },
  { code: "S61R503", name: "S61R503 Dye Stain Concentrate" },
  { code: "S61R506", name: "S61R506 Dye Stain Concentrate" },
  { code: "S61Y504", name: "S61Y504 Dye Stain Concentrate" },
  { code: "S61N502", name: "S61N502 Brown Dye Stain Concentrate" },
  { code: "S61B500", name: "S61B500 Black Dye Stain Concentrate" },
  { code: "S61E501", name: "S61E501 Orange Dye Stain Concentrate" },
  { code: "TW", name: "TW Titanium White 4100", aliases: ["4100"] },
  { code: "", name: "Green Shade Yellow" },
  { code: "OY", name: "OY Organic Yellow" },
  { code: "", name: "Med Yellow" },
  { code: "", name: "Red Shade Yellow" },
  { code: "PG", name: "PG Phthalo" },
  { code: "", name: "Phthalo Blue" },
  { code: "QV", name: "QV Quinacridone Violet" },
  { code: "", name: "Red Iron Oxide" },
  { code: "BU", name: "BU Burnt Umber 4188", aliases: ["4188"] },
  { code: "", name: "Raw Umber 4183", aliases: ["4183"] },
  { code: "", name: "Orange" },
  { code: "", name: "Orange Red Shade" },
  { code: "", name: "Lamp Black OptiColor XP" },
];

function squash(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\brave\b|\brau\b/g, "raw")
    .replace(/\bburut\b|\bburned\b/g, "burnt")
    .replace(/siena+/g, "sienna")
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
  const alias = raw.match(/\b(W85|4100|4188|4183)\b/);
  if (alias && BY_CODE.has(alias[1])) return BY_CODE.get(alias[1]);
  const short = raw.match(/\b([BDNRYL]\d{2})\b/);
  if (short && BY_CODE.has(short[1])) return BY_CODE.get(short[1]);
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

function findByName(text) {
  const key = squash(text);
  if (!key || /\b(base|sealer|topcoat|toner|glaze)\b/.test(key)) return null;
  let best = null;
  let bestScore = 0;
  COLORANTS.forEach((item) => {
    const phrase = colorWords(item);
    if (!phrase) return;
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

function matchColorant(text) {
  const hit = findByCode(text) || findByName(text);
  return hit ? { code: hit.code, name: hit.name } : null;
}

module.exports = {
  COLORANTS,
  matchColorant,
};

"use strict";

const THUMB_EDGE = 320;
const THUMB_QUALITY = 65;

async function makeFormulaThumb(input) {
  const sharp = require("sharp");
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!bytes.length) throw new Error("empty image");
  const out = await sharp(bytes, { failOn: "none" })
    .rotate()
    .resize(THUMB_EDGE, THUMB_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
  if (!out.length) throw new Error("thumb was empty");
  return { mime: "image/jpeg", bytes: out };
}

module.exports = { makeFormulaThumb, THUMB_EDGE, THUMB_QUALITY };

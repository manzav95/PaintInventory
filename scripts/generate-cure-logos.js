/**
 * Regenerates CURE brand marks/logos as transparent PNGs.
 * Gold arc has equal gaps on both sides.
 *
 * Usage: node scripts/generate-cure-logos.js
 * Requires: npx/sharp available (npm install --no-save sharp)
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "assets");
const GOLD = "#C9972E";
const WHITE = "#FFFFFF";
const BLACK = "#0F1624";

function xy(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

function polyArc(cx, cy, r, startDeg, endDeg, clockwise) {
  let span = clockwise ? startDeg - endDeg : endDeg - startDeg;
  while (span <= 0) span += 360;
  const steps = Math.max(32, Math.ceil(span / 1.5));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const deg = clockwise ? startDeg - span * t : startDeg + span * t;
    pts.push(xy(cx, cy, r, deg));
  }
  return (
    `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} ` +
    pts
      .slice(1)
      .map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ")
  );
}

function markSvg({ color, size = 1024 }) {
  const cx = size / 2;
  const cy = size / 2;
  const pad = size * 0.12;
  const r = size / 2 - pad;
  const stroke = size * 0.11;
  const ringW = stroke;
  const cW = stroke;
  const cR = r - stroke * 2.05;

  const goldStart = 62;
  const goldEnd = -25;
  const gap = 14;
  const inkStart = goldEnd - gap;
  const inkEnd = goldStart + gap;

  const goldPath = polyArc(cx, cy, r, goldStart, goldEnd, true);
  const inkPath = polyArc(cx, cy, r, inkStart, inkEnd, true);
  const cPath = polyArc(cx, cy, cR, -35, 35, true);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
  <path d="${inkPath}" stroke="${color}" stroke-width="${ringW.toFixed(2)}" stroke-linecap="butt" stroke-linejoin="round" />
  <path d="${goldPath}" stroke="${GOLD}" stroke-width="${ringW.toFixed(2)}" stroke-linecap="butt" stroke-linejoin="round" />
  <path d="${cPath}" stroke="${color}" stroke-width="${cW.toFixed(2)}" stroke-linecap="butt" stroke-linejoin="round" />
</svg>`;
}

function logoSvg({ color, size = 1024 }) {
  const markSize = 1000;
  const inner = markSvg({ color, size: markSize })
    .replace(/<\?xml[^>]*>/, "")
    .replace(/<svg[^>]*>/, "")
    .replace("</svg>", "");
  const disp = size * 0.64;
  const x = (size - disp) / 2;
  const y = size * 0.04;
  const s = disp / markSize;
  const textY = size * 0.84;
  const fontSize = size * 0.105;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${s.toFixed(5)})">${inner}</g>
  <text x="50%" y="${textY.toFixed(1)}" text-anchor="middle"
    font-family="ui-sans-serif, system-ui, Helvetica, Arial, sans-serif"
    font-size="${fontSize.toFixed(1)}" font-weight="650"
    letter-spacing="${(fontSize * 0.14).toFixed(1)}" fill="${color}">CURE</text>
</svg>`;
}

async function writePng(svg, file) {
  await sharp(Buffer.from(svg)).png().toFile(file);
  console.log("wrote", path.basename(file));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "cure-mark-white.svg"), markSvg({ color: WHITE }));
  fs.writeFileSync(path.join(OUT, "cure-mark-black.svg"), markSvg({ color: BLACK }));
  await writePng(markSvg({ color: WHITE }), path.join(OUT, "cure-mark-white.png"));
  await writePng(markSvg({ color: BLACK }), path.join(OUT, "cure-mark-black.png"));
  await writePng(logoSvg({ color: WHITE }), path.join(OUT, "cure-logo-white.png"));
  await writePng(logoSvg({ color: BLACK }), path.join(OUT, "cure-logo-black.png"));
  fs.copyFileSync(path.join(OUT, "cure-mark-white.png"), path.join(OUT, "cure-mark.png"));
  fs.copyFileSync(path.join(OUT, "cure-logo-white.png"), path.join(OUT, "cure-logo.png"));

  const mw = path.join(OUT, "cure-mark-white.png");
  await sharp(mw).resize(48, 48).png().toFile(path.join(OUT, "favicon.png"));
  await sharp(mw).resize(180, 180).png().toFile(path.join(OUT, "favicon-180.png"));
  await sharp(mw).resize(192, 192).png().toFile(path.join(OUT, "icon-192.png"));
  const markBuf = await sharp(mw)
    .resize(820, 820, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: "#0F1624" },
  })
    .composite([{ input: markBuf, gravity: "centre" }])
    .png()
    .toFile(path.join(OUT, "icon.png"));
  const logoBuf = await sharp(path.join(OUT, "cure-logo-white.png"))
    .resize(720, 720, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: { width: 1284, height: 1284, channels: 3, background: "#0F1624" },
  })
    .composite([{ input: logoBuf, gravity: "centre" }])
    .png()
    .toFile(path.join(OUT, "splash.png"));
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

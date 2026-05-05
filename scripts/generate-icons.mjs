// Generate PWA + iOS icons from /public/logo.svg.
// Run once after the logo changes. Outputs are committed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const iconsDir = path.join(publicDir, "icons");
const svg = path.join(publicDir, "logo.svg");

if (!fs.existsSync(svg)) {
  console.error(`Missing ${svg}`);
  process.exit(1);
}
fs.mkdirSync(iconsDir, { recursive: true });

const NAVY = { r: 10, g: 31, b: 61, alpha: 1 };

// The logo is wide (690×390); for square PWA icons we letterbox onto a
// navy background so the asset never gets cropped or stretched.
async function squareOnNavy(size) {
  // Render the SVG to fit within ~80% of the canvas, centered.
  const inner = Math.round(size * 0.8);
  const buf = await sharp(svg).resize(inner, inner, {
    fit: "contain",
    background: NAVY,
  }).png().toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: NAVY,
    },
  })
    .composite([{ input: buf, gravity: "center" }])
    .png()
    .toBuffer();
}

const targets = [
  { name: "icons/icon-192.png",   size: 192 },
  { name: "icons/icon-512.png",   size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const t of targets) {
  const out = path.join(publicDir, t.name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = await squareOnNavy(t.size);
  fs.writeFileSync(out, buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`  ${t.name}  (${t.size}×${t.size}, ${kb} KB)`);
}

// favicon.ico — 32×32 fits the historical norm, browsers handle it.
const faviconBuf = await sharp(svg)
  .resize(32, 32, { fit: "contain", background: NAVY })
  .png()
  .toBuffer();
const faviconPath = path.join(publicDir, "favicon.ico");
// sharp doesn't write .ico natively; PNG-named-as-.ico works in every
// modern browser, and Next.js's app router treats it as a favicon.
fs.writeFileSync(faviconPath, faviconBuf);
console.log(`  favicon.ico  (32×32 PNG, ${(faviconBuf.length / 1024).toFixed(1)} KB)`);

console.log("\nDone.");

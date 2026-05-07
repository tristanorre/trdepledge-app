// One-off compressor for the service illustrations under
// public/images/Services. ChatGPT exports them as full-RGB 24-bit PNGs
// at ~2.5 MB each; Next/Image re-encodes on serve, but the committed
// repo size still matters. Re-encoding through sharp's palette quantiser
// drops them ~80% with no visible change for cartoon-style art.
//
// Run: `node scripts/compress-illustrations.mjs`. Outputs replace the
// originals in place — re-run is idempotent.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..", "public", "images", "Services");

const files = fs
  .readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .map((f) => path.join(dir, f));

let beforeTotal = 0;
let afterTotal = 0;

for (const f of files) {
  const before = fs.statSync(f).size;
  beforeTotal += before;

  const buf = await sharp(f)
    .png({ palette: true, quality: 85, compressionLevel: 9, effort: 10 })
    .toBuffer();

  // Only replace if smaller — re-running on already-compressed files
  // shouldn't grow them.
  if (buf.length < before) {
    fs.writeFileSync(f, buf);
  }
  const after = fs.statSync(f).size;
  afterTotal += after;
  const pct = (((before - after) / before) * 100).toFixed(0);
  console.log(`  ${path.basename(f)}  ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB  (-${pct}%)`);
}

console.log(
  `\nTotal: ${(beforeTotal / 1024 / 1024).toFixed(1)} MB → ${(afterTotal / 1024 / 1024).toFixed(1)} MB  (saved ${(((beforeTotal - afterTotal) / beforeTotal) * 100).toFixed(0)}%)`,
);

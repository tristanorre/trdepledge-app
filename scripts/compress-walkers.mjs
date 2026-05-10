// One-off compressor for the hero walker PNGs in
// public/images/walkers/. Same pattern as compress-illustrations.mjs —
// palette quantise + max compression. The hero loads with `priority`
// so trimming these matters for LCP.
//
// Run: `node scripts/compress-walkers.mjs`. Idempotent (a second run
// won't grow files).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "..", "public", "images", "walkers");

const files = fs
  .readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .map((f) => path.join(dir, f));

let beforeTotal = 0, afterTotal = 0;
for (const f of files) {
  const before = fs.statSync(f).size;
  beforeTotal += before;
  const buf = await sharp(f)
    .png({ palette: true, quality: 85, compressionLevel: 9, effort: 10 })
    .toBuffer();
  if (buf.length < before) fs.writeFileSync(f, buf);
  const after = fs.statSync(f).size;
  afterTotal += after;
  const pct = (((before - after) / before) * 100).toFixed(0);
  console.log(`  ${path.basename(f)}  ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB  (-${pct}%)`);
}
console.log(
  `\nTotal: ${(beforeTotal / 1024 / 1024).toFixed(2)}MB → ${(afterTotal / 1024 / 1024).toFixed(2)}MB  (saved ${(((beforeTotal - afterTotal) / beforeTotal) * 100).toFixed(0)}%)`,
);

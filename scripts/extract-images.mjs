// One-shot extraction of base64 images from the approved prototype HTML
// into /public/images/. Run: node scripts/extract-images.mjs <path-to-html>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "public", "images");

const inputArg = process.argv[2];
if (!inputArg) {
  console.error("Usage: node scripts/extract-images.mjs <path-to-prototype.html>");
  process.exit(1);
}
const html = fs.readFileSync(path.resolve(inputArg), "utf8");
fs.mkdirSync(outDir, { recursive: true });

// Order in the prototype document (verified via line counts):
//   1326: 1  hero portrait (Thomas arms folded)
//   1334: 4  hero carousel slides 1-4
//   1409: 1  doug strip left
//   1410: 1  doug strip right
//   1422: 1  about snippet (home page)
//   1677: 2  services page poster cards (yard-revamps + landscaping)
//   1867: 1  about page (Thomas + Doug, "team that turns heads")
//   1961: 8  gallery items
const slotsInOrder = [
  "thomas-portrait",
  "carousel-1", "carousel-2", "carousel-3", "carousel-4",
  "doug-1", "doug-2",
  "about-snippet",
  "service-yard-revamps", "service-landscaping",
  "about-thomas-doug",
  "gallery-1", "gallery-2", "gallery-3", "gallery-4",
  "gallery-5", "gallery-6", "gallery-7", "gallery-8",
];

// Tokenized scan instead of `String.matchAll`, which can mis-track lastIndex
// on multi-MB single-line strings like ours.
const PREFIX = "data:image/";
const images = [];
let i = 0;
while (i < html.length) {
  const start = html.indexOf(PREFIX, i);
  if (start === -1) break;
  const semi = html.indexOf(";base64,", start);
  if (semi === -1) { i = start + PREFIX.length; continue; }
  const mime = html.slice(start + PREFIX.length, semi);
  const dataStart = semi + ";base64,".length;
  // Adjacent images in the prototype have no separator (the base64 payload
  // butts directly against the next `data:image/...` start), and the chars
  // d, a, t, a are all valid base64. So we must also break on a
  // `data:image/` lookahead to avoid swallowing the next image.
  let end = dataStart;
  while (end < html.length) {
    const c = html.charCodeAt(end);
    const isBase64 =
      (c >= 65 && c <= 90)  ||  // A-Z
      (c >= 97 && c <= 122) ||  // a-z
      (c >= 48 && c <= 57)  ||  // 0-9
      c === 43 || c === 47 || c === 61; // + / =
    if (!isBase64) break;
    if (c === 100 /* d */ && html.startsWith("data:image/", end)) break;
    end++;
  }
  if (end > dataStart) {
    images.push({ mime, b64: html.slice(dataStart, end) });
  }
  i = end;
}

if (images.length !== slotsInOrder.length) {
  console.warn(
    `Found ${images.length} images, expected ${slotsInOrder.length}. ` +
    `Slot mapping may need review.`
  );
}

images.forEach((img, idx) => {
  const ext = img.mime === "jpeg" ? "jpg"
            : img.mime === "svg+xml" ? "svg"
            : img.mime;
  const slot = slotsInOrder[idx] ?? `image-${idx + 1}`;
  const filename = `${slot}.${ext}`;
  const buf = Buffer.from(img.b64, "base64");
  fs.writeFileSync(path.join(outDir, filename), buf);
  console.log(`  ${filename}  (${(buf.length / 1024).toFixed(1)} KB)`);
});

console.log(`\nExtracted ${images.length} images to ${outDir}`);

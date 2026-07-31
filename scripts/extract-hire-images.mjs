// One-shot extraction of the base64 images from the approved DIY Hire
// prototype into /public/hire/.
//
//   node scripts/extract-hire-images.mjs <path-to-trdepledge-hire.html>
//
// Unlike scripts/extract-images.mjs (which walks the marketing prototype in
// document order), this one keys off the prototype's own JS object literals
// and a couple of class names. That's deliberate: the hire prototype names
// every image, so we can map them to slugs by name rather than by counting
// positions and hoping the order never changes.
//
// Output filenames match the `photo_path` / `flyer_path` values seeded in
// the equipment table. If you rename anything here, update the database.
//
// The source images are already WebP, so they're written through untouched.
// They are two compression generations deep (cropped from flyer JPEGs, then
// re-encoded) — Thomas has been asked for the Canva originals to re-export.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "public", "hire");

const inputArg = process.argv[2];
if (!inputArg) {
  console.error("Usage: node scripts/extract-hire-images.mjs <path-to-prototype.html>");
  process.exit(1);
}
const html = fs.readFileSync(path.resolve(inputArg), "utf8");
fs.mkdirSync(outDir, { recursive: true });

// Prototype's internal id → the slug used in the equipment table.
const TOOL_SLUGS = {
  mixer: "cement-mixer",
  digger: "post-hole-digger",
  hammer: "demolition-hammer",
  compactor: "wacker-packer",
  roller: "lawn-roller",
  mower: "lawn-mower",
};

const DATA_URI = /data:image\/webp;base64,([A-Za-z0-9+/=]+)/;

/** Pull the `key:'data:…'` entries out of a `const NAME = { … };` literal. */
function entriesFromObjectLiteral(name) {
  const start = html.indexOf(`const ${name}`);
  if (start === -1) throw new Error(`Could not find "const ${name}" in the prototype`);
  const open = html.indexOf("{", start);
  const close = html.indexOf("};", open);
  const body = html.slice(open, close);

  const out = {};
  // Keys are bare identifiers in the prototype: `digger:'data:…'`.
  for (const m of body.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*'(data:image\/webp;base64,[A-Za-z0-9+/=]+)'/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/**
 * First data URI following a literal markup snippet.
 *
 * Matches on the full `class="…"` attribute rather than the bare class name,
 * because the bare name also appears in the stylesheet — and the stylesheet
 * comes first in the document, so a loose match silently returns whichever
 * image happens to appear after the CSS rule instead of the intended one.
 */
function dataUriAfter(snippet) {
  const idx = html.indexOf(snippet);
  if (idx === -1) throw new Error(`Could not find ${snippet} in the prototype markup`);
  const m = html.slice(idx).match(DATA_URI);
  if (!m) throw new Error(`No WebP data URI after ${snippet}`);
  return m[0];
}

/** `const NAME = 'data:…'` — used for the single Doug avatar. */
function dataUriFromConst(name) {
  const idx = html.indexOf(`const ${name}`);
  if (idx === -1) throw new Error(`Could not find "const ${name}"`);
  const m = html.slice(idx).match(DATA_URI);
  if (!m) throw new Error(`No WebP data URI for const ${name}`);
  return m[0];
}

const written = [];
function write(filename, dataUri) {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  const buf = Buffer.from(base64, "base64");
  const dest = path.join(outDir, filename);
  fs.writeFileSync(dest, buf);
  written.push(`${filename}  ${(buf.length / 1024).toFixed(1)} KB`);
}

// Equipment photography — one per catalogue card.
const photos = entriesFromObjectLiteral("IMG");
for (const [id, slug] of Object.entries(TOOL_SLUGS)) {
  if (!photos[id]) throw new Error(`Prototype IMG map has no entry for "${id}"`);
  write(`${slug}.webp`, photos[id]);
}

// Flyers — lightbox spec sheets. The mower has none; that's expected.
const flyers = entriesFromObjectLiteral("FLYER");
for (const [id, dataUri] of Object.entries(flyers)) {
  const slug = TOOL_SLUGS[id];
  if (!slug) throw new Error(`Prototype FLYER map has an unknown id "${id}"`);
  write(`flyer-${slug}.webp`, dataUri);
}

// Brand furniture. The prototype's logo already has its dark background
// knocked out, which is why it's lifted rather than re-derived.
// One logo asset, four jobs. The prototype embeds the identical WebP as the
// favicon, the masthead crest, the hero artwork and the footer mark, so we
// write it once and point all four at it rather than shipping 59 KB four
// times. (Verified: those four data URIs are byte-identical.)
write("logo-hire.webp", dataUriAfter('class="crest-logo"'));

// Doug's avatar. Not used until phase 7, but it lives in this prototype and
// extracting it now means the prototype isn't needed again.
write("doug.webp", dataUriFromConst("DOUG_IMG"));

console.log(`Wrote ${written.length} images to public/hire/`);
for (const line of written.sort()) console.log(`  ${line}`);

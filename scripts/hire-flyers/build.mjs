/**
 * DIY Hire flyer generator.
 *
 *   npm run build            # once, so next/font has emitted the woff2 files
 *   node scripts/hire-flyers/build.mjs                 # all flyers
 *   node scripts/hire-flyers/build.mjs lawn-mower      # just one
 *
 * Writes public/hire/flyer-<slug>.webp at 640x960, the size the printed set
 * uses.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY IT RENDERS THROUGH CHROMIUM
 *
 * The flyers have to sit next to ones already printed, so "close enough"
 * typography would show. Rather than approximate Anton and Barlow, this
 * resolves the actual woff2 files next/font emits into .next and points the
 * template at them — the same bytes the hire page serves. That does mean a
 * production build has to have run first; the script says so rather than
 * silently falling back to a system font, because a fallback would look
 * almost right and that is the worst outcome.
 *
 * The 2x render is downsampled to 640x960 in a canvas, so the webp encode
 * and the resize both happen in the browser and this stays a dependency-free
 * Node script.
 * ─────────────────────────────────────────────────────────────────────
 *
 * RATES ARE NOT READ FROM THE DATABASE. They're written below and printed
 * on every run so a stale one is visible. `equipment.daily_rate` is the
 * source of truth for what a customer is charged — if you change a rate,
 * change it there and re-render here.
 */
import { chromium } from "@playwright/test";
import { readFile, writeFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.join(ROOT, "public", "hire");
const PHONE = "0474 844 204";

const FLYERS = {
  "lawn-mower": {
    rate: "$50",
    title: ["Lawn", "Mower"],
    pill: "Catcher included · Easy to use · Ready to go",
    blurb: "Catcher mower for a block that has got away from you. Goes out fuelled and sharpened.",
    art: "lawn-mower.webp",
    // The only picture of this mower is an illustration on a white ground
    // with the figure's boot in frame. Knocked out and trimmed at render.
    keyOutWhite: true,
    cropLeft: 58,
    artStyle: "max-width:96%;max-height:330px;object-fit:contain;filter:drop-shadow(0 18px 26px rgba(0,0,0,.75))",
    feats: [
      { icon: "bag", h: "Catcher included", p: "Bag the clippings or drop them, your call." },
      { icon: "height", h: "Height adjustable", p: "Drop it low for a tidy finish or lift it for long grass." },
      { icon: "grass", h: "Handles long grass", p: "Gets through a block that has been left a while." },
      { icon: "engine", h: "Fuelled and sharp", p: "Goes out with a full tank and a sharpened blade." },
    ],
    uses: [
      { icon: "house", h: "Home lawns", p: "Front and back in an afternoon." },
      { icon: "grass", h: "Overgrown yards", p: "Blocks that have got away from you." },
      { icon: "leaf", h: "Rentals & sales", p: "Tidy up before an inspection." },
      { icon: "plus", h: "Between visits", p: "Keep on top of it your own way." },
    ],
  },

  "wacker-packer": {
    rate: "$80",
    title: ["Wacker", "Packer"],
    pill: "Plate compactor · 6.5hp · Built tough",
    blurb: "Beds down soil, sand and gravel before paving. A firm, level base in a couple of passes.",
    art: "wacker-packer.webp",
    artStyle: "max-width:100%;max-height:340px;object-fit:contain;filter:drop-shadow(0 18px 26px rgba(0,0,0,.75))",
    feats: [
      { icon: "shield", h: "Powerful compaction", p: "Ideal for soil, sand, gravel and paving prep." },
      { icon: "engine", h: "6.5hp engine", p: "Simple controls and quick to start." },
      { icon: "deck", h: "Firm, level base", p: "Beds down in a couple of passes." },
      { icon: "clock", h: "Saves time", p: "Gets the job done faster than by hand." },
    ],
    uses: [
      { icon: "slope", h: "Compacting soil", p: "Prepares ground for paving or turf." },
      { icon: "path", h: "Sand", p: "Beds sand for pavers and slabs." },
      { icon: "scrub", h: "Gravel", p: "A firm base for driveways and paths." },
      { icon: "roll", h: "Paving prep", p: "A level finish that lasts." },
    ],
  },
};

/**
 * Find the woff2 files next/font emitted, by reading the @font-face rules it
 * wrote into the built CSS.
 *
 * The filenames are content hashes, so they change on any font or Next
 * upgrade — hard-coding them would rot silently. Weight AND style are both
 * matched because Barlow ships an italic at every weight, and picking one of
 * those by hash sets the whole flyer in italic. (Ask me how I know.)
 */
async function resolveFonts() {
  const cssDir = path.join(ROOT, ".next", "static", "css");
  if (!existsSync(cssDir)) {
    throw new Error(
      "No .next build found. Run `npm run build` first — the flyers are set " +
        "in the fonts next/font emits, and there is no acceptable fallback.",
    );
  }

  const faces = [];
  for (const file of await readdir(cssDir)) {
    if (!file.endsWith(".css")) continue;
    const css = await readFile(path.join(cssDir, file), "utf8");
    for (const [, body] of css.matchAll(/@font-face\{(.*?)\}/g)) {
      const family = body.match(/font-family:\s*'?([^;']+)'?/)?.[1] ?? "";
      const url = body.match(/url\(([^)]+)\)/)?.[1];
      if (!url || family.includes("Fallback")) continue;
      faces.push({
        family,
        url,
        weight: body.match(/font-weight:\s*([^;]+)/)?.[1]?.trim() ?? "400",
        style: body.match(/font-style:\s*([^;]+)/)?.[1]?.trim() ?? "normal",
      });
    }
  }

  const pick = (test, weight) => {
    const hits = faces.filter(
      (f) => test(f.family) && f.weight === weight && f.style === "normal",
    );
    if (!hits.length) throw new Error(`no font face for weight ${weight}`);
    // Prefer the latin subset next/font marks with `.p.` — it carries the
    // characters a flyer actually uses.
    const chosen = hits.find((f) => f.url.includes("-s.p.")) ?? hits[0];
    return "file://" + path.join(ROOT, ".next", chosen.url.replace("/_next/", ""));
  };

  const isCond = (f) => f.includes("Barlow_Condensed");
  return {
    __FONT_ANTON__: pick((f) => f.includes("Anton"), "400"),
    __FONT_COND_700__: pick(isCond, "700"),
    __FONT_COND_600__: pick(isCond, "600"),
    __FONT_BARLOW_400__: pick((f) => f.includes("Barlow") && !isCond(f), "400"),
    __FONT_BARLOW_600__: pick((f) => f.includes("Barlow") && !isCond(f), "600"),
  };
}

const targets = process.argv.slice(2);
const keys = targets.length ? targets : Object.keys(FLYERS);
for (const k of keys) if (!FLYERS[k]) throw new Error(`no flyer defined for "${k}"`);

const fonts = await resolveFonts();
let template = await readFile(path.join(HERE, "flyer.html"), "utf8");
for (const [token, url] of Object.entries(fonts)) template = template.replaceAll(token, url);

/**
 * Photos go in as data URLs rather than file:// paths.
 *
 * The page lives in a temp dir and the photos in public/, which Chromium
 * treats as different origins — enough to taint the canvas and break the
 * white-key and the webp encode. Inlining sidesteps it without launching
 * the browser with --allow-file-access-from-files, which is a bigger hammer
 * than a flyer script has any business swinging. Fonts stay on file://:
 * they don't taint anything.
 */
async function dataUrl(file) {
  const bytes = await readFile(file);
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}

// The page is written to a temp file rather than pushed in with setContent,
// so it has a real file:// origin and can load the fonts.
const work = await mkdtemp(path.join(tmpdir(), "hire-flyer-"));
const pagePath = path.join(work, "flyer.html");
await writeFile(pagePath, template);

const browser = await chromium.launch(
  existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {},
);
const page = await browser.newPage({ viewport: { width: 640, height: 960 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("  page error:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.error("  console:", m.text()); });

try {
  for (const key of keys) {
    const flyer = FLYERS[key];
    const crest = await dataUrl(path.join(OUT, "logo-hire.webp"));
    const art = await dataUrl(path.join(OUT, flyer.art));
    await page.goto("file://" + pagePath);
    await page.evaluate((d) => window.render(d), { ...flyer, phone: PHONE, crest, art });
    await page.evaluate(() => document.fonts.ready);

    // Guards, because a flyer that is subtly wrong still gets printed.
    const problems = await page.evaluate(() => {
      const f = document.querySelector(".flyer");
      const art = document.getElementById("art");
      const out = [];
      const spill = f.scrollHeight - f.clientHeight;
      if (spill > 0) out.push(`content overflows the page by ${spill}px`);
      if (!art.complete || !art.naturalWidth) out.push("art image did not load");
      return out;
    });
    if (problems.length) throw new Error(`${key}: ${problems.join("; ")}`);

    const shot = await page.screenshot({ type: "png" });

    // Downsample 1280x1920 -> 640x960 and encode webp, both in the browser.
    const encoded = await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = "data:image/png;base64," + b64;
      });
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 960;
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, 640, 960);
      return c.toDataURL("image/webp", 0.92);
    }, shot.toString("base64"));

    const dest = path.join(OUT, `flyer-${key}.webp`);
    const bytes = Buffer.from(encoded.split(",")[1], "base64");
    await writeFile(dest, bytes);
    console.log(`flyer-${key}.webp  ${flyer.rate}/day  ${(bytes.length / 1024) | 0}kB`);
  }
  console.log("\nRates above are from this script, not the database — check they still match equipment.daily_rate.");
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
}

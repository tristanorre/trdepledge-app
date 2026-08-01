# DIY Hire flyer generator

Renders `public/hire/flyer-<slug>.webp` at 640×960 — the size of the set
Thomas has printed — so a new tool, or a changed rate, doesn't need the
original artwork reopening.

```bash
npm run build            # once: next/font has to have emitted the woff2 files
npm run hire-flyers      # all flyers
node scripts/hire-flyers/build.mjs lawn-mower    # just one
```

## What's here

| File | |
|---|---|
| `flyer.html` | The template. Layout, the icon set, and the white-key for cut-out artwork. |
| `build.mjs` | Flyer copy and rates, font resolution, render, guards. |
| `recolour-to-brand.py` | One-off: rotates red plant to the DIY Hire yellow. |

## Things worth knowing before you change it

**It uses the site's own fonts.** `build.mjs` reads the `@font-face` rules
out of the built CSS and points the template at the actual woff2 files
`next/font` emitted, so flyers are set in the same Anton and Barlow as the
hire page rather than something similar. The filenames are content hashes,
which is why they're resolved rather than hard-coded. No build, no flyer —
it refuses rather than falling back to a system font, because a fallback
looks *almost* right, and that's worse than an obvious failure.

**Rates live in this script, not the database.** `equipment.daily_rate` is
what a customer is actually charged; the number here is just ink. Every run
prints the rate it used so a stale one is visible. Change the rate in the
database first, then re-render.

**It refuses to ship a broken flyer.** After rendering it checks that
nothing overflows the page and that the artwork actually loaded, and throws
rather than writing the file. The first draft of these flyers was 98px too
tall and had silently cut the phone number off the bottom.

**Photos are inlined as data URLs.** The page renders from a temp directory,
so `file://` images in `public/` count as cross-origin and taint the canvas
— which breaks both the white-key and the webp encode. Inlining avoids
launching Chromium with `--allow-file-access-from-files`.

## Artwork

Product shots want to be on a dark ground with the tool in DIY Hire yellow,
matching the printed set. Two helpers exist for artwork that isn't:

- `keyOutWhite` / `cropLeft` in a flyer's entry knock a white studio
  background out at render time and trim the result. Used for the lawn
  mower, whose only image is an illustration with a boot in frame.
- `recolour-to-brand.py` rotates red bodywork to the brand yellow, keying on
  hue *and* saturation so greys, greens and chrome are left alone. Run it
  once against a new photo of a red machine; it's idempotent.

Neither is a substitute for a real photo of the actual tool.

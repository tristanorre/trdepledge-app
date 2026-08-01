#!/usr/bin/env python3
"""Recolour red plant to the DIY Hire yellow.

Every tool in the printed flyer set is yellow — mixer, digger, hammer,
roller, slasher. Two of the photos we hold were of red machines, which made
their cards and flyers look like a different company's gear.

This rotates red hues to the brand yellow while leaving everything else
alone: greens (grass), greys (engines, handles) and anything desaturated
are untouched, because the mask is keyed on hue AND saturation rather than
on "looks reddish". Luminance is preserved, so highlights and shadows on
the bodywork still read as the same photograph.

Run from the repo root:

    python3 scripts/hire-flyers/recolour-to-brand.py

Idempotent: re-running finds no red left and reports zero pixels changed.
"""

import colorsys
import sys
from pathlib import Path

from PIL import Image

# Targets, relative to the repo root. Both are product shots on dark ground.
TARGETS = [
    "public/hire/lawn-mower.webp",
    "public/hire/wacker-packer.webp",
]

# The flyers' yellow, #ffd400, as a hue in the 0-1 space colorsys uses.
BRAND_HUE = 0.1385

# Reds sit either side of hue 0, so the mask wraps.
RED_BAND = 0.075          # +/- around 0, about +/-27 degrees
MIN_SATURATION = 0.20     # leave greys, chrome and shadow alone
MIN_VALUE = 0.09          # leave near-black alone; recolouring it adds noise


def recolour(path: Path) -> int:
    im = Image.open(path)
    had_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
    im = im.convert("RGBA" if had_alpha else "RGB")
    px = im.load()
    changed = 0

    for y in range(im.height):
        for x in range(im.width):
            pixel = px[x, y]
            r, g, b = pixel[0], pixel[1], pixel[2]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < MIN_SATURATION or v < MIN_VALUE:
                continue
            if not (h <= RED_BAND or h >= 1 - RED_BAND):
                continue

            # Keep the pixel's own saturation and value — only the hue moves,
            # so the bodywork keeps its modelling instead of going flat.
            nr, ng, nb = colorsys.hsv_to_rgb(BRAND_HUE, s, v)
            out = (round(nr * 255), round(ng * 255), round(nb * 255))
            px[x, y] = out + (pixel[3],) if had_alpha else out
            changed += 1

    if changed:
        im.save(path, "WEBP", quality=92, method=6)
    return changed


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    for rel in TARGETS:
        path = root / rel
        if not path.exists():
            print(f"missing: {rel}", file=sys.stderr)
            return 1
        n = recolour(path)
        print(f"{rel}: {n} pixels recoloured")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

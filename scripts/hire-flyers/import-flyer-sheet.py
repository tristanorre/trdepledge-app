#!/usr/bin/env python3
"""Bring Thomas's printed flyer sheet into the site.

He supplies the flyers as one composite image with several panels on it.
This cuts them apart into the per-item flyers the hire page links to, and
lifts the product shot out of each panel to use as the card photo — so the
card and the flyer show the same machine, which they hadn't been.

    python3 scripts/hire-flyers/import-flyer-sheet.py <sheet.png>

WHY THE CARD PHOTOS COME OUT OF THE FLYERS

Because otherwise they drift. The cards were showing an orange auger and a
blue breaker while the flyers showed yellow ones, and two of them had the
old flyer's own text baked into the crop — visible on the live page. Taking
both from one source makes that class of mistake impossible.

RESOLUTION IS THE PRICE

Panels on the sheet are around 390x590, against the 640x960 the printed
flyers use, so everything here is upscaled and softer than a native export
would be. That's accepted deliberately: the flyers this replaces quote
rates that are no longer true, and a soft flyer with the right price beats
a sharp one with the wrong one. Supply full-size exports and re-run this —
the boxes below are the only thing that would need revisiting.

Coordinates are for the 1298x1212 sheet. If the sheet is re-exported at a
different size the script says so rather than cutting garbage.
"""

import sys
from pathlib import Path

from PIL import Image, ImageFilter

SHEET_SIZE = (1298, 1212)

# Panel boundaries on the sheet.
PANELS = {
    "cement-mixer": (19, 15, 417, 606),
    "post-hole-digger": (447, 17, 836, 606),
    "demolition-hammer": (876, 17, 1279, 601),
    "lawn-roller": (230, 645, 592, 1212),
    "deutscher-slasher": (630, 645, 1015, 1212),
}

# The machine within each panel, in panel-local coordinates. Kept clear of
# the headings and the feature lists — a card showing half a sentence of
# flyer copy is exactly the defect this is fixing.
PRODUCT = {
    "cement-mixer": (180, 172, 398, 398),
    "post-hole-digger": (185, 165, 389, 400),
    # Left edge starts past the DAILY RATE block, which sits at x<140
    # on this panel; the feature list below starts at y>305.
    "demolition-hammer": (163, 188, 403, 302),
    "lawn-roller": (138, 194, 362, 386),
    "deutscher-slasher": (168, 201, 385, 365),
}

# Parts of a machine that disappear against the flyer's black ground, and
# the ellipse to repaint them in. The roller's drum is charcoal on near
# black — on the card it read as a floating yellow handle with nothing
# attached. Brand yellow is what the rest of the floor already wears.
#
# Panel-local coordinates, applied BEFORE the panel is cut up, so the flyer
# and the card photo can't end up disagreeing about what colour the tool is.
# A polygon, not a box or an ellipse: the drum is a cylinder seen end-on
# and neither shape fits it — an inscribed ellipse leaves its corners grey,
# a box paints the background either side. Traced off the panel.
TINT_TO_BRAND = {
    "lawn-roller": [
        (146, 316), (158, 299), (236, 290), (266, 302),
        (272, 350), (250, 383), (172, 393), (149, 373),
    ],
}

# Inside the polygon, only pixels this bright are repainted. The drum's
# shadowed underside is as dark as the backdrop, and letting it fade out
# rather than cutting it at the polygon edge is what stops the tint reading
# as a sticker laid over the photo.
TINT_MIN_VALUE = 0.16

BRAND_HUE = 0.1385      # #ffd400, same figure recolour-to-brand.py uses
BRAND_SATURATION = 0.88

# The house flyer size, matching the ones already printed.
FLYER_SIZE = (640, 960)
CARD_WIDTH = 560


def tint_to_brand(panel: Image.Image, polygon: list) -> int:
    """Repaint a part of the machine in brand yellow.

    Masked by a traced polygon, with a brightness floor inside it so the
    drum's shadowed edge fades out instead of stopping dead on the outline.
    Existing yellow is skipped so the handle crossing the drum keeps its own
    shading instead of being flattened into it.

    Only the hue and saturation are imposed; the pixel's own brightness is
    kept (lifted a little, since charcoal is too dark to read as yellow at
    all). That preserves the sheen along the drum, so it still looks like a
    photographed cylinder rather than a yellow blob.
    """
    import colorsys

    from PIL import ImageDraw

    mask = Image.new("1", panel.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=1)
    mpx = mask.load()
    px = panel.load()
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    changed = 0

    for y in range(min(ys), max(ys) + 1):
        for x in range(min(xs), max(xs) + 1):
            if not mpx[x, y]:
                continue
            r, g, b = px[x, y][:3]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if v < TINT_MIN_VALUE:
                continue
            if s > 0.30 and 0.08 < h < 0.20:
                continue  # already brand yellow — the handle
            nv = min(1.0, 0.20 + v * 0.80)
            nr, ng, nb = colorsys.hsv_to_rgb(BRAND_HUE, BRAND_SATURATION, nv)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255))
            changed += 1
    return changed


def import_sheet(sheet: Image.Image, out: Path) -> None:
    for slug, box in PANELS.items():
        panel = sheet.crop(box)
        if slug in TINT_TO_BRAND:
            print(f"{slug}: {tint_to_brand(panel, TINT_TO_BRAND[slug])} px tinted to brand yellow")
        flyer = panel.resize(FLYER_SIZE, Image.LANCZOS)
        flyer.save(out / f"flyer-{slug}.webp", "WEBP", quality=90, method=6)
        print(f"flyer-{slug}.webp      from {panel.size[0]}x{panel.size[1]}")

        if slug not in PRODUCT:
            continue
        shot = panel.crop(PRODUCT[slug])
        card = shot.resize(
            (CARD_WIDTH, round(CARD_WIDTH * shot.height / shot.width)), Image.LANCZOS
        )
        # A touch of sharpening back after a 2-3x upscale. Not magic, but it
        # stops the tools looking like they were photographed through a
        # window.
        card = card.filter(ImageFilter.UnsharpMask(radius=1.4, percent=70, threshold=3))
        card.save(out / f"{slug}.webp", "WEBP", quality=90, method=6)
        print(f"{slug}.webp           from {shot.size[0]}x{shot.size[1]}")


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    sheet = Image.open(sys.argv[1]).convert("RGB")
    if sheet.size != SHEET_SIZE:
        print(
            f"Sheet is {sheet.size[0]}x{sheet.size[1]}, expected "
            f"{SHEET_SIZE[0]}x{SHEET_SIZE[1]}. The panel boxes are pixel "
            f"coordinates on that exact sheet — re-measure them before "
            f"running against a different export.",
            file=sys.stderr,
        )
        return 1

    out = Path(__file__).resolve().parents[2] / "public" / "hire"
    import_sheet(sheet, out)
    print("\nCheck the rates on the new flyers still match equipment.daily_rate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

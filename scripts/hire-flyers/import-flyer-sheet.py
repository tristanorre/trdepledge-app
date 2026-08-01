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
    # Whole auger: engine at y=158 down to the spiral tip, which a row scan
    # puts at y=422 — stopping at 418 drops the lime rule of the "what it
    # can be used for" heading, at the cost of a few pixels of spiral tip.
    # The rate block and feature list are left of x=130, so only the
    # "hire the tools" bar needs painting out — see ERASE_RECTS.
    "post-hole-digger": (146, 158, 389, 418),
    # Left edge starts past the DAILY RATE block, which sits at x<140
    # on this panel; the feature list below starts at y>305.
    # The breaker runs corner to corner THROUGH the rate block and the
    # feature list, so no rectangle contains the whole tool and nothing
    # else. Everything bright that is not connected to the tool is
    # erased first — see ISOLATE below.
    "demolition-hammer": (14, 163, 403, 426),
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

# Where a tool overlaps the flyer's own furniture, the furniture is erased
# rather than the tool cropped. Keyed by a seed point ON the tool: every
# bright run connected to that seed is kept, everything else bright inside
# the box is painted out with the panel's own dark ground.
#
# Seeded rather than "keep the biggest blob", because the DAILY RATE panel
# is a solid yellow rectangle and quite capable of being the biggest blob
# on the page.
# Flyer furniture to paint out of a CARD crop, where the tool overlaps it.
#
# The breaker runs corner to corner across its panel, straight through the
# rate block and the feature list, so no rectangle holds the whole tool and
# nothing else. These are painted with the panel's own dark ground.
#
# The bounds are not eyeballed. A connected-component pass over the bright
# pixels gave every object's bbox, and each rectangle below is checked to
# fall in the gaps between them:
#
#   tool   body (225,164)-(397,297)   collar (141,267)-(221,337)
#          chisel (14,334)-(126,412)  handles (174,185)-(236,238), (382,179)-(402,249)
#   junk   crest strip (20,163)-(162,176)   rate block (14,214)-(140,324)
#          feature icons/text x>=242 y>=317   uses bar (37,422)-(197,425)
#
# Erasing by brightness instead was tried and leaves ghosts: the letters go
# but their anti-aliased edges sit under any sensible threshold, so the card
# shows a shadow of "DAILY RATE $50".
ERASE_RECTS = {
    # Just the right-hand end of the crest's "hire the tools" bar, which
    # reaches x=170 and so pokes into the left of the auger's crop. The
    # tool's own pixels on those rows start at x=171.
    "post-hole-digger": [(138, 150, 171, 182)],
    "demolition-hammer": [
        # x<173 throughout: the front handle starts at x=174 and the body at
        # x=225, so this clears the whole crest without touching either.
        (8, 148, 173, 214),
        # Rate block including the PER DAY bar. Row scan: the block's bright
        # pixels run to y=338, and the chisel's first bright pixel on any row
        # is x=106 at y=341 — so stopping at x=139, y=341 misses it.
        (8, 196, 139, 341),
        (230, 302, 403, 426),  # feature list, starting below the body (y<=297)
        (8, 414, 232, 426),    # "what it can be used for" bar, below the tip (y<=412)
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


def erase_furniture(panel: Image.Image, rects: list) -> int:
    """Paint flyer furniture out of a card crop with the panel's own ground.

    Flat fill plus grain, sampled from the darkest pixels around the tool, so
    the patch matches the speckled backdrop the photograph was shot on.
    """
    import colorsys
    import random
    import statistics

    px = panel.load()
    dark = [
        px[x, y][:3]
        for y in range(0, panel.height, 3)
        for x in range(0, panel.width, 3)
        if colorsys.rgb_to_hsv(*[c / 255 for c in px[x, y][:3]])[2] < 0.08
    ]
    base = tuple(int(statistics.median(c[i] for c in dark)) for i in range(3))
    rng = random.Random(11)

    painted = 0
    for x0, y0, x1, y1 in rects:
        for y in range(y0, min(y1, panel.height)):
            for x in range(x0, min(x1, panel.width)):
                j = rng.gauss(0, 2)
                px[x, y] = tuple(max(0, min(255, int(base[i] + j))) for i in range(3))
                painted += 1
    return painted


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

        # Erasing the flyer's furniture is for the CARD only — the flyer
        # itself obviously has to keep its rate block and feature list. Done
        # on a copy for exactly that reason; doing it in place stripped the
        # $50 off the printed hammer flyer.
        source = panel
        if slug in ERASE_RECTS:
            source = panel.copy()
            n = erase_furniture(source, ERASE_RECTS[slug])
            print(f"{slug}: {n} px of flyer furniture painted out, card only")

        shot = source.crop(PRODUCT[slug])
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

#!/usr/bin/env python3
"""Take the manufacturer's branding off the lawn mower photo.

Thomas hires the machine out; the flyer and the card shouldn't advertise
whoever built it. Four marks come off:

    console  badge on the handle console
    bag      the printed wordmark on the catcher
    engine   the badge on the engine cover
    deck     the badge on the deck

Safety decals are deliberately LEFT ALONE. They're generic, they belong on
the machine, and painting them out would make the photo say something
untrue about the tool.

Two techniques, because the marks aren't the same kind of thing:

  * The catcher wordmark is white ink printed straight onto black fabric,
    so only the bright pixels are removed and the mesh texture around them
    survives. A box fill there would leave a flat rectangle on a textured
    bag.
  * The three badges are physical plates. The whole plate goes, box and
    all, because removing just its lettering would leave an empty badge —
    obviously retouched.

Both are filled by growing the surrounding pixels inward, which keeps the
local gradient rather than stamping on an average colour.

    python3 scripts/hire-flyers/debrand-lawn-mower.py <source.png> <dest.webp>

Not idempotent: run it against the original photo, not its own output.
"""

import sys
from pathlib import Path

from PIL import Image, ImageFilter

# Boxes are (left, top, right, bottom) in the 1093x1123 source.
# Two boxes, not one. The rear wheel cuts into the bottom-right of the
# wordmark, and its silver hub is every bit as bright as the white ink — a
# single rectangle masks the wheel too and fills it in with black fabric.
# These stop short of it.
BRIGHT_MASK = {
    "bag-upper": ((150, 686, 252, 742), 110),
    "bag-lower": ((150, 742, 212, 842), 110),
}

# The source is a screenshot from a retailer's listing and carries their
# zoom control in the corner. Painted out to white before the background is
# keyed, so it simply becomes part of the background.
SCREENSHOT_ARTIFACTS = [(1040, 1050, 1093, 1110)]

# Smallest run of enclosed white treated as backdrop rather than a
# highlight. The gaps inside the handle frame are thousands of pixels; a
# glint on the chrome is a few dozen.
ENCLOSED_MIN_AREA = 150

BADGES = [
    ("console", (230, 236, 279, 261)),
    ("engine", (688, 693, 756, 735)),
    ("deck", (748, 912, 833, 945)),
]


def inpaint(im: Image.Image, mask: set) -> None:
    """Fill masked pixels by repeatedly averaging known neighbours.

    Grows the surrounding image inward one ring at a time, so a gradient
    across the hole is carried through instead of being flattened to the
    mean. Cheap, and at these sizes the quality is indistinguishable from
    anything cleverer.
    """
    px = im.load()
    todo = set(mask)
    while todo:
        filled = []
        for x, y in todo:
            acc, n = [0, 0, 0], 0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    p = (x + dx, y + dy)
                    if p in todo or p == (x, y):
                        continue
                    if not (0 <= p[0] < im.width and 0 <= p[1] < im.height):
                        continue
                    c = px[p]
                    acc[0] += c[0]
                    acc[1] += c[1]
                    acc[2] += c[2]
                    n += 1
            if n:
                filled.append(((x, y), (acc[0] // n, acc[1] // n, acc[2] // n, 255)))
        if not filled:
            break  # nothing left touching known pixels; shouldn't happen
        for p, c in filled:
            px[p] = c
            todo.discard(p)


def smooth(im: Image.Image, box: tuple, radius: float = 1.2) -> None:
    """Soften a filled area so it doesn't read as a patch of flat noise."""
    region = im.crop(box).filter(ImageFilter.GaussianBlur(radius))
    im.paste(region, box)


def fill_printed_mark(im: Image.Image, box: tuple, threshold: int) -> int:
    """Erase white ink printed onto the dark catcher.

    NOT done by growing neighbours inward, which is what the badges use.
    The lettering is anti-aliased against black, so it's ringed by mid-grey
    pixels; averaging inward drags those into the hole and leaves a pale
    ghost of the logo, tinted by whatever colour cast the fabric has. (It
    came out lavender.)

    Instead the mask is dilated past the halo and filled with the fabric's
    own median colour plus grain matched to its local variance. The bag is
    near-uniform at this scale, so it reads as plain black cloth rather
    than as a patch.
    """
    import random
    import statistics

    px = im.load()
    x0, y0, x1, y1 = box
    ink = {
        (x, y)
        for y in range(y0, y1)
        for x in range(x0, x1)
        if (px[x, y][0] + px[x, y][1] + px[x, y][2]) / 3 > threshold
    }

    # Dilate by 3 so the grey halo around each stroke goes too.
    mask = set()
    for x, y in ink:
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                p = (x + dx, y + dy)
                if x0 <= p[0] < x1 and y0 <= p[1] < y1:
                    mask.add(p)

    fabric = [
        px[x, y]
        for y in range(y0, y1)
        for x in range(x0, x1)
        if (x, y) not in mask and sum(px[x, y][:3]) / 3 < 90
    ]
    if not fabric:
        return 0
    base = tuple(int(statistics.median(c[i] for c in fabric)) for i in range(3))
    spread = max(2, int(statistics.pstdev(sum(c[:3]) / 3 for c in fabric)))

    rng = random.Random(7)  # fixed seed: same input, same output
    for x, y in mask:
        jitter = rng.gauss(0, spread * 0.5)
        px[x, y] = tuple(max(0, min(255, int(base[i] + jitter))) for i in range(3)) + (255,)

    smooth(im, box, 0.7)
    return len(ink)


def key_background(im: Image.Image) -> int:
    """Make the white studio backdrop transparent.

    Flood-filled from the border rather than thresholded on brightness:
    the mower has bright yellow panels and near-white highlights, and a
    global threshold punches holes straight through them. Only white that
    is CONNECTED to the edge of the frame is background.

    The boundary is then eroded by a pixel. The photo's edges are
    anti-aliased against white, so the outermost ring of the machine is a
    pale blend — left in place it draws a white halo around the whole tool
    on the dark card, which is worse than losing a hair off the outline.
    """
    px = im.load()
    w, h = im.size
    background = set()
    kept_white = set()
    stack = []

    def is_white(x, y):
        r, g, b, _ = px[x, y]
        return r > 225 and g > 225 and b > 225

    for x in range(w):
        for y in (0, h - 1):
            if is_white(x, y):
                stack.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_white(x, y):
                stack.append((x, y))

    while stack:
        x, y = stack.pop()
        if (x, y) in background:
            continue
        if not (0 <= x < w and 0 <= y < h) or not is_white(x, y):
            continue
        background.add((x, y))
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # The handle frame encloses areas of backdrop that the border fill can
    # never reach. Sweep them up by taking any REMAINING run of white big
    # enough to be backdrop rather than a highlight — a specular glint on
    # the chrome is small and rarely this pure, an enclosed panel of studio
    # white is thousands of pixels.
    for sy in range(h):
        for sx in range(w):
            if (sx, sy) in background or (sx, sy) in kept_white or not is_white(sx, sy):
                continue
            blob, work = set(), [(sx, sy)]
            while work:
                x, y = work.pop()
                if (x, y) in blob or (x, y) in background:
                    continue
                if not (0 <= x < w and 0 <= y < h) or not is_white(x, y):
                    continue
                blob.add((x, y))
                work.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
            if len(blob) >= ENCLOSED_MIN_AREA:
                background |= blob
            else:
                # Mark it seen so the sweep doesn't re-walk it every row.
                background |= set()
                for p in blob:
                    kept_white.add(p)

    # Grow one ring into the object to take the anti-aliased fringe with it.
    fringe = set()
    for x, y in background:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                p = (x + dx, y + dy)
                if 0 <= p[0] < w and 0 <= p[1] < h and p not in background:
                    fringe.add(p)

    for x, y in background | fringe:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
    return len(background) + len(fringe)


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    dest = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    if not src or not dest:
        print(__doc__)
        return 1

    im = Image.open(src).convert("RGBA")
    px = im.load()

    for name, ((x0, y0, x1, y1), threshold) in BRIGHT_MASK.items():
        print(f"{name}: {fill_printed_mark(im, (x0, y0, x1, y1), threshold)} ink pixels removed")

    for name, (x0, y0, x1, y1) in BADGES:
        mask = {(x, y) for y in range(y0, y1) for x in range(x0, x1)}
        inpaint(im, mask)
        smooth(im, (x0 - 2, y0 - 2, x1 + 2, y1 + 2), 1.1)
        print(f"{name}: {(x1 - x0) * (y1 - y0)} px badge removed")

    for box in SCREENSHOT_ARTIFACTS:
        for y in range(box[1], min(box[3], im.height)):
            for x in range(box[0], min(box[2], im.width)):
                px[x, y] = (255, 255, 255, 255)

    keyed = key_background(im)
    print(f"background: {keyed} px keyed out")

    im = im.crop(im.getbbox())
    im.save(dest, "WEBP", quality=92, method=6)
    print(f"wrote {dest} at {im.size[0]}x{im.size[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

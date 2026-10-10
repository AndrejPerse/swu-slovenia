"""Create icons for rare (named) bases, in the same shield shape as the hand-made 30 HP icons.

The frame is copied from assets/bases/<color>-30.png and the inside is filled with a crop of the
official card art. Hand-made icons for common bases are never overwritten.

Requires Pillow (pip install pillow). Run after tools/build_cards.py:
    python tools/build_base_icons.py
"""
import io
import json
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "assets" / "bases"
CARDS_JS = ROOT / "data" / "cards.js"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"

FRAME_WIDTH = 6           # px of the reference icon kept as the colored rim
ART_BAND = (0.075, 0.18, 0.94, 0.61)  # where the artwork sits on a base card (left, top, right, bottom)


def load_cards():
    text = CARDS_JS.read_text(encoding="utf-8")
    return json.loads(text[text.index("{"):text.rindex("}") + 1])


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as resp:
        return Image.open(io.BytesIO(resp.read())).convert("RGBA")


def erode(mask, px):
    return mask.filter(ImageFilter.MinFilter(px * 2 + 1))


def frame_for(color):
    if color:
        return Image.open(ICONS / f"{color.lower()}-30.png").convert("RGBA")
    # Colorless bases get a neutral grey version of the frame.
    ref = Image.open(ICONS / "green-30.png").convert("RGBA")
    grey = ImageOps.grayscale(ref).convert("RGBA")
    grey.putalpha(ref.getchannel("A"))
    return grey


def square_art(card):
    w, h = card.size
    left, top, right, bottom = ART_BAND
    band = card.crop((int(w * left), int(h * top), int(w * right), int(h * bottom)))
    bw, bh = band.size
    side = min(bw, bh)
    x = (bw - side) // 2
    return band.crop((x, 0, x + side, side))


def make_icon(card_art, color):
    frame = frame_for(color)
    size = frame.size
    mask = frame.getchannel("A").point(lambda a: 255 if a > 128 else 0)
    inner = erode(mask, FRAME_WIDTH)

    art = square_art(card_art).resize(size, Image.LANCZOS)
    icon = frame.copy()
    icon.paste(art, (0, 0), inner)

    # A thin dark line between rim and art keeps the edge crisp.
    edge = ImageChops.subtract(inner, erode(inner, 1))
    shade = Image.new("RGBA", size, (0, 0, 0, 150))
    icon.alpha_composite(Image.composite(shade, Image.new("RGBA", size, (0, 0, 0, 0)), edge))
    return icon


def main():
    bases = [b for b in load_cards()["bases"] if b["kind"] == "unique"]
    for base in bases:
        url = base["art"].replace("xxsmall_", "card_")
        icon = make_icon(download(url), base["color"])
        icon.save(ICONS / f"{base['id']}.png", optimize=True)
        print(f"  {base['id']}.png")
    print(f"Wrote {len(bases)} rare base icons to {ICONS}")


if __name__ == "__main__":
    main()

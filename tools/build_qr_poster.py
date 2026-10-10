"""Create a printable A4 poster (PNG + PDF) and a plain QR code that link to the league site.

Requires Pillow and segno (pip install pillow segno). Output goes to print/.
    python tools/build_qr_poster.py
"""
import io
from pathlib import Path

import segno
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "print"
LOGO = ROOT / "assets" / "logo.png"

URL = "https://andrejperse.github.io/swu-slovenia/"
SHOWN_URL = "andrejperse.github.io/swu-slovenia"
WEEKLY_LINE = "Weekly play every Monday at 17:30"

DPI = 300
WIDTH, HEIGHT = 2480, 3508  # A4 at 300 dpi
BAND = 1060                 # height of the black header band
YELLOW = (255, 232, 31)
BLACK = (5, 7, 13)
GREY = (90, 98, 112)


def font(size, weight="Bold"):
    try:
        f = ImageFont.truetype("bahnschrift.ttf", size)
        f.set_variation_by_name(weight)
        return f
    except (OSError, ValueError):
        return ImageFont.truetype("segoeuib.ttf" if weight == "Bold" else "segoeui.ttf", size)


def centered(draw, y, text, fnt, fill, spacing=0):
    if spacing:
        text = (" " * spacing).join(text)
    left, top, right, bottom = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((WIDTH - (right - left)) / 2 - left, y - top), text, font=fnt, fill=fill)
    return y + (bottom - top)


def qr_image(target_px):
    qr = segno.make(URL, error="q")
    modules = qr.symbol_size(scale=1, border=4)[0]
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=max(1, target_px // modules), border=4, dark="#000000", light="#ffffff")
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def poster():
    page = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(page)

    draw.rectangle((0, 0, WIDTH, BAND), fill=BLACK)
    draw.rectangle((0, BAND, WIDTH, BAND + 18), fill=YELLOW)
    logo = Image.open(LOGO).convert("RGBA").resize((380, 380), Image.LANCZOS)
    page.paste(logo, ((WIDTH - logo.width) // 2, 90), logo)
    y = centered(draw, 540, "SWU SLOVENIA", font(170), YELLOW)
    y = centered(draw, y + 50, "LEAGUE", font(78, "SemiBold"), (230, 236, 245), spacing=1)
    centered(draw, y + 70, "Standings  ·  Player history  ·  Meta  ·  Calendar", font(62, "SemiLight"), (160, 172, 192))

    centered(draw, BAND + 160, "Scan for the league standings", font(112), BLACK)
    code = qr_image(1500)
    top = BAND + 380
    page.paste(code, ((WIDTH - code.width) // 2, top))
    y = centered(draw, top + code.height + 70, SHOWN_URL, font(84, "SemiBold"), BLACK)
    centered(draw, y + 70, WEEKLY_LINE, font(66, "SemiLight"), GREY)
    return page


def main():
    OUT.mkdir(exist_ok=True)
    qr_image(1200).save(OUT / "swu-slovenia-qr.png", dpi=(DPI, DPI))
    page = poster()
    page.save(OUT / "league-poster-a4.png", dpi=(DPI, DPI))
    page.save(OUT / "league-poster-a4.pdf", resolution=DPI)
    print(f"Wrote poster and QR code to {OUT}")


if __name__ == "__main__":
    main()

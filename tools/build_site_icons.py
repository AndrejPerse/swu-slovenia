"""Create the browser-tab and home-screen icons from assets/logo.png.

Requires Pillow (pip install pillow). Run again if the logo changes:
    python tools/build_site_icons.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "assets" / "logo.png"
OUT = ROOT / "assets" / "icons"
BACKGROUND = (5, 7, 13, 255)  # the site's background color


def resized(logo, size):
    return logo.resize((size, size), Image.LANCZOS)


def on_background(logo, size, logo_share):
    """Logo centered on a solid square, for platforms that don't allow transparency (iOS)."""
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    inner = round(size * logo_share)
    offset = (size - inner) // 2
    canvas.alpha_composite(resized(logo, inner), (offset, offset))
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    logo = Image.open(LOGO).convert("RGBA")
    resized(logo, 32).save(OUT / "favicon-32.png", optimize=True)
    resized(logo, 48).save(OUT / "favicon-48.png", optimize=True)
    on_background(logo, 180, 0.9).save(OUT / "apple-touch-icon.png", optimize=True)
    resized(logo, 192).save(OUT / "icon-192.png", optimize=True)
    resized(logo, 512).save(OUT / "icon-512.png", optimize=True)
    print(f"Wrote icons to {OUT} (logo is {logo.width}×{logo.height}px)")


if __name__ == "__main__":
    main()

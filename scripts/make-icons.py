#!/usr/bin/env python3
"""Generates the app icons.

Deliberately dependency-free: it writes PNGs with nothing but zlib, so the
icons can be regenerated on any machine with a stock Python and no install
step. Shapes are drawn from signed distance fields, which gives clean
anti-aliased edges without supersampling.

Usage:  python3 scripts/make-icons.py
"""

import math
import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "icons"

TOP_COLOUR = (0x0A, 0x84, 0xFF)      # iOS system blue
BOTTOM_COLOUR = (0x5E, 0x5C, 0xE6)   # iOS system indigo
WHITE = (0xFF, 0xFF, 0xFF)


def write_png(path, width, height, pixels):
    """pixels: flat bytearray of RGBA rows, length width*height*4."""
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


def rounded_rect_sdf(px, py, cx, cy, half_w, half_h, radius):
    """Signed distance to a rounded rectangle; negative inside."""
    radius = min(radius, half_w, half_h)
    dx = abs(px - cx) - (half_w - radius)
    dy = abs(py - cy) - (half_h - radius)
    outside = math.hypot(max(dx, 0.0), max(dy, 0.0))
    inside = min(max(dx, dy), 0.0)
    return outside + inside - radius


def coverage(sdf_value):
    """1px-wide analytic anti-aliasing."""
    return min(max(0.5 - sdf_value, 0.0), 1.0)


def blend(dst, src, alpha):
    return tuple(round(d + (s - d) * alpha) for d, s in zip(dst, src))


def gradient_colour(y, size):
    t = y / max(size - 1, 1)
    return tuple(round(a + (b - a) * t) for a, b in zip(TOP_COLOUR, BOTTOM_COLOUR))


def render(size, maskable=False):
    """Three white book spines on a blue-to-indigo squircle."""
    pixels = bytearray(size * size * 4)

    # A maskable icon is cropped to a circle by the platform, so it bleeds to the
    # edges and keeps its glyph inside the 80% safe zone.
    bg_radius = size * 0.5 if maskable else size * 0.2237
    glyph_scale = 0.62 if maskable else 0.78

    books = [  # (centre x, top y, bottom y) as fractions of the glyph box
        (0.215, 0.10, 1.0),
        (0.5, 0.0, 1.0),
        (0.785, 0.16, 1.0),
    ]
    book_half_w = 0.115
    band_height = 0.085

    glyph = size * glyph_scale
    glyph_x0 = (size - glyph) / 2
    glyph_y0 = (size - glyph) / 2

    for y in range(size):
        row_colour = gradient_colour(y, size)
        for x in range(size):
            px, py = x + 0.5, y + 0.5

            bg_alpha = coverage(rounded_rect_sdf(px, py, size / 2, size / 2,
                                                 size / 2, size / 2, bg_radius))
            if bg_alpha <= 0.0:
                continue

            colour = row_colour

            for cx, top, bottom in books:
                bx = glyph_x0 + cx * glyph
                by0 = glyph_y0 + top * glyph
                by1 = glyph_y0 + bottom * glyph
                half_w = book_half_w * glyph
                half_h = (by1 - by0) / 2
                cy = (by0 + by1) / 2
                radius = min(half_w, half_h) * 0.42

                book_alpha = coverage(rounded_rect_sdf(px, py, bx, cy, half_w, half_h, radius))
                if book_alpha > 0.0:
                    colour = blend(colour, WHITE, book_alpha)

                    # Spine band: punch the background back through the white so
                    # the shapes read as books rather than a bar chart.
                    band_cy = by0 + (by1 - by0) * 0.26
                    band_alpha = coverage(rounded_rect_sdf(
                        px, py, bx, band_cy, half_w * 1.02, band_height * glyph / 2,
                        band_height * glyph * 0.16))
                    if band_alpha > 0.0:
                        colour = blend(colour, row_colour, band_alpha * book_alpha)

            offset = (y * size + x) * 4
            pixels[offset:offset + 4] = bytes(colour) + bytes([round(bg_alpha * 255)])

    return pixels


FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0A84FF"/>
      <stop offset="1" stop-color="#5E5CE6"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14.3" fill="url(#g)"/>
  <g fill="#fff">
    <rect x="16.2" y="16.9" width="11.5" height="30.2" rx="2.6"/>
    <rect x="29.9" y="14.0" width="11.5" height="33.1" rx="2.6"/>
    <rect x="43.6" y="18.6" width="11.5" height="28.5" rx="2.6"/>
  </g>
  <g fill="url(#g)">
    <rect x="16.2" y="24.0" width="11.5" height="3.4"/>
    <rect x="29.9" y="22.6" width="11.5" height="3.4"/>
    <rect x="43.6" y="25.2" width="11.5" height="3.4"/>
  </g>
</svg>
"""


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in (180, 192, 512):
        write_png(OUT_DIR / f"icon-{size}.png", size, size, render(size))
        print(f"wrote icon-{size}.png")
    write_png(OUT_DIR / "icon-512-maskable.png", 512, 512, render(512, maskable=True))
    print("wrote icon-512-maskable.png")
    (OUT_DIR / "favicon.svg").write_text(FAVICON_SVG)
    print("wrote favicon.svg")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generate PWA icons + splash + QR code for Grocery Hauls Pro za."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/home/z/my-project/public/icons"
os.makedirs(OUT, exist_ok=True)

# New palette: blue -> sky gradient, white basket, lime accent stripes
BLUE = (29, 78, 216)       # blue-700
SKY = (14, 165, 233)       # sky-500
LIME = (132, 204, 22)      # lime-500
SKY_100 = (224, 242, 254)
WHITE = (255, 255, 255)

def gradient_bg(size: int) -> Image.Image:
    """Vertical gradient from blue-700 (top) to sky-500 (bottom)."""
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(BLUE[0] + (SKY[0] - BLUE[0]) * t)
        g = int(BLUE[1] + (SKY[1] - BLUE[1]) * t)
        b = int(BLUE[2] + (SKY[2] - BLUE[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b))
    return img

def make_icon(size: int, maskable: bool = False) -> Image.Image:
    img = gradient_bg(size)
    d = ImageDraw.Draw(img)
    cx = size / 2
    scale = 0.52 if maskable else 0.62
    bw = size * scale          # basket top width
    tw = bw * 0.68             # basket bottom width
    bh = bw * 0.62             # basket height
    top_y = size * (0.42 if maskable else 0.38)
    bot_y = top_y + bh
    left = cx - bw / 2
    right = cx + bw / 2
    bl = cx - tw / 2
    br = cx + tw / 2
    # handle
    lw = max(4, int(size * 0.045))
    handle_r = bw * 0.34
    d.arc([cx - handle_r, top_y - handle_r * 0.9, cx + handle_r, top_y + handle_r * 0.55],
          start=180, end=360, fill=WHITE, width=lw)
    # basket body (trapezoid)
    d.polygon([(left, top_y), (right, top_y), (br, bot_y), (bl, bot_y)], fill=WHITE)
    # vertical stripes on basket
    stripe_color = LIME
    for frac in (0.3, 0.5, 0.7):
        x_top = left + bw * frac
        x_bot = bl + tw * frac
        d.line([(x_top, top_y + bh * 0.08), (x_bot, bot_y - bh * 0.06)], fill=stripe_color, width=max(3, lw // 2))
    # rim
    d.line([(left - lw * 0.2, top_y), (right + lw * 0.2, top_y)], fill=WHITE, width=lw)
    return img

try:
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    ImageFont.truetype(font_path, 20)
    HAS_FONT = font_path
except Exception:
    HAS_FONT = None

def make_splash(width: int, height: int) -> Image.Image:
    img = gradient_bg(min(width, height))
    if width != height:
        img = img.resize((width, height))
    d = ImageDraw.Draw(img)
    icon = make_icon(220)
    img.paste(icon, (width // 2 - 110, height // 2 - 190))
    if HAS_FONT:
        font_big = ImageFont.truetype(HAS_FONT, 64)
        font_small = ImageFont.truetype(HAS_FONT, 26)
        title = "Grocery Hauls Pro za"
        tagline = "Super Intelligence Budget Shopping"
        tw = d.textlength(title, font=font_big)
        d.text((width / 2 - tw / 2, height / 2 + 60), title, font=font_big, fill=WHITE)
        tw2 = d.textlength(tagline, font=font_small)
        d.text((width / 2 - tw2 / 2, height / 2 + 150), tagline, font=font_small, fill=SKY_100)
    return img

# App icons
for size in (192, 512):
    make_icon(size).save(f"{OUT}/icon-{size}.png")
make_icon(512, maskable=True).save(f"{OUT}/icon-maskable-512.png")
make_icon(180).save(f"{OUT}/apple-touch-icon.png")
make_icon(96).save(f"{OUT}/icon-96.png")
make_icon(32).save(f"{OUT}/favicon-32.png")

# Splash screens
for (w, h) in ((1125, 2436), (750, 1334), (1242, 2688)):
    make_splash(w, h).save(f"{OUT}/splash-{w}x{h}.png")

print("Icons + splash generated in", OUT)

# ---- QR code for the test link ----
import qrcode

qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=4)
qr.add_data("https://groceryhaulsza-pro1.web.app")
qr.make(fit=True)
img = qr.make_image(fill_color="#1D4ED8", back_color="white").convert("RGB")
dl = "/home/z/my-project/download"
os.makedirs(dl, exist_ok=True)
img.save(f"{dl}/grocery-hauls-pro-za-test-link-qr.png")

# QR with a title header
header_h = 140
qr_img = Image.open(f"{dl}/grocery-hauls-pro-za-test-link-qr.png")
combined = Image.new("RGB", (qr_img.width, qr_img.height + header_h), WHITE)
combined.paste(qr_img, (0, header_h))
d = ImageDraw.Draw(combined)
if HAS_FONT:
    f1 = ImageFont.truetype(HAS_FONT, 34)
    f2 = ImageFont.truetype(HAS_FONT, 22)
    t1 = "Grocery Hauls Pro za"
    t2 = "Scan to open the test app"
    d.text((combined.width / 2 - d.textlength(t1, font=f1) / 2, 22), t1, font=f1, fill=BLUE)
    d.text((combined.width / 2 - d.textlength(t2, font=f2) / 2, 72), t2, font=f2, fill=(90, 90, 90))
combined.save(f"{dl}/grocery-hauls-pro-za-test-link-qr-titled.png")
print("QR codes saved to", dl)

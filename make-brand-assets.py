#!/usr/bin/env python3
"""Generate GroceryHaulz-Pro za brand assets from the user's uploaded logo.

Source: upload/Gemini_Generated_Image_bgjrscbgjrscbgjr.jfif (1408x768)
  - icon tile:  (531, 123) -> (877, 469)   346x346 blue rounded tile
  - wordmark:   (445, ~483) -> (963, 579)  "GroceryHaulz-Pro za" text

Outputs:
  public/brand/logo-tile.png        native tile crop (346px)
  public/brand/logo-wordmark.png    wordmark strip (white bg, trimmed)
  public/brand/logo-lockup.png      white rounded card + tile + wordmark, 2x, baked soft shadow
  public/icons/*                    regenerated PWA icons (same filenames as manifest)
  public/icons/splash-*.png         regenerated splash screens
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os

SRC = "/home/z/my-project/upload/Gemini_Generated_Image_bgjrscbgjrscbgjr.jfif"
BRAND = "/home/z/my-project/public/brand"
ICONS = "/home/z/my-project/public/icons"
os.makedirs(BRAND, exist_ok=True)
os.makedirs(ICONS, exist_ok=True)

src = Image.open(SRC).convert("RGB")

# ---------------------------------------------------------------- crops
TILE_BOX = (531, 123, 877, 469)  # blue rounded tile, 346x346
tile = src.crop(TILE_BOX)

# wordmark: generous box then auto-trim against near-white card background
wm_raw = src.crop((430, 472, 980, 590))
arr = wm_raw.convert("L")
bbox = Image.eval(arr, lambda p: 255 if p < 235 else 0).getbbox()
pad = 6
l, t, r, b = bbox
wm = wm_raw.crop((max(0, l - pad), max(0, t - pad), min(wm_raw.width, r + pad), min(wm_raw.height, b + pad)))
print("tile:", tile.size, "| wordmark:", wm.size)

tile.save(f"{BRAND}/logo-tile.png")
wm.save(f"{BRAND}/logo-wordmark.png")

# ---------------------------------------------------------------- lockup (2x)
# white rounded card with baked soft shadow + transparent corners
S = 2  # supersample factor for crisp output then downscale
card_w, card_h = 620, 520
canvas_w, canvas_h = card_w + 60, card_h + 70  # room for shadow
canvas = Image.new("RGBA", (canvas_w * S, canvas_h * S), (0, 0, 0, 0))

# shadow layer
shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle(
    [44 * S, 44 * S, (44 + card_w) * S, (44 + card_h) * S],
    radius=56 * S, fill=(15, 60, 110, 130),
)
shadow = shadow.filter(ImageFilter.GaussianBlur(14 * S))
canvas.alpha_composite(shadow)

# white card
card_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
cd = ImageDraw.Draw(card_layer)
cd.rounded_rectangle(
    [40 * S, 40 * S, (40 + card_w) * S, (40 + card_h) * S],
    radius=56 * S, fill=(255, 255, 255, 255),
)
canvas.alpha_composite(card_layer)

# tile centered, upper area
tile_size = 300
tile_big = tile.resize((tile_size * S, tile_size * S), Image.LANCZOS)
# round the tile corners so no photo-background pixels peek out
mask = Image.new("L", tile_big.size, 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, tile_big.width, tile_big.height], radius=int(tile_big.width * 0.21), fill=255)
tx = (canvas_w - tile_size) // 2
ty = 40 + 42
canvas.paste(tile_big, (tx * S, ty * S), mask)

# wordmark below, centered
wm_target_w = 470
wm_big = wm.resize((wm_target_w * S, int(wm.height * wm_target_w / wm.width) * S), Image.LANCZOS)
wx = (canvas_w - wm_target_w) // 2
wy = ty + tile_size + 34
canvas.alpha_composite(wm_big.convert("RGBA"), (wx * S, wy * S))

canvas = canvas.resize((canvas_w, canvas_h), Image.LANCZOS)
canvas.save(f"{BRAND}/logo-lockup.png")
print("lockup:", canvas.size)

# ---------------------------------------------------------------- PWA icons
BLUE = (23, 74, 187)    # sampled from tile deep blue (slightly richer than blue-700)
SKY = (56, 130, 205)    # tile light-blue edge
WHITE = (255, 255, 255)


def gradient_bg(size: int) -> Image.Image:
    """Vertical gradient matched to the tile's own blues."""
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(BLUE[0] + (SKY[0] - BLUE[0]) * t)
        g = int(BLUE[1] + (SKY[1] - BLUE[1]) * t)
        b = int(BLUE[2] + (SKY[2] - BLUE[2]) * t)
        d.line([(0, y), (size, y)], fill=(r, g, b))
    return img


def rounded_tile(size: int) -> Image.Image:
    big = tile.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", big.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size, size], radius=int(size * 0.21), fill=255)
    out = Image.new("RGBA", big.size, (0, 0, 0, 0))
    out.paste(big, (0, 0), mask)
    return out


def make_icon(size: int, mode: str = "full") -> Image.Image:
    """mode: full = tile fills canvas (rounded corners over gradient);
    maskable = tile at 66%; apple = tile at 80%."""
    img = gradient_bg(size).convert("RGBA")
    if mode == "full":
        t = rounded_tile(size)
    elif mode == "maskable":
        inner = int(size * 0.66)
        t = rounded_tile(inner)
    else:  # apple
        inner = int(size * 0.82)
        t = rounded_tile(inner)
    img.alpha_composite(t, ((size - t.width) // 2, (size - t.height) // 2))
    return img


for name, size, mode in [
    ("icon-96.png", 96, "full"),
    ("icon-192.png", 192, "full"),
    ("icon-512.png", 512, "full"),
    ("icon-maskable-512.png", 512, "maskable"),
    ("apple-touch-icon.png", 180, "apple"),
]:
    make_icon(size, mode).convert("RGB").save(f"{ICONS}/{name}")
    print("icon:", name, size)

# favicon: square tile, no gradient needed
tile.resize((32, 32), Image.LANCZOS).save(f"{ICONS}/favicon-32.png")
print("icon: favicon-32.png")

# ---------------------------------------------------------------- splash screens
try:
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    ImageFont.truetype(font_path, 20)
    HAS_FONT = font_path
except Exception:
    HAS_FONT = None


def make_splash(width: int, height: int) -> Image.Image:
    # vertical gradient blue -> sky like the app splash
    top, bottom = (29, 78, 216), (14, 165, 233)  # blue-700 -> sky-500
    img = Image.new("RGB", (width, height))
    d = ImageDraw.Draw(img)
    for y in range(height):
        t = y / max(1, height - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (width, y)], fill=c)
    # lockup centered slightly above middle
    lw = int(width * 0.52)
    lh = int(canvas.height * lw / canvas.width)
    lock = canvas.resize((lw, lh), Image.LANCZOS)
    img.paste(lock, (width // 2 - lw // 2, int(height * 0.30) - lh // 2), lock)
    if HAS_FONT:
        f_tag = ImageFont.truetype(HAS_FONT, max(20, int(width * 0.036)))
        tagline = "Super Intelligence Budget Shopping"
        tw = d.textlength(tagline, font=f_tag)
        d.text((width / 2 - tw / 2, height * 0.30 + lh // 2 + int(height * 0.05)),
               tagline, font=f_tag, fill=(255, 255, 255))
    return img


for name, (w, h) in {
    "splash-1125x2436.png": (1125, 2436),
    "splash-1242x2688.png": (1242, 2688),
    "splash-750x1334.png": (750, 1334),
}.items():
    make_splash(w, h).save(f"{ICONS}/{name}")
    print("splash:", name)

print("DONE")

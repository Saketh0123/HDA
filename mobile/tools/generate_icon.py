from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join('assets', 'icons')
os.makedirs(OUT_DIR, exist_ok=True)

INDIGO = (0x1E, 0x1B, 0x4B, 255)  # #1E1B4B
GOLD = (0xD4, 0xAF, 0x37, 255)    # #D4AF37

SIZE = 1024


def _pick_font(px: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        r"C:\\Windows\\Fonts\\seguisb.ttf",
        r"C:\\Windows\\Fonts\\segoeuib.ttf",
        r"C:\\Windows\\Fonts\\arialbd.ttf",
        r"C:\\Windows\\Fonts\\arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, px)
        except Exception:
            pass
    return ImageFont.load_default()


def _fit_text(draw: ImageDraw.ImageDraw, text: str, max_w: int, max_h: int):
    lo, hi = 10, 900
    best = 10
    while lo <= hi:
        mid = (lo + hi) // 2
        font = _pick_font(mid)
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        if w <= max_w and h <= max_h:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return _pick_font(best)


def main() -> None:
    fg = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fg)

    # Safe area margin for adaptive icons
    margin = int(SIZE * 0.18)  # 18%
    max_w = SIZE - margin * 2
    max_h = int(SIZE * 0.42)

    text = 'HDA'
    font = _fit_text(draw, text, max_w, max_h)

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    x = (SIZE - text_w) // 2
    y = (SIZE - text_h) // 2
    y = int(y - SIZE * 0.02)  # optical centering tweak

    stroke = max(4, SIZE // 256)

    # Gold text with subtle dark stroke for readability
    draw.text(
        (x, y),
        text,
        font=font,
        fill=GOLD,
        stroke_width=stroke,
        stroke_fill=(0, 0, 0, 90),
    )

    fg_path = os.path.join(OUT_DIR, 'app_icon_foreground.png')
    fg.save(fg_path)

    bg = Image.new('RGBA', (SIZE, SIZE), INDIGO)
    preview = Image.alpha_composite(bg, fg)
    preview_path = os.path.join(OUT_DIR, 'app_icon_preview.png')
    preview.save(preview_path)

    print('Wrote', fg_path)
    print('Wrote', preview_path)


if __name__ == '__main__':
    main()

"""Make web-sized copies of the studio media for the cards.

Reads ASSET/DesignDirectory (the original, full-resolution files, which stay untouched and
are still what the zoom viewer opens) and writes assets/media/<code>.webp, scaled so the
longest edge fits the largest size each image is shown at on a 2x screen:

  -sl  studio logo     320px   (shown at 40-89px)
  -fp  founder photo   320px   (shown at 40px)
  -sp  studio photo   1600px   (Now Viewing card, up to ~800px tall)
  -pp  project photo  1600px   (Project card, up to ~400px tall)

Videos (.mp4) are skipped and used as-is. Existing copies newer than their source are kept.

  python3 scripts/optimize-media.py           # missing / outdated copies
  python3 scripts/optimize-media.py --force   # redo everything

Then run scripts/build-directory-data.py so the site picks them up.
Requires Pillow (pip install pillow).
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "ASSET" / "DesignDirectory"
OUT = ROOT / "assets" / "media"
MAX_EDGE = {"sl": 320, "fp": 320, "sp": 1600, "pp": 1600}
QUALITY = 82
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"}


def optimize(src, force):
    kind = src.stem.rsplit("-", 1)[-1]
    if kind not in MAX_EDGE:
        return None
    out = OUT / f"{src.stem}.webp"
    if not force and out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
        return "kept"
    with Image.open(src) as im:
        edge = MAX_EDGE[kind]
        if getattr(im, "is_animated", False):
            frames, durations = [], []
            for i in range(im.n_frames):
                im.seek(i)
                frame = im.convert("RGBA")
                frame.thumbnail((edge, edge), Image.LANCZOS)
                frames.append(frame)
                durations.append(im.info.get("duration", 100))
            frames[0].save(out, "WEBP", save_all=True, append_images=frames[1:], duration=durations,
                           loop=0, quality=QUALITY, method=6)
        else:
            im = ImageOps.exif_transpose(im)
            im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
            im.thumbnail((edge, edge), Image.LANCZOS)
            im.save(out, "WEBP", quality=QUALITY, method=6)
    return f"{src.stat().st_size / 1e6:6.2f} MB -> {out.stat().st_size / 1e3:6.0f} KB"


def main(args):
    force = "--force" in args
    OUT.mkdir(parents=True, exist_ok=True)
    before = after = 0
    for src in sorted(SOURCE.iterdir()):
        if src.suffix.lower() not in IMAGE_TYPES:
            continue
        result = optimize(src, force)
        if result is None:
            continue
        before += src.stat().st_size
        after += (OUT / f"{src.stem}.webp").stat().st_size
        if result != "kept":
            print(f"  {src.name:16} {result}")
    print(f"Total: {before / 1e6:.1f} MB originals -> {after / 1e6:.1f} MB web copies in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1:])

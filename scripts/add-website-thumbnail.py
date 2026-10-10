"""Use your own screenshot as an agency's Website-card thumbnail.

Crops the image to the window-viewer's 2880:1622 proportion (anchored top-center, like
the card), resizes it to match the captured thumbnails, and saves
assets/websites/<place_id>-web.webp. Then refreshes the asset index.

  python3 scripts/add-website-thumbnail.py 14 ~/Desktop/14.png
  python3 scripts/add-website-thumbnail.py ~/Desktop/14.png ~/Desktop/16.png   # number taken from each file name

Add the place_id to MANUAL in scripts/capture-websites.py so a recapture won't overwrite it.
Requires Pillow (pip install pillow).
"""
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "websites"
RATIO = 2880 / 1622
OUTPUT_SIZE = (800, 451)  # same as scripts/capture-websites.py


def add(place_id, source):
    im = Image.open(source).convert("RGB")
    width, height = im.size
    if width / height > RATIO:  # too wide: trim the sides equally
        new_width = round(height * RATIO)
        left = (width - new_width) // 2
        im = im.crop((left, 0, left + new_width, height))
    else:  # too tall: keep the top
        im = im.crop((0, 0, width, round(width / RATIO)))
    out = OUT_DIR / f"{place_id}-web.webp"
    im.resize(OUTPUT_SIZE, Image.LANCZOS).save(out, "WEBP", quality=80)
    print(f"#{place_id}: {source} ({width}x{height}) -> {out.relative_to(ROOT)}")


def main(args):
    if len(args) == 2 and args[0].isdigit():
        pairs = [(args[0], Path(args[1]).expanduser())]
    else:
        pairs = []
        for arg in args:
            match = re.search(r"\d+", Path(arg).stem)
            if not match:
                sys.exit(f"No place_id in file name: {arg}")
            pairs.append((match.group(), Path(arg).expanduser()))
    if not pairs:
        sys.exit(__doc__)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for place_id, source in pairs:
        add(place_id, source)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build-directory-data.py")], check=True)


if __name__ == "__main__":
    main(sys.argv[1:])

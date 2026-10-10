"""Screenshot each agency's homepage for the Website card.

Opens every `website` URL from DATASET/01_DD_Data_Agency_NORMALIZED.csv in headless
Google Chrome at 1440x811 (the 2880:1622 proportion of the Figma window-viewer) and
saves assets/websites/<place_id>-web.webp. Existing screenshots are kept unless --force.

  python3 scripts/capture-websites.py            # capture missing screenshots
  python3 scripts/capture-websites.py --force    # recapture everything
  python3 scripts/capture-websites.py 12 40      # (re)capture specific place_ids

Then run scripts/build-directory-data.py so the map page picks them up.
Requires Google Chrome and Pillow (pip install pillow).
"""
import csv
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "DATASET" / "01_DD_Data_Agency_NORMALIZED.csv"
OUT_DIR = ROOT / "assets" / "websites"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Sites whose homepage doesn't capture usefully (error pages, login walls, blank loaders).
# They show the grey globe empty state instead and are never captured.
NO_PREVIEW = {"3", "4", "5", "7", "18", "29", "31", "38", "59"}
# Screenshots supplied by hand; never overwritten by this script.
MANUAL = {"14", "16", "17", "19", "30", "39", "42", "45", "46", "48", "57", "60"}

VIEWPORT = (1440, 811)  # 2880:1622
OUTPUT_WIDTH = 800      # ~2.5x the card's image width, for sharp retina display
TIMEOUT_S = 45
PARALLEL = 6


# Pages that never go idle can stall Chrome's virtual clock, so retry with a shorter budget.
VIRTUAL_TIME_BUDGETS_MS = [10000, 3000]


def screenshot(url, png, profile, budget_ms):
    cmd = [
        CHROME, "--headless=new", "--hide-scrollbars", "--mute-audio",
        f"--user-data-dir={profile}", f"--window-size={VIEWPORT[0]},{VIEWPORT[1]}",
        f"--virtual-time-budget={budget_ms}", f"--screenshot={png}", url,
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired:
        pass  # Chrome may still have written the screenshot
    return png.exists() and png.stat().st_size >= 2000


def capture(place_id, url):
    out = OUT_DIR / f"{place_id}-web.webp"
    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / "shot.png"
        if not any(screenshot(url, png, f"{tmp}/profile-{budget}", budget) for budget in VIRTUAL_TIME_BUDGETS_MS):
            return place_id, url, "failed"
        with Image.open(png) as im:
            im = im.convert("RGB")
            height = round(OUTPUT_WIDTH * VIEWPORT[1] / VIEWPORT[0])
            im.resize((OUTPUT_WIDTH, height), Image.LANCZOS).save(out, "WEBP", quality=80)
    return place_id, url, "ok"


def main(args):
    force = "--force" in args
    only = {a for a in args if a.isdigit()}
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with DATASET.open(encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.DictReader(f, delimiter=";") if r["website"].strip().startswith("http")]

    jobs = [
        (r["place_id"], r["website"].strip()) for r in rows
        if r["place_id"] not in NO_PREVIEW | MANUAL
        and (not only or r["place_id"] in only)
        and (force or only or not (OUT_DIR / f"{r['place_id']}-web.webp").exists())
    ]
    print(f"Capturing {len(jobs)} websites...")
    with ThreadPoolExecutor(PARALLEL) as pool:
        for place_id, url, status in pool.map(lambda job: capture(*job), jobs):
            print(f"  {status:6} #{place_id} {url}")


if __name__ == "__main__":
    main(sys.argv[1:])

"""Close-up screenshots of the 3D muscle stage for a few exercises and camera views, tiled into one image.

python tools/stage_shots.py <out.png> [exercise_id ...]
"""
import functools
import http.server
import sys
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1])
ids = sys.argv[2:] or ["Barbell_Squat", "Barbell_Bench_Press_-_Medium_Grip", "Pullups", "Barbell_Deadlift"]
views = ["3/4", "Front", "Back"]
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
tiles, errors = [], []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    pg = b.new_page(viewport={"width": 412, "height": 900}, device_scale_factor=1)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    for i in ids:
        pg.goto(f"http://127.0.0.1:{srv.server_port}/#/ex/{i}")
        pg.wait_for_selector("canvas.gl")
        pg.click("#pp")  # pause on the working frame
        for v in views:
            pg.click(f".views button:text-is('{v}')")
            pg.wait_for_timeout(250)
            path = out.with_name(f"_{i}_{v.replace('/', '')}.png")
            pg.locator(".stage").screenshot(path=str(path))
            tiles.append(path)
    b.close()
srv.shutdown()
ims = [Image.open(t) for t in tiles]
w, h = ims[0].size
sheet = Image.new("RGB", (w * len(views), h * len(ids)), "white")
for k, im in enumerate(ims):
    sheet.paste(im, ((k % len(views)) * w, (k // len(views)) * h))
sheet.save(out)
for t in tiles:
    t.unlink()
print("saved", out, "errors:", errors or "none")

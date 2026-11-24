"""Smoke test at phone size with Edge: seeds ~5 months of fake workouts into a throwaway browser
profile, walks through every screen, logs a set, and saves screenshots.

python tools/smoke.py <out_dir> [--light]
"""
import functools
import http.server
import json
import random
import sys
import threading
import time
from datetime import date, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
LIGHT = "--light" in sys.argv

random.seed(4)
ids = ["Barbell_Squat", "Barbell_Bench_Press_-_Medium_Grip", "Barbell_Deadlift", "Pullups", "Dumbbell_Bicep_Curl", "Standing_Military_Press"]
workouts = []
d = date.today() - timedelta(days=150)
while d < date.today():
    if random.random() < 0.55:
        start = int(time.mktime((d.year, d.month, d.day, 18, 0, 0, 0, 0, -1)) * 1000)
        exs = [{"exId": i, "sets": [{"w": 40 + random.randint(0, 60), "r": random.randint(5, 10), "done": True} for _ in range(random.randint(2, 5))]} for i in random.sample(ids, random.randint(2, 5))]
        workouts.append({"id": f"w{len(workouts)}", "name": random.choice(["Push day", "Pull day", "Leg day"]), "date": d.isoformat(), "start": start, "end": start + 3600_000, "exercises": exs})
    d += timedelta(days=1)
state = {"version": 1, "settings": {"unit": "kg", "rest": 90, "weeklyGoal": 4, "theme": "light" if LIGHT else "auto"}, "workouts": workouts,
         "active": None, "checkins": {}, "favorites": ["Barbell_Squat"], "links": {}, "custom": [], "routines": [{"id": "r1", "name": "Push day", "exIds": ids[:3]}]}

srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{srv.server_port}/"
errors = []

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    ctx = b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        color_scheme="light" if LIGHT else "dark")
    ctx.add_init_script(f"if (!localStorage.getItem('forge.v1')) localStorage.setItem('forge.v1', {json.dumps(json.dumps(state))});")
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(str(e)))

    def shot(name, full=False):
        pg.wait_for_timeout(500)
        pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)

    pg.goto(base + "#/home"); pg.wait_for_selector(".cp-grid"); shot("1-home", True)
    pg.goto(base + "#/library"); pg.wait_for_selector(".ex-item"); pg.wait_for_timeout(600); shot("2-library")
    pg.fill(".search input", "squat"); pg.wait_for_timeout(500); shot("3-search")
    pg.goto(base + "#/ex/Barbell_Squat"); pg.wait_for_timeout(900); shot("4-detail", True)
    pg.goto(base + "#/workout"); shot("5-workout-idle")
    pg.click("[data-start]"); pg.wait_for_selector(".wo-ex")
    pg.fill(".wo-ex .set[data-j='0'] input[data-k='w']", "60"); pg.fill(".wo-ex .set[data-j='0'] input[data-k='r']", "8")
    pg.click(".wo-ex .set[data-j='0'] .chk"); pg.click(".wo-ex .set[data-j='1'] .chk")
    shot("6-workout-active", True)
    pg.click("#addx"); pg.wait_for_selector(".sheet .ex-item"); pg.wait_for_timeout(500)
    pg.click(".sheet .ex-item >> nth=0"); pg.click(".sheet .ex-item >> nth=2"); shot("7-picker")
    pg.click("#pk-ok"); pg.wait_for_timeout(400)
    pg.click("#fin"); pg.wait_for_selector(".sheet [data-a='1']"); pg.click(".sheet [data-a='1']"); pg.wait_for_timeout(600); shot("8-after-finish")
    pg.goto(base + "#/history"); shot("9-history")
    pg.goto(base + "#/settings"); shot("10-settings")
    pg.goto(base + "#/custom"); pg.wait_for_timeout(600); shot("11-custom")
    saved = pg.evaluate("JSON.parse(localStorage.getItem('forge.v1'))")
    print("workouts:", len(workouts), "->", len(saved["workouts"]), "| active:", saved["active"])
    last = max(saved["workouts"], key=lambda w: w["start"])
    print("last workout:", last["name"], last["date"], [(e["exId"], e["sets"]) for e in last["exercises"]])
    b.close()
srv.shutdown()
print("errors:", errors or "none")

# Forge — gym tracker (PWA)

Installable, offline web app for Android (Chrome → ⋮ → **Install app**). No build step, no server code.

- **1,323 exercises**, each with a looping animated GIF (red = target muscle), from [ExerciseGymGifsDB](https://github.com/JahelCuadrado/ExerciseGymGifsDB) (the same GIFs [FitLib](https://fitlib.samzhang.net/) shows). GIFs load from jsDelivr, not from this repo; the service worker keeps the last 400 you viewed for offline use. Where an exercise also exists in [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain), its fuller instructions and level are merged in. Search + filters + favourites, and your own custom exercises (which can borrow any exercise's GIF).
- **Old ids keep working**: `data/legacy.json` maps the previous free-exercise-db ids to the new ones; saved workouts, routines and favourites are migrated once on first launch, and old ids without a match still show by name in History.
- **Form videos**: "Watch form video" opens a YouTube search for the exercise.
- **Workout logger**: sets × weight × reps with last session's numbers as placeholders, rest timer (vibrates + beeps), routines, repeat a past workout, PRs, est. 1RM and a progress chart per exercise. Keeps the screen awake while logging.
- **LeetCode-style consistency panel**: a year heatmap grouped by month (colour = sets that day), workouts in the past year, total active days, max/current streak, weekly-goal streak, badges. Tap a day to see it or mark it active.

Data lives in `localStorage` on the phone (key `forge.v1`); Settings → Export/Import backup moves it between devices.

## Run locally
```
python -m http.server 8000        # then open http://localhost:8000
```

## Put it on your phone
A service worker (needed for install + offline) only runs over **HTTPS** (or localhost), so host the folder on any static HTTPS host, open it in Chrome on the phone once, and choose **Install app**. After that it works offline.
- GitHub Pages / Cloudflare Pages: publish this folder as-is.
- Tailscale: `tailscale serve --bg 8000` while `python -m http.server 8000` runs, then open the `https://<laptop>.ts.net` URL on the phone.

When you change any file, bump `VERSION` in `sw.js` so installed copies update (the app shows "Update ready · Reload").

## Files
| | |
|---|---|
| `js/app.js` | router (`#/home`, `#/library`, `#/ex/<id>`, `#/workout`, `#/history[/<id>]`, `#/settings`, `#/custom[/<id>]`) and all views |
| `js/store.js` | state, persistence, units (stored in kg), derived numbers |
| `js/consistency.js` | heatmap, streaks, badges |
| `data/exercises.json`, `data/legacy.json` | exercise list (`gif` = path under the ExerciseGymGifsDB CDN) and old-id map, built by `tools/build_data.py` |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA bits (`tools/make_icons.py` redraws the icons) |

## Tools
- `python tools/build_data.py [--report]` — rebuild `data/exercises.json` + `data/legacy.json` (downloads both datasets; `--report` prints the old→new id matches; add hand matches to `MANUAL`).
- `python tools/smoke.py <out_dir> [--light]` — phone-size run through every screen with Edge + Playwright on seeded fake data; saves screenshots and prints console errors.


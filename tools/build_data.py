"""Build data/exercises.json (+ data/legacy.json) for Forge.

python tools/build_data.py [--report]

The exercise list and the animated GIFs come from ExerciseGymGifsDB (github.com/JahelCuadrado/ExerciseGymGifsDB,
pinned to GIF_TAG); the app loads each GIF from jsDelivr at runtime, nothing is copied into this repo.
Where an exercise also exists in free-exercise-db (public domain, github.com/yuhonas/free-exercise-db; the
app's previous list), its better step-by-step instructions, level, mechanic and force are merged in.

data/legacy.json maps the old free-exercise-db ids (still in people's saved workouts) to the new ids,
and keeps name/muscles/equipment for old ids that have no GIF match so past workouts still show them.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

GIF_TAG = "v1.1.0"
GIF_SRC = f"https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@{GIF_TAG}/api/en/exercises.json"
OLD_SRC = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
DATA = Path(__file__).resolve().parent.parent / "data"

MUSCLE = {"abs": "abdominals", "pectorals": "chest", "delts": "shoulders", "upper-back": "middle back", "quads": "quadriceps",
          "spine": "lower back", "serratus-anterior": "chest", "levator-scapulae": "neck", "cardio": "cardio"}
EQUIP = {"bodyweight": "body only", "lever": "machine", "smith": "machine", "band": "bands", "kettlebell": "kettlebells",
         "ez-bar": "e-z curl bar", "sled": "other"}
OLD_EQ = {"body only": "bodyweight", "barbell": "barbell", "dumbbell": "dumbbell", "cable": "cable", "machine": "machine",
          "kettlebells": "kettlebell", "bands": "band", "e-z curl bar": "ez-bar"}
SYN = [(r"\bpull ?ups?\b|\bpullups?\b", "pull up"), (r"\bchin ?ups?\b|\bchinups?\b", "chin up"), (r"\bpush ?ups?\b|\bpushups?\b", "push up"),
       (r"\bsit ?ups?\b|\bsitups?\b", "sit up"), (r"\bdips?\b", "dip"), (r"\bcurls\b", "curl"), (r"\braises\b", "raise"),
       (r"\bdumbbells\b", "dumbbell"), (r"\bkettlebells\b", "kettlebell"), (r"\btricep\b", "triceps"), (r"\bbicep\b", "biceps"),
       (r"\bex(ercise)? ball\b|\bswiss ball\b", "stability ball"), (r"\be ?z\b", "ez"), (r"\bflyes\b|\bflys\b", "fly"),
       (r"\bv\d\b|\bmale\b|\bfemale\b", "")]
# Common lifts the name matcher misses (old free-exercise-db id -> GIF slug).
MANUAL = {"Barbell_Squat": "barbell-full-squat", "Plank": "weighted-front-plank", "Romanian_Deadlift": "barbell-romanian-deadlift",
          "Leg_Press": "sled-45-leg-press", "Wide-Grip_Lat_Pulldown": "cable-lat-pulldown-full-range-of-motion",
          "Standing_Military_Press": "barbell-standing-wide-military-press", "Seated_Cable_Rows": "cable-seated-row",
          "Triceps_Pushdown": "cable-pushdown", "Hammer_Curls": "dumbbell-hammer-curl", "Side_Lateral_Raise": "dumbbell-lateral-raise",
          "Leg_Extensions": "lever-leg-extension", "Crunches": "crunch-floor", "Barbell_Shrug": "barbell-shrug",
          "Dumbbell_Shrug": "dumbbell-shrug", "Goblet_Squat": "dumbbell-goblet-squat", "Sumo_Deadlift": "barbell-sumo-deadlift",
          "Dumbbell_Lunges": "dumbbell-lunge", "Burpee": "burpee"}
STOP = {"with", "on", "the", "a", "to", "and", "of", "grip", "medium", "version", "-"}


def tokens(name):
    s = name.lower().replace("-", " ").replace("/", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    for a, b in SYN:
        s = re.sub(a, b, s)
    return frozenset(t for t in s.split() if t not in STOP)


def fetch(url):
    with urllib.request.urlopen(url) as r:
        return json.load(r)


def main():
    gifs = fetch(GIF_SRC)["exercises"]
    old = fetch(OLD_SRC)
    old_ids = {o["id"] for o in old}
    gtok = [(tokens(g["name"]), g) for g in gifs]

    # best GIF match for each old exercise (token Jaccard, nudged by equipment agreement)
    pairs = []
    for o in old:
        ot = tokens(o["name"])
        if not ot:
            continue
        best, bs = None, 0.0
        for gt, g in gtok:
            inter = len(ot & gt)
            if not inter:
                continue
            sc = inter / len(ot | gt)
            oe = OLD_EQ.get(o.get("equipment") or "")
            if oe == g["equipment"]:
                sc += 0.05
            elif oe and g["equipment"] in OLD_EQ.values():
                sc -= 0.1
            if sc > bs:
                best, bs = g, sc
        if best and bs >= 0.74:
            pairs.append((bs, o, best))
    # one old exercise per GIF (best score wins)
    by_slug = {g["slug"]: g for g in gifs}
    by_old = {o["id"]: o for o in old}
    pairs += [(9, by_old[a], by_slug[b]) for a, b in MANUAL.items() if a in by_old]
    taken, match = {}, {}
    for bs, o, g in sorted(pairs, key=lambda p: -p[0]):
        if g["slug"] in taken or o["id"] in match:
            continue
        taken[g["slug"]] = o
        match[o["id"]] = g["slug"]

    out = []
    for g in gifs:
        o = taken.get(g["slug"])
        pm = [MUSCLE.get(g["muscle"], g["muscle"])]
        sm = []
        for m in g["secondaryMuscles"]:
            m = MUSCLE.get(m, m)
            if m not in pm and m not in sm:
                sm.append(m)
        e = {"id": g["slug"], "name": g["name"], "cat": g["category"], "eq": EQUIP.get(g["equipment"], g["equipment"]),
             "pm": pm, "sm": sm, "ins": g["instructions"], "gif": g["file"]}
        if o:
            e["ins"] = o.get("instructions") or e["ins"]
            for k, ok in (("lvl", "level"), ("mech", "mechanic"), ("force", "force")):
                if o.get(ok):
                    e[k] = o[ok]
        out.append(e)
    out.sort(key=lambda e: e["name"].lower())
    assert len({e["id"] for e in out}) == len(out) and not ({e["id"] for e in out} & old_ids)

    gone = {o["id"]: {"name": o["name"], "pm": o.get("primaryMuscles", []), "sm": o.get("secondaryMuscles", []),
                      "eq": o.get("equipment") or "other"} for o in old if o["id"] not in match}
    DATA.mkdir(exist_ok=True)
    (DATA / "exercises.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "legacy.json").write_text(json.dumps({"map": match, "old": gone}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)} exercises, {len(match)} old ids matched, {len(gone)} old ids without a GIF")
    if "--report" in sys.argv:
        by = {g["slug"]: g for g in gifs}
        for oid, slug in sorted(match.items()):
            print(f"  {oid:45} -> {by[slug]['name']}")


main()

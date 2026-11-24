"""Build data/exercises.json from free-exercise-db (public domain, github.com/yuhonas/free-exercise-db).

python tools/build_data.py [path/to/exercises.json]   (downloads the dataset when no path is given)

Each exercise gets an `anim` pattern id (see PATTERNS in js/anim.js): the first matching name rule
wins, then a fallback by category / primary muscle / force. Run with --report to see the counts and
the names that only matched a fallback.
"""
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

SRC = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
OUT = Path(__file__).resolve().parent.parent / "data" / "exercises.json"

# (regex on the lowercased name, pattern). Order matters: specific before general.
RULES = [
    (r"foam roll|smr|self.?myofascial|lacrosse ball|roller", "foamRoll"),
    (r"neck|head harness|chin to chest|isometric neck", "neck"),
    (r"jump rope|rope jump", "jumpRope"),
    (r"wrist|finger|forearm|pinch|gripper|hand squeeze|grip crush|pronation|supination", "wristCurl"),
    (r"(internal|external) rotation|cuban press", "facePull"),
    (r"front (barbell )?squat", "frontSquat"),
    (r"skull|lying triceps|lying.*extension|french press|tate press|jm press|tricep press", "skullCrusher"),
    (r"upright.*row", "uprightRow"),
    (r"dead bug|leg tucks", "legRaise"),
    (r"pallof", "frontRaise"),
    (r"seated calf|calf.*seated", "seatedCalf"),
    (r"calf|calves", "calfRaise"),
    (r"bicycling|bike|cycling|spinning|recumbent", "bike"),
    (r"rowing,? stationary|rowing machine|ergometer", "rower"),
    (r"running|jogging|treadmill|sprint|stair|elliptical|skating|trail|high knee|butt kick", "run"),
    (r"walk|carry|farmer|yoke|sled (drag|push)|prowler|duck walk|bear crawl|crawl", "walk"),
    (r"burpee", "burpee"),
    (r"jumping jack|star jump|side to side|lateral hop", "jumpingJack"),
    (r"mountain climber", "mountainClimber"),
    (r"box jump|depth jump|jump onto|onto box|box skip|hurdle", "boxJump"),
    (r"thruster", "thruster"),
    (r"snatch", "snatch"),
    (r"clean|high pull(?!ey)|hang pull|scoop", "clean"),
    (r"jerk|push press|split jerk", "pushPress"),
    (r"swing", "kbSwing"),
    (r"step.?up|step up", "stepUp"),
    (r"jump|bound|\bhops?\b|skip|leap", "jump"),
    (r"side plank", "sidePlank"),
    (r"plank|hollow|bridge hold|isometric|wall sit|l-sit|static", "plank"),
    (r"rollout|roll-?out|ab roller|ab wheel", "rollout"),
    (r"russian twist|\btwists?\b|windmill|rotational", "russianTwist"),
    (r"woodchop|wood chop|chop|slam|figure 8|around the world|halo", "woodchop"),
    (r"side bend|side band|saxon", "sideBend"),
    (r"hanging (leg|knee)|knee raise|leg raise.*(hang|captain|chair)|toes to bar|hanging pike", "hangingLegRaise"),
    (r"leg raise|leg lift|flutter|scissor|leg pull|reverse crunch|v-?up|jackknife|pike|knee tuck|bicycle", "legRaise"),
    (r"sit-?up|situp|sit up", "situp"),
    (r"crunch|ab (crunch|machine)|cable crunch|abdominal", "crunch"),
    (r"bird dog|donkey kick|kickback.*glute|glute kickback|quadruped|fire hydrant|hip extension|all fours|\bcat\b|\bcow\b|mule kick", "kneeling"),
    (r"hip thrust|thrust", "hipThrust"),
    (r"bridge|pelvic tilt|hip lift|hip raise", "bridge"),
    (r"abduct|clam|band walk|monster walk|lateral band", "abduction"),
    (r"adduct", "adduction"),
    (r"side lunge|lateral lunge|cossack", "sideLunge"),
    (r"lunge|split squat|bulgarian|scissors", "lunge"),
    (r"leg press|hack squat|sled", "legPress"),
    (r"leg extension|knee extension", "legExtension"),
    (r"leg curl|hamstring curl|glute.?ham|nordic|natural glute|ball leg curl", "legCurl"),
    (r"seated calf|calf.*seated", "seatedCalf"),
    (r"calf|calves|heel raise|toe raise|tibialis|donkey calf|ankle", "calfRaise"),
    (r"front squat|zercher", "frontSquat"),
    (r"goblet|plie|sumo squat", "gobletSquat"),
    (r"squat", "squat"),
    (r"good ?morning", "goodMorning"),
    (r"hyperextension|back extension|superman|reverse hyper|back raise", "hyperext"),
    (r"romanian|stiff.?leg|rdl|single leg deadlift|straight.?leg deadlift", "rdl"),
    (r"deadlift|rack pull|pull through|atlas|tire flip|keg|stone|axle", "deadlift"),
    (r"pullover|pull-over", "pullover"),
    (r"straight.?arm|lat pushdown", "straightArmPulldown"),
    (r"pull[- ]?ups?\b|chin[- ]?ups?\b|chins?\b|muscle.?up|rope climb", "pullup"),
    (r"pulldown|pull-down|pull down", "latPulldown"),
    (r"inverted row|body row|bodyweight row|australian", "invertedRow"),
    (r"face pull", "facePull"),
    (r"upright row", "uprightRow"),
    (r"shrug", "shrug"),
    (r"seated (cable )?row|cable row|low row|machine row|seated.*row|elevated cable", "seatedRow"),
    (r"\brows?\b|\browing\b", "row"),
    (r"reverse fly|rear delt|reverse flye|bent.?over.*(raise|lateral)|rear lateral|reverse pec", "rearDelt"),
    (r"crossover|cable fly|cable flye|standing.*fly|cable chest", "cableFly"),
    (r"fly|flye|pec deck|butterfly", "fly"),
    (r"decline.*(press|bench|push)", "declineBench"),
    (r"incline.*(press|bench)", "inclineBench"),
    (r"push-?up|push up|pushup|press-?up", "pushup"),
    (r"\bdips?\b", "dip"),
    (r"chest press|machine press|leverage.*press|smith machine.*bench|floor press|bench press|board press|pin press|close.?grip.*press|guillotine", "bench"),
    (r"lateral raise|side raise|lateral.*raise|laterals|deltoid raise|iron cross|crucifix|y raise|scaption|pull apart|shoulder raise|car drivers|pirate", "lateralRaise"),
    (r"front raise|front.*raise|front plate|plate raise|battling rope|dumbbell raise", "frontRaise"),
    (r"seated.*(press|military)|arnold", "seatedPress"),
    (r"overhead press|shoulder press|military|push press|press behind|handstand|pike press|landmine press|bradford|z press|press$", "ohp"),
    (r"skull|lying triceps|lying.*extension|french press|tate press|jm press", "skullCrusher"),
    (r"overhead.*(extension|triceps)|triceps extension|tricep extension|standing.*extension", "overheadExt"),
    (r"kickback", "kickback"),
    (r"pushdown|push-?down|press-?down", "pushdown"),
    (r"preacher|concentration|spider curl|scott", "preacherCurl"),
    (r"wrist|finger|forearm|pinch|gripper|hand squeeze|grip crush|pronation|supination", "wristCurl"),
    (r"curl", "curl"),
]

STRETCH_BY_MUSCLE = {
    "hamstrings": "stretchFold", "lower back": "stretchFold", "calves": "stretchFold",
    "quadriceps": "stretchQuad", "abductors": "stretchSeated", "adductors": "stretchSeated",
    "glutes": "stretchSeated", "chest": "stretchChest", "biceps": "stretchChest",
    "shoulders": "stretchArm", "triceps": "stretchArm", "lats": "stretchSide", "middle back": "stretchArm",
    "abdominals": "stretchSide", "traps": "neck", "neck": "neck", "forearms": "stretchArm",
}

FALLBACK_BY_MUSCLE = {
    "quadriceps": "squat", "hamstrings": "rdl", "glutes": "bridge", "calves": "calfRaise",
    "chest": "bench", "shoulders": "ohp", "triceps": "pushdown", "biceps": "curl", "forearms": "wristCurl",
    "lats": "latPulldown", "middle back": "row", "lower back": "hyperext", "traps": "shrug",
    "abdominals": "crunch", "adductors": "adduction", "abductors": "abduction", "neck": "neck",
}


def classify(x):
    name = x["name"].lower()
    muscle = (x["primaryMuscles"] or ["?"])[0]
    if x["category"] == "stretching":
        if re.search(r"lunge|hip flexor|kneeling hip", name):
            return "stretchLunge", True
        if re.search(r"foam|roll|smr", name):
            return "foamRoll", True
        if re.search(r"seated|sit|butterfly|lying|on back|supine|pigeon|knee to chest", name):
            return "stretchSeated", True
        return STRETCH_BY_MUSCLE.get(muscle, "stretchSide"), True
    for rx, pat in RULES:
        if re.search(rx, name):
            if pat == "squat" and x["equipment"] in ("body only", None):
                pat = "bwSquat"
            if pat == "squat" and x["equipment"] in ("dumbbell", "kettlebells"):
                pat = "gobletSquat"
            if pat == "bench" and x["equipment"] in ("machine", "cable"):
                pat = "machinePress"
            if pat == "curl" and "hammer" not in name and x["equipment"] == "cable":
                pat = "curl"
            return pat, True
    if x["category"] == "cardio":
        return "run", False
    if x["category"] == "plyometrics":
        return "jump", False
    return FALLBACK_BY_MUSCLE.get(muscle, "generic"), False


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args:
        data = json.loads(Path(args[0]).read_text(encoding="utf-8"))
    else:
        with urllib.request.urlopen(SRC) as r:
            data = json.loads(r.read().decode("utf-8"))
    out, fallback = [], []
    for x in data:
        anim, ruled = classify(x)
        if not ruled:
            fallback.append((x["name"], anim))
        out.append({
            "id": x["id"], "name": x["name"], "cat": x["category"], "eq": x["equipment"] or "body only",
            "lvl": x["level"], "force": x["force"], "mech": x["mechanic"],
            "pm": x["primaryMuscles"], "sm": x["secondaryMuscles"], "ins": x["instructions"], "anim": anim,
        })
    out.sort(key=lambda e: e["name"].lower())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)} exercises -> {OUT} ({OUT.stat().st_size // 1024} KB)")
    if "--report" in sys.argv:
        print(Counter(e["anim"] for e in out).most_common())
        print(f"\n{len(fallback)} matched only a fallback:")
        for n, a in fallback:
            print(f"  {a:16} {n}")


if __name__ == "__main__":
    main()

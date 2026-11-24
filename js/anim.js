// Exercise motion: keyframe poses, solved into 2D joint positions that js/body3d.js turns into a
// posed 3D muscle model.
//
// A pattern is a list of keyframe poses. The player eases between them (ping-pong by default,
// or `loop: true` for cycles like running). Side-view poses are solved with forward kinematics
// from a root point plus optional 2-bone IK targets for hands and feet; front-view poses
// (`view: 'front'`) use mirrored abduction angles.
//
// Angles are in degrees measured from straight DOWN, positive toward the way the figure faces
// (right): 0 = down, 90 = forward, 180 = up, -90 = backward. Screen y grows downward.

export const G = 200; // ground line
const L = { torso: 50, neck: 6, head: 10, ua: 27, fa: 25, th: 38, sh: 36, ft: 13 };

const rad = (d) => (d * Math.PI) / 180;
const dir = (a) => [Math.sin(rad(a)), Math.cos(rad(a))];
const mv = (p, a, l) => { const d = dir(a); return [p[0] + d[0] * l, p[1] + d[1] * l]; };
const back = (p, a, l) => mv(p, a, -l);

// 2-bone IK from S toward target T. bend = +1 / -1 picks which side the middle joint goes.
function ik(S, T, a, b, bend) {
  let dx = T[0] - S[0], dy = T[1] - S[1];
  let d = Math.hypot(dx, dy) || 0.001;
  const dc = Math.min(Math.max(d, Math.abs(a - b) + 0.5), a + b - 0.05);
  const base = Math.atan2(dy, dx);
  const A = Math.acos(Math.min(1, Math.max(-1, (a * a + dc * dc - b * b) / (2 * a * dc))));
  const ang = base - bend * A;
  const M = [S[0] + a * Math.cos(ang), S[1] + a * Math.sin(ang)];
  const ex = T[0] - M[0], ey = T[1] - M[1], el = Math.hypot(ex, ey) || 1;
  return [M, [M[0] + (ex / el) * b, M[1] + (ey / el) * b]];
}

const DEF = { t: 180, nk: 0, shr: 0, th: 0, sh: 0, ft: 90, ua: 0, fa: 0, eb: 1, kb: -1 };

function solveSide(p) {
  p = { ...DEF, ...p };
  const off = p.ar ? p.t - 180 : 0; // arms relative to torso (bar on the back, front rack...)
  const ua = p.ua + off, fa = p.fa + off;
  const ua2 = (p.ua2 ?? p.ua) + off, fa2 = (p.fa2 ?? p.fa) + off;
  const th2 = p.th2 ?? p.th, sh2 = p.sh2 ?? p.sh;
  let hip;
  if (p.root === 'ankle') hip = back(back(p.at, p.sh, L.sh), p.th, L.th);
  else if (p.root === 'knee') hip = back(p.at, p.th, L.th);
  else if (p.root === 'hand') {
    const sho = back(back(p.at, fa, L.fa), ua, L.ua);
    hip = back(sho, p.t, L.torso + p.shr);
  } else hip = p.at;
  const sho = mv(hip, p.t, L.torso + p.shr);
  const neck = mv(sho, p.t + p.nk, L.neck);
  const head = mv(sho, p.t + p.nk, L.neck + L.head);
  const leg = (th, sh, ft, target, kb) => {
    let knee, ank;
    if (target) [knee, ank] = ik(hip, target, L.th, L.sh, kb);
    else { knee = mv(hip, th, L.th); ank = mv(knee, sh, L.sh); }
    return { knee, ank, toe: mv(ank, ft, L.ft) };
  };
  const arm = (ua, fa, target, eb) => {
    let elb, hand;
    if (target) [elb, hand] = ik(sho, target, L.ua, L.fa, eb);
    else { elb = mv(sho, ua, L.ua); hand = mv(elb, fa, L.fa); }
    return { elb, hand };
  };
  return {
    view: 'side', hip, sho, neck, head,
    leg1: leg(p.th, p.sh, p.ft, p.foot, p.kb),
    leg2: leg(th2, sh2, p.ft2 ?? p.ft, p.foot2 ?? (p.foot && !('th2' in p) ? p.foot : null), p.kb2 ?? p.kb),
    arm1: arm(ua, fa, p.hand, p.eb),
    arm2: arm(ua2, fa2, p.hand2 ?? (p.hand && !('ua2' in p) ? p.hand : null), p.eb2 ?? p.eb),
  };
}

// Front view: left/right mirrored. la = leg abduction, ub/fb = upper/fore arm abduction (0 down,
// 90 out sideways, 180 overhead), kn = knee flex (shortens the leg), tilt = side bend,
// cx = horizontal shift, air = lift off the ground. Any key can be split per side with an L/R suffix.
function solveFront(p) {
  p = { la: 6, ub: 8, fb: 8, kn: 0, tilt: 0, shr: 0, cx: 0, air: 0, ...p };
  const side = (k, s) => p[k + (s < 0 ? 'L' : 'R')] ?? p[k];
  const legs = [-1, 1].map((s) => {
    const la = side('la', s), kn = side('kn', s);
    const k = Math.cos(rad(kn / 2));
    return { s, la, kn, len: (L.th + L.sh) * k };
  });
  const drop = Math.max(...legs.map((l) => l.len * Math.cos(rad(l.la))));
  const hipC = [120 + p.cx, G - 4 - drop - p.air];
  const sC = mv(hipC, 180 + p.tilt, L.torso + p.shr);
  const perp = (c, w, s) => { const d = dir(90 + p.tilt); return [c[0] + d[0] * w * s, c[1] + d[1] * w * s]; };
  const out = { view: 'front', hip: hipC, sho: sC, head: mv(sC, 180 + p.tilt, L.neck + L.head), neck: mv(sC, 180 + p.tilt, L.neck) };
  for (const l of legs) {
    const h = perp(hipC, 9, l.s);
    const knee = mv(h, l.s * (l.la + l.kn * 0.6), L.th * Math.cos(rad(l.kn / 2)));
    const ank = mv(knee, l.s * (l.la - l.kn * 0.25), L.sh * Math.cos(rad(l.kn / 2)));
    out[l.s < 0 ? 'legL' : 'legR'] = { hip: h, knee, ank, toe: [ank[0] + l.s * 8, ank[1] + 2] };
  }
  for (const s of [-1, 1]) {
    const sh = perp(sC, 15, s);
    const elb = mv(sh, s * side('ub', s), L.ua);
    const hand = mv(elb, s * side('fb', s), L.fa);
    out[s < 0 ? 'armL' : 'armR'] = { sho: sh, elb, hand };
  }
  return out;
}

const solve = (p, view) => (view === 'front' ? solveFront(p) : solveSide(p));

function lerpPose(a, b, t) {
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? b[k], y = b[k] ?? a[k];
    if (typeof x === 'number') o[k] = x + (y - x) * t;
    else if (Array.isArray(x)) o[k] = x.map((v, i) => v + (y[i] - v) * t);
    else o[k] = t < 0.5 ? x : y;
  }
  return o;
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// ---------------------------------------------------------------- timing
// Equipment string from the exercise database -> what the body holds.
export function holdFor(equipment) {
  return ({ barbell: 'barbell', 'e-z curl bar': 'ezbar', dumbbell: 'dumbbell', kettlebells: 'kettlebell',
    cable: 'cable', bands: 'band', machine: 'machine', 'medicine ball': 'medball' })[equipment] || 'none';
}

export const workFrame = (pat) => pat.thumb ?? Math.min(1, pat.frames.length - 1);

// Pose at time `ms` (ping-pong through the keyframes, or loop), plus `effort` 0..1: how close the
// body is to the working end of the rep, which drives how strongly the muscles light up.
export function poseAt(pat, ms) {
  const fr = pat.frames, n = fr.length, w = workFrame(pat);
  if (n === 1) return { pose: fr[0], effort: 1 };
  const seg = pat.dur || 900, hold = pat.pause ?? 260;
  const steps = pat.loop ? n : (n - 1) * 2;
  const span = seg + (pat.loop ? 0 : hold);
  const pos = (ms % (steps * span)) / span;
  const i = Math.floor(pos);
  const local = Math.min(1, ((pos - i) * span) / seg);
  let a, b;
  if (pat.loop) { a = i % n; b = (i + 1) % n; } else {
    const seq = [...Array(n).keys(), ...[...Array(n - 1).keys()].reverse().slice(0, n - 2).map((k) => k + 1)];
    a = seq[i % seq.length]; b = seq[(i + 1) % seq.length];
  }
  const t = pat.loop ? local : ease(local);
  const effort = pat.loop ? 0.75 + 0.25 * Math.sin(ms / 160) : (a === w ? 1 - t : 0) + (b === w ? t : 0);
  return { pose: lerpPose(fr[a], fr[b], t), effort };
}

export { solve };

// ---------------------------------------------------------------- pattern library
const ST = { root: 'ankle', at: [112, 196] }; // standing, near ankle fixed
const stand = (o = {}) => ({ ...ST, ...o });
const benchFlat = { k: 'bench', a: [48, 152], b: [168, 152] };

export const PATTERNS = {
  generic: { name: 'Standing', frames: [stand({ ua: 8, fa: 8 }), stand({ ua: 20, fa: 30 })] },

  // ---- legs
  squat: { name: 'Squat', frames: [stand({ ar: 1, ua: -40, fa: 175 }), stand({ ar: 1, ua: -40, fa: 175, th: 85, sh: -28, t: 140 })] },
  frontSquat: { name: 'Front squat', frames: [stand({ ar: 1, ua: 95, fa: -140 }), stand({ ar: 1, ua: 95, fa: -140, th: 88, sh: -32, t: 160 })] },
  gobletSquat: { name: 'Goblet squat', frames: [stand({ ar: 1, ua: 25, fa: 160 }), stand({ ar: 1, ua: 25, fa: 160, th: 88, sh: -30, t: 155 })] },
  bwSquat: { name: 'Bodyweight squat', frames: [stand({ ua: 5, fa: 5 }), stand({ th: 85, sh: -28, t: 145, ua: 95, fa: 95 })] },
  lunge: { name: 'Lunge', frames: [
    { root: 'hip', at: [110, 131], foot: [152, 192], foot2: [66, 190], kb: -1, kb2: 1, ft2: 40 },
    { root: 'hip', at: [113, 156], foot: [152, 192], foot2: [66, 190], kb: -1, kb2: 1, ft2: 40 },
  ] },
  stepUp: { name: 'Step-up', props: [{ k: 'box', x: 120, y: 160, w: 55 }], frames: [
    { root: 'hip', at: [104, 128], foot: [140, 156], foot2: [98, 196], kb: -1, kb2: -1 },
    { root: 'hip', at: [138, 86], foot: [140, 156], foot2: [134, 152], kb: -1, kb2: -1 },
  ] },
  legPress: { name: 'Leg press', hold: 'none', plate: 135, props: [{ k: 'bench', a: [120, 170], b: [74, 132] }, { k: 'line', a: [120, 170], b: [120, G] }], frames: [
    { root: 'hip', at: [114, 160], t: 230, ua: 20, fa: 70, foot: [132, 112], kb: 1, ft: 140 },
    { root: 'hip', at: [114, 160], t: 230, ua: 20, fa: 70, foot: [164, 98], kb: 1, ft: 140 },
  ] },
  legExtension: { name: 'Leg extension', hold: 'none', props: [{ k: 'bench', a: [70, 150], b: [118, 150] }, { k: 'line', a: [72, 150], b: [66, 90], cls: 'pad' }], frames: [
    { root: 'hip', at: [100, 144], t: 175, th: 88, sh: 0, ft: 90, ua: 10, fa: 40 },
    { root: 'hip', at: [100, 144], t: 175, th: 88, sh: 80, ft: 170, ua: 10, fa: 40 },
  ] },
  legCurl: { name: 'Lying leg curl', hold: 'none', props: [{ k: 'bench', a: [40, 160], b: [170, 160] }], frames: [
    { root: 'hip', at: [110, 152], t: 90, nk: 0, th: -90, sh: -90, ft: 0, ua: 90, fa: 140 },
    { root: 'hip', at: [110, 152], t: 90, nk: 0, th: -90, sh: -175, ft: -90, ua: 90, fa: 140 },
  ] },
  calfRaise: { name: 'Calf raise', frames: [stand({ at: [112, 196] }), stand({ at: [112, 187], ft: 45 })] },
  seatedCalf: { name: 'Seated calf raise', props: [{ k: 'bench', a: [60, 140], b: [110, 140] }], hold: 'none', frames: [
    { root: 'hip', at: [92, 134], t: 180, th: 90, sh: 0, ua: 30, fa: 90 },
    { root: 'hip', at: [92, 124], t: 180, th: 82, sh: 0, ft: 45, ua: 30, fa: 90 },
  ] },
  bridge: { name: 'Glute bridge / hip thrust', supine: true, frames: [
    { root: 'hip', at: [112, 186], t: 98, foot: [70, 194], kb: -1, hand: [118, 180] },
    { root: 'hip', at: [112, 162], t: 58, foot: [70, 194], kb: -1, hand: [118, 158] },
  ] },
  hipThrust: { name: 'Hip thrust', supine: true, props: [{ k: 'bench', a: [150, 150], b: [200, 150] }], frames: [
    { root: 'hip', at: [126, 184], t: 132, foot: [76, 194], kb: -1, hand: [130, 178] },
    { root: 'hip', at: [114, 150], t: 92, foot: [76, 194], kb: -1, hand: [118, 144] },
  ] },
  abduction: { name: 'Hip abduction', view: 'front', frames: [{ la: 6, ub: 10, fb: 10 }, { laR: 40, laL: 4, ub: 10, fb: 10, cx: -8 }] },
  adduction: { name: 'Hip adduction', view: 'front', frames: [{ laR: 35, laL: 4, cx: -8, ub: 10, fb: 10 }, { la: 5, ub: 10, fb: 10 }] },
  sideLunge: { name: 'Side lunge', view: 'front', frames: [{ la: 22, ub: 8, fb: 8 }, { laL: 34, laR: 18, knR: 95, kn: 0, cx: 14, ub: 25, fb: 25 }] },

  // ---- hinge / back
  deadlift: { name: 'Deadlift', frames: [stand({ th: 70, sh: -18, t: 115, ua: -8, fa: -8 }), stand({})] , thumb: 0 },
  rdl: { name: 'Romanian deadlift', frames: [stand({}), stand({ th: 22, sh: -7, t: 102, ua: -4, fa: -4 })] },
  goodMorning: { name: 'Good morning', frames: [stand({ ar: 1, ua: -40, fa: 175 }), stand({ ar: 1, ua: -40, fa: 175, th: 12, sh: -6, t: 98 })] },
  hyperext: { name: 'Back extension', hold: 'none', props: [{ k: 'bench', a: [70, 152], b: [118, 128] }, { k: 'line', a: [62, 196], b: [78, 186], cls: 'pad' }], frames: [
    { root: 'hip', at: [116, 122], t: 10, th: -62, sh: -62, ft: 30, ar: 1, ua: 130, fa: 150 },
    { root: 'hip', at: [116, 122], t: 118, th: -62, sh: -62, ft: 30, ar: 1, ua: 130, fa: 150 },
  ] },
  kbSwing: { name: 'Kettlebell swing', frames: [
    stand({ th: 55, sh: -18, t: 118, ua: -25, fa: -25 }),
    stand({ ua: 95, fa: 95 }),
  ] },
  row: { name: 'Bent-over row', frames: [
    stand({ th: 28, sh: -12, t: 122, ua: 0, fa: 0 }),
    stand({ th: 28, sh: -12, t: 122, ua: -110, fa: -8 }),
  ] },
  seatedRow: { name: 'Seated row', anchor: [214, 168], props: [{ k: 'bench', a: [60, 172], b: [130, 172] }, { k: 'line', a: [178, 150], b: [178, 196], cls: 'pad' }], frames: [
    { root: 'hip', at: [100, 166], t: 162, foot: [176, 172], kb: 1, ua: 82, fa: 88 },
    { root: 'hip', at: [100, 166], t: 186, foot: [176, 172], kb: 1, ua: -35, fa: 85 },
  ] },
  invertedRow: { name: 'Inverted row', supine: true, hold: 'none', props: [{ k: 'bar', x1: 110, x2: 200, y: 120 }], frames: [
    { root: 'ankle', at: [40, 192], th: -70, sh: -70, t: 110, ft: 10, hand: [150, 120], eb: -1 },
    { root: 'ankle', at: [40, 192], th: -82, sh: -82, t: 98, ft: 10, hand: [150, 120], eb: -1 },
  ] },
  pullup: { name: 'Pull-up', hold: 'none', props: [{ k: 'bar', x1: 70, x2: 190, y: 36 }], frames: [
    { root: 'hand', at: [130, 36], ua: 178, fa: 179, t: 182, th: 8, sh: -28, ft: 60 },
    { root: 'hand', at: [130, 36], ua: 30, fa: 175, t: 172, th: 18, sh: -24, ft: 60 },
  ] },
  latPulldown: { name: 'Lat pulldown', anchor: [134, 12], props: [{ k: 'bench', a: [80, 156], b: [126, 156] }, { k: 'line', a: [122, 132], b: [140, 132], cls: 'pad' }], frames: [
    { root: 'hip', at: [104, 150], t: 175, th: 90, sh: 0, ua: 170, fa: 174 },
    { root: 'hip', at: [104, 150], t: 168, th: 90, sh: 0, ua: 30, fa: 168 },
  ] },
  straightArmPulldown: { name: 'Straight-arm pulldown', anchor: [196, 30], frames: [
    stand({ t: 165, th: 10, sh: -5, ua: 150, fa: 150 }), stand({ t: 165, th: 10, sh: -5, ua: 5, fa: 5 }),
  ] },
  shrug: { name: 'Shrug', frames: [stand({}), stand({ shr: 7 })] },
  uprightRow: { name: 'Upright row', frames: [
    stand({ hand: [117, 126], eb: 1 }), stand({ hand: [119, 80], eb: 1 }),
  ] },
  facePull: { name: 'Face pull', anchor: [210, 66], frames: [
    stand({ t: 176, ua: 84, fa: 88 }), stand({ t: 182, ua: 200, fa: 95 }),
  ] },
  rearDelt: { name: 'Reverse fly', frames: [
    stand({ th: 20, sh: -8, t: 112, ua: 2, fa: 4 }), stand({ th: 20, sh: -8, t: 112, ua: -78, fa: -70 }),
  ] },

  // ---- chest / push
  bench: { name: 'Bench press', supine: true, props: [benchFlat], frames: [
    { root: 'hip', at: [76, 144], t: 90, foot: [44, 194], kb: 1, hand: [122, 90], eb: 1 },
    { root: 'hip', at: [76, 144], t: 90, foot: [44, 194], kb: 1, hand: [117, 128], eb: 1 },
  ] },
  inclineBench: { name: 'Incline press', supine: true, props: [{ k: 'bench', a: [70, 160], b: [150, 106] }], frames: [
    { root: 'hip', at: [88, 150], t: 124, foot: [52, 194], kb: 1, hand: [136, 66], eb: 1 },
    { root: 'hip', at: [88, 150], t: 124, foot: [52, 194], kb: 1, hand: [128, 104], eb: 1 },
  ] },
  declineBench: { name: 'Decline press', supine: true, props: [{ k: 'bench', a: [56, 128], b: [168, 162] }], frames: [
    { root: 'hip', at: [80, 122], t: 72, th: -150, sh: -40, ft: -10, hand: [130, 88], eb: 1 },
    { root: 'hip', at: [80, 122], t: 72, th: -150, sh: -40, ft: -10, hand: [124, 128], eb: 1 },
  ] },
  fly: { name: 'Chest fly', supine: true, props: [benchFlat], frames: [
    { root: 'hip', at: [76, 144], t: 90, foot: [44, 194], kb: 1, ua: 178, fa: 170 },
    { root: 'hip', at: [76, 144], t: 90, foot: [44, 194], kb: 1, ua: 108, fa: 128 },
  ] },
  pullover: { name: 'Pullover', supine: true, props: [benchFlat], frames: [
    { root: 'hip', at: [76, 144], t: 90, foot: [44, 194], kb: 1, ua: 175, fa: 175 },
    { root: 'hip', at: [76, 144], t: 90, foot: [44, 194], kb: 1, ua: 68, fa: 75 },
  ] },
  cableFly: { name: 'Cable crossover', anchor: [24, 30], frames: [
    stand({ t: 170, ua: -70, fa: -40 }), stand({ t: 170, ua: 55, fa: 60 }),
  ] },
  machinePress: { name: 'Chest press', anchor: [200, 108], props: [{ k: 'bench', a: [70, 150], b: [110, 150] }, { k: 'line', a: [72, 150], b: [64, 80], cls: 'pad' }], frames: [
    { root: 'hip', at: [92, 144], t: 175, th: 88, sh: 0, ua: -30, fa: 90 },
    { root: 'hip', at: [92, 144], t: 175, th: 88, sh: 0, ua: 85, fa: 92 },
  ] },
  pushup: { name: 'Push-up', hold: 'none', frames: [
    { root: 'ankle', at: [45, 187], th: -70, sh: -70, t: 110, ft: 0, hand: [161, 197], eb: 1 },
    { root: 'ankle', at: [45, 187], th: -84, sh: -84, t: 96, ft: 0, hand: [161, 197], eb: 1 },
  ] },
  dip: { name: 'Dip', hold: 'none', props: [{ k: 'line', a: [100, 112], b: [160, 112], cls: 'rod' }, { k: 'line', a: [150, 112], b: [150, 196] }], frames: [
    { root: 'hand', at: [126, 112], ua: 0, fa: 0, t: 178, th: 10, sh: -60, ft: 40 },
    { root: 'hand', at: [126, 112], ua: -80, fa: 20, t: 165, th: 18, sh: -60, ft: 40 },
  ] },

  // ---- shoulders / arms
  ohp: { name: 'Overhead press', frames: [stand({ ua: 25, fa: 175 }), stand({ ua: 172, fa: 178 })] },
  seatedPress: { name: 'Seated press', props: [{ k: 'bench', a: [80, 150], b: [120, 150] }, { k: 'line', a: [82, 150], b: [78, 84], cls: 'pad' }], frames: [
    { root: 'hip', at: [98, 144], t: 178, th: 88, sh: -5, ua: 25, fa: 175 },
    { root: 'hip', at: [98, 144], t: 178, th: 88, sh: -5, ua: 172, fa: 178 },
  ] },
  lateralRaise: { name: 'Lateral raise', view: 'front', frames: [{ ub: 8, fb: 8 }, { ub: 86, fb: 92 }] },
  frontRaise: { name: 'Front raise', frames: [stand({ ua: 4, fa: 6 }), stand({ ua: 92, fa: 95 })] },
  curl: { name: 'Curl', frames: [stand({ ua: 4, fa: 6 }), stand({ ua: 12, fa: 158 })] },
  preacherCurl: { name: 'Preacher curl', props: [{ k: 'bench', a: [70, 150], b: [110, 150] }, { k: 'line', a: [118, 96], b: [140, 124], cls: 'pad' }], frames: [
    { root: 'hip', at: [96, 144], t: 172, th: 88, sh: 0, ua: 42, fa: 60 },
    { root: 'hip', at: [96, 144], t: 172, th: 88, sh: 0, ua: 42, fa: 168 },
  ] },
  pushdown: { name: 'Triceps pushdown', anchor: [146, 16], frames: [stand({ t: 172, ua: 8, fa: 100 }), stand({ t: 172, ua: 6, fa: 4 })] },
  overheadExt: { name: 'Overhead extension', frames: [stand({ ua: 172, fa: -12 }), stand({ ua: 172, fa: -186 })] },
  skullCrusher: { name: 'Lying triceps extension', supine: true, props: [benchFlat], frames: [
    { root: 'hip', at: [76, 144], t: 90, foot: [44, 194], kb: 1, ua: 166, fa: 28 },
    { root: 'hip', at: [76, 144], t: 90, foot: [44, 194], kb: 1, ua: 170, fa: 172 },
  ] },
  kickback: { name: 'Triceps kickback', frames: [
    stand({ th: 20, sh: -8, t: 115, ua: -80, fa: 8 }), stand({ th: 20, sh: -8, t: 115, ua: -80, fa: -80 }),
  ] },
  wristCurl: { name: 'Wrist curl', props: [{ k: 'bench', a: [70, 150], b: [110, 150] }], frames: [
    { root: 'hip', at: [92, 144], t: 160, th: 88, sh: 0, ua: 40, fa: 92 },
    { root: 'hip', at: [92, 144], t: 160, th: 88, sh: 0, ua: 40, fa: 120 },
  ] },

  // ---- core
  crunch: { name: 'Crunch', supine: true, hold: 'none', frames: [
    { root: 'hip', at: [110, 192], t: 90, th: -140, sh: -30, ft: -90, ar: 1, ua: 150, fa: -60 },
    { root: 'hip', at: [110, 192], t: 122, th: -140, sh: -30, ft: -90, ar: 1, ua: 150, fa: -60 },
  ] },
  situp: { name: 'Sit-up', supine: true, hold: 'none', frames: [
    { root: 'hip', at: [110, 192], t: 90, th: -140, sh: -30, ft: -90, ar: 1, ua: 150, fa: -60 },
    { root: 'hip', at: [110, 192], t: 172, th: -140, sh: -30, ft: -90, ar: 1, ua: 150, fa: -60 },
  ] },
  legRaise: { name: 'Leg raise', supine: true, hold: 'none', frames: [
    { root: 'hip', at: [100, 192], t: 90, th: -88, sh: -88, ft: -175, ua: 80, fa: 80 },
    { root: 'hip', at: [100, 192], t: 90, th: -178, sh: -178, ft: 95, ua: 80, fa: 80 },
  ] },
  hangingLegRaise: { name: 'Hanging leg raise', hold: 'none', props: [{ k: 'bar', x1: 70, x2: 190, y: 30 }], frames: [
    { root: 'hand', at: [124, 30], ua: 178, fa: 179, t: 180, th: 0, sh: 0, ft: 60 },
    { root: 'hand', at: [124, 30], ua: 178, fa: 179, t: 176, th: 92, sh: 92, ft: 170 },
  ] },
  plank: { name: 'Plank', hold: 'none', dur: 1400, frames: [
    { root: 'ankle', at: [40, 187], th: -80, sh: -80, t: 100, ft: 0, ua: 0, fa: 90 },
    { root: 'ankle', at: [40, 187], th: -78, sh: -78, t: 102, ft: 0, ua: 0, fa: 90 },
  ] },
  sidePlank: { name: 'Side plank', hold: 'none', dur: 1400, frames: [
    { root: 'ankle', at: [40, 190], th: -72, sh: -72, t: 108, ft: 20, hand: [158, 197], ua2: 180, fa2: 180 },
    { root: 'ankle', at: [40, 190], th: -70, sh: -70, t: 110, ft: 20, hand: [158, 197], ua2: 175, fa2: 178 },
  ] },
  mountainClimber: { name: 'Mountain climber', hold: 'none', loop: true, dur: 380, frames: [
    { root: 'hand', at: [168, 197], ua: 0, fa: 0, t: 108, th: -62, sh: -78, th2: 40, sh2: -60, ft: 0, ft2: 0 },
    { root: 'hand', at: [168, 197], ua: 0, fa: 0, t: 108, th: 40, sh: -60, th2: -62, sh2: -78, ft: 0, ft2: 0 },
  ] },
  russianTwist: { name: 'Russian twist', view: 'front', frames: [{ la: 30, kn: 40, air: -12, tilt: -14, ub: 40, fb: 70, ubL: -30, fbL: 40 }, { la: 30, kn: 40, air: -12, tilt: 14, ubR: -30, fbR: 40, ub: 40, fb: 70 }] },
  sideBend: { name: 'Side bend', view: 'front', frames: [{ la: 8, tilt: 0, ub: 6, fb: 6 }, { la: 8, tilt: 24, ubR: 32, fbR: 32, ubL: -28, fbL: -24 }] },
  woodchop: { name: 'Woodchop', anchor: [210, 24], frames: [
    stand({ t: 182, ua: 160, fa: 160, th: 4 }), stand({ t: 150, th: 40, sh: -16, ua: -30, fa: -30 }),
  ] },
  rollout: { name: 'Ab rollout', hold: 'none', props: [], frames: [
    { root: 'knee', at: [70, 194], th: -10, sh: -90, ft: 0, t: 140, hand: [112, 186], eb: 1 },
    { root: 'knee', at: [70, 194], th: -70, sh: -90, ft: 0, t: 98, hand: [176, 186], eb: 1 },
  ] },

  // ---- full body / power / cardio
  clean: { name: 'Clean', dur: 650, frames: [
    stand({ th: 70, sh: -18, t: 115, ua: -8, fa: -8 }),
    stand({ th: 8, t: 186, ua: -10, fa: -10, at: [112, 192], ft: 60 }),
    stand({ ar: 1, ua: 95, fa: -140, th: 60, sh: -26, t: 165 }),
    stand({ ar: 1, ua: 95, fa: -140 }),
  ] },
  snatch: { name: 'Snatch', dur: 650, frames: [
    stand({ th: 70, sh: -18, t: 115, ua: -14, fa: -14 }),
    stand({ th: 8, t: 186, ua: -14, fa: -14, at: [112, 192], ft: 60 }),
    stand({ th: 85, sh: -30, t: 150, ua: 190, fa: 190 }),
    stand({ ua: 182, fa: 182 }),
  ] },
  pushPress: { name: 'Push press / jerk', dur: 600, frames: [
    stand({ ua: 25, fa: 175 }), stand({ ua: 25, fa: 175, th: 35, sh: -14, t: 174 }), stand({ ua: 174, fa: 178, at: [112, 190], ft: 55 }),
  ] },
  thruster: { name: 'Thruster', frames: [stand({ ar: 1, ua: 95, fa: -140, th: 88, sh: -32, t: 160 }), stand({ ua: 174, fa: 178 })] },
  jump: { name: 'Jump', dur: 500, frames: [
    stand({ th: 70, sh: -26, t: 140, ua: -50, fa: -40 }), stand({ at: [112, 150], ft: 30, ua: 170, fa: 175 }),
  ] },
  boxJump: { name: 'Box jump', dur: 520, props: [{ k: 'box', x: 152, y: 150, w: 60 }], frames: [
    stand({ at: [100, 196], th: 70, sh: -26, t: 140, ua: -50, fa: -40 }),
    stand({ at: [130, 128], th: 50, sh: -60, ft: 40, ua: 150, fa: 160 }),
    stand({ at: [168, 150], th: 50, sh: -20, t: 150, ua: 60, fa: 70 }),
  ] },
  burpee: { name: 'Burpee', dur: 450, loop: true, frames: [
    stand({ ua: 170, fa: 175, at: [112, 180], ft: 40 }),
    stand({ th: 90, sh: -40, t: 120, hand: [150, 196] }),
    { root: 'hand', at: [150, 197], ua: 0, fa: 0, t: 108, th: -68, sh: -72, ft: 0 },
    stand({ th: 90, sh: -40, t: 120, hand: [150, 196] }),
  ] },
  jumpingJack: { name: 'Jumping jack', view: 'front', dur: 380, frames: [{ la: 4, ub: 8, fb: 8 }, { la: 22, ub: 165, fb: 172, air: 6 }] },
  run: { name: 'Run', hold: 'none', loop: true, dur: 260, frames: [
    stand({ root: 'hip', at: [112, 128], t: 172, th: 40, sh: -30, th2: -30, sh2: -80, ft: 80, ft2: 30, ua: -40, fa: 50, ua2: 40, fa2: 120 }),
    stand({ root: 'hip', at: [112, 124], t: 172, th: 0, sh: -10, th2: 20, sh2: -100, ft: 90, ft2: 20, ua: 0, fa: 70, ua2: 0, fa2: 80 }),
    stand({ root: 'hip', at: [112, 128], t: 172, th: -30, sh: -80, th2: 40, sh2: -30, ft: 30, ft2: 80, ua: 40, fa: 120, ua2: -40, fa2: 50 }),
    stand({ root: 'hip', at: [112, 124], t: 172, th: 20, sh: -100, th2: 0, sh2: -10, ft: 20, ft2: 90, ua: 0, fa: 80, ua2: 0, fa2: 70 }),
  ] },
  walk: { name: 'Carry / walk', loop: true, dur: 420, frames: [
    stand({ root: 'hip', at: [112, 124], th: 18, sh: 4, th2: -16, sh2: -24, ft2: 60, ua: 3, fa: 3 }),
    stand({ root: 'hip', at: [112, 122], th: 0, sh: 0, th2: 6, sh2: -40, ft2: 60, ua: 3, fa: 3 }),
    stand({ root: 'hip', at: [112, 124], th: -16, sh: -24, th2: 18, sh2: 4, ft: 60, ua: 3, fa: 3 }),
    stand({ root: 'hip', at: [112, 122], th: 6, sh: -40, th2: 0, sh2: 0, ft: 60, ua: 3, fa: 3 }),
  ] },
  bike: { name: 'Cycling', hold: 'none', loop: true, dur: 260, props: [{ k: 'bike', x: 124, y: 168, sx: 98, sy: 118 }], frames: [0, 90, 180, 270].map((a) => {
    const r = 14, fx = 124 + r * Math.sin(rad(a)), fy = 168 - r * Math.cos(rad(a));
    const gx = 124 - r * Math.sin(rad(a)), gy = 168 + r * Math.cos(rad(a));
    return { root: 'hip', at: [98, 114], t: 150, foot: [fx, fy], foot2: [gx, gy], kb: 1, kb2: 1, hand: [150, 108], eb: -1 };
  }) },
  rower: { name: 'Rowing machine', anchor: [214, 172], hold: 'none', props: [{ k: 'line', a: [30, 190], b: [214, 190], cls: 'rod' }], frames: [
    { root: 'hip', at: [128, 182], t: 160, foot: [176, 184], kb: 1, ua: 85, fa: 88 },
    { root: 'hip', at: [72, 182], t: 195, foot: [176, 184], kb: 1, ua: -30, fa: 85 },
  ] },
  jumpRope: { name: 'Jump rope', hold: 'none', dur: 260, frames: [
    stand({ ua: 20, fa: 60 }), stand({ at: [112, 184], ft: 40, ua: 20, fa: 60 }),
  ] },
  foamRoll: { name: 'Foam roll', hold: 'none', props: [{ k: 'roller', x: 118 }], frames: [
    { root: 'hip', at: [100, 178], t: 98, th: -90, sh: -90, ft: 0, hand: [150, 197], eb: 1 },
    { root: 'hip', at: [128, 178], t: 98, th: -90, sh: -90, ft: 0, hand: [160, 197], eb: 1 },
  ] },
  kneeling: { name: 'Quadruped', hold: 'none', frames: [
    { root: 'hip', at: [92, 150], t: 90, th: 0, sh: -90, ft: -90, hand: [140, 197] },
    { root: 'hip', at: [92, 150], t: 90, th: -100, sh: -110, th2: 0, sh2: -90, ft: -90, ft2: -90, hand: [140, 197] },
  ] },

  // ---- stretching
  stretchFold: { name: 'Forward fold', hold: 'none', dur: 1600, frames: [stand({ ua: 4, fa: 4 }), stand({ t: 55, th: 8, sh: -4, ua: 30, fa: 30, nk: -10 })] },
  stretchQuad: { name: 'Quad stretch', hold: 'none', dur: 1600, frames: [stand({ ua: 4, fa: 4 }), stand({ th2: -10, sh2: -170, ft2: -170, ua2: -30, fa2: -10, ua: 60, fa: 70 })] },
  stretchArm: { name: 'Arm stretch', view: 'front', hold: 'none', dur: 1600, frames: [{ ub: 8, fb: 8 }, { ubR: 170, fbR: 230, ubL: 150, fbL: 200, tilt: 8 }] },
  stretchChest: { name: 'Chest stretch', hold: 'none', dur: 1600, frames: [stand({ ua: 4, fa: 4 }), stand({ ua: -60, fa: -40, t: 184 })] },
  stretchLunge: { name: 'Hip flexor stretch', hold: 'none', dur: 1600, frames: [
    { root: 'hip', at: [110, 150], foot: [150, 194], foot2: [66, 192], kb: -1, kb2: 1, ft2: 0, ua: 4, fa: 4 },
    { root: 'hip', at: [116, 164], t: 186, foot: [150, 194], foot2: [66, 192], kb: -1, kb2: 1, ft2: 0, ua: 175, fa: 178 },
  ] },
  stretchSide: { name: 'Side stretch', view: 'front', hold: 'none', dur: 1600, frames: [{ la: 10, ub: 8, fb: 8 }, { la: 10, tilt: 22, ubL: 160, fbL: 150, ubR: 20, fbR: 20 }] },
  stretchSeated: { name: 'Seated stretch', hold: 'none', dur: 1600, frames: [
    { root: 'hip', at: [100, 192], t: 175, th: 90, sh: 90, ft: 180, ua: 20, fa: 20 },
    { root: 'hip', at: [100, 192], t: 120, th: 90, sh: 90, ft: 180, ua: 95, fa: 95, nk: -10 },
  ] },
  neck: { name: 'Neck', hold: 'none', dur: 1200, frames: [stand({ nk: 0 }), stand({ nk: 30 })] },
};

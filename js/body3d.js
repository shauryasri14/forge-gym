// 3D muscle body: a stylised anatomy model where each of the 17 muscle groups in the exercise
// database is its own set of meshes. The body is posed every frame from the 2D keyframe solver in
// anim.js (side-view poses become sagittal-plane motion with left/right limbs offset in depth;
// front-view poses become frontal-plane motion). Primary muscles glow red and pulse with the
// effort of the rep, secondary muscles glow orange.
//
// 3D axes: +X = the way the body faces, +Y = up, +Z = the body's right side (the near side in
// side-view poses). Units are the same as anim.js (torso = 50).
import * as THREE from '../vendor/three.module.min.js';
import { PATTERNS, poseAt, solve, workFrame, holdFor } from './anim.js';

export { holdFor };
export const MUSCLE_GROUPS = ['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps'];
const BACK_GROUPS = new Set(['lats', 'middle back', 'lower back', 'traps', 'triceps', 'glutes', 'hamstrings', 'calves']);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
const NOMINAL = { torso: 50, neck: 16, ua: 27, fa: 25, th: 38, sh: 36, ft: 11 };

const COL = {
  base: new THREE.Color('#5c6370'), idle: new THREE.Color('#b9a6aa'),
  primary: new THREE.Color('#ff2b2b'), secondary: new THREE.Color('#ff9c33'),
  equip: new THREE.Color('#2d3139'), plate: new THREE.Color('#ff6b2c'), metal: new THREE.Color('#9aa3ad'),
};

// ------------------------------------------------------------------ 2D solve -> 3D joints
function joints3d(s) {
  if (s.view === 'front') {
    const F = (p) => V(0, 200 - p[1], 120 - p[0]); // screen-left is the body's right (+Z)
    const side = (sgn, leg, arm) => {
      const ank = F(leg.ank);
      return { s: sgn, hip: F(leg.hip), knee: F(leg.knee), ank, toe: ank.clone().addScaledVector(AX, NOMINAL.ft),
        sho: F(arm.sho), elb: F(arm.elb), hand: F(arm.hand) };
    };
    return { view: 'front', hipC: F(s.hip), shoC: F(s.sho), head: F(s.head), sides: [side(1, s.legL, s.armL), side(-1, s.legR, s.armR)] };
  }
  const P = (p, z = 0) => V(p[0] - 120, 200 - p[1], z);
  const side = (sgn, leg, arm) => ({
    s: sgn, hip: P(s.hip, 9 * sgn), knee: P(leg.knee, 9 * sgn), ank: P(leg.ank, 9 * sgn), toe: P(leg.toe, 9 * sgn),
    sho: P(s.sho, 15 * sgn), elb: P(arm.elb, 15 * sgn), hand: P(arm.hand, 15 * sgn),
  });
  return { view: 'side', hipC: P(s.hip), shoC: P(s.sho), head: P(s.head), sides: [side(1, s.leg1, s.arm1), side(-1, s.leg2, s.arm2)] };
}

// Point a segment group from A to B. Local axes: x = lateral, y = along the segment, z = its front.
const _u = V(), _f = V(), _l = V();
function orient(g, A, B, nominal, view, kind, flip) {
  _u.subVectors(B, A);
  const len = _u.length() || 1e-3;
  _u.divideScalar(len);
  if (view === 'side') kind === 'up' ? _f.crossVectors(_u, AZ) : _f.crossVectors(AZ, _u);
  else _f.copy(AX).addScaledVector(_u, -_u.dot(AX));
  if (_f.lengthSq() < 1e-4) _f.copy(AY).addScaledVector(_u, -_u.dot(AY));
  _f.normalize();
  _l.crossVectors(_u, _f);
  if (flip) _f.negate(); // lying face-up: same joints, body rolled over (mirrored basis keeps sides outward)
  g.matrix.makeBasis(_l, _u.multiplyScalar(len / nominal), _f).setPosition(A);
  g.matrixWorldNeedsUpdate = true;
}

function placeBetween(mesh, A, B) { // unit-height Y-aligned mesh stretched from A to B
  const d = V().subVectors(B, A), len = d.length() || 1e-3;
  mesh.position.copy(A).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(AY, d.divideScalar(len));
  mesh.scale.set(1, len, 1);
}

// ------------------------------------------------------------------ the body
const SPH = new THREE.SphereGeometry(1, 28, 18);

class Body {
  constructor() {
    this.root = new THREE.Group();
    this.mats = {};
    this.baseMat = new THREE.MeshStandardMaterial({ color: COL.base, roughness: 0.75, metalness: 0.05 });
    for (const g of MUSCLE_GROUPS) this.mats[g] = new THREE.MeshStandardMaterial({ color: COL.idle.clone(), roughness: 0.5, metalness: 0.02, emissive: new THREE.Color(0) });
    const seg = () => { const g = new THREE.Group(); g.matrixAutoUpdate = false; this.root.add(g); return g; };
    this.torso = seg(); this.neck = seg();
    this.limbs = [1, -1].map((s) => ({ s, ua: seg(), fa: seg(), th: seg(), sh: seg(), ft: seg() }));
    this.build();
    this.level = {};
  }

  blob(parent, mat, pos, r, rot = [0, 0, 0]) {
    const m = new THREE.Mesh(SPH, mat);
    m.position.set(...pos); m.scale.set(...r); m.rotation.set(...rot);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  cap(parent, r, len, y0 = 0, r2) {
    const geo = r2 ? new THREE.CylinderGeometry(r2, r, len, 18) : new THREE.CapsuleGeometry(r, Math.max(0.1, len - 2 * r), 6, 18);
    const m = new THREE.Mesh(geo, this.baseMat);
    m.position.y = y0 + len / 2; m.castShadow = true;
    parent.add(m);
    return m;
  }

  build() {
    const M = this.mats, B = this.baseMat, T = this.torso;
    // torso base (local x is lateral, y up from the hip centre, z = front)
    this.blob(T, B, [0, 4, 0], [12.5, 8.5, 8.5]);
    this.blob(T, B, [0, 19, 0], [11, 13, 8]);
    this.blob(T, B, [0, 36, 0], [14.5, 16, 9.6]);
    this.blob(T, B, [0, 47, 0], [16, 4.5, 7]);
    for (const x of [-1, 1]) {
      this.blob(T, M.chest, [6.6 * x, 40.5, 7.2], [7.4, 6, 3.4], [0, 0, -0.28 * x]);
      for (const [i, y] of [12.5, 18, 23.5, 29].entries()) this.blob(T, M.abdominals, [3.2 * x, y, 7.6 + (i === 3 ? 0.9 : 0)], [2.9, 2.6, 1.6]);
      this.blob(T, M.abdominals, [10 * x, 20, 3.5], [3, 9, 4.6]);           // obliques
      this.blob(T, M.traps, [6.5 * x, 48.6, -2.2], [7.5, 3.3, 4.2], [0, 0, 0.35 * x]);
      this.blob(T, M.traps, [2.4 * x, 43, -8.4], [3, 6.5, 2]);
      this.blob(T, M['middle back'], [5.8 * x, 37.5, -8.6], [4.2, 6.2, 2.2], [0, 0, -0.2 * x]);
      this.blob(T, M.lats, [10.4 * x, 30, -5.6], [4.6, 11.5, 4.2], [0, 0, 0.22 * x]);
      this.blob(T, M['lower back'], [3.4 * x, 16, -7.3], [2.6, 9.5, 2.4]);
      this.blob(T, M.glutes, [6.2 * x, 3, -6.2], [6.6, 7.2, 5.6]);
    }
    // neck + head (local y runs from the shoulder centre up to the head centre, 16 units)
    const N = this.neck;
    this.cap(N, 4.2, 9, 0);
    for (const x of [-1, 1]) this.blob(N, M.neck, [2.3 * x, 4, 2.2], [1.6, 5, 1.6], [0.35, 0, 0.3 * x]);
    this.blob(N, B, [0, 16, 0], [7.6, 9.2, 8.4]);
    this.blob(N, B, [0, 11, 3.6], [5.4, 4, 4.6]);
    // limbs; x offsets are "outward" so they flip with the side
    for (const L of this.limbs) {
      const o = L.s;
      this.cap(L.ua, 3.4, 27);
      this.blob(L.ua, M.shoulders, [1.6 * o, 2.5, 0], [5.6, 7.2, 5.8]);
      this.blob(L.ua, M.biceps, [0, 14, 2.5], [3.3, 8.6, 3.2]);
      this.blob(L.ua, M.triceps, [0.4 * o, 12, -2.7], [3.6, 10, 3.4]);
      this.blob(L.fa, B, [0, 0, 0], [3, 3, 3]);                             // elbow
      this.cap(L.fa, 2.2, 25, 0, 3.1);
      this.blob(L.fa, M.forearms, [0.4 * o, 7.5, 0.9], [3.3, 8, 3]);
      this.blob(L.fa, M.forearms, [-0.6 * o, 8.5, -0.9], [2.7, 8, 2.6]);
      this.blob(L.fa, B, [0, 27.5, 0], [2, 3.8, 3]);                        // hand
      this.cap(L.th, 5.2, 38);
      this.blob(L.th, M.quadriceps, [0.8 * o, 20, 3.6], [5.2, 14, 4.3]);
      this.blob(L.th, M.quadriceps, [-2.4 * o, 31.5, 2.8], [3.1, 5, 3]);
      this.blob(L.th, M.hamstrings, [0.2 * o, 19, -3.4], [4.6, 15, 4]);
      this.blob(L.th, M.adductors, [-3.7 * o, 11, 0.4], [3, 10, 4]);
      this.blob(L.th, M.abductors, [5.4 * o, 3, -0.5], [3, 6.5, 4.6]);
      this.blob(L.sh, B, [0, 0, 0.6], [4.2, 4, 4]);                         // knee
      this.cap(L.sh, 2.6, 36, 0, 3.8);
      this.blob(L.sh, M.calves, [0, 9, -2.9], [3.9, 9, 3.6]);
      this.blob(L.sh, M.calves, [0, 17, -2], [3, 7, 2.8]);
      this.blob(L.ft, B, [0, 4.5, -0.6], [3.2, 7.5, 2.4]);
    }
  }

  pose(J, flip = false) {
    orient(this.torso, J.hipC, J.shoC, NOMINAL.torso, J.view, 'up', flip);
    orient(this.neck, J.shoC, J.head, NOMINAL.neck, J.view, 'up', flip);
    for (const L of this.limbs) {
      const j = J.sides.find((x) => x.s === L.s);
      orient(L.ua, j.sho, j.elb, NOMINAL.ua, J.view, null, flip);
      orient(L.fa, j.elb, j.hand, NOMINAL.fa, J.view, null, flip);
      orient(L.th, j.hip, j.knee, NOMINAL.th, J.view, null, flip);
      orient(L.sh, j.knee, j.ank, NOMINAL.sh, J.view, null, flip);
      orient(L.ft, j.ank, j.toe, NOMINAL.ft, J.view, null, flip);
    }
  }

  setActivation(pm = [], sm = []) {
    this.level = {};
    for (const m of sm) this.level[m] = 'secondary';
    for (const m of pm) this.level[m] = 'primary';
  }

  glow(effort) {
    for (const g of MUSCLE_GROUPS) {
      const mat = this.mats[g], lv = this.level[g];
      if (!lv) { mat.color.copy(COL.idle); mat.emissive.setRGB(0, 0, 0); continue; }
      const k = lv === 'primary' ? 0.55 + 0.45 * effort : 0.45 + 0.25 * effort;
      const c = lv === 'primary' ? COL.primary : COL.secondary;
      mat.color.copy(COL.idle).lerp(c, Math.min(1, k + 0.25));
      mat.emissive.copy(c).multiplyScalar(0.42 * k);
    }
  }
}

// ------------------------------------------------------------------ equipment & props
function mat(c, extra = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2, ...extra }); }

class Equipment {
  constructor(scene) { this.scene = scene; this.group = new THREE.Group(); scene.add(this.group); this.held = []; }

  clear() {
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    this.group.clear(); this.held = [];
  }

  add(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh); return mesh; }

  build(pat, hold) {
    this.clear();
    const P = (p, z = 0) => V(p[0] - 120, 200 - p[1], z);
    const dark = mat(COL.equip), metal = mat(COL.metal, { metalness: 0.6, roughness: 0.35 }), plate = mat(COL.plate, { roughness: 0.45 });
    const box = (w, h, d, m) => this.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
    const rod = (r, m) => this.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 14), m));
    const slab = (a, b, width, thick, m) => {
      const A = P(a), B = P(b), d = V().subVectors(B, A), len = d.length();
      const s = box(len, thick, width, m);
      s.position.copy(A).addScaledVector(d, 0.5).add(V(0, -thick / 2, 0));
      s.rotation.z = Math.atan2(d.y, d.x);
      return s;
    };
    for (const pr of pat.props || []) {
      if (pr.k === 'bench') {
        slab(pr.a, pr.b, 26, 6, dark);
        const mid = P([(pr.a[0] + pr.b[0]) / 2, Math.max(pr.a[1], pr.b[1])]);
        for (const dx of [-20, 20]) { const leg = rod(1.6, metal); placeBetween(leg, V(mid.x + dx, mid.y - 4, 0), V(mid.x + dx * 1.15, 0, 0)); }
      } else if (pr.k === 'bar') {
        const y = 200 - pr.y, x = (pr.x1 + pr.x2) / 2 - 120;
        const bar = rod(1.4, metal); placeBetween(bar, V(x, y, -38), V(x, y, 38));
        for (const z of [-38, 38]) { const post = rod(2, dark); placeBetween(post, V(x, y, z), V(x, 0, z)); }
      } else if (pr.k === 'box') {
        const b = box(pr.w, 200 - pr.y, 40, dark); b.position.set(pr.x + pr.w / 2 - 120, (200 - pr.y) / 2, 0);
      } else if (pr.k === 'roller') {
        const r = rod(9, dark); placeBetween(r, V(pr.x - 120, 9, -22), V(pr.x - 120, 9, 22));
      } else if (pr.k === 'ball') {
        const b = this.add(new THREE.Mesh(SPH, dark)); b.position.copy(P([pr.x, pr.y])); b.scale.setScalar(pr.r);
      } else if (pr.k === 'bike') {
        const w = this.add(new THREE.Mesh(new THREE.TorusGeometry(20, 2.2, 10, 40), dark)); w.position.copy(P([pr.x, pr.y]));
        const fr = rod(1.8, metal); placeBetween(fr, P([pr.sx, pr.sy]), P([pr.x, pr.y]));
        const seat = box(14, 3, 9, dark); seat.position.copy(P([pr.sx, pr.sy]));
        for (const dx of [-28, 28]) { const l = rod(1.8, metal); placeBetween(l, P([pr.x, pr.y]), V(pr.x - 120 + dx, 0, 0)); }
      } else if (pr.k === 'line') {
        if (pr.cls === 'pad') slab(pr.a, pr.b, 22, 7, dark);
        else for (const z of [-17, 17]) { const r = rod(pr.cls === 'rod' ? 1.8 : 1.2, pr.cls === 'rod' ? metal : dark); placeBetween(r, P(pr.a, z), P(pr.b, z)); }
      }
    }
    // cable machine column + pulley
    const kind = pat.hold === 'none' ? 'none' : hold;
    this.kind = kind;
    this.anchor = ['cable', 'machine', 'band'].includes(kind) && (kind === 'band' ? pat.band || pat.anchor : pat.anchor) ? P(kind === 'band' ? pat.band || pat.anchor : pat.anchor) : null;
    if (this.anchor && kind !== 'band') {
      const col = box(6, 210, 10, dark); col.position.set(this.anchor.x + 7, 105, 0);
      const pul = this.add(new THREE.Mesh(SPH, metal)); pul.position.copy(this.anchor); pul.scale.setScalar(3.2);
    }
    // held equipment, moved every frame
    if (kind === 'barbell' || kind === 'ezbar') {
      const g = new THREE.Group(); this.group.add(g);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, kind === 'ezbar' ? 52 : 92, 12), metal); bar.rotation.x = Math.PI / 2; g.add(bar);
      const pr = kind === 'ezbar' ? 12 : 19;
      for (const z of kind === 'ezbar' ? [-20, 20] : [-32, -28, 28, 32]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(Math.abs(z) > 30 ? pr * 0.8 : pr, Math.abs(z) > 30 ? pr * 0.8 : pr, 3.4, 30), plate);
        p.rotation.x = Math.PI / 2; p.position.z = z; p.castShadow = true; g.add(p);
      }
      this.held.push({ g, at: 'mid' });
    } else if (kind === 'dumbbell') {
      for (const s of [1, -1]) {
        const g = new THREE.Group(); this.group.add(g);
        const h = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 12, 10), metal); h.rotation.x = Math.PI / 2; g.add(h);
        for (const z of [-6.5, 6.5]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 4, 18), plate); b.rotation.x = Math.PI / 2; b.position.z = z; b.castShadow = true; g.add(b); }
        this.held.push({ g, at: s });
      }
    } else if (kind === 'kettlebell') {
      for (const s of [1, -1]) {
        const g = new THREE.Group(); this.group.add(g);
        const b = new THREE.Mesh(SPH, plate); b.scale.setScalar(7.5); b.position.y = -9; b.castShadow = true; g.add(b);
        const hnd = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.9, 8, 20, Math.PI), dark); hnd.position.y = -3; hnd.rotation.y = Math.PI / 2; g.add(hnd);
        this.held.push({ g, at: s });
      }
    } else if (kind === 'medball') {
      const g = new THREE.Group(); this.group.add(g);
      const b = new THREE.Mesh(SPH, plate); b.scale.setScalar(9); b.castShadow = true; g.add(b);
      this.held.push({ g, at: 'mid', z0: true });
    }
    if (this.anchor) {
      this.cables = [1, -1].map(() => { const c = rod(kind === 'band' ? 0.9 : 0.5, kind === 'band' ? plate : dark); c.castShadow = false; return c; });
    } else this.cables = null;
    if (pat.plate != null) { this.sled = box(4, 44, 30, metal); this.sledAng = pat.plate; } else this.sled = null;
  }

  pose(J) {
    const [a, b] = J.sides;
    for (const h of this.held) {
      if (h.at === 'mid') {
        h.g.position.copy(a.hand).add(b.hand).multiplyScalar(0.5);
        if (J.view === 'side' && !h.z0) h.g.position.z = 0;
      } else h.g.position.copy((h.at === 1 ? a : b).hand);
    }
    if (this.cables) this.cables.forEach((c, i) => { const hd = J.sides[i].hand; placeBetween(c, hd, V(this.anchor.x, this.anchor.y, hd.z)); });
    if (this.sled) {
      const toe = a.toe.clone(); toe.z = 0;
      const r = (this.sledAng * Math.PI) / 180;
      this.sled.position.copy(toe);
      this.sled.quaternion.setFromUnitVectors(AY, V(Math.sin(r), -Math.cos(r), 0));
    }
  }
}

// ------------------------------------------------------------------ scene setup shared by viewer + thumbnails
function makeStage(canvas, { shadows = true, preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x50555f, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(160, 260, 140);
  key.castShadow = shadows;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 10, far: 700 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd2c2, 0.7); rim.position.set(-200, 120, -160); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(115, 64), new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 1, transparent: true, opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.4; floor.receiveShadow = true;
  scene.add(floor);
  const body = new Body(); scene.add(body.root);
  const equip = new Equipment(scene);
  return { renderer, scene, camera, body, equip };
}

// Box around every keyframe so the camera frames the whole movement.
function bounds(pat) {
  const box = new THREE.Box3();
  for (const f of pat.frames) {
    const J = joints3d(solve(f, pat.view));
    for (const p of [J.hipC, J.shoC, J.head, ...J.sides.flatMap((s) => [s.hip, s.knee, s.ank, s.toe, s.sho, s.elb, s.hand])]) box.expandByPoint(p);
  }
  box.expandByPoint(V(box.min.x, 0, 0));
  box.expandByScalar(12);
  return box;
}

export function defaultYaw(pm = [], pat) {
  if (pat?.supine && pm.some((m) => BACK_GROUPS.has(m))) return 196;
  return pm.some((m) => BACK_GROUPS.has(m)) ? 148 : 32;
}

// Look down on lying / bent-over bodies so the chest, abs or back can be seen.
export function defaultPitch(pat, pm = []) {
  if (pat.supine && pm.some((m) => BACK_GROUPS.has(m))) return 16; // e.g. bridges: glutes face the floor
  const J = joints3d(solve(pat.frames[workFrame(pat)], pat.view));
  const d = V().subVectors(J.shoC, J.hipC).normalize();
  return Math.abs(d.y) < 0.55 ? 42 : 12;
}

function placeCamera(camera, box, yaw, pitch, aspect, zoom = 1) {
  const c = box.getCenter(V()), size = box.getSize(V());
  const r = Math.max(size.y * 0.62, Math.hypot(size.x, size.z) * 0.5 / Math.max(aspect, 0.6), 60);
  const dist = (r / Math.tan((camera.fov * Math.PI) / 360)) * 1.08 / zoom;
  const y = (yaw * Math.PI) / 180, p = (pitch * Math.PI) / 180;
  camera.aspect = aspect;
  camera.position.set(c.x + dist * Math.cos(p) * Math.cos(y), c.y + dist * Math.sin(p), c.z + dist * Math.cos(p) * Math.sin(y));
  camera.lookAt(c);
  camera.updateProjectionMatrix();
}

export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

// ------------------------------------------------------------------ interactive viewer
export class Viewer {
  constructor(container) {
    this.el = container;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gl';
    container.prepend(this.canvas);
    Object.assign(this, makeStage(this.canvas));
    this.yaw = 32; this.pitch = 10; this.zoom = 1; this.speed = 1; this.playing = false; this.ms = 0;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.bindOrbit();
  }

  load({ anim, eq, pm = [], sm = [] }, { keepView = false } = {}) {
    this.pat = PATTERNS[anim] || PATTERNS.generic;
    this.body.setActivation(pm, sm);
    this.equip.build(this.pat, holdFor(eq));
    this.box = bounds(this.pat);
    this.pm = pm;
    if (!keepView) { this.yaw = defaultYaw(pm, this.pat); this.pitch = defaultPitch(this.pat, pm); }
    this.resize();
  }

  setView(yaw) { this.yaw = yaw; this.pitch = defaultPitch(this.pat, this.pm); this.frame(); }

  resize() {
    const w = this.el.clientWidth, h = this.canvas.clientHeight || w * 0.9;
    if (!w) return;
    this.renderer.setSize(w, h, false);
    this.frame();
  }

  frame() {
    if (!this.box) return;
    placeCamera(this.camera, this.box, this.yaw, this.pitch, this.canvas.clientWidth / (this.canvas.clientHeight || 1), this.zoom);
    if (!this.playing) this.draw();
  }

  draw() {
    const { pose, effort } = this.playing || this.ms ? poseAt(this.pat, this.ms) : { pose: this.pat.frames[workFrame(this.pat)], effort: 1 };
    const J = joints3d(solve(pose, this.pat.view));
    this.body.pose(J, !!this.pat.supine); this.equip.pose(J); this.body.glow(effort);
    this.renderer.render(this.scene, this.camera);
  }

  play() { if (this.playing) return; this.playing = true; this.last = performance.now(); this.loop(); }
  pause() { this.playing = false; cancelAnimationFrame(this.raf); }
  toggle() { this.playing ? this.pause() : this.play(); return this.playing; }

  loop() {
    if (!this.playing) return;
    const now = performance.now();
    this.ms += (now - this.last) * this.speed; this.last = now;
    this.draw();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  bindOrbit() {
    const c = this.canvas, pts = new Map();
    let pinch0 = 0, zoom0 = 1;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { pinch0 = this.pinchDist(pts); zoom0 = this.zoom; } });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 1) {
        this.yaw += (e.clientX - p[0]) * 0.45;
        this.pitch = Math.max(-10, Math.min(60, this.pitch + (e.clientY - p[1]) * 0.3));
        this.onOrbit?.();
      }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch0) this.zoom = Math.max(0.7, Math.min(2.2, zoom0 * (this.pinchDist(pts) / pinch0)));
      this.frame();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.7, Math.min(2.2, this.zoom * (e.deltaY < 0 ? 1.08 : 0.93))); this.frame(); }, { passive: false });
  }
  pinchDist(pts) { const [a, b] = [...pts.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  destroy() {
    this.pause(); this.ro.disconnect(); this.equip.clear();
    this.renderer.dispose(); this.renderer.forceContextLoss?.(); this.canvas.remove();
  }
}

// ------------------------------------------------------------------ thumbnails (one shared offscreen renderer)
let thumbStage = null;
const thumbCache = new Map();
const queue = [];
let busy = false;

export function thumbnail(ex) {
  const key = `${ex.anim}|${holdFor(ex.eq)}|${(ex.pm || []).join(',')}|${(ex.sm || []).join(',')}`;
  if (thumbCache.has(key)) return Promise.resolve(thumbCache.get(key));
  return new Promise((res) => { queue.push({ ex, key, res }); pump(); });
}

function pump() {
  if (busy || !queue.length) return;
  busy = true;
  requestAnimationFrame(() => {
    if (!thumbStage) {
      const canvas = document.createElement('canvas');
      thumbStage = makeStage(canvas, { shadows: false, preserve: true });
      thumbStage.renderer.setPixelRatio(1);
      thumbStage.renderer.setSize(200, 176, false);
    }
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 24) {
      const { ex, key, res } = queue.shift();
      if (thumbCache.has(key)) { res(thumbCache.get(key)); continue; }
      const { renderer, scene, camera, body, equip } = thumbStage;
      const pat = PATTERNS[ex.anim] || PATTERNS.generic;
      body.setActivation(ex.pm, ex.sm);
      equip.build(pat, holdFor(ex.eq));
      const J = joints3d(solve(pat.frames[workFrame(pat)], pat.view));
      body.pose(J, !!pat.supine); equip.pose(J); body.glow(1);
      placeCamera(camera, bounds(pat), defaultYaw(ex.pm, pat), defaultPitch(pat, ex.pm), 200 / 176, 1.05);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/webp', 0.85);
      thumbCache.set(key, url); res(url);
    }
    busy = false;
    pump();
  });
}

// All app state lives in one object persisted to localStorage (plus JSON export/import as a backup).
// Weights are stored in kg and converted for display.

const KEY = 'forge.v1';
const LB = 2.20462;

const blank = () => ({
  version: 1,
  settings: { unit: 'kg', rest: 90, weeklyGoal: 4, theme: 'auto' },
  workouts: [],      // finished: { id, date, start, end, name, exercises: [{ exId, sets: [{ w, r, done }] }] }
  active: null,      // the workout in progress (same shape)
  checkins: {},      // 'YYYY-MM-DD' -> true: active day without a logged workout
  favorites: [],
  links: {},         // exId -> preferred form-video URL
  custom: [],        // user-made exercises (same shape as the database rows, custom: true)
  routines: [],      // { id, name, exIds }
});

let state = load();
const subs = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw), settings: { ...blank().settings, ...JSON.parse(raw).settings } };
  } catch (e) { console.warn('state load failed', e); }
  return blank();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('state save failed', e); }
  subs.forEach((f) => f(state));
}

export const get = () => state;
export const onChange = (f) => (subs.add(f), () => subs.delete(f));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function update(fn) { fn(state); save(); }

export function replaceAll(next) {
  if (!next || !Array.isArray(next.workouts)) throw new Error('Not a Forge backup file');
  state = { ...blank(), ...next, settings: { ...blank().settings, ...next.settings } };
  save();
}

export const exportJSON = () => JSON.stringify(state, null, 1);

// ---- dates (local time)
export const dayKey = (d = new Date()) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

// ---- units
export const unit = () => state.settings.unit;
export const toDisplay = (kg) => (kg == null || kg === '' ? '' : +(unit() === 'lb' ? kg * LB : kg).toFixed(1));
export const fromDisplay = (v) => (v === '' || v == null || isNaN(+v) ? null : +(unit() === 'lb' ? +v / LB : +v).toFixed(3));
export const fmtW = (kg) => (kg ? `${toDisplay(kg)} ${unit()}` : 'BW');

// ---- derived numbers
export const e1rm = (w, r) => (w && r ? w * (1 + Math.min(r, 12) / 30) : 0); // Epley, capped reps
export const doneSets = (wo) => wo.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
export const volume = (wo) => wo.exercises.reduce((v, e) => v + e.sets.reduce((a, s) => a + (s.done ? (s.w || 0) * (s.r || 0) : 0), 0), 0);

// Per-day activity for the consistency panel: { 'YYYY-MM-DD': { workouts, sets, checkin } }
export function activity() {
  const map = {};
  for (const w of state.workouts) {
    const d = (map[w.date] ||= { workouts: 0, sets: 0, checkin: false });
    d.workouts++; d.sets += doneSets(w);
  }
  for (const k in state.checkins) if (state.checkins[k]) (map[k] ||= { workouts: 0, sets: 0, checkin: false }).checkin = true;
  return map;
}

// Most recent finished sets for an exercise (for the "previous" column and history).
export function historyFor(exId) {
  const out = [];
  for (const w of [...state.workouts].sort((a, b) => b.start - a.start)) {
    for (const e of w.exercises) if (e.exId === exId && e.sets.some((s) => s.done)) out.push({ date: w.date, start: w.start, sets: e.sets.filter((s) => s.done) });
  }
  return out;
}

// LeetCode-style consistency panel: a year of days grouped into month blocks, coloured by how much
// was done that day, with the headline counts, streaks and badges.
import { activity, dayKey, parseDay, get } from './store.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function level(a) {
  if (!a) return 0;
  if (!a.workouts) return a.checkin ? 1 : 0;
  if (a.sets <= 8) return 1;
  if (a.sets <= 16) return 2;
  if (a.sets <= 24) return 3;
  return 4;
}
const isActive = (a) => !!a && (a.workouts > 0 || a.checkin);

export function streaks(act, today = new Date()) {
  const keys = Object.keys(act).filter((k) => isActive(act[k])).sort();
  let max = 0, run = 0, prev = null;
  for (const k of keys) {
    const d = parseDay(k);
    run = prev && Math.round((d - prev) / DAY) === 1 ? run + 1 : 1;
    max = Math.max(max, run); prev = d;
  }
  // current: counts back from today, or from yesterday if today isn't logged yet
  let cur = 0, d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!isActive(act[dayKey(d)])) d = addDays(d, -1);
  while (isActive(act[dayKey(d)])) { cur++; d = addDays(d, -1); }
  return { cur, max };
}

// Consecutive Mon–Sun weeks that hit the weekly goal. This week only counts once it's met.
export function weekStreak(act, goal, today = new Date()) {
  const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const daysIn = (start) => { let n = 0; for (let i = 0; i < 7; i++) if (isActive(act[dayKey(addDays(start, i))])) n++; return n; };
  let wk = monday(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const thisWeek = daysIn(wk);
  let n = thisWeek >= goal ? 1 : 0;
  wk = addDays(wk, -7);
  while (daysIn(wk) >= goal) { n++; wk = addDays(wk, -7); }
  return { n, thisWeek };
}

function badges(act, s, ws, total) {
  const days = Object.values(act).filter(isActive).length;
  return [
    { icon: '🏁', name: 'First rep', desc: 'Log your first workout', ok: total >= 1 },
    { icon: '🔥', name: 'On fire', desc: '3-day streak', ok: s.max >= 3 },
    { icon: '📅', name: 'Full week', desc: '7-day streak', ok: s.max >= 7 },
    { icon: '⚡', name: 'Unstoppable', desc: '30-day streak', ok: s.max >= 30 },
    { icon: '🎯', name: 'Goal getter', desc: 'Hit the weekly goal 4 weeks running', ok: ws.best >= 4 },
    { icon: '🗓️', name: 'Quarter', desc: 'Hit the weekly goal 12 weeks running', ok: ws.best >= 12 },
    { icon: '💪', name: 'Regular', desc: '25 workouts', ok: total >= 25 },
    { icon: '🏋️', name: 'Centurion', desc: '100 workouts', ok: total >= 100 },
    { icon: '🌟', name: 'Iron year', desc: '200 active days', ok: days >= 200 },
  ];
}

// Longest run of goal-meeting weeks ever (for badges).
function bestWeekRun(act, goal) {
  const keys = Object.keys(act).filter((k) => isActive(act[k])).sort();
  if (!keys.length) return 0;
  const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const counts = new Map();
  for (const k of keys) { const m = dayKey(monday(parseDay(k))); counts.set(m, (counts.get(m) || 0) + 1); }
  let best = 0, run = 0, wk = monday(parseDay(keys[0]));
  const end = monday(new Date());
  while (wk <= end) {
    run = (counts.get(dayKey(wk)) || 0) >= goal ? run + 1 : 0;
    best = Math.max(best, run); wk = addDays(wk, 7);
  }
  return best;
}

function range(sel) {
  const today = new Date();
  if (sel === 'current') {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return { start: addDays(end, -364), end };
  }
  const y = +sel;
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
}

export function renderConsistency(root, { onDay } = {}) {
  const st = get();
  const act = activity();
  const years = new Set([new Date().getFullYear()]);
  for (const k of Object.keys(act)) years.add(+k.slice(0, 4));
  let sel = root.dataset.sel || 'current';

  const draw = () => {
    root.dataset.sel = sel;
    const { start, end } = range(sel);
    const todayK = dayKey();
    let workouts = 0, activeDays = 0, maxRun = 0, run = 0;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const a = act[dayKey(d)];
      if (a) workouts += a.workouts;
      if (isActive(a)) { activeDays++; run++; maxRun = Math.max(maxRun, run); } else run = 0;
    }
    const s = streaks(act);
    const ws = weekStreak(act, st.settings.weeklyGoal);
    ws.best = bestWeekRun(act, st.settings.weeklyGoal);
    const total = st.workouts.length;

    // month blocks
    let months = '';
    let m = new Date(start.getFullYear(), start.getMonth(), 1);
    while (m <= end) {
      const first = m < start ? start : m;
      const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      const stop = last > end ? end : last;
      let cells = '';
      for (let i = 0; i < first.getDay(); i++) cells += '<i class="pad"></i>';
      for (let d = first; d <= stop; d = addDays(d, 1)) {
        const k = dayKey(d), a = act[k];
        const lv = level(a);
        const tip = `${a ? (a.workouts ? `${a.workouts} workout${a.workouts > 1 ? 's' : ''} · ${a.sets} sets` : 'Active day') : 'No activity'} on ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
        cells += `<button class="c l${lv}${k === todayK ? ' today' : ''}" data-k="${k}" aria-label="${tip}" title="${tip}"></button>`;
      }
      months += `<div class="mo"><div class="days">${cells}</div><span>${MONTHS[m.getMonth()]}</span></div>`;
      m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    }

    const opts = ['current', ...[...years].sort((a, b) => b - a)].map((y) => `<option value="${y}" ${String(y) === String(sel) ? 'selected' : ''}>${y === 'current' ? 'Current' : y}</option>`).join('');
    const goal = st.settings.weeklyGoal;
    const bs = badges(act, s, ws, total);
    root.innerHTML = `
      <div class="cp-head">
        <div class="cp-title"><b>${workouts}</b> workout${workouts === 1 ? '' : 's'} in ${sel === 'current' ? 'the past one year' : sel}</div>
        <div class="cp-meta"><span>Total active days: <b>${activeDays}</b></span><span>Max streak: <b>${maxRun}</b></span>
          <select class="cp-year" aria-label="Year">${opts}</select></div>
      </div>
      <div class="cp-scroll"><div class="cp-grid">${months}</div></div>
      <div class="cp-legend"><span class="cp-tip" aria-live="polite">Tap a day to see it</span><span class="lg">Less <i class="c l0"></i><i class="c l1"></i><i class="c l2"></i><i class="c l3"></i><i class="c l4"></i> More</span></div>
      <div class="cp-stats">
        <div class="stat"><span class="k">Current streak</span><span class="v">${s.cur ? '🔥 ' : ''}${s.cur}<small> day${s.cur === 1 ? '' : 's'}</small></span></div>
        <div class="stat"><span class="k">Best streak</span><span class="v">${s.max}<small> day${s.max === 1 ? '' : 's'}</small></span></div>
        <div class="stat"><span class="k">This week</span><span class="v">${ws.thisWeek}<small> / ${goal} days</small></span>
          <span class="bar"><i style="width:${Math.min(100, (ws.thisWeek / goal) * 100)}%"></i></span></div>
        <div class="stat"><span class="k">Goal weeks in a row</span><span class="v">${ws.n}</span></div>
      </div>
      <details class="cp-badges"><summary>Badges <span class="muted">${bs.filter((b) => b.ok).length}/${bs.length}</span></summary>
        <div class="badges">${bs.map((b) => `<div class="badge ${b.ok ? 'ok' : ''}" title="${b.desc}"><span class="bi">${b.icon}</span><b>${b.name}</b><small>${b.desc}</small></div>`).join('')}</div>
      </details>`;

    const scroller = root.querySelector('.cp-scroll');
    scroller.scrollLeft = scroller.scrollWidth; // newest at the right, like LeetCode
    root.querySelector('.cp-year').onchange = (e) => { sel = e.target.value; draw(); };
    root.querySelector('.cp-grid').onclick = (e) => {
      const c = e.target.closest('.c[data-k]');
      if (!c) return;
      root.querySelectorAll('.c.sel').forEach((x) => x.classList.remove('sel'));
      c.classList.add('sel');
      root.querySelector('.cp-tip').textContent = c.getAttribute('aria-label');
      onDay?.(c.dataset.k);
    };
  };
  draw();
}

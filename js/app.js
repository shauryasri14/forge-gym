import * as S from './store.js';
import { PATTERNS } from './anim.js';
import { Viewer, thumbnail, webglOK } from './body3d.js';
import { renderConsistency, streaks } from './consistency.js';

// ------------------------------------------------------------------ data
let DB = [];
let byId = new Map();
const allEx = () => [...S.get().custom, ...DB];
const reindex = () => { byId = new Map(allEx().map((e) => [e.id, e])); };
const ex = (id) => byId.get(id) || { id, name: 'Deleted exercise', pm: [], sm: [], ins: [], anim: 'generic', eq: 'body only' };

const MUSCLES = ['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps'];
const EQUIP = ['barbell', 'dumbbell', 'cable', 'machine', 'body only', 'kettlebells', 'bands', 'e-z curl bar', 'medicine ball', 'exercise ball', 'foam roll', 'other'];
const CATS = ['strength', 'stretching', 'plyometrics', 'powerlifting', 'olympic weightlifting', 'strongman', 'cardio'];

// ------------------------------------------------------------------ helpers
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (k) => { const d = S.parseDay(k); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
const fmtDur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const ytUrl = (e) => S.get().links[e.id] || `https://www.youtube.com/results?search_query=${encodeURIComponent(e.name + ' exercise proper form')}`;
let cleanups = [];
const onLeave = (f) => cleanups.push(f);

const GL = webglOK();
const thumb = (e) => `<img class="thumb" alt="" data-id="${esc(e.id)}" decoding="async">`;

// Render list thumbnails (posed 3D body with the muscles lit) when they scroll into view.
const thumbObs = new IntersectionObserver((ents) => {
  for (const en of ents) {
    if (!en.isIntersecting) continue;
    const img = en.target; thumbObs.unobserve(img);
    const e = byId.get(img.dataset.id);
    if (e && GL) thumbnail(e).then((u) => { img.src = u; });
  }
}, { rootMargin: '300px' });
const drawThumbs = (root) => $$('img.thumb[data-id]:not([src])', root).forEach((i) => thumbObs.observe(i));

const VIEWS = [['3/4', null], ['Front', 0], ['Side', 90], ['Back', 180]];
const legend = (pm = [], sm = []) => `<div class="legend">
  <span><i class="dot p"></i><b>Primary</b> ${esc(cap(pm.join(', ')) || '—')}</span>
  ${sm.length ? `<span><i class="dot s"></i><b>Secondary</b> ${esc(cap(sm.join(', ')))}</span>` : ''}</div>`;

// The 3D stage: canvas + view buttons. Returns the Viewer (or null without WebGL).
function mountStage(host, e) {
  if (!GL) { host.innerHTML = '<p class="muted small gl-off">Your browser has WebGL turned off, so the 3D muscle view can’t be shown.</p>'; return null; }
  host.insertAdjacentHTML('beforeend', `<div class="views">${VIEWS.map(([l], i) => `<button data-i="${i}" class="${i ? '' : 'on'}">${l}</button>`).join('')}<button class="fx" aria-pressed="false">Focus</button></div>
    <p class="hint">Drag to rotate · pinch to zoom</p>`);
  const v = new Viewer(host);
  v.load(e);
  const def = v.yaw;
  const btns = $$('.views button[data-i]', host);
  $('.views', host).onclick = (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.classList.contains('fx')) {
      v.focus = !v.focus; v.zoom = 1; v.frame();
      b.classList.toggle('on', v.focus); b.setAttribute('aria-pressed', v.focus);
      return;
    }
    const yaw = VIEWS[+b.dataset.i][1];
    v.zoom = 1; v.setView(yaw ?? def);
    btns.forEach((x) => x.classList.toggle('on', x === b));
  };
  v.onOrbit = () => btns.forEach((x) => x.classList.remove('on'));
  onLeave(() => v.destroy());
  return v;
}

function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { action.run(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
}

function sheet(html, mount) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 220); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  mount?.(wrap.firstChild, close);
  return close;
}

const ask = (msg, ok = 'OK', danger = false) => new Promise((res) => {
  sheet(`<p class="ask">${esc(msg)}</p><div class="row end"><button class="btn ghost" data-a="0">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-a="1">${esc(ok)}</button></div>`,
    (el, close) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) { close(); res(b.dataset.a === '1'); } }));
});

const prompt2 = (title, value = '') => new Promise((res) => {
  sheet(`<form class="stack"><label class="lbl">${esc(title)}<input class="inp" name="v" value="${esc(value)}" maxlength="60" required></label>
    <div class="row end"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn primary">Save</button></div></form>`, (el, close) => {
    const f = $('form', el); setTimeout(() => f.v.focus(), 250);
    f.onsubmit = (e) => { e.preventDefault(); close(); res(f.v.value.trim()); };
    $('[data-x]', el).onclick = () => { close(); res(null); };
  });
});

// ------------------------------------------------------------------ router
const routes = { home: viewHome, library: viewLibrary, ex: viewExercise, workout: viewWorkout, history: viewHistory, settings: viewSettings, custom: viewCustom };

function go(hash) { location.hash = hash; }

function render() {
  cleanups.forEach((f) => f()); cleanups = [];
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const view = routes[name] || viewHome;
  const main = $('#view');
  main.innerHTML = '';
  main.scrollTop = 0; window.scrollTo(0, 0);
  const tab = { ex: 'library', custom: 'library', settings: 'home' }[name] || (routes[name] ? name : 'home');
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  view(main, arg && decodeURIComponent(arg));
  updateNavBadge();
}

function setTitle(t, back) {
  $('#title').textContent = t;
  $('#back').hidden = !back;
  $('#back').onclick = () => (history.length > 1 ? history.back() : go(back));
}

function updateNavBadge() { $('#nav a[data-tab=workout]').classList.toggle('live', !!S.get().active); }

// ------------------------------------------------------------------ home
function viewHome(main) {
  setTitle('Forge');
  const st = S.get();
  const today = S.dayKey();
  const act = S.activity();
  const s = streaks(act);
  const hr = new Date().getHours();
  const hello = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  main.innerHTML = `
    <section class="hello">
      <div><p class="muted">${fmtDay(today)}</p><h2>${hello}</h2></div>
      <div class="flame ${s.cur ? 'lit' : ''}" title="Current streak"><span>🔥</span><b>${s.cur}</b></div>
    </section>
    ${st.active
      ? `<a class="cta live" href="#/workout"><span><b>Resume workout</b><small>${esc(st.active.name)} · ${S.doneSets(st.active)} sets done</small></span><span class="go">›</span></a>`
      : `<button class="cta" id="start"><span><b>Start a workout</b><small>Empty, or from a routine</small></span><span class="go">›</span></button>`}
    <section class="card cp" id="cp"></section>
    <section class="card" id="day"></section>
    <section><div class="sec-h"><h3>Recent</h3><a href="#/history" class="link">All history</a></div><div id="recent"></div></section>`;
  $('#start')?.addEventListener('click', () => go('#/workout'));

  const showDay = (k) => {
    const ws = st.workouts.filter((w) => w.date === k);
    const chk = !!st.checkins[k];
    const future = k > today;
    $('#day').innerHTML = `<div class="sec-h"><h3>${k === today ? 'Today' : fmtDay(k)}</h3>
      ${future ? '' : `<button class="chip-btn ${chk ? 'on' : ''}" id="chk">${chk ? '✓ Marked active' : 'Mark as active day'}</button>`}</div>
      ${ws.length ? ws.map(woRow).join('') : `<p class="muted small">${chk ? 'Marked as an active day (no workout logged).' : future ? 'Nothing here yet.' : 'No workout logged.'}</p>`}`;
    $('#chk')?.addEventListener('click', () => {
      S.update((x) => { if (x.checkins[k]) delete x.checkins[k]; else x.checkins[k] = true; });
      renderConsistency($('#cp'), { onDay: showDay }); showDay(k);
    });
  };
  renderConsistency($('#cp'), { onDay: showDay });
  showDay(today);
  const recent = [...st.workouts].sort((a, b) => b.start - a.start).slice(0, 3);
  $('#recent').innerHTML = recent.length ? recent.map(woRow).join('') : `<div class="empty"><p>No workouts yet.</p><p class="muted small">Finish your first one and it shows up here and on the grid above.</p></div>`;
}

function woRow(w) {
  const names = w.exercises.map((e) => ex(e.exId).name);
  return `<a class="wo-row" href="#/history/${w.id}">
    <div><b>${esc(w.name)}</b><small>${fmtDay(w.date)} · ${fmtDur(w.end - w.start)}</small>
    <p class="muted small clamp">${esc(names.slice(0, 4).join(', '))}${names.length > 4 ? ` +${names.length - 4}` : ''}</p></div>
    <div class="nums"><span><b>${S.doneSets(w)}</b> sets</span><span>${S.volume(w) ? `${Math.round(S.toDisplay(S.volume(w))).toLocaleString()} ${S.unit()}` : ''}</span></div></a>`;
}

// ------------------------------------------------------------------ library
const lib = { q: '', muscle: '', eq: '', lvl: '', cat: '', fav: false };

function filterEx(f) {
  const toks = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const favs = new Set(S.get().favorites);
  return allEx().filter((e) => {
    if (f.fav && !favs.has(e.id)) return false;
    if (f.muscle && !e.pm.includes(f.muscle) && !(e.sm || []).includes(f.muscle)) return false;
    if (f.eq && e.eq !== f.eq) return false;
    if (f.lvl && e.lvl !== f.lvl) return false;
    if (f.cat && e.cat !== f.cat) return false;
    if (toks.length) {
      const hay = (e.name + ' ' + e.pm.join(' ') + ' ' + e.eq).toLowerCase();
      if (!toks.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

const sel = (name, label, opts, val) => `<select class="fsel ${val ? 'on' : ''}" data-f="${name}" aria-label="${label}"><option value="">${label}</option>${opts.map((o) => `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(cap(o))}</option>`).join('')}</select>`;

// Shared searchable list, used by the Exercises tab and the "add exercises" picker.
function exList(root, f, { pick } = {}) {
  root.innerHTML = `
    <div class="search"><input class="inp" type="search" placeholder="Search ${allEx().length} exercises" value="${esc(f.q)}" aria-label="Search exercises">
      <button class="fav-t ${f.fav ? 'on' : ''}" aria-label="Favourites only" title="Favourites only">★</button></div>
    <div class="filters">${sel('muscle', 'Muscle', MUSCLES, f.muscle)}${sel('eq', 'Equipment', EQUIP, f.eq)}${sel('lvl', 'Level', ['beginner', 'intermediate', 'expert'], f.lvl)}${sel('cat', 'Type', CATS, f.cat)}</div>
    <p class="muted small count"></p><div class="ex-list"></div><div class="sentinel"></div>`;
  const list = $('.ex-list', root), count = $('.count', root);
  let items = [], shown = 0;
  const favs = () => new Set(S.get().favorites);
  const more = () => {
    const fs = favs();
    const chunk = items.slice(shown, shown + 40);
    list.insertAdjacentHTML('beforeend', chunk.map((e) => `
      <${pick ? 'button' : 'a'} class="ex-item ${pick?.has(e.id) ? 'picked' : ''}" ${pick ? `data-id="${esc(e.id)}"` : `href="#/ex/${encodeURIComponent(e.id)}"`}>
        ${thumb(e)}
        <span class="ex-txt"><b>${esc(e.name)}</b><small>${esc(cap(e.pm.join(', ')))} · ${esc(cap(e.eq))}</small></span>
        ${pick ? '<span class="tick">✓</span>' : fs.has(e.id) ? '<span class="star">★</span>' : e.custom ? '<span class="tag">Custom</span>' : ''}
      </${pick ? 'button' : 'a'}>`).join(''));
    shown += chunk.length;
    drawThumbs(list);
  };
  const refresh = () => {
    items = filterEx(f); shown = 0; list.innerHTML = '';
    count.textContent = items.length === allEx().length ? `${items.length} exercises` : `${items.length} match${items.length === 1 ? '' : 'es'}`;
    if (!items.length) list.innerHTML = `<div class="empty"><p>No exercises match.</p><p class="muted small">Try fewer filters${pick ? '' : ', or add it as a custom exercise'}.</p></div>`;
    more();
  };
  const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && shown < items.length) more(); }, { root: pick ? root.closest('.sheet') : null, rootMargin: '400px' });
  io.observe($('.sentinel', root));
  onLeave(() => io.disconnect());
  let tm;
  $('input', root).oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { f.q = e.target.value; refresh(); }, 120); };
  $('.fav-t', root).onclick = (e) => { f.fav = !f.fav; e.currentTarget.classList.toggle('on', f.fav); refresh(); };
  $$('.fsel', root).forEach((s) => (s.onchange = () => { f[s.dataset.f] = s.value; s.classList.toggle('on', !!s.value); refresh(); }));
  if (pick) list.onclick = (e) => {
    const b = e.target.closest('.ex-item'); if (!b) return;
    const id = b.dataset.id;
    pick.has(id) ? pick.delete(id) : pick.add(id);
    b.classList.toggle('picked', pick.has(id));
    root.dispatchEvent(new CustomEvent('pick'));
  };
  refresh();
}

function viewLibrary(main) {
  setTitle('Exercises');
  main.innerHTML = `<div id="lib"></div><a class="fab" href="#/custom" aria-label="Add custom exercise">＋</a>`;
  exList($('#lib'), lib);
}

function pickExercises(title = 'Add exercises') {
  return new Promise((res) => {
    const picked = new Set();
    const f = { q: '', muscle: '', eq: '', lvl: '', cat: '', fav: false };
    let done = false;
    sheet(`<div class="sheet-h"><h3>${esc(title)}</h3><button class="btn primary sm" id="pk-ok" disabled>Add</button></div><div id="pk"></div>`, (el, close) => {
      const root = $('#pk', el);
      exList(root, f, { pick: picked });
      root.addEventListener('pick', () => { const b = $('#pk-ok', el); b.disabled = !picked.size; b.textContent = picked.size ? `Add ${picked.size}` : 'Add'; });
      $('#pk-ok', el).onclick = () => { done = true; close(); res([...picked]); };
      el.parentElement.addEventListener('click', (e) => { if (e.target === el.parentElement && !done) res([]); });
    });
  });
}

// ------------------------------------------------------------------ exercise detail
function viewExercise(main, id) {
  const e = byId.get(id);
  if (!e) { setTitle('Not found', '#/library'); main.innerHTML = '<div class="empty"><p>That exercise doesn’t exist.</p></div>'; return; }
  setTitle('Exercise', '#/library');
  const st = S.get();
  const fav = st.favorites.includes(e.id);
  const hist = S.historyFor(e.id);
  const chips = [e.lvl, e.eq, e.mech, e.force, e.cat].filter(Boolean).map((c) => `<span class="chip">${esc(cap(c))}</span>`).join('');
  main.innerHTML = `
    <div class="hero"><div class="stage" id="stage"></div>
      <div class="hero-ctl"><button class="round" id="pp" aria-label="Pause">❚❚</button>
        <div class="seg" id="spd">${[0.5, 1, 1.5].map((v) => `<button data-v="${v}" class="${v === 1 ? 'on' : ''}">${v}×</button>`).join('')}</div></div>
      ${legend(e.pm, e.sm)}</div>
    <div class="ex-head"><h1>${esc(e.name)}</h1><button class="star-btn ${fav ? 'on' : ''}" id="fav" aria-label="Favourite">★</button></div>
    <div class="chips">${chips}${e.custom ? '<span class="chip acc">Custom</span>' : ''}</div>
    <div class="row gap">
      <a class="btn yt" href="${esc(ytUrl(e))}" target="_blank" rel="noopener"><span class="yt-i">▶</span> Watch form video</a>
      <button class="btn primary" id="add">${st.active ? 'Add to workout' : 'Start with this'}</button>
    </div>
    ${(e.ins || []).length ? `<section class="card"><h3>How to do it</h3><ol class="steps">${e.ins.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section>` : ''}
    <section class="card" id="hist"></section>
    ${e.custom ? `<div class="row gap"><a class="btn ghost" href="#/custom/${encodeURIComponent(e.id)}">Edit</a><button class="btn ghost danger-t" id="del">Delete exercise</button></div>` : ''}`;

  const player = mountStage($('#stage'), e);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pp = $('#pp');
  const setPP = (on) => { pp.textContent = on ? '❚❚' : '▶'; pp.setAttribute('aria-label', on ? 'Pause' : 'Play'); };
  if (player && !reduce) player.play(); setPP(!!player && !reduce);
  if (player) {
    pp.onclick = () => setPP(player.toggle());
    $('#spd').onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; player.speed = +b.dataset.v; $$('#spd button').forEach((x) => x.classList.toggle('on', x === b)); };
  } else $('.hero-ctl').hidden = true;

  $('#fav').onclick = (ev) => {
    S.update((x) => { const i = x.favorites.indexOf(e.id); i < 0 ? x.favorites.push(e.id) : x.favorites.splice(i, 1); });
    ev.currentTarget.classList.toggle('on', S.get().favorites.includes(e.id));
  };
  $('#add').onclick = () => { addToWorkout([e.id]); go('#/workout'); };
  $('#del')?.addEventListener('click', async () => {
    if (!(await ask(`Delete “${e.name}”? Past workouts keep their sets.`, 'Delete', true))) return;
    S.update((x) => { x.custom = x.custom.filter((c) => c.id !== e.id); });
    reindex(); go('#/library');
  });

  // history + PRs
  const h = $('#hist');
  if (!hist.length) { h.innerHTML = '<h3>Your history</h3><p class="muted small">Not logged yet. Your best sets and progress chart will appear here.</p>'; return; }
  let best = { w: 0 }, bestE = { v: 0 };
  for (const x of hist) for (const s of x.sets) {
    if ((s.w || 0) > (best.w || 0)) best = s;
    const v = S.e1rm(s.w, s.r); if (v > bestE.v) bestE = { v, s };
  }
  const maxReps = Math.max(...hist.flatMap((x) => x.sets.map((s) => s.r || 0)));
  const pts = hist.slice(0, 20).reverse().map((x) => Math.max(...x.sets.map((s) => S.e1rm(s.w, s.r) || s.r || 0)));
  h.innerHTML = `<h3>Your history</h3>
    <div class="prs">
      ${best.w ? `<div><span class="muted small">Heaviest</span><b>${S.fmtW(best.w)}</b><small>× ${best.r}</small></div>` : ''}
      ${bestE.v ? `<div><span class="muted small">Est. 1RM</span><b>${S.fmtW(bestE.v)}</b><small>Epley</small></div>` : ''}
      <div><span class="muted small">Most reps</span><b>${maxReps}</b><small>in a set</small></div>
      <div><span class="muted small">Sessions</span><b>${hist.length}</b><small>logged</small></div></div>
    ${pts.length > 1 ? spark(pts, bestE.v ? 'Best est. 1RM per session' : 'Best reps per session') : ''}
    <ul class="hist-l">${hist.slice(0, 6).map((x) => `<li><span class="muted">${fmtDay(x.date)}</span><span>${x.sets.map((s) => `${s.w ? S.toDisplay(s.w) : 'BW'}×${s.r || 0}`).join(', ')}</span></li>`).join('')}</ul>`;
}

function spark(pts, label) {
  const w = 300, hgt = 70, min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * (w - 12) + 6, hgt - 8 - ((v - min) / span) * (hgt - 18)]);
  const d = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = xy[xy.length - 1];
  return `<figure class="spark"><svg viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><path d="${d}" /><circle cx="${last[0]}" cy="${last[1]}" r="3.5"/></svg><figcaption class="muted small">${esc(label)}</figcaption></figure>`;
}

// ------------------------------------------------------------------ workout
function newWorkout(name = 'Workout') {
  const hr = new Date().getHours();
  const auto = hr < 11 ? 'Morning workout' : hr < 16 ? 'Afternoon workout' : 'Evening workout';
  return { id: S.uid(), name: name === 'Workout' ? auto : name, start: Date.now(), exercises: [], restEnd: 0 };
}

function setsFromHistory(exId) {
  const last = S.historyFor(exId)[0];
  const n = last ? Math.min(Math.max(last.sets.length, 1), 6) : 3;
  return Array.from({ length: n }, () => ({ w: null, r: null, done: false }));
}

function addToWorkout(ids) {
  S.update((x) => {
    x.active ||= newWorkout();
    for (const id of ids) x.active.exercises.push({ exId: id, sets: setsFromHistory(id) });
  });
  if (ids.length) toast(ids.length === 1 ? `Added ${ex(ids[0]).name}` : `Added ${ids.length} exercises`);
}

function startFrom(name, exIds) {
  S.update((x) => { x.active = newWorkout(name); x.active.exercises = exIds.map((id) => ({ exId: id, sets: setsFromHistory(id) })); });
  render();
}

function viewWorkout(main) {
  const st = S.get();
  if (!st.active) return viewWorkoutIdle(main);
  setTitle('Workout');
  const w = st.active;
  main.innerHTML = `
    <div class="wo-top">
      <input class="wo-name" value="${esc(w.name)}" aria-label="Workout name" maxlength="60">
      <div class="wo-meta"><span class="timer" id="el">0:00</span><span class="muted">·</span><span id="sc">${S.doneSets(w)} sets</span></div>
      <button class="btn primary" id="fin">Finish</button>
    </div>
    <div id="exs"></div>
    <button class="btn wide dashed" id="addx">＋ Add exercises</button>
    <div class="row gap wrap">
      <button class="btn ghost" id="rt">Save as routine</button>
      <button class="btn ghost danger-t" id="disc">Discard workout</button>
    </div>`;

  const tick = () => { $('#el').textContent = clock((Date.now() - w.start) / 1000); };
  tick(); const iv = setInterval(tick, 1000); onLeave(() => clearInterval(iv));
  keepAwake(); onLeave(releaseAwake);

  $('.wo-name').onchange = (e) => S.update(() => { w.name = e.target.value.trim() || 'Workout'; });
  drawExercises();
  $('#addx').onclick = async () => { const ids = await pickExercises(); if (ids.length) { addToWorkout(ids); drawExercises(); } };
  $('#rt').onclick = async () => {
    if (!w.exercises.length) return toast('Add some exercises first');
    const name = await prompt2('Routine name', w.name);
    if (!name) return;
    S.update((x) => x.routines.push({ id: S.uid(), name, exIds: w.exercises.map((e) => e.exId) }));
    toast(`Saved routine “${name}”`);
  };
  $('#disc').onclick = async () => {
    if (!(await ask('Discard this workout? Nothing from it will be saved.', 'Discard', true))) return;
    S.update((x) => { x.active = null; }); stopRest(); render();
  };
  $('#fin').onclick = finish;
}

function drawExercises() {
  const w = S.get().active, root = $('#exs');
  if (!root) return;
  if (!w.exercises.length) { root.innerHTML = `<div class="empty"><p>No exercises yet.</p><p class="muted small">Add some to start logging sets.</p></div>`; return; }
  root.innerHTML = w.exercises.map((we, i) => {
    const e = ex(we.exId);
    const prev = S.historyFor(we.exId)[0]?.sets || [];
    return `<section class="card wo-ex" data-i="${i}">
      <div class="wo-ex-h"><a href="#/ex/${encodeURIComponent(e.id)}" class="wo-ex-t">${thumb(e)}<span><b>${esc(e.name)}</b><small class="muted">${esc(cap(e.pm.join(', ')))}</small></span></a>
        <button class="icon-btn" data-menu="${i}" aria-label="Exercise options">⋯</button></div>
      <div class="sets"><div class="set hdr"><span>Set</span><span>Previous</span><span>${S.unit()}</span><span>Reps</span><span>✓</span></div>
      ${we.sets.map((s, j) => {
        const p = prev[j];
        return `<div class="set ${s.done ? 'done' : ''}" data-j="${j}"><span class="n">${j + 1}</span>
          <span class="prev">${p ? `${p.w ? S.toDisplay(p.w) : 'BW'} × ${p.r}` : '—'}</span>
          <input class="num" inputmode="decimal" data-k="w" value="${s.w != null ? S.toDisplay(s.w) : ''}" placeholder="${p?.w ? S.toDisplay(p.w) : '0'}" aria-label="Weight">
          <input class="num" inputmode="numeric" data-k="r" value="${s.r ?? ''}" placeholder="${p?.r ?? '0'}" aria-label="Reps">
          <button class="chk" aria-label="Done">✓</button></div>`;
      }).join('')}</div>
      <div class="row gap"><button class="btn sm ghost" data-add="${i}">＋ Set</button>${we.sets.length > 1 ? `<button class="btn sm ghost" data-rm="${i}">− Set</button>` : ''}</div>
    </section>`;
  }).join('');
  drawThumbs(root);

  root.oninput = (e) => {
    const inp = e.target.closest('input.num'); if (!inp) return;
    const i = +inp.closest('.wo-ex').dataset.i, j = +inp.closest('.set').dataset.j;
    const s = w.exercises[i].sets[j];
    if (inp.dataset.k === 'w') s.w = S.fromDisplay(inp.value); else s.r = inp.value === '' ? null : Math.max(0, Math.round(+inp.value));
    S.save();
  };
  root.onclick = async (e) => {
    const t = e.target;
    const card = t.closest('.wo-ex'); if (!card) return;
    const i = +card.dataset.i, we = w.exercises[i];
    if (t.closest('.chk')) {
      const row = t.closest('.set'), j = +row.dataset.j, s = we.sets[j];
      if (!s.done) { // fill blanks from the placeholders (last time's numbers)
        const [wi, ri] = $$('input', row);
        if (s.w == null && wi.placeholder !== '0') s.w = S.fromDisplay(wi.placeholder);
        if (s.r == null) s.r = +ri.placeholder || null;
        if (!s.r) { ri.focus(); return toast('Enter reps first'); }
      }
      s.done = !s.done; S.save();
      if (s.done) { startRest(S.get().settings.rest); navigator.vibrate?.(15); }
      drawExercises(); $('#sc').textContent = `${S.doneSets(w)} sets`;
    } else if (t.dataset.add != null) {
      const last = we.sets[we.sets.length - 1];
      we.sets.push({ w: last?.w ?? null, r: last?.r ?? null, done: false }); S.save(); drawExercises();
    } else if (t.dataset.rm != null) {
      we.sets.pop(); S.save(); drawExercises();
    } else if (t.dataset.menu != null) {
      sheet(`<h3>${esc(ex(we.exId).name)}</h3><div class="menu">
        ${i > 0 ? '<button data-m="up">↑ Move up</button>' : ''}${i < w.exercises.length - 1 ? '<button data-m="down">↓ Move down</button>' : ''}
        <button data-m="swap">⇄ Replace exercise</button><button data-m="rm" class="danger-t">✕ Remove from workout</button></div>`, (el, close) => {
        el.onclick = async (ev) => {
          const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return;
          close();
          if (m === 'up' || m === 'down') { const k = m === 'up' ? i - 1 : i + 1; [w.exercises[i], w.exercises[k]] = [w.exercises[k], w.exercises[i]]; }
          if (m === 'rm') w.exercises.splice(i, 1);
          if (m === 'swap') { const ids = await pickExercises('Replace with'); if (ids[0]) w.exercises[i] = { exId: ids[0], sets: setsFromHistory(ids[0]) }; }
          S.save(); drawExercises();
        };
      });
    }
  };
}

async function finish() {
  const w = S.get().active;
  const n = S.doneSets(w);
  if (!n) {
    if (await ask('No sets are ticked yet. Discard this workout?', 'Discard', true)) { S.update((x) => { x.active = null; }); stopRest(); render(); }
    return;
  }
  if (!(await ask(`Finish workout? ${n} set${n > 1 ? 's' : ''} will be saved.`, 'Finish'))) return;
  S.update((x) => {
    const done = { ...w, end: Date.now(), date: S.dayKey(w.start) };
    delete done.restEnd;
    done.exercises = w.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length);
    x.workouts.push(done); x.active = null;
  });
  stopRest();
  const s = streaks(S.activity());
  go('#/home');
  toast(s.cur > 1 ? `Workout saved · 🔥 ${s.cur}-day streak` : 'Workout saved · day logged');
}

function viewWorkoutIdle(main) {
  setTitle('Workout');
  const st = S.get();
  main.innerHTML = `
    <button class="cta" id="empty"><span><b>Start empty workout</b><small>Add exercises as you go</small></span><span class="go">›</span></button>
    <div class="sec-h"><h3>Routines</h3><button class="link" id="newr">＋ New routine</button></div>
    <div id="rts">${st.routines.length ? st.routines.map((r) => `
      <div class="card routine" data-id="${r.id}"><div><b>${esc(r.name)}</b>
        <p class="muted small clamp">${esc(r.exIds.map((id) => ex(id).name).join(', '))}</p></div>
        <div class="row gap"><button class="btn sm primary" data-start>Start</button><button class="icon-btn" data-del aria-label="Delete routine">✕</button></div></div>`).join('')
      : `<div class="empty"><p>No routines yet.</p><p class="muted small">Save a workout as a routine (Push day, Legs…) to start it in one tap.</p></div>`}</div>`;
  $('#empty').onclick = () => startFrom('Workout', []);
  $('#newr').onclick = async () => {
    const ids = await pickExercises('Pick routine exercises');
    if (!ids.length) return;
    const name = await prompt2('Routine name', 'Push day');
    if (!name) return;
    S.update((x) => x.routines.push({ id: S.uid(), name, exIds: ids }));
    render();
  };
  $('#rts').onclick = async (e) => {
    const card = e.target.closest('.routine'); if (!card) return;
    const r = st.routines.find((x) => x.id === card.dataset.id);
    if (e.target.closest('[data-start]')) startFrom(r.name, r.exIds);
    if (e.target.closest('[data-del]') && (await ask(`Delete routine “${r.name}”?`, 'Delete', true))) { S.update((x) => { x.routines = x.routines.filter((y) => y.id !== r.id); }); render(); }
  };
}

// rest timer (survives navigation; the end time lives in the active workout)
let restIv = null;
function startRest(sec) {
  if (!sec) return;
  S.update((x) => { if (x.active) x.active.restEnd = Date.now() + sec * 1000; });
  runRest();
}
function stopRest() { clearInterval(restIv); restIv = null; $('#rest').classList.remove('show'); const a = S.get().active; if (a) { a.restEnd = 0; S.save(); } }
function runRest() {
  const bar = $('#rest');
  clearInterval(restIv);
  const draw = () => {
    const a = S.get().active;
    const left = a?.restEnd ? (a.restEnd - Date.now()) / 1000 : 0;
    if (left <= 0) {
      if (a?.restEnd) { navigator.vibrate?.([180, 80, 180]); beep(); toast('Rest over · next set'); }
      return stopRest();
    }
    bar.classList.add('show');
    $('#rest-t').textContent = clock(Math.ceil(left));
    $('#rest-p').style.width = `${Math.min(100, (left / S.get().settings.rest) * 100)}%`;
  };
  draw(); restIv = setInterval(draw, 250);
}
function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.15, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.4);
    o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.4);
  } catch { /* audio blocked */ }
}

let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* not allowed */ } }
function releaseAwake() { wakeLock?.release?.(); wakeLock = null; }

// ------------------------------------------------------------------ history
function viewHistory(main, id) {
  if (id) return viewWorkoutDetail(main, id);
  setTitle('History');
  const ws = [...S.get().workouts].sort((a, b) => b.start - a.start);
  if (!ws.length) { main.innerHTML = `<div class="empty"><p>No workouts yet.</p><p class="muted small">Finished workouts are saved here.</p><a class="btn primary" href="#/workout">Start one</a></div>`; return; }
  let html = '', month = '';
  const tot = { n: ws.length, sets: ws.reduce((a, w) => a + S.doneSets(w), 0), vol: ws.reduce((a, w) => a + S.volume(w), 0) };
  html += `<div class="prs card"><div><span class="muted small">Workouts</span><b>${tot.n}</b></div><div><span class="muted small">Sets</span><b>${tot.sets.toLocaleString()}</b></div><div><span class="muted small">Volume</span><b>${Math.round(S.toDisplay(tot.vol)).toLocaleString()}</b><small>${S.unit()}</small></div></div>`;
  for (const w of ws) {
    const d = S.parseDay(w.date), m = `${MON[d.getMonth()]} ${d.getFullYear()}`;
    if (m !== month) { html += `<h3 class="month">${m}</h3>`; month = m; }
    html += woRow(w);
  }
  main.innerHTML = html;
}

function viewWorkoutDetail(main, id) {
  const w = S.get().workouts.find((x) => x.id === id);
  setTitle('Workout', '#/history');
  if (!w) { main.innerHTML = '<div class="empty"><p>Workout not found.</p></div>'; return; }
  main.innerHTML = `
    <div class="wd-h"><h1>${esc(w.name)}</h1><p class="muted">${fmtDay(w.date)} · ${new Date(w.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${fmtDur(w.end - w.start)}</p></div>
    <div class="prs card"><div><span class="muted small">Sets</span><b>${S.doneSets(w)}</b></div><div><span class="muted small">Exercises</span><b>${w.exercises.length}</b></div><div><span class="muted small">Volume</span><b>${Math.round(S.toDisplay(S.volume(w))).toLocaleString()}</b><small>${S.unit()}</small></div></div>
    ${w.exercises.map((we) => { const e = ex(we.exId); return `<section class="card"><a class="wo-ex-t" href="#/ex/${encodeURIComponent(e.id)}">${thumb(e)}<span><b>${esc(e.name)}</b></span></a>
      <ol class="setlist">${we.sets.map((s) => `<li><span>${s.w ? S.fmtW(s.w) : 'Bodyweight'}</span><span>× ${s.r}</span>${S.e1rm(s.w, s.r) ? `<span class="muted small">e1RM ${S.toDisplay(S.e1rm(s.w, s.r))}</span>` : ''}</li>`).join('')}</ol></section>`; }).join('')}
    <div class="row gap wrap"><button class="btn primary" id="again">Repeat this workout</button><button class="btn ghost" id="ren">Rename</button><button class="btn ghost danger-t" id="del">Delete</button></div>`;
  drawThumbs(main);
  $('#again').onclick = async () => {
    if (S.get().active && !(await ask('You have a workout in progress. Replace it?', 'Replace', true))) return;
    startFrom(w.name, w.exercises.map((e) => e.exId)); go('#/workout');
  };
  $('#ren').onclick = async () => { const n = await prompt2('Workout name', w.name); if (n) { S.update(() => { w.name = n; }); render(); } };
  $('#del').onclick = async () => {
    if (!(await ask('Delete this workout? It also comes off your consistency grid.', 'Delete', true))) return;
    S.update((x) => { x.workouts = x.workouts.filter((y) => y.id !== w.id); });
    go('#/history');
  };
}

// ------------------------------------------------------------------ custom exercise
function viewCustom(main, id) {
  const editing = id ? S.get().custom.find((c) => c.id === id) : null;
  setTitle(editing ? 'Edit exercise' : 'New exercise', '#/library');
  const e = editing || { name: '', pm: ['chest'], eq: 'barbell', cat: 'strength', anim: 'bench', ins: [] };
  const animOpts = Object.entries(PATTERNS).map(([k, p]) => `<option value="${k}" ${k === e.anim ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  main.innerHTML = `<form class="stack" id="cf">
    <div class="hero sm"><div class="stage" id="stage"></div><div id="lg">${legend(e.pm, [])}</div></div>
    <label class="lbl">Name<input class="inp" name="name" required maxlength="60" value="${esc(e.name)}" placeholder="e.g. Landmine press"></label>
    <div class="grid2">
      <label class="lbl">Main muscle<select class="inp" name="pm">${MUSCLES.map((m) => `<option ${m === e.pm[0] ? 'selected' : ''} value="${m}">${cap(m)}</option>`).join('')}</select></label>
      <label class="lbl">Equipment<select class="inp" name="eq">${EQUIP.map((m) => `<option ${m === e.eq ? 'selected' : ''} value="${m}">${cap(m)}</option>`).join('')}</select></label>
      <label class="lbl">Type<select class="inp" name="cat">${CATS.map((m) => `<option ${m === e.cat ? 'selected' : ''} value="${m}">${cap(m)}</option>`).join('')}</select></label>
      <label class="lbl">Animation<select class="inp" name="anim">${animOpts}</select></label>
    </div>
    <label class="lbl">Steps <span class="muted small">(one per line, optional)</span><textarea class="inp" name="ins" rows="4">${esc(e.ins.join('\n'))}</textarea></label>
    <button class="btn primary wide">${editing ? 'Save changes' : 'Create exercise'}</button></form>`;
  const f = $('#cf');
  const player = mountStage($('#stage'), e);
  player?.play();
  const sync = () => {
    player?.load({ anim: f.anim.value, eq: f.eq.value, pm: [f.pm.value] }, { keepView: true });
    $('#lg').innerHTML = legend([f.pm.value], []);
  };
  f.anim.onchange = sync; f.eq.onchange = sync; f.pm.onchange = sync;
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const row = { id: editing?.id || 'c_' + S.uid(), name: f.name.value.trim(), pm: [f.pm.value], sm: [], eq: f.eq.value, cat: f.cat.value,
      anim: f.anim.value, ins: f.ins.value.split('\n').map((s) => s.trim()).filter(Boolean), lvl: 'beginner', custom: true };
    S.update((x) => { if (editing) x.custom = x.custom.map((c) => (c.id === row.id ? row : c)); else x.custom.push(row); });
    reindex();
    history.replaceState(null, '', `#/ex/${encodeURIComponent(row.id)}`); render();
    toast(editing ? 'Saved' : 'Exercise created');
  };
}

// ------------------------------------------------------------------ settings
function viewSettings(main) {
  setTitle('Settings', '#/home');
  const s = S.get().settings;
  const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[k]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  main.innerHTML = `
    <section class="card set-l">
      <div><span>Units</span>${seg('unit', [['kg', 'kg'], ['lb', 'lb']])}</div>
      <div><span>Theme</span>${seg('theme', [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']])}</div>
      <div><span>Rest timer</span><select class="inp sm" data-k="rest">${[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map((v) => `<option value="${v}" ${v === s.rest ? 'selected' : ''}>${v ? clock(v) : 'Off'}</option>`).join('')}</select></div>
      <div><span>Weekly goal</span><select class="inp sm" data-k="weeklyGoal">${[1, 2, 3, 4, 5, 6, 7].map((v) => `<option value="${v}" ${v === s.weeklyGoal ? 'selected' : ''}>${v} day${v > 1 ? 's' : ''}</option>`).join('')}</select></div>
    </section>
    <section class="card"><h3>Backup</h3>
      <p class="muted small">Everything is stored only on this phone. Export a backup now and then, and use it to move to a new phone.</p>
      <div class="row gap wrap"><button class="btn" id="exp">Export backup</button><label class="btn ghost">Import backup<input type="file" accept="application/json,.json" id="imp" hidden></label></div>
      <p class="muted small" id="persist"></p></section>
    <section class="card"><h3>About</h3>
      <p class="small">Exercise list and instructions: <a class="link" href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a> (public domain). Animations are drawn by the app. Form videos open on YouTube.</p>
      <button class="btn ghost danger-t" id="wipe">Delete all data</button></section>`;
  $$('.seg[data-k]', main).forEach((g) => (g.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.update((x) => { x.settings[g.dataset.k] = b.dataset.v; });
    $$('button', g).forEach((x) => x.classList.toggle('on', x === b)); applyTheme();
  }));
  $$('select[data-k]', main).forEach((el) => (el.onchange = () => S.update((x) => { x.settings[el.dataset.k] = +el.value; })));
  $('#exp').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: 'application/json' }));
    a.download = `forge-backup-${S.dayKey()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#imp').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!(await ask(`Replace everything on this phone with the backup (${data.workouts?.length ?? 0} workouts)?`, 'Import', true))) return;
      S.replaceAll(data); reindex(); applyTheme(); toast('Backup imported'); go('#/home');
    } catch (err) { toast('Couldn’t read that file: ' + err.message); }
  };
  $('#wipe').onclick = async () => {
    if (!(await ask('Delete all workouts, routines and settings from this phone?', 'Delete everything', true))) return;
    if (!(await ask('Really? This can’t be undone unless you exported a backup.', 'Yes, delete', true))) return;
    S.replaceAll({ workouts: [] }); reindex(); applyTheme(); go('#/home');
  };
  navigator.storage?.persisted?.().then((p) => { $('#persist').textContent = p ? 'Storage is persistent: the browser won’t clear it on its own.' : 'Storage may be cleared by the browser if the phone runs low on space. Install the app to home screen to keep it safe.'; });
}

function applyTheme() {
  const t = S.get().settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}

// ------------------------------------------------------------------ boot
async function boot() {
  applyTheme();
  $('#gear').onclick = () => go('#/settings');
  $('#rest-m').onclick = () => { const a = S.get().active; if (a?.restEnd) { a.restEnd = Math.max(Date.now(), a.restEnd - 15000); S.save(); } };
  $('#rest-p15').onclick = () => { const a = S.get().active; if (a?.restEnd) { a.restEnd += 15000; S.save(); } };
  $('#rest-x').onclick = stopRest;
  try {
    const r = await fetch('data/exercises.json');
    DB = await r.json();
  } catch (e) {
    $('#view').innerHTML = '<div class="empty"><p>Couldn’t load the exercise list.</p><p class="muted small">Open the app once while online so it can save itself for offline use.</p></div>';
    return;
  }
  reindex();
  window.addEventListener('hashchange', render);
  render();
  if (S.get().active?.restEnd > Date.now()) runRest();
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update ready', { label: 'Reload', run: () => location.reload() });
        });
      });
    }).catch(() => {});
  }
}
boot();

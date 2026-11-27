// DOM wiring for the Giza page: places list, info card, toolbar, cutaway
// bar, settings, help, compass and walk HUD.
import { PLACES, GROUPS } from './data/places.js';

const $ = (id) => document.getElementById(id);

export function createUI(app, act) {
  const { state } = app;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let toastT = 0;

  // ---------------------------------------------------------- places ---
  const list = $('placeList');
  const items = new Map();
  for (const g of GROUPS) {
    const sec = document.createElement('div');
    sec.className = 'pl-group';
    sec.innerHTML = `<h3>${g.name}</h3>`;
    for (const p of PLACES.filter((q) => q.group === g.id)) {
      const b = document.createElement('button');
      b.className = `pl-item k-${p.kind}`;
      b.setAttribute('role', 'listitem');
      b.innerHTML = `<span class="dot"></span><span class="nm"></span>${p.era === 'today' ? '<span class="tag">today</span>' : ''}`;
      b.querySelector('.nm').textContent = p.name;
      b.addEventListener('click', () => { act.selectPlace(p.id); if (mobile()) togglePlaces(false); });
      sec.appendChild(b);
      items.set(p.id, { b, p, sec });
    }
    list.appendChild(sec);
  }
  $('search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const { b, p } of items.values()) {
      const hit = !q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
      b.classList.toggle('hidden', !hit);
    }
    for (const sec of list.children) sec.classList.toggle('hidden', ![...sec.querySelectorAll('.pl-item')].some((x) => !x.classList.contains('hidden')));
  });
  const mobile = () => innerWidth <= 860;
  const togglePlaces = (open) => {
    const el = $('places');
    if (!mobile()) {
      const o = open ?? document.body.classList.contains('places-collapsed');
      document.body.classList.toggle('places-collapsed', !o);
      $('placesBtn').setAttribute('aria-expanded', String(o));
      try { localStorage.setItem('giza-places', o ? '1' : '0'); } catch (e) { /* ignore */ }
      return;
    }
    const o = open ?? !el.classList.contains('open');
    el.classList.toggle('open', o);
    $('placesBtn').setAttribute('aria-expanded', String(o));
    if (o) $('info').classList.add('hidden');
  };
  let placesPref = null;
  try { placesPref = localStorage.getItem('giza-places'); } catch (e) { /* ignore */ }
  if (placesPref !== '1') document.body.classList.add('places-collapsed');
  if (new URLSearchParams(location.search).has('noplaces')) document.body.classList.add('places-collapsed');
  if (new URLSearchParams(location.search).has('clean')) document.body.classList.add('clean');
  $('placesBtn').addEventListener('click', () => togglePlaces());
  $('placesClose').addEventListener('click', () => togglePlaces(false));

  // ------------------------------------------------------------ info ---
  const groupName = Object.fromEntries(GROUPS.map((g) => [g.id, g.name]));
  // first sentence (or two short ones) as the summary; the rest behind "More"
  const summary = (t) => {
    const parts = t.match(/[^.!?]+[.!?]+(\s|$)/g) || [t];
    let out = parts[0];
    if (out.length < 70 && parts[1]) out += parts[1];
    return out.trim();
  };
  function showInfo(p) {
    for (const { b } of items.values()) b.classList.remove('sel');
    items.get(p.id)?.b.classList.add('sel');
    $('infoKicker').textContent = groupName[p.group] || '';
    $('infoTitle').textContent = p.name;
    const short = summary(p.desc);
    const rest = p.desc.slice(short.length).trim();
    $('infoDesc').textContent = short;
    $('infoMore').textContent = rest;
    const dl = $('infoFacts');
    dl.innerHTML = '';
    for (const [k, v] of p.facts || []) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    const acts = $('infoActions');
    acts.innerHTML = '';
    const btn = (label, fn, cls = '') => {
      const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls;
      b.addEventListener('click', fn); acts.appendChild(b);
      return b;
    };
    const interior = p.pyr && !p.exterior;
    const hasMore = !!(rest || (p.facts && p.facts.length));
    if (interior && (state.mode !== 'orbit' || (!state.section && !state.xray))) btn('Cutaway', () => { act.setMode('orbit'); act.selectPlace(p.id); }, 'primary');
    if (p.walk || !interior) btn(interior ? 'Walk inside' : 'Walk here', () => app.enterWalkAt(p), interior ? '' : 'primary');
    if (hasMore) { const mb = btn('More', () => { mb.textContent = info.classList.toggle('expanded') ? 'Less' : 'More'; }, 'ghost'); }
    btn('Share', () => {
      const u = new URL(location.href); u.search = ''; u.searchParams.set('place', p.id);
      if (navigator.share && coarse) navigator.share({ title: p.name, url: u.toString() }).catch(() => {});
      else navigator.clipboard?.writeText(u.toString()).then(() => toast('Link copied'), () => toast(u.toString()));
    }, 'ghost');
    const info = $('info');
    info.classList.remove('expanded');
    info.classList.remove('hidden');
    if (innerWidth <= 860) togglePlaces(false);
    try { const u = new URL(location.href); u.searchParams.set('place', p.id); history.replaceState(null, '', u); } catch (e) { /* file:// */ }
  }
  function hideInfo() {
    $('info').classList.add('hidden');
    app.labels.select(null);
    state.selected = null;
    for (const { b } of items.values()) b.classList.remove('sel');
  }
  $('infoClose').addEventListener('click', hideInfo);

  // --------------------------------------------------------- toolbar ---
  const seg = (id, fn) => {
    const el = $(id);
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => fn(b.dataset.v)));
    return (v) => el.querySelectorAll('button').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  };
  const syncMode = seg('modeSeg', (v) => act.setMode(v));
  const syncEraSeg = seg('eraSeg', (v) => act.setEra(v));
  const syncPlane = seg('secPlane', (v) => { act.setSection(true, { plane: v }); syncSectionBar(); });
  const press = (id, on) => $(id).setAttribute('aria-pressed', String(on));
  $('secBtn').addEventListener('click', () => act.setSection(!state.section));
  $('xrayBtn').addEventListener('click', () => act.setXray(!state.xray));
  $('labelsBtn').addEventListener('click', () => act.setLabels(!state.labels));
  $('helpBtn').addEventListener('click', () => showHelp(true));
  $('helpBtn2').addEventListener('click', () => { closeMore(); showHelp(true); });
  $('labelsChk').addEventListener('change', (e) => act.setLabels(e.target.checked));
  $('xrayChk').addEventListener('change', (e) => { closeMore(); act.setXray(e.target.checked); });
  $('tourBtn').addEventListener('click', () => { closeMore(); app.tour.active ? app.tour.stop() : app.tour.start(); });
  $('eraBtn').addEventListener('click', () => act.setEra(state.era === 'today' ? 'built' : 'today'));
  // welcome screen
  const closeWelcome = () => $('welcome').classList.add('hidden');
  $('welcomeTour').addEventListener('click', () => { closeWelcome(); app.tour.start(); });
  $('welcomeExplore').addEventListener('click', () => { closeWelcome(); });
  $('welcomeHelp').addEventListener('click', () => { closeWelcome(); showHelp(true); });
  function closeMore() { $('settings').classList.add('hidden'); press('settingsBtn', false); }
  $('helpClose').addEventListener('click', () => showHelp(false));
  $('help').addEventListener('click', (e) => { if (e.target.id === 'help') showHelp(false); });
  $('settingsBtn').addEventListener('click', () => {
    const el = $('settings'); const o = el.classList.toggle('hidden');
    press('settingsBtn', !o);
  });

  // time of day: limit the slider to daylight (plus twilight) for the date
  const timeSlider = $('timeSlider');
  const fmt = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${String(hh + (mm === 60 ? 1 : 0)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`; };
  const timeSlider2 = $('timeSlider2');
  function setDayRange() {
    const { rise, set } = app.sky.dayInfo();
    for (const t of [timeSlider, timeSlider2]) { t.min = (rise - 0.5).toFixed(2); t.max = (set + 0.5).toFixed(2); }
  }
  setDayRange();
  timeSlider.addEventListener('input', () => act.setTime(parseFloat(timeSlider.value)));
  timeSlider2.addEventListener('input', () => act.setTime(parseFloat(timeSlider2.value)));
  const syncTime = (h) => { timeSlider.value = h; timeSlider2.value = h; $('timeOut').textContent = fmt(h); $('timeOut2').textContent = fmt(h); };

  // ------------------------------------------------------- cutaway bar ---
  const off = $('secOffset');
  function syncSectionBar() {
    const s = app.section;
    $('secTarget').value = s.target;
    syncPlane(s.plane);
    const [lo, hi] = s.range();
    off.min = lo.toFixed(1); off.max = hi.toFixed(1); off.value = s.offset;
    $('secOffsetLabel').textContent = s.plane === 'x' ? 'Move cut  W ↔ E' : 'Move cut  N ↔ S';
  }
  $('secTarget').addEventListener('change', (e) => {
    const sel = PLACES.find((q) => q.id === state.selected);
    if (sel && sel.pyr && sel.pyr !== e.target.value) hideInfo();
    act.setSection(true, { target: e.target.value }); syncSectionBar();
  });
  off.addEventListener('input', () => { app.section.set({ offset: parseFloat(off.value) }); });
  $('secFlip').addEventListener('click', () => {
    app.section.set({ flip: !app.section.flip });
    const vp = app.section.viewpoint();
    app.flyTo(new app.camera.position.constructor(...vp.pos), new app.camera.position.constructor(...vp.target));
  });
  $('secView').addEventListener('click', () => {
    const vp = app.section.viewpoint();
    app.flyTo(new app.camera.position.constructor(...vp.pos), new app.camera.position.constructor(...vp.target));
  });

  // ---------------------------------------------------------- settings ---
  const qs = $('qualitySel');
  qs.value = app.quality;
  qs.addEventListener('change', () => {
    try { localStorage.setItem('giza-quality', qs.value); } catch (e) { /* ignore */ }
    const u = new URL(location.href); u.searchParams.set('q', qs.value); location.href = u.toString();
  });
  const di = $('dateInput');
  const d0 = app.sky.date;
  di.value = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`;
  di.addEventListener('change', () => {
    const [y, m, d] = di.value.split('-').map(Number);
    if (!y) return;
    app.sky.setDate(new Date(y, m - 1, d));
    setDayRange();
  });
  $('voidsChk').addEventListener('change', (e) => act.setVoids(e.target.checked));
  $('cityChk').addEventListener('change', (e) => act.setCity(e.target.checked));
  $('nowBtn').addEventListener('click', () => {
    const now = new Date();
    const cairo = new Date(now.getTime() + (now.getTimezoneOffset() + 120) * 60000);
    app.sky.setDate(new Date(cairo.getFullYear(), cairo.getMonth(), cairo.getDate()));
    setDayRange();
    const h = cairo.getHours() + cairo.getMinutes() / 60;
    act.setTime(Math.min(Math.max(h, parseFloat(timeSlider.min)), parseFloat(timeSlider.max)));
    di.value = `${cairo.getFullYear()}-${String(cairo.getMonth() + 1).padStart(2, '0')}-${String(cairo.getDate()).padStart(2, '0')}`;
    toast(h < parseFloat(timeSlider.min) || h > parseFloat(timeSlider.max) ? 'It is night in Giza — showing twilight' : 'Sun set to the current time in Giza');
  });

  $('homeBtn').addEventListener('click', () => { app.tour?.active && app.tour.stop(); act.flyHome(); });

  // ---------------------------------------------------------- compass ---
  const rose = document.querySelector('#compass .rose');
  const fwd = new app.camera.position.constructor();
  $('compass').addEventListener('click', faceNorth);
  $('compass').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') faceNorth(); });
  function faceNorth() {
    if (state.mode === 'walk') { app.walk.yaw = 0; return; }
    const t = app.controls.target, c = app.camera.position;
    const d = Math.hypot(c.x - t.x, c.z - t.z);
    app.flyTo(new c.constructor(t.x, c.y, t.z + d), t.clone(), 700);
  }
  function updateCompass(cam) {
    cam.getWorldDirection(fwd);
    const heading = Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI;
    rose.style.transform = `rotate(${-heading}deg)`;
  }

  // ---------------------------------------------------------- walk HUD ---
  function setWalkHint(locked) {
    if (state.mode === 'fly') {
      $('walkHint').textContent = coarse ? 'Joystick to fly · drag to look · ▲▼ climb' : 'W A S D fly · Q / E down, up · drag to look · Shift faster';
      return;
    }
    $('walkHint').textContent = coarse
      ? 'Joystick to move · drag to look · tap Explore to leave'
      : locked ? 'W A S D move · Shift run · F torch · Esc releases the mouse'
        : 'Click the view to look around · W A S D to move · V or Explore to leave';
  }
  let hintT = 0;
  function flashHint() {
    const h = $('walkHint'); h.classList.remove('faded');
    clearTimeout(hintT); hintT = setTimeout(() => h.classList.add('faded'), 6000);
  }
  let whereLast = null;
  function setWhere(s) {
    if (s === whereLast) return;
    whereLast = s;
    $('whereTag').textContent = !s ? '' : state.mode === 'walk' ? 'Inside the ' + s : s;
  }

  // ------------------------------------------------------------- sync ---
  const ui = {
    showInfo,
    syncMode(m) {
      syncMode(m);
      $('walkHud').classList.toggle('hidden', m === 'orbit');
      setWalkHint(false);
      if (m !== 'orbit') flashHint();
      document.body.classList.toggle('walking', m === 'walk');
      document.body.classList.toggle('flying', m === 'fly');
      if (m !== 'walk') setWhere('');
      const sel = PLACES.find((q) => q.id === state.selected);
      if (sel && !$('info').classList.contains('hidden')) showInfo(sel);
    },
    syncEra(e) {
      syncEraSeg(e);
      $('eraBtnLabel').textContent = e === 'today' ? '2560 BCE' : 'Today';
      press('eraBtn', e === 'built');
      $('eraBadge').textContent = e === 'today' ? 'Today' : 'As built, c. 2560 BCE';
      toast(e === 'today' ? 'Today' : 'As built, c. 2560 BCE');
    },
    syncXray(on) { press('xrayBtn', on); $('xrayChk').checked = on; },
    syncSection(on) {
      press('secBtn', on);
      $('sectionBar').classList.toggle('hidden', !on);
      if (on) syncSectionBar();
    },
    syncLabels(on) { press('labelsBtn', on); $('labelsChk').checked = on; },
    hideInfo,
    // pixels at the bottom of the screen covered by a sheet (used to re-centre the view)
    bottomCover() {
      let c = 0;
      const t = $('tour');
      if (!t.classList.contains('hidden')) c = Math.max(c, innerHeight - t.getBoundingClientRect().top);
      if (mobile()) {
        const i = $('info');
        if (!i.classList.contains('hidden')) c = Math.max(c, innerHeight - i.getBoundingClientRect().top);
      }
      return Math.max(0, c);
    },
    maybeShowWelcome() {
      let seen = false;
      try { seen = localStorage.getItem('giza-welcome') === '1'; } catch (e) { /* ignore */ }
      const q = new URLSearchParams(location.search);
      if (seen || q.has('still') || q.has('place') || q.has('walk') || q.has('section')) return;
      $('welcome').classList.remove('hidden');
      try { localStorage.setItem('giza-welcome', '1'); } catch (e) { /* ignore */ }
    },
    syncTime,
    updateCompass, setWalkHint, setWhere, toast,
  };

  function showHelp(on) { $('help').classList.toggle('hidden', !on); if (on) $('helpClose').focus(); }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
  }

  // -------------------------------------------------------- keyboard ---
  addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.code) {
      case 'KeyV': act.setMode(state.mode === 'walk' ? 'orbit' : 'walk'); break;
      case 'KeyG': act.setMode(state.mode === 'fly' ? 'orbit' : 'fly'); break;
      case 'KeyO': act.setMode('orbit'); break;
      case 'KeyC': act.setSection(!state.section); break;
      case 'KeyX': act.setXray(!state.xray); break;
      case 'KeyB': act.setEra(state.era === 'today' ? 'built' : 'today'); break;
      case 'KeyE': if (state.mode === 'orbit') act.setEra(state.era === 'today' ? 'built' : 'today'); break;
      case 'KeyL': act.setLabels(!state.labels); break;
      case 'KeyH': showHelp($('help').classList.contains('hidden')); break;
      case 'Home': act.flyHome(); break;
      case 'KeyT': app.tour.active ? app.tour.stop() : app.tour.start(); break;
      case 'KeyF': if (state.mode === 'walk') act.setTorch(!state.torch); break;
      case 'Escape':
        showHelp(false); closeMore(); $('welcome').classList.add('hidden');
        if (innerWidth <= 860) togglePlaces(false);
        break;
      default: break;
    }
  });
  // stop camera fly when the user grabs the view
  app.renderer.domElement.addEventListener('pointerdown', () => {
    app.cancelFly?.();
    if (state.mode !== 'walk') app.tour?.userInterrupt();
  });
  app.renderer.domElement.addEventListener('wheel', () => app.cancelFly?.(), { passive: true });

  return ui;
}

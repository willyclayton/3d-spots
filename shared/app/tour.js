// Guided tour engine: a narrated sequence of stops shown in the #tour card.
// Each stop is { title, text, dur (seconds; 0 = wait for the visitor), run }
// where run() is an async function that moves the camera (see the helpers in
// SpotApp.tourHelpers: place, view, walkPath, cutaway). Touching the view or
// the joystick pauses the tour.
const $ = (id) => document.getElementById(id);

export function createTour(app, stops) {
  let i = -1, playing = false, waiting = false, timer = 0, token = 0, active = false;
  const card = $('tour');

  function render() {
    const s = stops[i];
    $('tourStep').textContent = `${i + 1} / ${stops.length}`;
    $('tourTitle').textContent = s.title;
    $('tourText').textContent = s.text;
    $('tourPrev').disabled = i === 0;
    $('tourNext').textContent = i === stops.length - 1 ? 'Finish' : 'Next ›';
    $('tourPlay').textContent = playing ? 'Pause' : 'Play';
    $('tourPlay').classList.toggle('hidden', stops[i].dur === 0);
  }

  async function go(n) {
    if (n < 0 || n >= stops.length) return;
    const my = ++token;
    app.walk.cancelAuto(false);
    i = n; timer = 0; waiting = true;
    playing = true;
    render();
    $('tourProg').style.width = '0%';
    try { await stops[n].run(); } catch (e) { console.warn('tour', e); }
    if (my !== token) return;
    waiting = false;
    if (stops[n].dur === 0) { playing = false; render(); }
  }

  const tour = {
    get active() { return active; },
    get stops() { return stops; },
    get index() { return i; },
    get waiting() { return waiting; },
    start(at = 0) {
      active = true;
      document.body.classList.add('touring');
      card.classList.remove('hidden');
      app.ui.hideInfo?.();
      go(at);
    },
    stop() {
      token++; active = false; playing = false;
      app.walk.cancelAuto(false);
      app.walk.paused = false;
      document.body.classList.remove('touring');
      card.classList.add('hidden');
    },
    next() { if (i >= stops.length - 1) tour.stop(); else go(i + 1); },
    prev() { go(i - 1); },
    pause() { playing = false; app.walk.paused = true; render(); },
    resume() { playing = true; app.walk.paused = false; if (!waiting && timer >= (stops[i]?.dur || 0)) tour.next(); render(); },
    toggle() { playing ? tour.pause() : tour.resume(); },
    // called every frame
    tick(dt) {
      if (!active || !playing || waiting) return;
      const d = stops[i].dur;
      if (!d) return;
      timer += dt;
      $('tourProg').style.width = Math.min(100, (timer / d) * 100) + '%';
      if (timer >= d) tour.next();
    },
    // the visitor grabbed the view or the joystick: hold the tour here
    userInterrupt() { if (active && playing) tour.pause(); },
  };

  $('tourPrev').addEventListener('click', () => tour.prev());
  $('tourNext').addEventListener('click', () => tour.next());
  $('tourPlay').addEventListener('click', () => tour.toggle());
  $('tourExit').addEventListener('click', () => tour.stop());
  return tour;
}

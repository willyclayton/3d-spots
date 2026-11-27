// HTML labels pinned to 3D points, decluttered so they never get in the way:
//  * at most `max()` labels at once, most important first, nearest first
//  * never over the UI (reserved rectangles) or each other
//  * a clear zone around the selected place
//  * while the camera moves fast only the main landmarks stay up
//  * optional occlusion test (a few labels per frame)
import * as THREE from 'three';

export class LabelLayer {
  // reserved(): screen rectangles (DOMRect-like) that labels must not cover
  // max(width, height): how many labels may show at once
  constructor(container, camera, { onSelect, reserved, max } = {}) {
    this.reserved = reserved;
    this.max = max || ((w) => (w < 600 ? 7 : w < 1100 ? 11 : 14));
    this.root = container;
    this.camera = camera;
    this.items = [];
    this.enabled = true;
    this.onSelect = onSelect;
    this.selected = null;
    this._v = new THREE.Vector3();
    this._occIdx = 0;
    this._lastPos = new THREE.Vector3();
    this._lastQ = new THREE.Quaternion();
    this._moving = 0;
  }

  add(item) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `lbl k-${item.kind || 'feature'} p${item.prio || 2}`;
    el.innerHTML = `<span class="pin" aria-hidden="true"></span><span class="txt"></span>`;
    el.querySelector('.txt').textContent = item.short || item.text;
    el.setAttribute('aria-label', item.text);
    el.title = item.text;
    el.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect?.(item.id); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.appendChild(el);
    const it = { ...item, el, txt: el.querySelector('.txt'), w: 0, h: 0, shown: false, occluded: false, pos: new THREE.Vector3() };
    this.items.push(it);
    return it;
  }

  setEnabled(on) { this.enabled = on; this.root.classList.toggle('off', !on); }

  select(id) {
    this.selected = id;
    for (const it of this.items) { it.el.classList.toggle('sel', it.id === id); it.w = 0; }
  }

  // how fast the view is changing (fraction of the view per second)
  _motion(dt) {
    const cam = this.camera;
    const dp = cam.position.distanceTo(this._lastPos) / Math.max(1, cam.position.length() * 0.02 + 20);
    const dq = 2 * Math.acos(Math.min(1, Math.abs(cam.quaternion.dot(this._lastQ))));
    this._lastPos.copy(cam.position); this._lastQ.copy(cam.quaternion);
    const speed = (dp + dq * 2.5) / Math.max(dt, 1 / 240);
    if (speed > 1.6) this._moving = 0.35; else this._moving = Math.max(0, this._moving - dt);
    return this._moving > 0;
  }

  update(width, height, dt = 1 / 60) {
    if (!this.enabled) return;
    const cam = this.camera;
    const camPos = cam.position;
    const moving = this._motion(dt);
    const cand = [];
    // occlusion: test a few labels per frame
    const nOcc = Math.min(6, this.items.length);
    for (let k = 0; k < nOcc; k++) {
      const it = this.items[(this._occIdx + k) % this.items.length];
      if (it.occlusion) { it.getPos(it.pos); it.occluded = it.occlusion(it.pos, camPos); }
    }
    this._occIdx = (this._occIdx + nOcc) % Math.max(1, this.items.length);

    for (const it of this.items) {
      let vis = it.visible ? it.visible() : true;
      const sel = it.id === this.selected;
      if (vis && moving && !sel && it.prio > 1) vis = false;
      if (vis) {
        it.getPos(it.pos);
        const d = it.pos.distanceTo(camPos);
        it.dist = d;
        if (!sel && (d > (it.maxDist ?? 1e9) || d < (it.minDist ?? 0))) vis = false;
        if (it.occluded && !sel) vis = false;
        if (vis) {
          this._v.copy(it.pos).project(cam);
          if (this._v.z > 1 || this._v.z < -1 || Math.abs(this._v.x) > 1.05 || Math.abs(this._v.y) > 1.05) vis = false;
          else {
            it.sx = (this._v.x * 0.5 + 0.5) * width;
            it.sy = (-this._v.y * 0.5 + 0.5) * height;
          }
        }
      }
      if (vis) cand.push(it);
      else if (it.shown) { it.el.classList.remove('on'); it.shown = false; }
    }
    // selected first, then by priority, then distance
    cand.sort((a, b) => (b.id === this.selected) - (a.id === this.selected) || a.prio - b.prio || a.dist - b.dist);
    const placed = [];
    if (this.reserved) for (const q of this.reserved()) placed.push({ x0: q.left - 4, x1: q.right + 4, y0: q.top - 4, y1: q.bottom + 4 });
    let n = 0;
    const max = this.max(width, height);
    for (const it of cand) {
      if (!it.w) { it.w = it.txt.offsetWidth || 90; it.h = it.txt.offsetHeight || 20; }
      const r = { x0: it.sx - it.w / 2 - 3, x1: it.sx + it.w / 2 + 3, y0: it.sy - it.h - 9, y1: it.sy + 6 };
      const sel = it.id === this.selected;
      let ok = (sel || n < max) && r.x0 >= 2 && r.x1 <= width - 2 && r.y0 >= 2 && r.y1 <= height - 2;
      for (const q of placed) {
        if (!ok) break;
        if (r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0) ok = false;
      }
      if (ok) {
        n++;
        // keep the selected place itself in clear view
        placed.push(sel ? { x0: r.x0 - 40, x1: r.x1 + 40, y0: r.y0 - 16, y1: r.y1 + 70 } : r);
        it.el.style.transform = `translate3d(${it.sx.toFixed(1)}px, ${it.sy.toFixed(1)}px, 0)`;
        if (!it.shown) { it.el.classList.add('on'); it.shown = true; }
      } else if (it.shown) { it.el.classList.remove('on'); it.shown = false; }
    }
  }
}

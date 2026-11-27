// HTML labels pinned to 3D points, with priority-based decluttering,
// distance fading and an optional occlusion test.
import * as THREE from 'three';

export class LabelLayer {
  constructor(container, camera, { onSelect } = {}) {
    this.root = container;
    this.camera = camera;
    this.items = [];
    this.enabled = true;
    this.onSelect = onSelect;
    this.selected = null;
    this._v = new THREE.Vector3();
    this._occIdx = 0;
  }

  add(item) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `lbl k-${item.kind || 'feature'} p${item.prio || 2}`;
    el.innerHTML = `<span class="pin" aria-hidden="true"></span><span class="txt"></span>`;
    el.querySelector('.txt').textContent = item.text;
    el.setAttribute('aria-label', item.text);
    el.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect?.(item.id); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.appendChild(el);
    const it = { ...item, el, w: 0, h: 0, shown: false, occluded: false, pos: new THREE.Vector3() };
    this.items.push(it);
    return it;
  }

  setEnabled(on) { this.enabled = on; this.root.classList.toggle('off', !on); }

  select(id) {
    this.selected = id;
    for (const it of this.items) it.el.classList.toggle('sel', it.id === id);
  }

  update(width, height) {
    if (!this.enabled) return;
    const cam = this.camera;
    const camPos = cam.position;
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
      if (vis) {
        it.getPos(it.pos);
        const d = it.pos.distanceTo(camPos);
        it.dist = d;
        if (d > (it.maxDist ?? 1e9) || d < (it.minDist ?? 0)) vis = false;
        if (it.occluded && it.id !== this.selected) vis = false;
        if (vis) {
          this._v.copy(it.pos).project(cam);
          if (this._v.z > 1 || this._v.z < -1 || Math.abs(this._v.x) > 1.1 || Math.abs(this._v.y) > 1.1) vis = false;
          else {
            it.sx = (this._v.x * 0.5 + 0.5) * width;
            it.sy = (-this._v.y * 0.5 + 0.5) * height;
          }
        }
      }
      if (vis) cand.push(it);
      else if (it.shown) { it.el.classList.remove('on'); it.shown = false; }
    }
    // declutter: selected first, then by priority then distance
    cand.sort((a, b) => (b.id === this.selected) - (a.id === this.selected) || a.prio - b.prio || a.dist - b.dist);
    const placed = [];
    for (const it of cand) {
      if (!it.w) { it.w = it.el.offsetWidth || 120; it.h = it.el.offsetHeight || 28; }
      const r = { x0: it.sx - it.w / 2 - 4, x1: it.sx + it.w / 2 + 4, y0: it.sy - it.h - 18, y1: it.sy + 4 };
      let ok = true;
      for (const q of placed) {
        if (r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0) { ok = false; break; }
      }
      if (ok) {
        placed.push(r);
        it.el.style.transform = `translate3d(${it.sx.toFixed(1)}px, ${it.sy.toFixed(1)}px, 0)`;
        if (!it.shown) { it.el.classList.add('on'); it.shown = true; }
      } else if (it.shown) { it.el.classList.remove('on'); it.shown = false; }
    }
  }
}

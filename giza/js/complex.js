// The wider necropolis: mastaba cemeteries, temples, causeways, boat pits,
// the Sphinx enclosure, the Wall of the Crow, and the modern city / ancient
// flood plain.  Each part comes in a "today" (ruined) and "built" version.
import * as THREE from 'three';
import { GeoBuilder, addBox } from '../../shared/engine/geo.js';
import { mulberry32, fbm2, lerp, clamp } from '../../shared/engine/util.js';
import { COMPLEX, SPHINX } from './data/site.js';
import { Mats } from './materials.js';
import { causewayY } from './terrain.js';

export function buildComplex(terrain, { quality = 'high' } = {}) {
  const today = new THREE.Group(); today.name = 'complex-today';
  const built = new THREE.Group(); built.name = 'complex-built'; built.visible = false;
  const both = new THREE.Group(); both.name = 'complex-both';
  const obstacles = { today: [], built: [] };
  const holes = [];
  const rnd = mulberry32(77);
  const H = (x, z) => terrain.heightAt(x, z);

  const M = {
    stone: Mats.masonry(), plaster: Mats.plaster(), granite: Mats.roughGranite(), rock: Mats.rock({ tile: 7 }),
    big: Mats.masonry({ course: 2.2, color: 0xe2d0b2 }),
    mud: Mats.mudbrick(), basalt: Mats.basalt(), tura: Mats.weatheredCasing(),
  };
  const add = (gb, mat, grp, shadow = true) => {
    if (!gb.count) return null;
    const m = new THREE.Mesh(gb.build(), mat);
    m.castShadow = shadow; m.receiveShadow = true; grp.add(m); return m;
  };

  // ------------------------------------------------------- mastabas -------
  const mastabas = [];
  const pushM = (cx, cz, lx, lz, h, big = false) => mastabas.push({ cx, cz, lx, lz, h, big });
  // Western Cemetery: nucleus cemeteries laid out in streets
  for (let col = 0; col < 10; col++) {
    for (let row = 0; row < 15; row++) {
      const cx = -178 - col * 29 + (rnd() - 0.5) * 2;
      const cz = -262 + row * 21 + (rnd() - 0.5) * 2;
      if (rnd() < 0.16) continue;
      if (cx > -150) continue;
      const lz = 15 + rnd() * 6, lx = 8 + rnd() * 4;
      pushM(cx, cz, lx, lz, 4.5 + rnd() * 2);
    }
  }
  pushM(-200, -55, 26, 53, 7.5, true);       // G 4000, Hemiunu
  // Cemetery en échelon and G 2000 further west
  for (let i = 0; i < 26; i++) {
    const cx = -470 - (i % 6) * 27 - Math.floor(i / 6) * 9;
    const cz = -230 + Math.floor(i / 6) * 48 + (i % 6) * 8;
    pushM(cx, cz, 10 + rnd() * 4, 20 + rnd() * 8, 4 + rnd() * 2);
  }
  pushM(-520, -300, 24, 48, 7, true);         // G 2000
  // Eastern Cemetery: great double mastabas of Khufu's family
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 4; row++) {
      pushM(248 + col * 52, -70 + row * 64, 22, 48, 7.5, true);
    }
  }
  for (let i = 0; i < 30; i++) {
    const cx = 410 + (i % 4) * 22 + (rnd() - 0.5) * 3, cz = -110 + Math.floor(i / 4) * 34 + (rnd() - 0.5) * 3;
    if (rnd() < 0.2) continue;
    pushM(cx, cz, 9 + rnd() * 3, 16 + rnd() * 5, 4 + rnd() * 1.5);
  }
  // Central Field (south of the Great Pyramid, around the causeway)
  for (let i = 0; i < 22; i++) {
    const cx = -40 + rnd() * 230, cz = 380 + rnd() * 160;
    if (Math.abs(cz - (344 + (cx + 121) * 0.24)) < 14) continue;   // keep off the causeway
    pushM(cx, cz, 9 + rnd() * 5, 14 + rnd() * 8, 3.5 + rnd() * 2);
  }
  {
    const gT = new GeoBuilder(), gB = new GeoBuilder();
    for (const m of mastabas) {
      const y0 = Math.min(H(m.cx - m.lx / 2, m.cz - m.lz / 2), H(m.cx + m.lx / 2, m.cz + m.lz / 2), H(m.cx, m.cz)) - 0.4;
      const bat = 0.08;   // inward batter per metre of height
      // built: crisp, plastered
      battered(gB, m.cx, y0, m.cz, m.lx, m.lz, m.h + 0.4, bat, [0.96, 0.94, 0.9]);
      // today: eroded, lower, slumped
      const hT = Math.max(1.2, (m.h + 0.4) * (0.35 + rnd() * 0.45));
      const shrink = 0.3 + rnd() * 0.6;
      battered(gT, m.cx, y0, m.cz, m.lx - shrink, m.lz - shrink, hT, bat * 2.2, [0.92 + rnd() * 0.1, 0.88 + rnd() * 0.08, 0.82]);
      const r = { x0: m.cx - m.lx / 2 - 0.2, x1: m.cx + m.lx / 2 + 0.2, z0: m.cz - m.lz / 2 - 0.2, z1: m.cz + m.lz / 2 + 0.2 };
      obstacles.today.push(r); obstacles.built.push(r);
    }
    add(gT, M.stone, today); add(gB, M.plaster, built);
  }

  // ---------------------------------------------------------- temples -----
  const wallsT = new GeoBuilder(), wallsB = new GeoBuilder(), graniteT = new GeoBuilder(), graniteB = new GeoBuilder();
  const mudT = new GeoBuilder(), mudB = new GeoBuilder();
  const wall = (g, x0, z0, x1, z1, y0, h, obsList) => {
    addBox(g, Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y0 + h, Math.max(z0, z1), [0.95, 0.93, 0.9], 1);
    obsList?.forEach((l) => l.push({ x0: Math.min(x0, x1) - 0.25, x1: Math.max(x0, x1) + 0.25, z0: Math.min(z0, z1) - 0.25, z1: Math.max(z0, z1) + 0.25 }));
  };
  // a rectangular temple: outer walls with a door on the east, inner court
  const temple = (r, y0, hBuilt, hToday, gBuilt, gToday, thick = 3, door = 'e', court = 0.55) => {
    const { x0, x1, z0, z1 } = r;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, dw = 3;
    const sides = [
      ['n', x0, z0, x1, z0 + thick], ['s', x0, z1 - thick, x1, z1],
      ['w', x0, z0, x0 + thick, z1], ['e', x1 - thick, z0, x1, z1],
    ];
    for (const [s, a, b, c, d] of sides) {
      const parts = s === door
        ? (s === 'e' || s === 'w' ? [[a, b, c, cz - dw], [a, cz + dw, c, d]] : [[a, b, cx - dw, d], [cx + dw, b, c, d]])
        : [[a, b, c, d]];
      for (const [p, q, u, v] of parts) {
        wall(gBuilt, p, q, u, v, y0, hBuilt, [obstacles.built]);
        // ruined: broken into segments of varying height
        const len = Math.max(u - p, v - q), n = Math.max(1, Math.round(len / 3.5));
        const ph = rnd() * 10;
        for (let k = 0; k < n; k++) {
          const f0 = k / n, f1 = (k + 1) / n;
          const wave = 0.55 + 0.45 * Math.sin(ph + k * 0.7) * Math.sin(ph * 0.3 + k * 0.23);
          const hh = hToday * Math.min(1, Math.max(0.15, wave + (rnd() - 0.5) * 0.25));
          if (rnd() < 0.06) continue;
          const [aa, bb, cc, dd] = (u - p) > (v - q) ? [lerp(p, u, f0), q, lerp(p, u, f1), v] : [p, lerp(q, v, f0), u, lerp(q, v, f1)];
          wall(gToday, aa, bb, cc, dd, y0, hh, [obstacles.today]);
        }
      }
    }
    // inner sanctuary block on the west (pyramid) side
    const ix0 = x0 + thick + 2, ix1 = lerp(x0, x1, 1 - court) , iz0 = z0 + thick + 3, iz1 = z1 - thick - 3;
    if (ix1 > ix0 + 2) {
      wall(gBuilt, ix0, iz0, ix1, iz1, y0, hBuilt * 0.92, [obstacles.built]);
      wall(gToday, ix0, iz0, ix1, iz1, y0, hToday * 0.35, [obstacles.today]);
    }
  };
  const tK = COMPLEX.khufuTemple;
  temple(tK, 0, 8, 1.2, wallsB, wallsT, 3, 'e');
  { // basalt pavement remains
    const g = new GeoBuilder();
    g.poly([[tK.x0 + 6, 0.12, tK.z0 + 8], [tK.x1 - 8, 0.12, tK.z0 + 8], [tK.x1 - 8, 0.12, tK.z1 - 8], [tK.x0 + 6, 0.12, tK.z1 - 8]], [0, 1, 0], [1, 1, 1]);
    addBox(g, tK.x0 + 6, -0.2, tK.z0 + 8, tK.x1 - 8, 0.12, tK.z1 - 8, [0.8, 0.8, 0.8], 1, { py: true });
    add(g, M.basalt, both);
  }
  temple(COMPLEX.khafreTemple, 9.8, 9, 3.2, wallsB, wallsT, 4, 'e', 0.5);
  temple(COMPLEX.menkaureTemple, 7.7, 6, 0.9, mudB, mudT, 3, 'e', 0.5);
  // valley temple of Khafre: granite-faced, well preserved, roofed when built
  {
    const r = COMPLEX.khafreValleyTemple, y0 = -40.6;
    temple(r, y0, 12, 8.5, graniteB, wallsT, 6, 'e', 0.0);
    addBox(graniteB, r.x0, y0 + 12, r.z0, r.x1, y0 + 12.8, r.z1, [0.9, 0.86, 0.84]);   // roof
    // T-shaped pillared hall (granite pillars and architraves)
    for (let i = 0; i < 8; i++) {
      const x = r.x0 + 12 + (i % 4) * 5.2, z = (r.z0 + r.z1) / 2 + (i < 4 ? -3 : 3);
      for (const g of [graniteT, graniteB]) addBox(g, x - 0.55, y0, z - 0.55, x + 0.55, y0 + (g === graniteT ? 7.5 : 12), z + 0.55, [0.85, 0.8, 0.78]);
    }
    for (let i = 0; i < 6; i++) {
      const x = r.x0 + 9, z = r.z0 + 10 + i * 5;
      for (const g of [graniteT, graniteB]) addBox(g, x - 0.55, y0, z - 0.55, x + 0.55, y0 + (g === graniteT ? 7.5 : 12), z + 0.55, [0.85, 0.8, 0.78]);
    }
  }
  // Sphinx temple
  {
    const r = COMPLEX.sphinxTemple, y0 = -40.6;
    temple(r, y0, 8, 4.5, wallsB, wallsT, 4, 'w', 0.0);
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, px = cx + Math.cos(a) * 12, pz = cz + Math.sin(a) * 9;
      addBox(graniteB, px - 0.5, y0, pz - 0.5, px + 0.5, y0 + 7.5, pz + 0.5, [0.85, 0.8, 0.78]);
      addBox(graniteT, px - 0.5, y0, pz - 0.5, px + 0.5, y0 + 0.6 + rnd() * 1.2, pz + 0.5, [0.85, 0.8, 0.78]);
    }
  }
  // Khentkaus I: two-stepped tomb, lower part rock-cut
  {
    const r = COMPLEX.khentkausTomb, y0 = H((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2) - 0.5;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const g = new GeoBuilder(), g2 = new GeoBuilder();
    battered(g, cx, y0, cz, 45, 45, 10, 0.06, [0.95, 0.9, 0.84]);
    battered(g2, cx - 3, y0 + 10, cz, 28, 28, 7, 0.12, [0.95, 0.92, 0.88]);
    add(g, M.rock, both);
    add(g2, M.stone, today); add(g2.count ? cloneBuilder(g2) : g2, M.plaster, built);
    const o = { x0: cx - 23, x1: cx + 23, z0: cz - 23, z1: cz + 23 };
    obstacles.today.push(o); obstacles.built.push(o);
  }
  // Menkaure valley temple (mudbrick)
  temple(COMPLEX.menkaureValleyTemple, terrain.pads.find((p) => p.x0 < 60 && p.x1 > 90 && p.z0 < 790)?.y ?? H(75, 790), 7, 0.8, mudB, mudT, 3, 'e', 0.3);
  add(wallsT, M.big, today); add(wallsB, M.plaster, built);
  add(graniteT, M.granite, today); add(graniteB, M.granite, built);
  add(mudT, M.mud, today); add(mudB, M.mud, built);

  // ---------------------------------------------------------- causeways ---
  {
    const gT = new GeoBuilder(), gB = new GeoBuilder();
    for (const c of terrain.causeways) {
      const isKhafre = c.pts === COMPLEX.khafreCauseway, isKhufu = c.pts === COMPLEX.khufuCauseway;
      const step = 6;
      const n = Math.ceil(c.len / step);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = pointAt(c, t0), p1 = pointAt(c, t1);
        const y0 = causewayY(c, t0), y1 = causewayY(c, t1);
        const dx = p1[0] - p0[0], dz = p1[1] - p0[1], L = Math.hypot(dx, dz);
        const nx = -dz / L, nz = dx / L;
        const W = isKhafre ? 4.6 : 4.0, wt = 1.6, h = 5.5;
        // built: two walls and a roof, leaving a corridor
        for (const s of [-1, 1]) {
          const o0 = W / 2 * s, o1 = (W / 2 + wt) * s;
          slab(gB, p0, p1, nx, nz, o0, o1, y0 - 0.6, y1 - 0.6, h, [0.95, 0.94, 0.9]);
        }
        slab(gB, p0, p1, nx, nz, -(W / 2 + wt), W / 2 + wt, y0 + h - 0.6, y1 + h - 0.6, 0.7, [0.95, 0.94, 0.9]);
        // today: bed and broken wall stubs
        const keep = isKhafre ? 0.75 : isKhufu ? (t0 < 0.22 ? 0.6 : 0) : 0.25;
        if (rnd() < keep) {
          slab(gT, p0, p1, nx, nz, -(W / 2 + wt), W / 2 + wt, y0 - 0.6, y1 - 0.6, 0.75, [0.9, 0.88, 0.84]);
          for (const s of [-1, 1]) if (rnd() < 0.5) slab(gT, p0, p1, nx, nz, W / 2 * s, (W / 2 + wt) * s, y0, y1, 0.4 + rnd() * 1.4, [0.92, 0.9, 0.86]);
        }
      }
    }
    add(gT, M.stone, today); add(gB, M.plaster, built);
  }

  // ---------------------------------------------------------- boat pits ---
  {
    const g = new GeoBuilder(), gc = new GeoBuilder();
    for (const p of COMPLEX.boatPits) {
      const a = (p.angle * Math.PI) / 180;
      const ux = Math.cos(a), uz = Math.sin(a);           // along the length
      const vx = -uz, vz = ux;
      const hl = p.len / 2, hw = p.w / 2, depth = p.id.startsWith('pit') && p.len > 40 ? 7 : 5.5;
      const corner = (s, t) => [p.cx + ux * s * hl + vx * t * hw, p.cz + uz * s * hl + vz * t * hw];
      const C = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      const yb = H(p.cx, p.cz) - depth;
      for (let i = 0; i < 4; i++) {
        const [ax, az] = C[i], [bx, bz] = C[(i + 1) % 4];
        const steps = 6;
        for (let k = 0; k < steps; k++) {
          const f0 = k / steps, f1 = (k + 1) / steps;
          const x0 = lerp(ax, bx, f0), z0 = lerp(az, bz, f0), x1 = lerp(ax, bx, f1), z1 = lerp(az, bz, f1);
          g.poly([[x0, yb, z0], [x1, yb, z1], [x1, H(x1, z1) + 0.05, z1], [x0, H(x0, z0) + 0.05, z0]], null, [0.85, 0.8, 0.74]);
        }
      }
      // inward facing: fix orientation by pointing normals to the pit centre
      g.poly(C.map(([x, z]) => [x, yb, z]), [0, 1, 0], [0.7, 0.66, 0.6]);
      holes.push({ cx: p.cx, cz: p.cz, hx: hl, hz: hw, ang: a });
      obstacles.today.push({ x0: p.cx - Math.abs(ux * hl) - Math.abs(vx * hw), x1: p.cx + Math.abs(ux * hl) + Math.abs(vx * hw), z0: p.cz - Math.abs(uz * hl) - Math.abs(vz * hw), z1: p.cz + Math.abs(uz * hl) + Math.abs(vz * hw) });
      // as built: sealed with limestone slabs
      const yt = Math.max(...C.map(([x, z]) => H(x, z))) + 0.35;
      const n = Math.round(p.len / 1.0);
      for (let k = 0; k < n; k++) {
        const s0 = -hl + (k / n) * p.len, s1 = -hl + ((k + 1) / n) * p.len - 0.04;
        const q = (s, t) => [p.cx + ux * s + vx * t * (hw + 0.6), p.cz + uz * s + vz * t * (hw + 0.6)];
        const P4 = [q(s0, -1), q(s1, -1), q(s1, 1), q(s0, 1)].map(([x, z]) => [x, yt, z]);
        gc.poly(P4, [0, 1, 0], [0.98, 0.96, 0.9]);
      }
    }
    // pit walls must face inwards: build with double side via material clone
    const mat = Mats.rock({ tile: 5 }); mat.side = THREE.DoubleSide;
    add(g, mat, both, false);
    add(gc, M.plaster, built);
    // Hetepheres shaft
    const hs = COMPLEX.hetepheresShaft;
    holes.push({ cx: hs.x, cz: hs.z, hx: 0.9, hz: 0.9, ang: 0 });
    const gh = new GeoBuilder();
    const yb2 = H(hs.x, hs.z) - 6;
    for (const [ax, az, bx, bz] of [[-0.9, -0.9, 0.9, -0.9], [0.9, -0.9, 0.9, 0.9], [0.9, 0.9, -0.9, 0.9], [-0.9, 0.9, -0.9, -0.9]]) {
      gh.poly([[hs.x + ax, yb2, hs.z + az], [hs.x + bx, yb2, hs.z + bz], [hs.x + bx, H(hs.x, hs.z) + 0.05, hs.z + bz], [hs.x + ax, H(hs.x, hs.z) + 0.05, hs.z + az]], null, [0.6, 0.56, 0.5]);
    }
    gh.poly([[hs.x - 0.9, yb2, hs.z - 0.9], [hs.x + 0.9, yb2, hs.z - 0.9], [hs.x + 0.9, yb2, hs.z + 0.9], [hs.x - 0.9, yb2, hs.z + 0.9]], [0, 1, 0], [0.3, 0.28, 0.25]);
    add(gh, mat, both, false);
  }

  // ------------------------------------------------- Sphinx enclosure -----
  {
    const E = SPHINX.enclosure;
    const g = new GeoBuilder();
    const floor = SPHINX.baseY - 0.2;
    const seg = (x0, z0, x1, z1, nx, nz) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 2.5);
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n;
        const ax = lerp(x0, x1, f0), az = lerp(z0, z1, f0), bx = lerp(x0, x1, f1), bz = lerp(z0, z1, f1);
        const ja = (fbm2(ax * 0.2, az * 0.2, 3, 8) - 0.5) * 1.6, jb = (fbm2(bx * 0.2, bz * 0.2, 3, 8) - 0.5) * 1.6;
        const ta = H(ax - nx * 3, az - nz * 3) + 0.1, tb = H(bx - nx * 3, bz - nz * 3) + 0.1;
        // three bands with different set-backs: erosion of the softer layers
        const bands = [[floor, floor + 2.5, 0.0], [floor + 2.5, floor + 5.5, 0.8], [floor + 5.5, 99, 0.25]];
        for (const [b0, b1, inset] of bands) {
          const ya0 = b0, ya1 = Math.min(b1, ta), yb0 = b0, yb1 = Math.min(b1, tb);
          if (ya1 <= ya0 && yb1 <= yb0) continue;
          const oa = -(inset + ja) , ob = -(inset + jb);
          g.poly([[ax + nx * oa, ya0, az + nz * oa], [bx + nx * ob, yb0, bz + nz * ob], [bx + nx * ob, Math.max(yb0, yb1), bz + nz * ob], [ax + nx * oa, Math.max(ya0, ya1), az + nz * oa]], [nx, 0, nz], [0.95, 0.9, 0.84]);
        }
      }
    };
    seg(E.x0, E.z0, E.x1 - 4, E.z0, 0, 1);       // north wall faces south
    seg(E.x0, E.z1, E.x0, E.z0, 1, 0);           // west wall faces east
    seg(E.x1 - 4, E.z1, E.x0, E.z1, 0, -1);      // south wall faces north
    const m = new THREE.Mesh(g.build(), M.rock);
    m.material.side = THREE.DoubleSide;
    m.receiveShadow = true; m.castShadow = true;
    both.add(m);
  }

  // ------------------------------------------------- Wall of the Crow -----
  {
    const w = COMPLEX.wallOfTheCrow, g = new GeoBuilder();
    const n = 20, L = w.x1 - w.x0;
    for (let i = 0; i < n; i++) {
      const x0 = w.x0 + (i / n) * L, x1 = w.x0 + ((i + 1) / n) * L;
      const xm = (x0 + x1) / 2;
      const y0 = H(xm, w.z) - 1;
      if (Math.abs(xm - (w.x0 + L / 2)) < 4) {
        addBox(g, x0, y0 + 7, w.z - w.thick / 2, x1, y0 + w.height, w.z + w.thick / 2, [0.95, 0.92, 0.86]);   // gate lintel
        continue;
      }
      battered(g, xm, y0, w.z, x1 - x0 + 0.02, w.thick, w.height * (0.85 + rnd() * 0.15), 0.12, [0.95, 0.92, 0.86]);
      const o = { x0, x1, z0: w.z - w.thick / 2, z1: w.z + w.thick / 2 };
      obstacles.today.push(o); obstacles.built.push(o);
    }
    add(g, M.stone, both);
  }
  // workers' town foundations (today: low excavated walls; built: mudbrick galleries)
  {
    const r = COMPLEX.workersTown, gT = new GeoBuilder(), gB = new GeoBuilder();
    // the excavated galleries lie in a block south of the wall; today they are mostly reburied
    for (let x = r.x0 + 40; x < r.x0 + 160; x += 7) {
      for (let z = r.z0 + 10; z < r.z0 + 90; z += 40) {
        const y0 = H(x + 3, z + 15) - 0.3;
        addBox(gB, x, y0, z, x + 0.9, y0 + 3.2, z + 34, [1.0, 0.95, 0.88]);
        addBox(gB, x, y0 + 3.2, z, x + 7, y0 + 3.45, z + 34, [1.05, 1.0, 0.92]);
        if (rnd() < 0.55) addBox(gT, x, y0, z, x + 0.7, y0 + 0.35 + rnd() * 0.3, z + 34, [1.05, 1.0, 0.92]);
      }
    }
    add(gT, M.mud, today); add(gB, M.mud, built);
  }

  // ------------------------------------------- modern city (today only) ---
  const city = buildCity(terrain, quality, rnd);
  today.add(city);
  // ------------------------------------- ancient flood plain (built only) ---
  const water = buildWater();
  built.add(water);

  return { today, built, both, obstacles, holes, city, water };
}

// battered (sloping-walled) block, centred at (cx, cz), base at y0
function battered(g, cx, y0, cz, lx, lz, h, bat, col) {
  const ix = Math.min(lx / 2 - 0.3, h * bat), iz = Math.min(lz / 2 - 0.3, h * bat);
  const b = [[cx - lx / 2, cz - lz / 2], [cx + lx / 2, cz - lz / 2], [cx + lx / 2, cz + lz / 2], [cx - lx / 2, cz + lz / 2]];
  const t = [[cx - lx / 2 + ix, cz - lz / 2 + iz], [cx + lx / 2 - ix, cz - lz / 2 + iz], [cx + lx / 2 - ix, cz + lz / 2 - iz], [cx - lx / 2 + ix, cz + lz / 2 - iz]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    g.poly([[b[i][0], y0, b[i][1]], [b[j][0], y0, b[j][1]], [t[j][0], y0 + h, t[j][1]], [t[i][0], y0 + h, t[i][1]]], null, col);
  }
  g.poly(t.map(([x, z]) => [x, y0 + h, z]), [0, 1, 0], [col[0] * 1.04, col[1] * 1.03, col[2] * 1.0]);
}

function slab(g, p0, p1, nx, nz, o0, o1, y0, y1, h, col) {
  const a0 = [p0[0] + nx * o0, p0[1] + nz * o0], a1 = [p1[0] + nx * o0, p1[1] + nz * o0];
  const b0 = [p0[0] + nx * o1, p0[1] + nz * o1], b1 = [p1[0] + nx * o1, p1[1] + nz * o1];
  const Q = (a, y) => [a[0], y, a[1]];
  g.poly([Q(a0, y0 + h), Q(a1, y1 + h), Q(b1, y1 + h), Q(b0, y0 + h)], [0, 1, 0], col);
  g.poly([Q(a0, y0), Q(a1, y1), Q(a1, y1 + h), Q(a0, y0 + h)], null, col);
  g.poly([Q(b0, y0), Q(b0, y0 + h), Q(b1, y1 + h), Q(b1, y1)], null, col);
  g.poly([Q(a0, y0), Q(a0, y0 + h), Q(b0, y0 + h), Q(b0, y0)], null, col);
  g.poly([Q(a1, y1), Q(b1, y1), Q(b1, y1 + h), Q(a1, y1 + h)], null, col);
}

function pointAt(c, t) {
  const s = t * c.len;
  for (const g of c.seg) {
    if (s <= g.s0 + g.l + 1e-6) {
      const u = (s - g.s0) / g.l;
      return [g.ax + (g.bx - g.ax) * u, g.az + (g.bz - g.az) * u];
    }
  }
  const g = c.seg[c.seg.length - 1];
  return [g.bx, g.bz];
}

function cloneBuilder(gb) { return gb; }

function buildCity(terrain, quality, rnd) {
  const grp = new THREE.Group(); grp.name = 'city';
  const k = quality === 'low' ? 0.3 : quality === 'medium' ? 0.6 : 1;
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec4 wq = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wq = instanceMatrix * wq;
          vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vWN = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vWP = (modelMatrix * wq).xyz;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 n = normalize(vWN);
          if (abs(n.y) < 0.5) {
            float hc = abs(n.x) > 0.5 ? vWP.z : vWP.x;
            float fy = fract(vWP.y / 3.05), fx = fract(hc / 3.3);
            float aw = fwidth(hc / 3.3) * 1.5, ay = fwidth(vWP.y / 3.05) * 1.5;
            float win = smoothstep(0.32 - ay, 0.32 + ay, fy) * (1.0 - smoothstep(0.78 - ay, 0.78 + ay, fy))
                      * smoothstep(0.22 - aw, 0.22 + aw, fx) * (1.0 - smoothstep(0.72 - aw, 0.72 + aw, fx));
            float fade = 1.0 - smoothstep(0.25, 0.6, max(aw, ay));
            diffuseColor.rgb *= mix(1.0, 0.32, win * fade);
            diffuseColor.rgb *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.07, fy)) * fade;
          } else {
            diffuseColor.rgb *= 1.08;
          }
        }`);
  };
  mat.customProgramCacheKey = () => 'city-facade';
  const cands = [];
  const cell = 13;
  for (let x = -2400; x < 2300; x += cell) {
    for (let z = -2100; z < 2800; z += cell) {
      const d = Math.hypot(x - 250, z - 250);
      if (d > 2500) continue;
      const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
      if (ix % 6 === 0 || iz % 5 === 0) continue;                // streets
      const zone = terrain.zoneAt(x, z);
      if (zone < 0.55) continue;
      cands.push([x, z, d]);
    }
  }
  const max = Math.round(16000 * k);
  const keep = Math.min(1, max / Math.max(1, cands.length));
  const im = new THREE.InstancedMesh(box, mat, Math.min(max, cands.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const palette = [[0.62, 0.42, 0.33], [0.66, 0.47, 0.37], [0.74, 0.69, 0.6], [0.8, 0.76, 0.68], [0.66, 0.65, 0.62], [0.84, 0.8, 0.72], [0.56, 0.44, 0.38]];
  let n = 0;
  for (const [x, z] of cands) {
    if (n >= im.count) break;
    if (rnd() > keep * 0.93) continue;
    const w = cell * (0.72 + rnd() * 0.22), l = cell * (0.72 + rnd() * 0.22);
    const floors = 2 + Math.floor(rnd() * rnd() * 9) + (rnd() < 0.25 ? 2 : 0);
    const h = floors * 3.05 + 0.6;
    const y = terrain.heightAt(x, z, false) - 0.4;
    p.set(x + (rnd() - 0.5) * 2, y, z + (rnd() - 0.5) * 2); s.set(w, h, l);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.08);
    m4.compose(p, q, s); im.setMatrixAt(n, m4);
    const c = palette[Math.floor(rnd() * palette.length)];
    const v = 0.85 + rnd() * 0.25;
    col.setRGB(c[0] * v, c[1] * v, c[2] * v); im.setColorAt(n, col);
    n++;
  }
  im.count = n;
  im.castShadow = true; im.receiveShadow = true;
  im.computeBoundingSphere();
  grp.add(im);
  // Grand Egyptian Museum: a vast wedge of translucent stone
  const g = new GeoBuilder();
  const gx = COMPLEX.gem.x, gz = COMPLEX.gem.z, y0 = terrain.heightAt(gx, gz, false) - 1;
  const L = 420, W = 260, Ht = 45;
  const P = (x, y, z) => [gx + x, y0 + y, gz + z];
  g.poly([P(-L / 2, 0, W / 2), P(L / 2, 0, W / 2), P(L / 2, Ht, -W / 2 + 40), P(-L / 2, Ht, -W / 2 + 40)], null, [0.92, 0.88, 0.8]);
  g.poly([P(-L / 2, 0, -W / 2), P(-L / 2, Ht, -W / 2 + 40), P(L / 2, Ht, -W / 2 + 40), P(L / 2, 0, -W / 2)], null, [0.85, 0.82, 0.76]);
  g.poly([P(-L / 2, 0, -W / 2), P(-L / 2, 0, W / 2), P(-L / 2, Ht, -W / 2 + 40)], null, [0.8, 0.77, 0.7]);
  g.poly([P(L / 2, 0, -W / 2), P(L / 2, Ht, -W / 2 + 40), P(L / 2, 0, W / 2)], null, [0.8, 0.77, 0.7]);
  const gem = new THREE.Mesh(g.build(), Mats.plaster());
  gem.castShadow = gem.receiveShadow = true;
  grp.add(gem);
  return grp;
}

function buildWater() {
  // inundation water over the valley floor, reaching the valley temples
  const geo = new THREE.PlaneGeometry(30000, 30000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d5a5e, roughness: 0.18, metalness: 0.0, transparent: true, opacity: 0.92 });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -41.4;
  m.receiveShadow = true;
  m.name = 'inundation';
  return m;
}

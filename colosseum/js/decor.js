// What dressed the building, c. 90 CE: statues in the arches of the two
// middle storeys, bronze shields on the attic, the 240 masts on the attic's
// consoles and the awning (velarium) the sailors of the fleet rigged from
// them, and the colonnade round the top of the seating. Also, in both eras,
// the numbers carved over the ground-floor arches (I–LXXVI; today XXIII–LIV
// survive).
import * as THREE from 'three';
import { PLAN, STOREYS, RINGS } from './data/site.js';
import { BAY, alphaAt, ovalPoint, ovalNormal } from './plan.js';
import { sweep } from './geom.js';
import { bayNumber } from './data/site.js';
import { Human, figureGeometry, figMat } from './figures.js';

const NB = PLAN.bays;

export function buildDecor(ctx) {
  const { B, built, S, surv } = ctx;
  const objects = [];
  const at = (s, y, d) => { const al = alphaAt(s); const [u, v] = ovalPoint(al, d); return { u, v, n: ovalNormal(al), al }; };
  const facing = (n) => Math.atan2(n[0], n[1]);          // heading that faces outwards
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);

  // ------------------------------------------- numbers over the arches
  {
    const cv = document.createElement('canvas');
    cv.width = 2048; cv.height = 1024;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(52, 42, 32, 0.92)';
    g.font = '600 76px Georgia, "Times New Roman", serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const roman = (n) => [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].reduce((acc, [v, r]) => { while (n >= v) { acc += r; n -= v; } return acc; }, '');
    const cell = (n) => [(n - 1) % 8, Math.floor((n - 1) / 8)];
    for (let n = 1; n <= 76; n++) { const [cx, cy] = cell(n); g.fillText(roman(n), cx * 256 + 128, cy * 102 + 52); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const pos = [], uv = [];
    for (let k = 0; k < NB; k++) {
      const n = bayNumber(k);
      if (!n || !surv(k, 'facade')) continue;
      const [cx, cy] = cell(n);
      const u0 = cx / 8, u1 = (cx + 1) / 8, v0 = 1 - (cy * 102 + 102) / 1024, v1 = 1 - (cy * 102) / 1024;
      const sc = S(k);
      const p = (ds, y) => { const a = at(sc + ds, y, -0.02); return [a.u + a.n[0] * 0.02, y, a.v + a.n[1] * 0.02]; };
      const y0 = 7.45, y1 = 7.95, w = 0.62;
      const A = p(w, y0), Bq = p(-w, y0), C = p(-w, y1), D = p(w, y1);
      pos.push(...A, ...Bq, ...C, ...A, ...C, ...D);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
    if (pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.25, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const m = new THREE.Mesh(geo, mat);
      m.name = 'arch-numbers'; m.userData.noClip = true;
      objects.push(m);
    }
  }

  if (!built) return { objects };

  // --------------------------------------- statues in the middle storeys
  {
    const fig = new Human('statue', { material: figMat(0xece6da, { rough: 0.55 }), low: true });
    fig.R.sh.rotation.set(-0.3, 0, 0.2); fig.R.el.rotation.x = -0.9;
    fig.L.hip.rotation.x = 0.12; fig.L.kn.rotation.x = 0.25;
    const geo = figureGeometry(fig);
    geo.scale(1.18, 1.18, 1.18);
    const n = NB * 2;
    const im = new THREE.InstancedMesh(geo, figMat(0xece6da, { rough: 0.55 }), n);
    let i = 0;
    for (const st of [1, 2]) {
      const yb = STOREYS[st].y0 + 2.25;
      for (let k = 0; k < NB; k++) {
        const a = at(S(k), yb, 1.1);
        q.setFromAxisAngle(Y, facing(a.n));
        m4.compose(new THREE.Vector3(a.u, yb + 0.02, a.v), q, new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(i++, m4);
      }
    }
    im.castShadow = true; im.name = 'statues';
    objects.push(im);
  }

  // ------------------------------------------------- shields on the attic
  {
    const geo = new THREE.CylinderGeometry(0.72, 0.72, 0.08, 20);
    geo.rotateX(Math.PI / 2);
    const boss = new THREE.SphereGeometry(0.16, 10, 8); boss.translate(0, 0, 0.06);
    const im = new THREE.InstancedMesh(geo, figMat(0xb98c4c, { metal: 0.85, rough: 0.35 }), NB / 2);
    const imB = new THREE.InstancedMesh(boss, figMat(0xb98c4c, { metal: 0.85, rough: 0.35 }), NB / 2);
    let i = 0;
    for (let k = 0; k < NB; k += 2) {
      const y = 38.7, a = at(S(k), y, -0.06);
      q.setFromAxisAngle(Y, facing(a.n));
      m4.compose(new THREE.Vector3(a.u, y, a.v), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m4); imB.setMatrixAt(i, m4); i++;
    }
    im.castShadow = true; im.name = 'shields'; imB.name = 'shield-bosses';
    objects.push(im, imB);
  }

  // ------------------------------- the masts and the awning (velarium)
  const mastTop = 53.4, mastD = -0.36;
  {
    const geo = new THREE.CylinderGeometry(0.13, 0.17, mastTop - 44.9, 8);
    geo.translate(0, (mastTop + 44.9) / 2, 0);
    const im = new THREE.InstancedMesh(geo, figMat(0x8a6a48), NB * 3);
    let i = 0;
    for (let k = 0; k < NB; k++) for (const f of [-0.28, 0, 0.28]) {
      const a = at(S(k, f), 0, mastD);
      m4.makeTranslation(a.u, 0, a.v);
      im.setMatrixAt(i++, m4);
    }
    im.castShadow = true; im.name = 'masts';
    objects.push(im);
  }
  {
    // canvas stripes for the linen
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 16;
    const g = cv.getContext('2d');
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, 256, 16);
    g.fillStyle = '#d9cbb0'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 14, 16);
    g.fillStyle = '#b7493a'; g.fillRect(250, 0, 6, 16);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const pos = [], uv = [], idx = [];
    const dIn = 31, yIn = 44.2, nd = 8, ns = 4;
    for (let k = 0; k < NB; k++) {
      const base = pos.length / 3;
      for (let i = 0; i <= nd; i++) {
        const t = i / nd, d = mastD + (dIn - mastD) * t;
        for (let j = 0; j <= ns; j++) {
          const f = j / ns, s = S(k, f - 0.5);
          const a = at(s, 0, d);
          // straight between mast top and the inner ring, sagging between the ropes
          const y = mastTop - 0.4 + (yIn - mastTop + 0.4) * t - 0.9 * Math.sin(Math.PI * f) * Math.sin(Math.PI * Math.min(1, t * 1.4)) - 0.5 * Math.sin(Math.PI * t);
          pos.push(a.u, y, a.v);
          uv.push(f, t * 4);
        }
      }
      for (let i = 0; i < nd; i++) for (let j = 0; j < ns; j++) {
        const a = base + i * (ns + 1) + j, b2 = a + ns + 1;
        idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.95 });
    const vel = new THREE.Mesh(geo, mat);
    vel.name = 'velarium'; vel.castShadow = true; vel.receiveShadow = true;
    vel.userData.toggle = 'awning';
    objects.push(vel);
    // the ropes from the masts to the inner ring, one per bay
    const rp = [];
    for (let k = 0; k < NB; k++) {
      const a0 = at(S(k, -0.5), 0, mastD), a1 = at(S(k, -0.5), 0, dIn + 3);
      rp.push(a0.u, mastTop - 0.2, a0.v, a1.u, yIn - 0.8, a1.v);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    const ropes = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x6e5a40 }));
    ropes.userData.toggle = 'awning';
    objects.push(ropes);
  }

  // ---------------------------- the colonnade round the top of the seating
  {
    const y0 = 36.0, y1 = 44.0, dC = 8.2;
    const geo = new THREE.CylinderGeometry(0.26, 0.3, y1 - y0, 10);
    geo.translate(0, (y0 + y1) / 2, 0);
    const im = new THREE.InstancedMesh(geo, figMat(0xd9d4c8, { rough: 0.5 }), NB * 2);
    let i = 0;
    for (let k = 0; k < NB; k++) for (const f of [-0.5, 0]) {
      const a = at(S(k, f), 0, dC);
      m4.makeTranslation(a.u, 0, a.v);
      im.setMatrixAt(i++, m4);
    }
    im.castShadow = true; im.name = 'colonnade';
    objects.push(im);
    for (let k = 0; k < NB; k++) {
      const sa = S(k, -0.5), sb = S(k, 0.5);
      // architrave over the columns, the floor of the gallery, a lean-to roof of tiles
      sweep(B.marble, [[dC - 0.45, y1], [dC + 0.45, y1], [dC + 0.45, y1 + 0.75], [dC - 0.45, y1 + 0.75]], sa, sb, { col: [0.95, 0.94, 0.9], closed: true, segs: 2, inside: 'poly' });
      sweep(B.trav, [[RINGS.ring2[1], y0], [dC + 0.6, y0], [dC + 0.6, y0 - 0.5], [RINGS.ring2[1], y0 - 0.5]], sa, sb, { col: [0.92, 0.9, 0.86], closed: true, segs: 2, inside: 'poly' });
      sweep(B.plaster, [[RINGS.facade[1], 46.9], [dC + 0.8, y1 + 0.75], [dC + 0.8, y1 + 0.5], [RINGS.facade[1], 46.6]], sa, sb, { col: [0.62, 0.3, 0.22], closed: true, segs: 3, inside: 'poly' });
    }
  }
  return { objects };
}

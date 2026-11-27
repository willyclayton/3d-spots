// Interior of the Great Pyramid (Khufu).  Pyramid-local metres:
// x east of the centre line, y above the base, z south of the centre.
// Dimensions after Petrie (1883), Maragioglio & Rinaldi, and the
// ScanPyramids results (2017, 2023).  The passage system lies in a N–S plane
// 7.29 m east of the centre line.
import { nsPassage, ewPassage, room, prism } from './build.js';

const RAD = Math.PI / 180;

export function khufuInterior(info) {
  const X = 7.29, W = 1.05;
  const ed = info.ents.find((e) => e.id === 'desc');
  const er = info.ents.find((e) => e.id === 'robbers');
  const tanA = info.tanA;
  const tD = Math.tan(26.523 * RAD), hvD = 1.2 / Math.cos(26.523 * RAD);
  const zE = -ed.aCasing, yE = ed.yCasing;
  const yD = (z) => yE - (z - zE) * tD;
  const zB = -ed.aBack;
  const zRock = zE + yE / tD;
  const zDend = zE + 105.3 * Math.cos(26.523 * RAD);
  const yDend = yD(zDend);
  const els = [];

  // ---- descending passage ------------------------------------------------
  {
    // outer part through the casing (as built only): mouth lies in the casing slope
    const d = hvD / (tanA + tD);
    els.push(prism('D0', 'x', X - W / 2, X + W / 2,
      [[zE + d, yE + d * tanA], [zE, yE], [zB, yD(zB)], [zB, yD(zB) + hvD]],
      { era: 'built', mat: 'lime', walk: true, omit: [0] }));
  }
  els.push(nsPassage('D1', { x: X, w: W, z0: zB, y0: yD(zB), z1: zRock, y1: 0, h: 1.2, mat: 'lime', walk: true, omit: [3] }));
  els.push(nsPassage('D2', { x: X, w: W, z0: zRock, y0: 0, z1: zDend, y1: yDend, h: 1.2, mat: 'rock', walk: true }));
  els.push(nsPassage('H1', { x: X, w: 0.81, z0: zDend, y0: yDend, z1: 1.3, y1: yDend, h: 0.91, vertical: true, mat: 'rock', walk: true }));
  els.push(room('SC', { x0: -5.6, x1: 8.4, y0: yDend, y1: yDend + 3.5, z0: 1.3, z1: 9.6, mat: 'rough', walk: true }));
  els.push(room('SCpit', { x0: 3.0, x1: 4.8, y0: yDend - 3.3, y1: yDend, z0: 4.5, z1: 6.3, mat: 'rough' }));
  els.push(nsPassage('SCde', { x: 4.0, w: 0.75, z0: 9.6, y0: yDend + 0.25, z1: 26.0, y1: yDend + 0.25, h: 0.75, vertical: true, mat: 'rough' }));

  // ---- ascending passage --------------------------------------------------
  const tA = Math.tan(26.03 * RAD), hvA = 1.2 / Math.cos(26.03 * RAD);
  const zGN = -41.9, yGN = 21.7;               // bottom (north end) of the Grand Gallery
  const yAf = (z) => yGN + (z - zGN) * tA;
  const zA = (yE + zE * tD + hvD - yGN + zGN * tA) / (tA + tD);
  const zA2 = zA - hvA / (tA + tD);
  const zP = zA + 5.0 * Math.cos(26.03 * RAD);  // top of the granite plugs
  els.push(prism('A0', 'x', X - W / 2, X + W / 2,
    [[zA2, yAf(zA2) + hvA], [zA, yAf(zA)], [zP, yAf(zP)], [zP, yAf(zP) + hvA]], { mat: 'lime' }));
  els.push(nsPassage('A1', { x: X, w: W, z0: zP, y0: yAf(zP), z1: zGN, y1: yGN, h: 1.2, mat: 'lime', walk: true }));

  // ---- al-Ma'mun's robbers' tunnel (c. 820 CE) ----------------------------
  const zR = -er.aBack, yR = er.yFloorBack;
  els.push(nsPassage('R1', { x: er.u, w: 2.3, z0: zR, y0: yR, z1: -69.6, y1: yR + 0.3, h: 2.4, vertical: true, mat: 'rough', walk: true, era: 'today', omit: [3] }));
  els.push(ewPassage('R2', { z: -70.6, w: 2.0, x0: er.u + 1.15, y0: yR + 0.3, x1: X - W / 2, y1: yAf(-70.6) + 0.05, h: 2.1, vertical: true, mat: 'rough', walk: true, era: 'today' }));

  // ---- Grand Gallery (corbelled, 7 overlaps) ------------------------------
  const zGS = 0;                                 // foot of the Great Step
  const tG = (42.1 - yGN) / (zGS - zGN);
  const yG = (z) => yGN + (z - zGN) * tG;
  const layers = [{ w: 1.05, b: 0, t: 0.62 }, { w: 2.09, b: 0.62, t: 2.9 }];
  for (let k = 1; k <= 7; k++) layers.push({ w: 2.09 - 0.152 * k, b: 2.9 + 0.83 * (k - 1), t: 2.9 + 0.83 * k });
  const zSplit = zGN + 2.4;
  layers.forEach((L, k) => {
    const prof = (za, zb) => [[za, yG(za) + L.b], [zb, yG(zb) + L.b], [zb, yG(zb) + L.t], [za, yG(za) + L.t]];
    if (k === 0) {
      els.push(prism('G0a', 'x', X - L.w / 2, X + L.w / 2, prof(zGN, zSplit), { mat: 'lime', walk: true, omit: [0] }));
      els.push(prism('G0b', 'x', X - L.w / 2, X + L.w / 2, prof(zSplit, zGS), { mat: 'lime', walk: true }));
    } else {
      els.push(prism('G' + k, 'x', X - L.w / 2, X + L.w / 2, prof(zGN, zGS), { mat: 'lime', walk: k === 1, floorOffset: k === 1 ? 0 : 0 }));
    }
  });
  const yGtop = yG(zGS) + layers[layers.length - 1].t;

  // ---- horizontal passage and Queen's Chamber -----------------------------
  els.push(nsPassage('QP1a', { x: X, w: W, z0: zGN, y0: yGN, z1: zSplit, y1: yGN, h: 1.17, vertical: true, mat: 'lime', walk: true, omit: [2] }));
  els.push(nsPassage('QP1b', { x: X, w: W, z0: zSplit, y0: yGN, z1: -8.12, y1: yGN, h: 1.17, vertical: true, mat: 'lime', walk: true }));
  els.push(nsPassage('QP2', { x: X, w: W, z0: -8.12, y0: 21.2, z1: -2.62, y1: 21.2, h: 1.67, vertical: true, mat: 'lime', walk: true }));
  els.push(room('Q', { x0: 2.07, x1: 7.82, y0: 21.2, y1: 25.87, z0: -2.62, z1: 2.62, gable: 'x', rise: 1.56, mat: 'lime', walk: true }));
  [[0.785, 21.2, 22.9], [0.61, 22.9, 23.73], [0.44, 23.73, 24.56], [0.27, 24.56, 25.9]].forEach(([hw, y0, y1], k) => {
    els.push(room('QN' + k, { x0: 7.82, x1: 8.86, y0, y1, z0: 0.6 - hw, z1: 0.6 + hw, mat: 'lime', walk: k === 0 }));
  });
  // Queen's Chamber shafts (blocked by small stone "doors")
  {
    const y = 22.55, qx = 4.94;
    els.push(nsPassage('QSn1', { x: qx, w: 0.21, z0: -4.62, y0: y, z1: -2.62, y1: y, h: 0.21, vertical: true, mat: 'lime', noSection: false }));
    const Ln = 60, an = 39.1 * RAD;
    els.push(nsPassage('QSn2', { x: qx, w: 0.21, z0: -4.62 - Ln * Math.cos(an), y0: y + Ln * Math.sin(an), z1: -4.62, y1: y, h: 0.21, mat: 'lime' }));
    els.push(nsPassage('QSs1', { x: qx, w: 0.21, z0: 2.62, y0: y, z1: 4.62, y1: y, h: 0.21, vertical: true, mat: 'lime' }));
    const Ls = 60, as = 39.6 * RAD;
    els.push(nsPassage('QSs2', { x: qx, w: 0.21, z0: 4.62, y0: y, z1: 4.62 + Ls * Math.cos(as), y1: y + Ls * Math.sin(as), h: 0.21, mat: 'lime' }));
  }

  // ---- service ("well") shaft and grotto ---------------------------------
  els.push(prism('WS1', 'x', 6.25, 6.76, [[-41.6, 4.0], [-40.9, 4.0], [-40.9, yG(-40.9) + 0.62], [-41.6, yG(-41.6) + 0.62]], { mat: 'rough' }));
  els.push(prism('WS2', 'x', 6.1, X - W / 2, [[-41.6, 4.0], [-40.9, 4.0], [-31.0, yD(-31.0)], [-31.7, yD(-31.7)]], { mat: 'rough' }));
  els.push(room('WSg', { x0: 4.6, x1: 6.1, y0: 3.6, y1: 6.0, z0: -42.6, z1: -40.4, mat: 'rough' }));

  // ---- Great Step, antechamber, King's Chamber ----------------------------
  const yK = 43.0;
  els.push(room('GS', { x0: X - 1.045, x1: X + 1.045, y0: yK, y1: 50.0, z0: zGS, z1: 1.56, mat: 'lime', walk: true }));
  els.push(nsPassage('P1', { x: X, w: W, z0: 1.56, y0: yK, z1: 2.86, y1: yK, h: 1.12, vertical: true, mat: 'lime', walk: true }));
  els.push(room('AC', { x0: X - 0.58, x1: X + 0.58, y0: yK, y1: yK + 3.8, z0: 2.86, z1: 5.84, mat: 'granite', walk: true }));
  els.push(nsPassage('P2', { x: X, w: W, z0: 5.84, y0: yK, z1: 8.38, y1: yK, h: 1.11, vertical: true, mat: 'granite', walk: true }));
  const KX0 = -1.97, KX1 = 8.5;
  els.push(room('K', { x0: KX0, x1: KX1, y0: yK, y1: yK + 5.84, z0: 8.38, z1: 13.62, mat: 'granite', walk: true }));
  // King's Chamber "air shafts"
  {
    const y = yK + 0.9, sx = 2.6;
    els.push(nsPassage('KSn1', { x: sx, w: 0.21, z0: 6.38, y0: y, z1: 8.38, y1: y, h: 0.2, vertical: true, mat: 'granite' }));
    const zn = -51.56;
    els.push(nsPassage('KSn2', { x: sx, w: 0.21, z0: zn, y0: y + (6.38 - zn) * Math.tan(32.6 * RAD), z1: 6.38, y1: y, h: 0.2, mat: 'lime' }));
    els.push(nsPassage('KSs1', { x: sx, w: 0.21, z0: 13.62, y0: y, z1: 15.62, y1: y, h: 0.2, vertical: true, mat: 'granite' }));
    const zs = 52.05;
    els.push(nsPassage('KSs2', { x: sx, w: 0.21, z0: 15.62, y0: y, z1: zs, y1: y + (zs - 15.62), h: 0.2, mat: 'lime' }));
  }
  // relieving ("construction") chambers above the King's Chamber
  const rc = [['RC1', 50.4, 51.3], ['RC2', 52.9, 53.9], ['RC3', 55.4, 56.4], ['RC4', 57.9, 58.9], ['RC5', 60.4, 61.6]];
  rc.forEach(([id, y0, y1], k) => {
    els.push(room(id, { x0: KX0 - 0.1, x1: KX1 + 0.1, y0, y1, z0: 8.38, z1: 13.62, mat: k === 4 ? 'lime' : 'granite', gable: k === 4 ? 'x' : null, rise: 2.0 }));
  });
  els.push(nsPassage('DT', { x: X, w: 0.66, z0: zGS, y0: 50.05, z1: 8.38, y1: 50.45, h: 0.72, vertical: true, mat: 'lime' }));

  // ---- ScanPyramids North Face Corridor (confirmed 2023) ------------------
  els.push(room('NFC', { x0: X - 1.05, x1: X + 1.05, y0: 24.4, y1: 25.6, z0: -92.0, z1: -83.0, gable: 'z', rise: 0.9, mat: 'lime' }));

  // ---- detected but unexplored: the Big Void (2017) ------------------------
  const voids = [{
    id: 'bigvoid', x0: X - 1.1, x1: X + 1.1,
    profile: [[-34, yG(-34) + yGtop - yG(zGS) + 10.5], [-5, yG(-5) + yGtop - yG(zGS) + 10.5], [-5, yG(-5) + yGtop - yG(zGS) + 17.5], [-34, yG(-34) + yGtop - yG(zGS) + 17.5]],
  }];

  // ---- reference points for props, labels and lighting --------------------
  const ref = {
    X, W, zE, yE, zB, yD, zRock, zDend, yDend, zA, zA2, zP, yAf, zGN, yGN, yG, zGS, yGtop, yK, KX0, KX1, zR, yR, er, tA, tG, hvA, hvD,
  };
  return { elements: els, voids, ref };
}

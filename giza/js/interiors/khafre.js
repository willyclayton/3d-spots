// Interior of the Pyramid of Khafre.  Two entrances on the north side: the
// upper one in the face (11.5 m up), the lower one cut into the pavement in
// front of the pyramid.  Both lead to Belzoni's burial chamber, cut into the
// bedrock with a gabled limestone roof.  Layout after Maragioglio & Rinaldi;
// dimensions approximate.
import { nsPassage, ewPassage, room, prism } from './build.js';

const RAD = Math.PI / 180;

export function khafreInterior(info) {
  const X = 6.0, W = 1.05;
  const e = info.ents.find((q) => q.id === 'upper');
  const tanA = info.tanA;
  const tU = Math.tan(25.92 * RAD), hvU = 1.2 / Math.cos(25.92 * RAD);
  const zE = -e.aCasing, yE = e.yCasing;
  const yU = (z) => yE - (z - zE) * tU;
  const zB = -e.aBack;
  const yF = -1.2;                         // floor of the upper horizontal passage and chamber
  const zRock = zE + yE / tU;
  const zUend = zE + (yE - yF) / tU;
  const els = [];
  {
    const d = hvU / (tanA + tU);
    els.push(prism('UD0', 'x', X - W / 2, X + W / 2, [[zE + d, yE + d * tanA], [zE, yE], [zB, yU(zB)], [zB, yU(zB) + hvU]], { era: 'built', mat: 'granite', walk: true, omit: [0] }));
  }
  els.push(nsPassage('UD1', { x: X, w: W, z0: zB, y0: yU(zB), z1: zRock, y1: 0, h: 1.2, mat: 'granite', walk: true, omit: [3] }));
  els.push(nsPassage('UD2', { x: X, w: W, z0: zRock, y0: 0, z1: zUend, y1: yF, h: 1.2, mat: 'rock', walk: true }));
  els.push(nsPassage('UH', { x: X, w: W, z0: zUend, y0: yF, z1: -2.5, y1: yF, h: 1.78, vertical: true, mat: 'rock', walk: true }));
  els.push(room('BC', { x0: -7.6, x1: 7.0, y0: yF, y1: 3.0, z0: -2.5, z1: 2.5, gable: 'x', rise: 2.63, mat: 'rock', walk: true }));

  // lower entrance: opens in the pavement 7.4 m north of the base
  const zL0 = -115.0, tL = Math.tan(21.67 * RAD), hvL = 1.2 / Math.cos(21.67 * RAD);
  const yLH = -12.6;
  const zL1 = zL0 + (0 - yLH) / tL;
  const zC0 = zL0 + hvL / tL;               // where the roof meets the ground
  els.push(prism('LD', 'x', X - W / 2, X + W / 2, [[zL0, 0], [zL1, yLH], [zL1, yLH + hvL], [zC0, 0]], { mat: 'rock', walk: true, omit: [3] }));
  els.push(nsPassage('LH', { x: X, w: W, z0: zL1, y0: yLH, z1: -60.0, y1: yLH, h: 1.8, vertical: true, mat: 'rock', walk: true }));
  // ramp west to the subsidiary chamber
  els.push(ewPassage('SP', { z: -75.35, w: 1.1, x0: 2.6, y0: -13.4, x1: X - W / 2, y1: yLH, h: 1.6, vertical: true, mat: 'rock', walk: true }));
  els.push(room('SubC', { x0: -7.8, x1: 2.6, y0: -13.4, y1: -11.4, z0: -76.9, z1: -73.78, gable: 'x', rise: 0.61, mat: 'rock', walk: true }));
  // lower ascending passage climbs to meet the upper horizontal passage
  {
    const zs = -60.0, zEnd = zs + (yF - yLH) / tL, zEc = zs + (yF - (yLH + hvL)) / tL;
    els.push(prism('LA', 'x', X - W / 2, X + W / 2, [[zs, yLH], [zEnd, yF], [zEc, yF], [zs, yLH + hvL]], { mat: 'rock', walk: true }));
  }
  const ref = { X, W, zE, yE, zB, yU, zRock, zUend, yF, zL0, zL1, yLH, zC0, hvL, tL };
  return { elements: els, voids: [], ref, terrainHoles: [[X - W / 2, zL0, X + W / 2, zC0]] };
}

// Interior of the Pyramid of Menkaure: a granite-lined descending passage,
// the panelled chamber, a passage closed by three portcullises, the large
// antechamber (with the abandoned upper passage), and a lower level with the
// six-niche chamber and the granite burial chamber.  Approximate layout after
// Vyse & Perring (1837) and Maragioglio & Rinaldi.
import { nsPassage, ewPassage, room, prism } from './build.js';

const RAD = Math.PI / 180;

export function menkaureInterior(info) {
  const X = 0, W = 1.06;
  const e = info.ents[0];
  const tanA = info.tanA;
  const tM = Math.tan(26.03 * RAD), hv = 1.21 / Math.cos(26.03 * RAD);
  const zE = -e.aCasing, yE = e.yCasing;
  const yM = (z) => yE - (z - zE) * tM;
  const zB = -e.aBack;
  const yF = -9.9;
  const zRock = zE + yE / tM;
  const zEnd = zE + (yE - yF) / tM;
  const els = [];
  {
    const d = hv / (tanA + tM);
    els.push(prism('MD0', 'x', X - W / 2, X + W / 2, [[zE + d, yE + d * tanA], [zE, yE], [zB, yM(zB)], [zB, yM(zB) + hv]], { era: 'built', mat: 'granite', walk: true, omit: [0] }));
  }
  els.push(nsPassage('MD1', { x: X, w: W, z0: zB, y0: yM(zB), z1: zRock, y1: 0, h: 1.21, mat: 'granite', walk: true, omit: [3] }));
  els.push(nsPassage('MD2', { x: X, w: W, z0: zRock, y0: 0, z1: zEnd, y1: yF, h: 1.21, mat: 'rock', walk: true }));
  els.push(room('PC', { x0: -1.05, x1: 1.05, y0: yF, y1: yF + 2.1, z0: zEnd, z1: zEnd + 3.84, mat: 'fine', walk: true }));
  const zH0 = zEnd + 3.84;
  els.push(nsPassage('MH', { x: X, w: 1.07, z0: zH0, y0: yF, z1: -3.9, y1: yF, h: 1.8, vertical: true, mat: 'rock', walk: true }));
  els.push(room('MA', { x0: -7.1, x1: 7.1, y0: yF, y1: yF + 4.87, z0: -3.9, z1: -0.06, mat: 'rock', walk: true, stack: 'mk' }));
  // the earlier, abandoned upper passage (dead end to the north)
  els.push(nsPassage('MUP', { x: 0, w: 1.0, z0: -13.5, y0: yF + 3.4, z1: -3.9, y1: yF + 3.4, h: 1.1, vertical: true, mat: 'rock' }));
  // ramp down (westward) from the antechamber floor to the lower level
  {
    const t = 0.62, h2 = 1.1 / Math.cos(Math.atan(t));
    const x0 = -2.0, x1 = -6.0, yb = yF - (x0 - x1) * t;
    const xc = x0 - h2 / t;
    els.push(prism('ML', 'z', -2.5, -1.45, [[x1, yb], [x0, yF], [xc, yF], [x1, yb + h2]], { mat: 'rock', walk: true, stack: 'mk' }));
    els.push(ewPassage('MCo', { z: -1.975, w: 1.05, x0: -9.7, y0: yb, x1: x1, y1: yb, h: 1.8, vertical: true, mat: 'rock', walk: true }));
    els.push(room('MB', { x0: -12.3, x1: -9.7, y0: yb, y1: yb + 2.4, z0: -4.3, z1: 2.3, gable: 'z', rise: 1.0, mat: 'granite', walk: true }));
    els.push(room('MN', { x0: -8.9, x1: -6.4, y0: yb, y1: yb + 2.1, z0: -1.45, z1: 3.2, mat: 'rock', walk: true }));
    [-0.65, 0.4, 1.45, 2.5].forEach((zc, k) => els.push(room('MNn' + k, { x0: -6.4, x1: -5.6, y0: yb + 0.3, y1: yb + 1.7, z0: zc - 0.4, z1: zc + 0.4, mat: 'rock' })));
    [-8.25, -7.05].forEach((xc, k) => els.push(room('MNs' + k, { x0: xc - 0.42, x1: xc + 0.42, y0: yb + 0.3, y1: yb + 1.7, z0: 3.2, z1: 4.0, mat: 'rock' })));
    var yLow = yb;
  }
  const ref = { X, W, zE, yE, zB, yM, zEnd, yF, zH0, yLow };
  return { elements: els, voids: [], ref };
}

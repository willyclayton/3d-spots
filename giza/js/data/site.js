// Giza plateau layout.  World frame: x = east, y = up, z = south (metres).
// Origin = centre of Khufu's base on its pavement (≈ 60 m above sea level).
// Positions come from published coordinates (Wikipedia / survey values) and
// the SRTM elevation model; small monuments are placed from site plans and are
// approximate (± a few metres).
import { deg } from '../../../shared/engine/util.js';

export const SITE = {
  name: 'Giza Pyramid Complex',
  lat: 29.979175,
  lon: 31.134358,
  utcOffset: 2,              // Egypt standard time (EET); daylight saving from the time zone
  timeZone: 'Africa/Cairo',
  baseASL: 60,               // world y = 0  <=> 60 m above sea level
};

// --- the three kings' pyramids -------------------------------------------
export const PYRAMIDS = {
  khufu: {
    id: 'khufu', name: 'Great Pyramid of Khufu', short: 'Khufu',
    cx: 0, cz: 0, baseY: 0,
    base: 230.33, slope: Math.atan(28 / 22),        // seked 5 1/2 palms = 51.84°
    heightOrig: 146.6, heightNow: 138.5, courses: 203,
    coreInset: 1.6, seed: 101,
    // passages lie in a N–S plane 7.29 m east of the centre line
    passageX: 7.29,
  },
  khafre: {
    id: 'khafre', name: 'Pyramid of Khafre', short: 'Khafre',
    cx: -340, cz: 340, baseY: 10,
    base: 215.25, slope: Math.atan(4 / 3),          // 53.13°
    heightOrig: 143.5, heightNow: 136.4, courses: 196,
    coreInset: 1.2, seed: 202, passageX: 6.0,
  },
  menkaure: {
    id: 'menkaure', name: 'Pyramid of Menkaure', short: 'Menkaure',
    cx: -581, cz: 740, baseY: 8,
    base: 103.4, slope: deg(51.34),
    heightOrig: 65.5, heightNow: 61.0, courses: 86,
    coreInset: 1.5, seed: 303, passageX: 0,
  },
};

// Queens' and satellite pyramids.  stepped: built as step pyramids
export const SMALL_PYRAMIDS = [
  { id: 'g1a', name: 'Queen’s Pyramid G1-a', owner: 'probably Hetepheres I', cx: 178, cz: 30, baseY: -1.5, base: 49.5, slope: deg(51.8), heightNow: 20, damage: 0.7, seed: 11 },
  { id: 'g1b', name: 'Queen’s Pyramid G1-b', owner: 'possibly Meritites I', cx: 178, cz: 90, baseY: -2.5, base: 49.0, slope: deg(51.8), heightNow: 21, damage: 0.7, seed: 12 },
  { id: 'g1c', name: 'Queen’s Pyramid G1-c', owner: 'Henutsen', cx: 174, cz: 147, baseY: -3.5, base: 46.25, slope: deg(51.8), heightNow: 22, damage: 0.65, seed: 13 },
  { id: 'g1d', name: 'Satellite Pyramid of Khufu', owner: 'cult pyramid (G1-d)', cx: 138, cz: 112, baseY: -1.0, base: 21.75, slope: deg(51.8), heightNow: 1.6, damage: 0.9, seed: 14 },
  { id: 'g2a', name: 'Satellite Pyramid of Khafre', owner: 'cult pyramid (G2-a)', cx: -340, cz: 470, baseY: 9.5, base: 20.1, slope: deg(53), heightNow: 1.4, damage: 0.9, seed: 15 },
  { id: 'g3a', name: 'Queen’s Pyramid G3-a', owner: 'possibly Khamerernebty II', cx: -548, cz: 842, baseY: 6.5, base: 44.3, slope: deg(52.2), heightNow: 21, damage: 0.55, seed: 16 },
  { id: 'g3b', name: 'Queen’s Pyramid G3-b', owner: 'unknown queen', cx: -602, cz: 842, baseY: 6.8, base: 31.5, slope: deg(52), heightNow: 17, damage: 0.5, seed: 17, stepped: 4 },
  { id: 'g3c', name: 'Queen’s Pyramid G3-c', owner: 'unknown queen', cx: -648, cz: 842, baseY: 7.0, base: 31.2, slope: deg(52), heightNow: 16, damage: 0.5, seed: 18, stepped: 4 },
];

export const SPHINX = {
  cx: 322, cz: 434, baseY: -40,        // floor of the Sphinx enclosure ≈ 20 m ASL
  length: 73, height: 20.2,
  enclosure: { x0: 282, x1: 368, z0: 402, z1: 466, rim: -31 },
};

// Temples, causeways (polylines in world xz), boat pits etc.
export const COMPLEX = {
  khufuTemple: { x0: 115.6, x1: 156, z0: -26, z1: 26 },
  khufuCauseway: [[156, -2], [260, -30], [420, -66], [700, -130]],
  khafreTemple: { x0: -231.9, x1: -121, z0: 312, z1: 368 },
  khafreCauseway: [[-121, 344], [96, 397], [300, 450], [352, 462]],
  khafreValleyTemple: { x0: 352, x1: 397, z0: 448, z1: 494 },
  sphinxTemple: { x0: 372, x1: 418, z0: 405, z1: 446 },
  menkaureTemple: { x0: -529, x1: -484, z0: 712, z1: 768 },
  menkaureCauseway: [[-484, 740], [-200, 762], [50, 790]],
  menkaureValleyTemple: { x0: 50, x1: 100, z0: 765, z1: 815 },
  khentkausTomb: { x0: 70, x1: 115, z0: 640, z1: 685 },
  boatPits: [
    { id: 'pitN', cx: 140, cz: -62, len: 51, w: 7, angle: 90, name: 'Boat pit (north of temple)' },
    { id: 'pitS', cx: 136, cz: 64, len: 51, w: 7, angle: 90, name: 'Boat pit (south of temple)' },
    { id: 'pitC', cx: 214, cz: -40, len: 45, w: 6, angle: -14, name: 'Causeway boat pit' },
    { id: 'pitE', cx: 20, cz: 133, len: 31, w: 5.4, angle: 0, name: 'Khufu ship pit (east)' },
    { id: 'pitW', cx: -21, cz: 133, len: 31, w: 5.4, angle: 0, name: 'Second boat pit (west)' },
  ],
  hetepheresShaft: { x: 204, z: -6 },
  wallOfTheCrow: { x0: 112, x1: 312, z: 852, thick: 10, height: 10 },
  workersTown: { x0: 140, x1: 420, z0: 875, z1: 1050 },
  workersTombs: { x: 40, z: 905 },
  panorama: { x: -660, z: 1330 },
  gem: { x: -1455, z: -1710 },       // Grand Egyptian Museum
};

// Course heights: realistic pattern (thick courses at the base, decreasing
// upward, with "resets" to thick courses that Petrie observed).
export function courseHeights(count, total, first, last, resets, seed) {
  const h = [];
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let k = 0;
  for (let i = 0; i < count; i++) {
    if (resets.includes(i)) k = i;
    const decay = Math.exp(-(i) / (count * 0.22));
    const reset = resets.length ? Math.exp(-(i - k) / 5) * 0.32 : 0;
    h.push((last + (first - last) * decay) * (1 + reset) * (0.94 + rnd() * 0.12));
  }
  const sum = h.reduce((a, b) => a + b, 0);
  return h.map((v) => (v * total) / sum);
}

// Snap a course boundary to an exact height (keeps the total).
export function forceBoundary(h, y) {
  let acc = 0, best = -1, bestD = 1e9;
  for (let i = 0; i < h.length; i++) {
    acc += h[i];
    const d = Math.abs(acc - y);
    if (d < bestD) { bestD = d; best = i; }
  }
  let acc2 = 0;
  for (let i = 0; i <= best; i++) acc2 += h[i];
  const delta = y - acc2;
  h[best] += delta;
  if (best + 1 < h.length) h[best + 1] -= delta;
  return best + 1; // index of the course starting at y
}

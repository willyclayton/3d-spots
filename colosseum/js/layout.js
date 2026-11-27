// The structure behind the façade, as numbers shared by the geometry and
// the walkable floors: where the annular walls stand, which bays hold
// staircases, where the vomitoria open on to the seats, the seating profile
// and the underside of the raking vaults that carry it. Distances d are in
// from the outer face of the façade; heights y above the arena floor.
import { PLAN, RINGS, SEATING, STOREYS } from './data/site.js';

// annular walls under the seating (each carries the front of a tier)
export const ANNULAR = [
  { id: 'w1', d0: 36.4, d1: 37.4, top: 13.0 },       // under the balteus of the second tier
  { id: 'w2', d0: 26.6, d1: 27.6, top: 21.6 },       // of the third tier
  { id: 'w3', d0: 17.0, d1: 18.2, top: 30.6 },       // of the wooden top tier
];
// the ring corridor at ground level halfway under the seating
export const MID_CORRIDOR = { d0: 28.4, d1: 30.8, y1: 4.2 };
// the passages through each annular wall at ground level
export const PASSAGE = { half: 1.1, y1: 4.4 };

export const isAxial = (k) => ((k % 20) + 20) % 20 === 0;
// arena gates: the long axis (east, west)
export const GATE_BAYS = [0, 40];
export const GATE = { half: 1.8, y1: 3.4 };
// the stair down into the basement: under the north axis, into the service corridor
export const HYP_STAIR = { bay: 20, d0: 29.0, d1: 43.5, half: 1.05 };

// Staircases: every fourth bay, a straight flight rising inwards from the
// second ambulatory to the walkway between the first and second tiers,
// coming out through a vomitorium.
export const STAIR = { d0: 15.8, d1: 37.6, y1: 11.4, half: 1.0 };
export const isStairBay = (k) => ((k % 4) + 4) % 4 === 2;
// the vomitorium: the seats of the second tier are cut back over the stair's
// last metres; a lintel spans the opening
export const VOM = { d0: 33.4, d1: 37.4, lintel: [13.7, 14.4] };
export const stairY = (d) => Math.max(0, Math.min(STAIR.y1, ((d - STAIR.d0) / (STAIR.d1 - STAIR.d0)) * STAIR.y1));

// Barrel vaults over the ambulatories: [d0, d1, floor, crown] per storey
export function ambVaults() {
  const out = [];
  const S = STOREYS;
  for (const st of [0, 1, 2]) {
    const floor = S[st].y0, crown = S[st + 1].y0 - 1.0;
    out.push({ amb: 'amb1', st, d0: RINGS.amb1[0], d1: RINGS.amb1[1], floor, crown, top: S[st + 1].y0 });
    if (st < 2) out.push({ amb: 'amb2', st, d0: RINGS.amb2[0], d1: RINGS.amb2[1], floor, crown, top: S[st + 1].y0 });
  }
  return out;
}

// The stepped profile of the seating, per tier: [[d, y], ...] from the front
// (arena side, larger d) to the back, steps of about 0.44 m.
export function tierSteps(m) {
  const n = Math.max(2, Math.round((m.y1 - m.y0) / 0.44));
  const rise = (m.y1 - m.y0) / n, tread = (m.d0 - m.d1) / n;
  const pts = [[m.d0, m.y0]];
  for (let i = 0; i < n; i++) {
    const d = m.d0 - tread * i, y = m.y0 + rise * (i + 1);
    pts.push([d, y], [d - tread, y]);
  }
  return { pts, rise, tread, n };
}
export const TIERS = SEATING.filter((m) => m.id !== 'podium');

// height of the seat surface at depth d (the floor for walking on the seats);
// null where there is no seating (the walkways are the tops of the walls)
export function seatY(d) {
  if (d >= RINGS.podium[0] && d <= PLAN.cavea) return 4.0;
  for (const m of TIERS) {
    if (d <= m.d0 && d >= m.d1) {
      const { rise, tread } = tierSteps(m);
      const i = Math.min(Math.floor((m.d0 - d) / tread), Math.round((m.y1 - m.y0) / rise) - 1);
      return m.y0 + rise * (i + 1);
    }
  }
  // the walkways (praecinctiones) in front of each tier
  const prev = (m) => SEATING[SEATING.indexOf(m) - 1];
  for (const m of TIERS) {
    const p = prev(m);
    if (d > m.d0 && d < p.d1 + 1e-6) return p.y1;
  }
  return null;
}

// underside of the raking vault under tier m (straight, below the steps)
export function tierUnder(m) { return [[m.d0, m.y0 - 1.3], [m.d1, m.y1 - 1.5]]; }
export function underY(d) {
  for (const m of TIERS) {
    if (d <= m.d0 + 0.6 && d >= m.d1 - 0.6) {
      const [[a, ya], [b, yb]] = tierUnder(m);
      return ya + ((d - a) / (b - a)) * (yb - ya);
    }
  }
  if (d > RINGS.amb3[0] - 0.5) return 3.4;                  // the podium terrace over the inner ambulatory
  return 9.55;
}

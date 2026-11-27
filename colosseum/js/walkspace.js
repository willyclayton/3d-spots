// Where one can walk in the amphitheatre, from the same layout numbers the
// geometry uses (layout.js, hypogeum.js). Each volume answers, for a world
// point, the floor and ceiling there, or null where the masonry is (see
// shared/engine/walkworld.js):
//   - the ground floor: through the arches, round the ambulatories, between
//     the radial walls, through the annular walls and the ring corridor, into
//     the inner ambulatory and (by the gates) out into the arena;
//   - the staircases, up to the walkway in front of the second tier;
//   - the seats and walkways, the podium terrace and the boxes;
//   - the arena floor (90 CE) or the modern platform (today);
//   - the basement: its corridors, the stair down from the north side and
//     the tunnels at both ends.
import { PLAN, RINGS, STOREYS } from './data/site.js';
import { BAY, ringCoords, bayOf, toPlan, toWorld, alphaAt, ovalPoint } from './plan.js';
import { bayScale } from './geom.js';
import { ANNULAR, MID_CORRIDOR, PASSAGE, GATE_BAYS, GATE, HYP_STAIR, STAIR, VOM, isAxial, isStairBay, stairY, seatY, underY } from './layout.js';
import { caveaCap, stairSurvives, stairHalf } from './cavea.js';
import { hypoWalk } from './hypogeum.js';

const R = 0.26;          // body radius
const NB = PLAN.bays;

// plan coordinates of a world point: d in from the façade, bay k, offset e
// (metres across the bay on ring d)
function where(x, z) {
  const [u, v] = toPlan(x, z);
  const rc = ringCoords(u, v);
  const f = bayOf(rc.alpha);
  let k = Math.round(f);
  const es = (f - k) * BAY;
  k = ((k % NB) + NB) % NB;
  const s = k * BAY + es;
  return { u, v, d: rc.d, k, s, e: es * bayScale(s, Math.max(0, Math.min(PLAN.cavea, rc.d))) };
}

export function buildWalkVolumes(ctx) {
  const { built, surv } = ctx;
  const bw = (k, d) => BAY * bayScale(k * BAY, d);                 // bay width on ring d
  const ex = worldRect(-PLAN.a - 2, PLAN.a + 2, -PLAN.b - 2, PLAN.b + 2);
  const vaultCrown = STOREYS[1].y0 - 1.0;
  const vols = [];

  // ---------------------------------------------------- the ground floor
  vols.push({
    id: 'ground', inside: 'amph', ...ex, base: 0,
    range(x, z) {
      const w = where(x, z);
      const { d, k, e } = w;
      const ae = Math.abs(e);
      if (d < -0.4 || d > PLAN.cavea) return null;
      const nF = surv(k, 'facade'), n2 = Math.min(3, surv(k, 'ring2'));
      if (d < RINGS.facade[1] + R) { if (nF && ae > 2.1 - R && d > -R) return null; return [0, nF ? 7.0 : Infinity]; }
      if (d < RINGS.amb1[1] - R) return [0, nF && n2 ? vaultCrown : Infinity];
      if (d < RINGS.ring2[1] + R) {
        if (!n2) return [0, Infinity];
        const half = Math.max(0.8, (bw(k, RINGS.ring2[0]) - 2.2) / 2);
        return ae < half - R ? [0, 6.0] : null;
      }
      if (d < RINGS.amb2[1] - R) return [0, n2 && surv(k, 'ring3') ? vaultCrown : Infinity];
      if (d < RINGS.ring3[1] + R) {
        const half = Math.max(0.6, (bw(k, RINGS.ring3[0]) - 2.6) / 2);
        return ae < half - R ? [0, 5.4] : null;
      }
      // the substructures: between the radial walls
      if (d < RINGS.amb3[0] - 0.5 - R) {
        if (ae > bw(k, d) / 2 - 0.6 - R) return null;
        const stair = built ? isStairBay(k) : stairSurvives(ctx, k);
        const inMid = d > MID_CORRIDOR.d0 + R && d < MID_CORRIDOR.d1 - R;
        if (stair && d > STAIR.d0 + 0.3 && !inMid) return null;          // the stair fills the bay
        if (k === HYP_STAIR.bay && d > HYP_STAIR.d0 - 0.2 && d < 40 && ae < HYP_STAIR.half + 0.35) return null;   // the open stairwell
        for (const W of ANNULAR) {
          if (d > W.d0 - R && d < W.d1 + R) {
            const half = isAxial(k) ? 1.6 : PASSAGE.half;
            if (ae > half - R) return null;
            if (stair && W.id === 'w1') return null;
          }
        }
        const cap = caveaCap(ctx, k);
        const roof = cap > 6 ? underY(d) : Infinity;
        return [0, inMid ? Math.min(roof, MID_CORRIDOR.y1) : roof];
      }
      // the wall of the inner ambulatory, its doors, the ambulatory and the gates
      if (d < RINGS.amb3[0] + 0.5 + R) {
        const half = isAxial(k) ? 1.6 : 0.9;
        return ae < Math.min(half, bw(k, d) * 0.3) - R ? [0, 2.9] : null;
      }
      if (d < RINGS.podium[1] - 1.0 - R) return [0, 3.4];
      if (GATE_BAYS.includes(k) && ae < GATE.half - R) return [0, GATE.y1];
      return null;
    },
  });

  // ------------------------------------------------------------ stairs
  for (let k = 0; k < NB; k++) {
    if (!(built ? isStairBay(k) : stairSurvives(ctx, k))) continue;
    const half = stairHalf(k);
    const al = alphaAt(k * BAY);
    vols.push({
      id: 'stair-' + k, inside: 'amph', ...rectAround(al, STAIR.d0 - 0.5, STAIR.d1 + 0.6, half + 1), base: 0,
      range(x, z) {
        const w = where(x, z);
        if (w.k !== k || Math.abs(w.e) > half - R) return null;
        if (w.d < STAIR.d0 - 0.3 || w.d > STAIR.d1 + 0.5) return null;
        const f = stairY(w.d);
        const ceil = w.d > VOM.d0 - 0.5 ? VOM.lintel[0] : underY(w.d);
        return [f, Math.max(f + 1.9, ceil)];
      },
    });
  }

  // ----------------------------------------------- seats and walkways
  vols.push({
    id: 'seats', inside: null, ...ex, base: 0,
    range(x, z) {
      const w = where(x, z);
      const { d, k, e } = w;
      if (d < 9.4 || d > (built ? PLAN.cavea - 0.32 - R : PLAN.cavea - 0.1)) return null;
      // the boxes (90 CE)
      if (built && (Math.abs(w.s - 20 * BAY) < 1.3 * BAY || Math.abs(w.s - 60 * BAY) < 1.3 * BAY) && d > 45.5) return d < PLAN.cavea + 0.5 ? [4.9, 9.0] : null;
      let y = seatY(d);
      if (y === null) return null;
      if (!built) {
        if (y > caveaCap(ctx, k) - 0.2) return null;
        if (d < RINGS.podium[0]) y -= 0.6;
      }
      const stair = built ? isStairBay(k) : stairSurvives(ctx, k);
      if (stair && d > VOM.d0 && d < 37.0 && Math.abs(e) < stairHalf(k) + 0.1) y = VOM.lintel[1];
      return [y, Infinity];
    },
  });

  // --------------------------------------------- arena floor / platform
  vols.push({
    id: 'arena', inside: null, ...ex, base: 0,
    range(x, z) {
      const [u, v] = toPlan(x, z);
      const d = ringCoords(u, v).d;
      if (d < PLAN.cavea - 0.1) return null;
      if (!built && u < 26.2) return null;
      return [0, Infinity];
    },
  });

  // --------------------------------------------------------- basement
  vols.push({
    id: 'hypogeum', inside: 'hypogeum', ...ex, base: 0,
    range(x, z) { const [u, v] = toPlan(x, z); return hypoWalk(u, v, built); },
  });
  // the stair down from the north side, and the passage under the podium
  {
    const S = HYP_STAIR, al = alphaAt(S.bay * BAY);
    vols.push({
      id: 'hyp-stair', inside: 'hypogeum', ...rectAround(al, S.d0 - 0.5, PLAN.cavea + 1, S.half + 1), base: 0,
      range(x, z) {
        const w = where(x, z);
        if (w.k !== S.bay || Math.abs(w.e) > S.half - R) return null;
        if (w.d < S.d0 - 0.3 || w.d > PLAN.cavea + 0.8) return null;
        const f = w.d < S.d1 ? -6.2 * Math.max(0, (w.d - S.d0) / (S.d1 - S.d0)) : -6.2;
        return [f, w.d < 40 ? Infinity : w.d > PLAN.cavea - 1.0 ? -3.6 : -0.36];
      },
    });
  }
  // the tunnels at both ends of the long axis
  for (const k of [0, 40]) {
    const al = alphaAt(k * BAY);
    vols.push({
      id: 'tunnel-' + k, inside: 'hypogeum', ...rectAround(al, 36, PLAN.cavea + 1, 2.5), base: 0,
      range(x, z) {
        const w = where(x, z);
        if (w.k !== k || Math.abs(w.e) > 1.4 - R) return null;
        if (w.d < 36.3 || w.d > PLAN.cavea + 0.8) return null;
        return [-6.2, -3.5];
      },
    });
  }
  return vols;
}

// world rectangle round a plan rectangle
function worldRect(u0, u1, v0, v1) {
  const c = [[u0, v0], [u0, v1], [u1, v0], [u1, v1]].map(([u, v]) => toWorld(u, v));
  return { x0: Math.min(...c.map((p) => p[0])), x1: Math.max(...c.map((p) => p[0])), z0: Math.min(...c.map((p) => p[1])), z1: Math.max(...c.map((p) => p[1])) };
}
// world rectangle round a strip along the normal at angle al, from d0 to d1, half-width h
function rectAround(al, d0, d1, h) {
  const pts = [];
  for (const d of [d0, d1]) {
    const [u, v] = ovalPoint(al, d);
    for (const e of [-h, h]) pts.push(toWorld(u - Math.sin(al) * e, v - Math.cos(al) * e));   // across: the tangent
  }
  const pad = h + 1;
  return { x0: Math.min(...pts.map((p) => p[0])) - pad, x1: Math.max(...pts.map((p) => p[0])) + pad, z0: Math.min(...pts.map((p) => p[1])) - pad, z1: Math.max(...pts.map((p) => p[1])) + pad };
}

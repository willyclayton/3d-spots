// The seating (cavea) and the structure that carries it, bay by bay:
//
//   - each tier is a raking vault: a thick slab, stepped on top (marble seats
//     in 90 CE, rough concrete and brick in the ruin), smooth below;
//   - annular walls carry the front of each tier, radial walls between the
//     bays carry the vaults; both are pierced by passages at ground level and
//     by a ring corridor halfway in;
//   - every fourth bay a staircase climbs from the second ambulatory to the
//     walkway in front of the second tier, coming out through a vomitorium
//     under a lintel;
//   - the podium: the arena wall with its gates and the openings of the
//     basement, the terrace, the balustrade, and (90 CE) the emperor's box
//     and the magistrates' box opposite.
import { PLAN, RINGS } from './data/site.js';
import { BAY } from './plan.js';
import { sweep, curvedWall, radialWall, archPts, archedBay, bayScale, solidAt, centreOf } from './geom.js';
import { ANNULAR, MID_CORRIDOR, PASSAGE, GATE_BAYS, GATE, HYP_STAIR, STAIR, VOM, TIERS, isAxial, isStairBay, tierSteps, tierUnder, underY } from './layout.js';

const NB = PLAN.bays;

// what survives of the seating today, per bay: a height above which it has
// fallen (ragged from bay to bay), and what the ruin keeps of the stairs
export function caveaCap(ctx, k) {
  if (ctx.built) return 99;
  if (!ctx._caps) {
    ctx._caps = [];
    for (let i = 0; i < NB; i++) ctx._caps.push(ctx.surv(i, 'facade') > 0 ? 24 + ctx.rnd() * 5 : 14 + ctx.rnd() * 6);
  }
  return ctx._caps[((k % NB) + NB) % NB];
}
export function stairSurvives(ctx, k) { return isStairBay(k) && caveaCap(ctx, k) > 21; }
// half-width (metres) of a stair in bay k: what fits between the radial walls
export function stairHalf(k) {
  const sc = k * BAY;
  const clear = BAY * bayScale(sc, STAIR.d1) / 2 - 0.7;
  return Math.max(0.55, Math.min(STAIR.half, clear));
}

export function buildCavea(ctx) {
  const { B, built, rnd, tone, S } = ctx;
  const seatB = built ? B.marble : B.brick;

  for (let k = 0; k < NB; k++) {
    const sa = S(k, -0.5), sb = S(k, 0.5), sc = S(k);
    const cap = caveaCap(ctx, k);
    const stair = built ? isStairBay(k) : stairSurvives(ctx, k);
    const sHalf = (d, m) => m / bayScale(sc, d);               // metres across -> façade arc length
    const vomHalf = stair ? sHalf(35, stairHalf(k)) : 0;

    // ------------------------------------------------------ the tiers
    let lastD = null;                                         // outer edge of what survives
    for (const m of TIERS) {
      if (m.y0 > cap) continue;
      const slab = tierSlab(m, cap, built ? null : rnd);
      if (!slab) continue;
      lastD = slab.back;
      const c = built ? [1, 1, 1] : tone(0.8, 0.12);
      const ins = 'poly';
      // the top tier was of timber benches
      const tb = built && m.id === 'ligneis' ? B.wood : seatB;
      if (stair && m.id === 'imum') {
        // the vomitorium: the lowest rows are cut back over the stair
        sweep(seatB, slab.poly, sa, sc - vomHalf, { col: c, closed: true, segs: 2, caps: true, inside: ins });
        sweep(seatB, slab.poly, sc + vomHalf, sb, { col: c, closed: true, segs: 2, caps: true, inside: ins });
        const cut = tierSlab(m, cap, built ? null : rnd, VOM.d0);
        if (cut) sweep(seatB, cut.poly, sc - vomHalf, sc + vomHalf, { col: c, closed: true, segs: 1, caps: true, inside: 'poly' });
        const lin = [[VOM.d0, VOM.lintel[1]], [VOM.d1, VOM.lintel[1]], [VOM.d1, VOM.lintel[0]], [VOM.d0, VOM.lintel[0]]];
        sweep(B.trav, lin, sc - vomHalf - 0.15, sc + vomHalf + 0.15, { col: tone(), closed: true, segs: 1, caps: true, inside: 'poly' });
      } else {
        sweep(tb, slab.poly, sa, sb, { col: c, closed: true, segs: built ? 3 : 2, inside: ins });
      }
    }
    // where the seating has fallen, the broken vault over the ground floor
    if (!built && lastD !== null && lastD > RINGS.ring3[1] + 1) {
      const yv = 7.6 + rnd() * 0.6;
      const p = [[RINGS.ring3[1], yv + 0.9], [lastD, yv + 0.9], [lastD, yv], [RINGS.ring3[1], yv]];
      sweep(B.brick, p, sa, sb, { col: tone(0.75, 0.1), closed: true, segs: 2, inside: 'poly' });
    }
    const capY = (d) => Math.min(cap - 0.4, underY(d)) - (built ? 0 : rnd() * 0.8);

    // ----------------------------------------------- annular walls
    for (const W of ANNULAR) {
      let top = Math.min(W.top, built ? W.top : capY((W.d0 + W.d1) / 2));
      if (top < 2) continue;
      if (!built && top < W.top && lastD !== null && (W.d0 + W.d1) / 2 < lastD) top = Math.min(top, 7.6 + rnd() * 3);
      const s3 = bayScale(sc, W.d0);
      const half = (isAxial(k) ? 1.6 : PASSAGE.half) / s3;
      let contour;
      if (stair && W.id === 'w1') {
        // under the stair's landing: only the wall below the stair
        contour = [[sa, 0], [sb, 0], [sb, top], [sc + vomHalf + 0.02, top], [sc + vomHalf + 0.02, STAIR.y1 - 0.5], [sc - vomHalf - 0.02, STAIR.y1 - 0.5], [sc - vomHalf - 0.02, top], [sa, top]];
        curvedWall(B.tuff, { d0: W.d0, d1: W.d1, contour, col: tone() });
        continue;
      }
      const yArch = stair && W.id === 'w2' ? 9.2 : PASSAGE.y1 + (isAxial(k) ? 1.2 : 0);
      if (yArch > top - 0.6) continue;
      contour = archedBay(sa, sb, 0, top, sc - half, sc + half, yArch);
      curvedWall(B.tuff, { d0: W.d0, d1: W.d1, contour, col: tone() });
    }

    // -------------------------------------------------- radial walls
    const tops = [];
    for (let d = RINGS.ring3[1]; d <= RINGS.amb3[0] + 1e-6; d += 0.9) {
      let y = built ? underY(d) - 0.05 : capY(d) + rnd() * 0.5;
      if (!built && lastD !== null && d < lastD) y = Math.min(y, 9 + rnd() * 6);
      tops.push([d, Math.max(1.5, y)]);
    }
    radialWall(B.brick, sa, 1.2, tops, 0, tone(0.85, 0.12), [{ d0: MID_CORRIDOR.d0, d1: MID_CORRIDOR.d1, y1: MID_CORRIDOR.y1 }]);

    // -------------------------------------------------------- stairs
    if (stair) {
      const half = sHalf(27, stairHalf(k));
      sweep(B.trav, stairProfile(), sc - half, sc + half, { col: tone(0.82, 0.1), closed: true, segs: 1, caps: true, inside: 'poly' });
    }

    // ------------------------------------------- the podium and arena wall
    const [, pb] = RINGS.podium;
    const holes = [];
    const sWall = (m) => m / bayScale(sc, pb);
    if (GATE_BAYS.includes(k)) holes.push(archPts(sc - sWall(GATE.half), sc + sWall(GATE.half), 0, GATE.y1 + 0.4));
    const notchBottom = (k === 0 || k === 40 || k === HYP_STAIR.bay);
    const hw = k === HYP_STAIR.bay ? sWall(HYP_STAIR.half + 0.1) : sWall(1.4);
    const contour = notchBottom
      ? [[sa, -6.2], [sc - hw, -6.2], [sc - hw, -3.6], [sc + hw, -3.6], [sc + hw, -6.2], [sb, -6.2], [sb, 4.0], [sa, 4.0]]
      : [[sa, -6.2], [sb, -6.2], [sb, 4.0], [sa, 4.0]];
    curvedWall(B.brick, { d0: pb - 1.0, d1: pb, contour, holes, col: tone(0.85, 0.12) });
    if (built) {
      // marble facing of the arena wall, the terrace and its balustrade
      const veneer = [[pb, 0], [pb + 0.06, 0], [pb + 0.06, 4.0], [pb, 4.0]];
      if (GATE_BAYS.includes(k)) {
        const g = sWall(GATE.half + 0.25);
        sweep(B.marble, veneer, sa, sc - g, { col: [1, 1, 1], closed: true, segs: 1, inside: solidAt(pb + 0.03, 2) });
        sweep(B.marble, veneer, sc + g, sb, { col: [1, 1, 1], closed: true, segs: 1, inside: solidAt(pb + 0.03, 2) });
      } else sweep(B.marble, veneer, sa, sb, { col: [1, 1, 1], closed: true, segs: 2, inside: solidAt(pb + 0.03, 2) });
      const bal = [[pb - 0.32, 4.0], [pb, 4.0], [pb, 5.1], [pb - 0.32, 5.1]];
      if (k !== 20 && k !== 60 && k !== 19 && k !== 21 && k !== 59 && k !== 61) sweep(B.marble, bal, sa, sb, { col: [0.97, 0.96, 0.94], closed: true, segs: 2, inside: solidAt(pb - 0.16, 4.5) });
    }
    const terrace = [[RINGS.amb3[0], 4.0], [pb - 1.0, 4.0], [pb - 1.0, 3.4], [RINGS.amb3[0], 3.4]];
    sweep(built ? B.marble : B.brick, terrace, sa, sb, { col: tone(0.85, 0.12), closed: true, segs: 2, inside: 'poly' });
    // the wall between the inner ambulatory and the substructures, a door per bay
    const s3 = bayScale(sc, RINGS.amb3[0]);
    const dh = Math.min(isAxial(k) ? 1.6 : 0.9, BAY * s3 * 0.3) / s3;
    curvedWall(B.brick, { d0: RINGS.amb3[0] - 0.5, d1: RINGS.amb3[0] + 0.5, contour: archedBay(sa, sb, 0, 3.4, sc - dh, sc + dh, isAxial(k) ? 3.3 : 2.9), col: tone(0.85, 0.12) });
  }

  // ------------------------------------------------- the boxes (90 CE)
  if (built) {
    box(60, [0.55, 0.18, 0.22]);       // the emperor's box (pulvinar)
    box(20, [0.62, 0.5, 0.36]);        // the magistrates' box (tribunal)
  }

  // The emperor's box (south) and the magistrates' box opposite: a raised
  // floor projecting over the arena, columns, a roof and painted walls.
  function box(k, paint) {
    const s0 = S(k, -1.3), s1 = S(k, 1.3), [, pb] = RINGS.podium;
    const fl = [[45.5, 4.9], [pb + 0.6, 4.9], [pb + 0.6, 3.8], [45.5, 3.8]];
    sweep(B.marble, fl, s0, s1, { col: [1, 1, 1], closed: true, segs: 4, caps: true, inside: 'poly' });
    const roof = [[45.2, 9.6], [pb + 0.9, 9.6], [pb + 0.9, 9.0], [45.2, 9.0]];
    sweep(B.marble, roof, s0 - 0.2, s1 + 0.2, { col: [0.96, 0.95, 0.93], closed: true, segs: 4, caps: true, inside: 'poly' });
    const pedi = [[pb + 0.9, 9.6], [pb + 0.9, 10.6], [pb + 0.5, 10.6], [pb + 0.5, 9.6]];
    sweep(B.marble, pedi, s0 - 0.2, s1 + 0.2, { col: [0.96, 0.95, 0.93], closed: true, segs: 4, caps: true, inside: 'poly' });
    const back = [[45.5, 4.9], [46.1, 4.9], [46.1, 9.0], [45.5, 9.0]];
    sweep(B.plaster, back, s0, s1, { col: paint, closed: true, segs: 4, caps: true, inside: 'poly' });
    for (const f of [0, 1 / 3, 2 / 3, 1]) {
      const s = s0 + (s1 - s0) * f;
      const sc = bayScale(s, pb);
      const r = 0.26 / sc;
      const col = [[pb + 0.15, 4.9], [pb + 0.67, 4.9], [pb + 0.67, 9.0], [pb + 0.15, 9.0]];
      sweep(B.marble, col, s - r, s + r, { col: [1, 0.99, 0.97], closed: true, segs: 1, caps: true, inside: solidAt(pb + 0.41, 7) });
    }
  }
}

// A tier as a closed polygon: the steps on top (from the front, larger d,
// to the back), the raking vault below. `cap`: the height above which it
// has fallen; `rnd`: roughen the top (the ruin); `from`: start at this d
// instead of the front (the vomitorium).
function tierSlab(m, cap, rnd, from = null) {
  const { pts } = tierSteps(m);
  let top = pts.filter(([d, y]) => y <= cap + 1e-6 && (from === null || d <= from + 1e-6));
  if (from !== null) {
    const first = top[0];
    if (!first) return null;
    top = [[from, first[1]], ...top.filter(([d]) => d < from - 1e-6)];
  }
  if (top.length < 2) return null;
  if (rnd) top = top.map(([d, y], i) => [d, y - 0.4 - ((i * 7) % 5 === 0 ? rnd() * 0.5 : 0)]);
  const [[ua, ya], [ub, yb]] = tierUnder(m);
  const under = (d) => ya + ((d - ua) / (ub - ua)) * (yb - ya);
  const dFront = top[0][0], dBack = top[top.length - 1][0];
  const poly = [...top, [dBack, Math.min(under(dBack), top[top.length - 1][1] - 0.6)], [dFront, Math.min(under(dFront), top[0][1] - 0.6)]];
  return { poly, back: dBack };
}

// The stair, as a closed profile: 38 steps up from the ambulatory floor to the
// landing at the walkway, resting on a raking vault.
function stairProfile() {
  const n = 38, rise = STAIR.y1 / n, tread = (STAIR.d1 - STAIR.d0) / n;
  const pts = [[STAIR.d0, 0]];
  for (let i = 0; i < n; i++) {
    const d = STAIR.d0 + tread * i, y = rise * (i + 1);
    pts.push([d, y], [d + tread, y]);
  }
  pts.push([STAIR.d1 + 0.2, STAIR.y1], [STAIR.d1 + 0.2, STAIR.y1 - 0.7], [STAIR.d0 + 1.6, 0]);
  return pts;
}

// Plan geometry of the amphitheatre: the four-centred oval, its offsets, the
// 80 bays and the plan <-> world transform. See data/site.js for the frames.
import { PLAN, AXIS_BEARING } from './data/site.js';

const B = (AXIS_BEARING * Math.PI) / 180;
const SB = Math.sin(B), CB = Math.cos(B);
const { a, b, r, R } = PLAN;
const CE = a - r;                         // end-arc centres at u = ±CE
const CS = R - b;                         // side-arc centres at v = ±CS (opposite side)
export const ALPHA0 = Math.atan2(CS, CE); // normal angle where end and side arcs meet

// Plan (u, v) -> world (x, z), and back.
export function toWorld(u, v) { return [u * SB + v * CB, -u * CB + v * SB]; }
export function toPlan(x, z) { return [x * SB - z * CB, x * CB + z * SB]; }
// direction (unit plan vector) -> world direction
export function dirWorld(du, dv) { return [du * SB + dv * CB, -du * CB + dv * SB]; }
// world rotation (radians about +y) that maps plan axes onto world axes:
// a mesh built in plan coordinates (x = u, z = v) needs rotation.y = PLAN_ROT
export const PLAN_ROT = Math.PI / 2 - B;

// The arc a normal angle falls on: centre and radius of the outer curve.
// Normal angle alpha is measured counter-clockwise seen from above, from the
// eastern end (+u) towards the north (-v).
function arcFor(alpha) {
  const t = ((alpha % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (t <= ALPHA0 || t >= 2 * Math.PI - ALPHA0) return { cu: CE, cv: 0, rad: r };
  if (t <= Math.PI - ALPHA0) return { cu: 0, cv: CS, rad: R };          // north side
  if (t <= Math.PI + ALPHA0) return { cu: -CE, cv: 0, rad: r };         // west end
  return { cu: 0, cv: -CS, rad: R };                                     // south side
}

// Point on the ring d metres in from the outer façade, at normal angle alpha.
export function ovalPoint(alpha, d = 0) {
  const { cu, cv, rad } = arcFor(alpha);
  const k = rad - d;
  return [cu + k * Math.cos(alpha), cv - k * Math.sin(alpha)];
}

// Outward unit normal (plan) at normal angle alpha.
export function ovalNormal(alpha) { return [Math.cos(alpha), -Math.sin(alpha)]; }

// Radius of curvature of the ring at d (negative when d passes the centre).
export function ovalRadius(alpha, d = 0) { return arcFor(alpha).rad - d; }

// Perimeter of the outer façade and arc length <-> normal angle.
const L_END = r * ALPHA0, L_SIDE = R * (Math.PI - 2 * ALPHA0);
export const PERIMETER = 4 * L_END + 2 * L_SIDE;
export function alphaAt(s) {
  let t = ((s % PERIMETER) + PERIMETER) % PERIMETER;
  if (t <= L_END) return t / r;
  t -= L_END;
  if (t <= L_SIDE) return ALPHA0 + t / R;
  t -= L_SIDE;
  if (t <= 2 * L_END) return Math.PI - ALPHA0 + t / r;
  t -= 2 * L_END;
  if (t <= L_SIDE) return Math.PI + ALPHA0 + t / R;
  t -= L_SIDE;
  return 2 * Math.PI - ALPHA0 + t / r;
}

// The bays have equal widths along the façade. Bay k is centred on
// s = k * PERIMETER / 80 (bay 0 on the eastern end of the long axis).
export const BAY = PERIMETER / PLAN.bays;
export function bayAlpha(k, f = 0) { return alphaAt((k + f) * BAY); }   // f in [-0.5, 0.5]

// Distance in from the façade and normal angle of a plan point (inverse of
// ovalPoint), for point-in-ring tests. Exact on each arc's sector.
export function ringCoords(u, v) {
  // try each arc; the right one gives an angle inside its own sector
  const arcs = [
    { cu: CE, cv: 0, rad: r, lo: -ALPHA0, hi: ALPHA0 },
    { cu: 0, cv: CS, rad: R, lo: ALPHA0, hi: Math.PI - ALPHA0 },
    { cu: -CE, cv: 0, rad: r, lo: Math.PI - ALPHA0, hi: Math.PI + ALPHA0 },
    { cu: 0, cv: -CS, rad: R, lo: Math.PI + ALPHA0, hi: 2 * Math.PI - ALPHA0 },
  ];
  let best = null;
  for (const A of arcs) {
    const du = u - A.cu, dv = -(v - A.cv);
    let al = Math.atan2(dv, du);
    // bring into [lo, hi] range modulo 2pi
    while (al < A.lo - 1e-9) al += 2 * Math.PI;
    while (al > A.hi + 1e-9) al -= 2 * Math.PI;
    if (al < A.lo - 1e-6 || al > A.hi + 1e-6) continue;
    const d = A.rad - Math.hypot(du, dv);
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { d, alpha: (al + 2 * Math.PI) % (2 * Math.PI) };
  }
  return best || { d: -1e9, alpha: 0 };
}

// Which bay (fractional) a normal angle is in.
export function bayOf(alpha) {
  const t = ((alpha % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let s;
  if (t <= ALPHA0) s = t * r;
  else if (t <= Math.PI - ALPHA0) s = L_END + (t - ALPHA0) * R;
  else if (t <= Math.PI + ALPHA0) s = L_END + L_SIDE + (t - Math.PI + ALPHA0) * r;
  else if (t <= 2 * Math.PI - ALPHA0) s = 3 * L_END + L_SIDE + (t - Math.PI - ALPHA0) * R;
  else s = 3 * L_END + 2 * L_SIDE + (t - 2 * Math.PI + ALPHA0) * r;
  return s / BAY;
}

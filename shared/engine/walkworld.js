// Walkable space for first-person mode: the terrain outdoors, plus walkable
// volumes (rooms, passages, stairs) and things in the way.
//
//   volumes:    { id, inside, x0, x1, z0, z1, base, range(x, z) -> [floor, ceiling] | null, stack? }
//               world plan rectangle; floor and ceiling are relative to base.
//               `inside` names the structure the volume belongs to (null for
//               open-air things such as stairs). Volumes with the same `stack`
//               whose floor meets the ceiling below form one open space.
//   footprints: rects of solid structures: only volumes can be entered there.
//   obstacles:  rects that block walking on the terrain (walls, tombs...).
//   blockedAt:  optional (x, z) -> bool, for shapes that are not rectangles.
//   maxDrop:    optional: refuse steps that would drop further than this
//               (parapets, the edge of a terrace); unlimited by default.

const R = 0.24;          // body radius
const STEP_UP = 1.0;     // highest step one can climb (the Great Step is 0.9 m)
const HEAD = 1.05;       // minimum headroom when crouching

export class WalkWorld {
  constructor(terrain) {
    this.terrain = terrain;
    this.volumes = [];
    this.obstacles = [];
    this.footprints = [];
    this.blockedAt = null;
    this.maxDrop = Infinity;
  }

  setVolumes(list) { this.volumes = list.slice(); }

  addVolume(o) { this.volumes.push(o); }

  // all supports at (x,z) that fit a body standing at height y
  supports(x, z, y) {
    const raw = [];
    for (const v of this.volumes) {
      if (x < v.x0 || x > v.x1 || z < v.z0 || z > v.z1) continue;
      const r = v.range(x, z);
      if (!r) continue;
      raw.push({ floor: v.base + r[0], ceiling: v.base + r[1], inside: v.inside ?? null, v });
    }
    // stacked rooms (gallery corbels, niches, junctions) form one open space
    raw.sort((a, b) => a.floor - b.floor);
    const out = [];
    for (const s of raw) {
      const last = out[out.length - 1];
      // merge only rooms stacked on top of each other (floor meets ceiling);
      // overlapping rooms are separate routes (e.g. the gallery bridge over the
      // passage to the Queen's Chamber)
      if (last && last.v?.stack && last.v.stack === s.v?.stack && Math.abs(s.floor - last.ceiling) <= 0.05) { last.ceiling = Math.max(last.ceiling, s.ceiling); last.inside = last.inside || s.inside; }
      else out.push({ ...s });
    }
    let blocked = false;
    for (const f of this.footprints) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) { blocked = true; break; }
    if (!blocked) for (const o of this.obstacles) if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) { blocked = true; break; }
    if (!blocked && this.blockedAt && this.blockedAt(x, z)) blocked = true;
    if (!blocked) out.push({ floor: this.terrain.heightAt(x, z), ceiling: Infinity, inside: null });
    return out;
  }

  best(x, z, y) {
    let best = null;
    for (const s of this.supports(x, z, y)) {
      if (s.floor > y + STEP_UP) continue;           // too high to step onto
      if (s.ceiling - s.floor < 0.75) continue;      // too low even to crawl
      if (s.ceiling < y + 0.7) continue;              // we are above this room
      if (!best || s.floor > best.floor) best = s;
    }
    return best;
  }

  // when the height is unknown (teleport), stand on the highest real floor
  highest(x, z) {
    let best = null;
    for (const s of this.supports(x, z, 0)) {
      if (s.ceiling - s.floor < 0.75) continue;
      if (!best || s.floor > best.floor) best = s;
    }
    return best;
  }

  fits(x, z, y) {
    const c = this.best(x, z, y);
    if (!c) return null;
    if (y - c.floor > this.maxDrop) return null;
    const y2 = Math.max(y, c.floor);
    for (const [ox, oz] of [[R, 0], [-R, 0], [0, R], [0, -R], [R * 0.7, R * 0.7], [-R * 0.7, R * 0.7], [R * 0.7, -R * 0.7], [-R * 0.7, -R * 0.7]]) {
      const s = this.best(x + ox, z + oz, y2);
      if (!s) return null;
      if (s.ceiling < c.floor + 0.75) return null;
      if (s.floor > c.floor + STEP_UP) return null;
    }
    return c;
  }

  resolve(feet, dx, dz) {
    const tryAt = (x, z) => {
      const c = this.fits(x, z, feet.y);
      return c ? { x, z, floor: c.floor, ceiling: c.ceiling, inside: c.inside } : null;
    };
    if (dx === 0 && dz === 0) {
      const c = this.best(feet.x, feet.z, feet.y + 0.5) || this.highest(feet.x, feet.z);
      return c ? { x: feet.x, z: feet.z, floor: c.floor, ceiling: c.ceiling, inside: c.inside } : null;
    }
    return tryAt(feet.x + dx, feet.z + dz) || tryAt(feet.x + dx, feet.z) || tryAt(feet.x, feet.z + dz) || tryAt(feet.x, feet.z);
  }
}

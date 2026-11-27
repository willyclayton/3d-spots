// The Colosseum (Amphitheatrum Flavium) and its surroundings.
//
// World frame: x = east, y = up, z = south (metres). Origin = centre of the
// arena at arena-floor level, which is also the level of the travertine
// pavement around the building (≈ 21 m above sea level).
//
// Plan frame of the amphitheatre: u along the long axis (towards the eastern
// entrance), v along the short axis (towards the southern, imperial side).
// AXIS_BEARING turns it into the world frame: u = (sin B, -cos B) and
// v = (cos B, sin B) in world (x, z).
//
// Sources: Wikipedia and the Parco archeologico del Colosseo for the overall
// dimensions; the four-centred plan follows the 3-4-5 construction proposed
// for the building (the real curve may be an eight-centred oval or an
// ellipse; the difference is under a metre). The orientation, the storey
// heights, the seating profile and the positions of the surrounding monuments
// are approximate (± a few metres, the axis ± a few degrees).

export const SITE = {
  name: 'Colosseum',
  lat: 41.89021, lon: 12.49223,
  utcOffset: 1, timeZone: 'Europe/Rome',
  baseASL: 21,               // world y = 0  <=>  21 m above sea level
};

// Long axis, degrees clockwise from north, pointing to the eastern end.
// Estimated: the axis follows the valley towards the Temple of Venus and Roma.
export const AXIS_BEARING = 106;

// ---------------------------------------------------------------- plan --
// Four-centred oval: end arcs (radius r, centres on the long axis) and side
// arcs (radius R, centres on the short axis). The triangle joining an end
// centre, a side centre and the middle is a 3-4-5 triangle (k = 8 m), which
// makes the outline tangent-continuous. Every ring of the building is an
// offset of the outer one, so all its walls are normal to the curve and point
// at one of the four centres.
export const PLAN = {
  a: 94, b: 78,              // half axes of the outer façade: 188 × 156 m
  r: 62, R: 102,             // end and side arc radii (a - 4k, b + 3k)
  cavea: 51,                 // façade to arena wall: arena 86 × 54 m
  bays: 80,                  // 76 numbered arches + 4 axial entrances
};

// The cross-section, as distances in from the outer face of the façade.
export const RINGS = {
  facade: [0, 2.4],          // outer travertine wall (piers with half-columns)
  amb1: [2.4, 7.0],          // outer ambulatory
  ring2: [7.0, 9.2],         // second travertine arcade
  amb2: [9.2, 13.6],         // second ambulatory
  ring3: [13.6, 15.8],       // third ring of piers (tuff), start of the stairs
  radial: [15.8, 44.5],      // radial walls under the raking vaults of the seats
  amb3: [44.5, 47.6],        // inner ambulatory behind the podium
  podium: [47.6, 51.0],      // podium terrace and the arena wall
};

// Façade storeys (heights above the pavement). The ground arcade is taller
// than the two above it; the attic has pilasters and a window in every other bay.
export const STOREYS = [
  { order: 'tuscan', y0: 0, y1: 10.55, arch: [4.20, 7.05] },
  { order: 'ionic', y0: 10.55, y1: 22.35, arch: [4.20, 6.45] },
  { order: 'corinthian', y0: 22.35, y1: 34.15, arch: [4.20, 6.45] },
  { order: 'attic', y0: 34.15, y1: 48.50, window: [1.9, 2.6] },
];

// Seating (d = distance in from the façade, y = height of the step).
// Podium for senators; maenianum primum (equestrians); maenianum secundum
// imum and summum (citizens); maenianum summum in ligneis, wooden seats under
// the colonnade at the top (women, the poor and slaves).
export const SEATING = [
  { id: 'podium', d0: 51.0, d1: 47.6, y0: 4.0, y1: 4.0 },
  { id: 'primum', d0: 47.0, d1: 38.0, y0: 4.6, y1: 11.4 },
  { id: 'imum', d0: 37.0, d1: 27.5, y0: 13.0, y1: 20.0 },
  { id: 'summum', d0: 27.0, d1: 18.5, y0: 21.6, y1: 28.0 },
  { id: 'ligneis', d0: 16.5, d1: 9.4, y0: 30.6, y1: 36.0 },
];

// ------------------------------------------------------------- the bays --
// Bay k (0..79) runs counter-clockwise in plan, seen from above, starting at
// the eastern entrance (k = 0). Entrances are at k = 0 (east), 20 (north),
// 40 (west) and 60 (south, the emperor's side). The numbered arches run
// counter-clockwise from the south entrance: I..XIX up to the east entrance,
// XX..XXXVIII to the north one, XXXIX..LVII to the west, LVIII..LXXVI back to
// the south. Numbers survive carved above the arches XXIII to LIV.
export function bayNumber(k) {
  const q = ((k % 80) + 80) % 80;
  if (q % 20 === 0) return null;                       // axial entrance
  // k = 61 is I, then on round through 79 (XIX), 1 (XX) ...
  const steps = (q - 61 + 80) % 80;                    // bays after the south entrance
  return steps - Math.floor(steps / 20) + 1;
}

export const ENTRANCES = {
  0: { id: 'east', name: 'Eastern entrance', note: 'probably the Porta Libitinaria, towards the gladiators’ school' },
  20: { id: 'north', name: 'Northern entrance', note: 'the tribunal of honour for magistrates' },
  40: { id: 'west', name: 'Western entrance', note: 'probably the Porta Triumphalis, for the opening procession' },
  60: { id: 'south', name: 'Southern entrance', note: 'the emperor’s entrance to his box (pulvinar)' },
};

// What survives today, per bay, as the highest storey still standing on each
// ring (0 = nothing above the foundations, 4 = the full height with the attic).
// The outer ring stands on the north side between the two 19th-century
// buttresses: Stern's (1807) at the east end and Valadier's (1820s) at the
// west. On the south side the outer ring fell (earthquakes, the worst in
// 1349, then centuries of quarrying) and the second ring is the visible face.
export function survives(k, ring) {
  const q = ((k % 80) + 80) % 80;
  const north = q >= 4 && q <= 36;                     // the standing outer wall (XXIII..LIV)
  if (ring === 'facade') return north ? 4 : 0;
  if (ring === 'ring2') {
    if (north) return 4;
    // south side: two storeys stand for most of the way, three near the ends
    const fromEnd = Math.min(Math.abs(q - 3), Math.abs(q - 37), Math.abs(q - 83));
    return fromEnd < 4 ? 3 : 2;
  }
  if (ring === 'ring3') return north ? 3 : 2;
  return north ? 3 : 2;
}

export const BUTTRESSES = [
  { id: 'stern', bay: 3.5, name: 'Stern’s buttress', year: 1807, kind: 'brick wedge' },
  { id: 'valadier', bay: 36.5, name: 'Valadier’s buttress', year: 1824, kind: 'brick and travertine, stepped' },
];

// ------------------------------------------------------------ hypogeum --
// Domitian's two-level basement under the arena floor, about 6 m deep: a
// central corridor on the long axis, straight corridors either side of it,
// curved corridors following the arena, and a service corridor round the
// edge. 28 lifts lined the curved corridors under the Flavians (later 60).
export const HYPOGEUM = {
  depth: 6.2,
  level2: 3.0,               // floor of the upper storey of the basement
  halfU: 38.5, halfV: 22.5,  // extent (arena is 43 × 27)
  central: 3.4,              // width of the central corridor
  straight: [5.0, 9.6, 14.2], // centre lines (|v|) of the straight lateral corridors
  wall: 1.0,
  lifts: 28,
  galleries: [               // tunnels out under the seating
    { id: 'east', dir: 'u+', width: 3.2 },   // to the Ludus Magnus
    { id: 'west', dir: 'u-', width: 3.2 },
    { id: 'south', dir: 'v+', width: 2.6 },  // the "Passage of Commodus" to the emperor's box
    { id: 'north', dir: 'v-', width: 2.6 },
  ],
};

// ------------------------------------------------------ around the valley --
// Positions in world metres (from latitude and longitude, approximate).
export const AROUND = {
  archConstantine: { x: -138, z: 54, w: 25.9, d: 7.4, h: 21, bearing: 0 },
  metaSudans: { x: -94, z: 12, r: 8.8 },
  colossus: { x: -125, z: -44, w: 17.6, d: 14.8, h: 1.2 },
  venusRoma: { x: -301, z: -88, len: 145, wid: 100, bearing: AXIS_BEARING },
  ludusMagnus: { x: 155, z: 34, a: 31.5, b: 21, bearing: AXIS_BEARING },
};

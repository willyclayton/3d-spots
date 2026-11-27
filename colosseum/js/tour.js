// The Colosseum guided tour: a day at the games in 90 CE, much of it on
// foot — in through a numbered arch, round the corridor, up a staircase and
// out through a vomitorium on to the seats, a lion raised by lift and the
// gladiators' bout, then down into the hypogeum past the lifts and the cells
// where the gladiators waited — and finally the ruin as it stands today.
import * as THREE from 'three';
import { bayAlpha, ovalPoint, ovalNormal, toWorld, dirWorld } from './plan.js';

export function colosseumTour(app, { place, view, walkPath, cutaway }) {
  // world point of bay k at depth d (offset e across the bay), and of plan (u, v)
  const W = (k, d, e = 0) => {
    const al = bayAlpha(k);
    const [u, v] = ovalPoint(al, d);
    const [x, z] = toWorld(u - Math.sin(al) * e, v - Math.cos(al) * e);
    return new THREE.Vector3(x, 0, z);
  };
  const Pl = (u, v) => { const [x, z] = toWorld(u, v); return new THREE.Vector3(x, 0, z); };
  // compass heading (degrees, as walkPath wants) that faces the arena from bay k
  const inward = (k) => { const [nu, nv] = ovalNormal(bayAlpha(k)); const [dx, dz] = dirWorld(-nu, -nv); return (-Math.atan2(-dx, -dz) * 180) / Math.PI; };
  const along = (du, dv) => { const [dx, dz] = dirWorld(du, dv); return (-Math.atan2(-dx, -dz) * 180) / Math.PI; };
  const games = (from, opts) => () => { app.games.startAt(from, opts); };
  const lookTo = (yawDeg, pitch = 0) => () => { app.walk.yaw = -THREE.MathUtils.degToRad(yawDeg); app.walk.pitch = pitch; };
  const seq = (...fns) => async () => { for (const f of fns) await f(); };
  // fly to look at the action from `dist` metres off and `h` up, from the
  // middle of the arena (looking out towards the crowd), then keep following it
  const watch = (dist, h) => async () => {
    if (app.state.mode !== 'orbit') app.setMode('orbit');
    let c = null;
    for (let i = 0; i < 400 && !(c = app.games.actionCentre()); i++) await new Promise((r) => setTimeout(r, 50));
    c = c || new THREE.Vector2(0, 0);
    const dir = c.length() > 5 ? c.clone().multiplyScalar(-1).normalize() : new THREE.Vector2(0.6, 0.8);
    await app.flyTo(Pl(c.x + dir.x * dist, c.y + dir.y * dist).setY(h), Pl(c.x, c.y).setY(1));
    app.followGames(true);
  };
  const still = (stop) => ({ ...stop, run: seq(() => app.followGames(false), stop.run) });
  const K = 26;                                      // the bay we enter by: arch XLIV, a staircase bay

  return [
    { title: 'Rome, c. 90 CE', dur: 9, run: view('hero', { era: 'built' }),
      text: 'Ten years after Titus opened it, Domitian has finished the amphitheatre and its basement.' },
    { title: 'The Flavian Amphitheatre', dur: 9, run: place('colosseum'),
      text: '188 by 156 m, 48.5 m high: three arcades of columns and an attic, for some 50,000 people.' },
    { title: 'In by gate XLIV', dur: 4,
      run: walkPath(W(K, -16), inward(K), [W(K, -3), W(K, 1.2), W(K, 4.7)], { era: 'built', speed: 2.6 }),
      text: 'Each ground-floor arch carries a number; your token tells you which one to use.' },
    { title: 'Round the outer corridor', dur: 3,
      run: walkPath(W(K, 4.7), inward(K), [W(K + 0.5, 4.7), W(K + 1, 4.7), W(K + 1, 8.1), W(K + 1, 11.4), W(K + 0.5, 11.4), W(K, 11.4)], { era: 'built', speed: 2.4 }),
      text: 'Barrel-vaulted corridors ring every storey, between rings of travertine piers.' },
    { title: 'Up the stairs', dur: 3,
      run: walkPath(W(K, 11.4), inward(K), [W(K, 15.2), W(K, 22), W(K, 30), W(K, 36.6), W(K, 37.7)], { era: 'built', speed: 2.2 }),
      text: 'Thirty-eight steps between the radial walls, under the vaults that carry the seats.' },
    { title: 'Out of the vomitorium', dur: 10,
      run: seq(walkPath(W(K, 37.7), inward(K), [W(K, 37.9, 1.2), W(K, 38.9, 1.2)], { era: 'built', speed: 1.4 }), lookTo(inward(K), -0.22)),
      text: 'The stair spills you on to the walkway in front of the second tier. The crowd is in.' },
    { title: 'Seats by rank', dur: 9, run: place('cavea'),
      text: 'Senators on the podium, equestrians above, citizens higher, the poor at the top on wooden benches.' },
    { title: 'The morning: a beast hunt', dur: 14,
      run: seq(games('venatio', { beast: 'lion' }), place('trapdoors')),
      text: 'A trapdoor swings open, and a cage rises through the floor of the arena.' },
    { title: 'The lion and the venator', dur: 16, run: watch(16, 8),
      text: 'A beast fighter with a hunting spear sidesteps the charge.' },
    { title: 'How the animals came up', dur: 16,
      run: seq(cutaway({ target: 'amph', plane: 'z', offset: -18, flip: false }), games('venatio', { beast: 'bear' }), place('lifts')),
      text: 'Cut open: men turn a capstan on a timber deck; the rope hauls the cage up its shaft.' },
    { title: 'The afternoon: gladiators', dur: 14,
      run: seq(games('bout'), async () => { app.setSection(false, { instant: true }); await new Promise((r) => setTimeout(r, 2500)); }, watch(13, 6)),
      text: 'A secutor, all helmet and shield, against a retiarius with net and trident. A referee watches.' },
    { title: 'Mercy', dur: 12, run: watch(9, 4),
      text: 'Beaten, a fighter kneels and raises a finger to appeal. Most bouts did not end in death.' },
    { title: 'Down to the hypogeum', dur: 3,
      run: walkPath(W(20, 26.5), inward(20), [W(20, 29), W(20, 36), W(20, 43.6), W(20, 48), W(20, 52.6)], { era: 'built', speed: 2.2 }),
      text: 'A stair from the north side leads down under the arena floor.' },
    { title: 'The lift corridor', dur: 8,
      run: seq(walkPath(W(20, 52.6), inward(20), [W(20, 54.8), W(20, 56.2)], { era: 'built', speed: 1.8 }), lookTo(along(1, 0), 0.25)),
      text: 'Shafts, ropes and capstans: 28 lifts to the trapdoors above. Lamps burn in the gloom.' },
    { title: 'Where the gladiators waited', dur: 8,
      run: seq(walkPath(W(20, 56.2), inward(20), [W(20, 59.9), Pl(0, -13.7), Pl(0, -4.6), Pl(6.5, -4.6)], { era: 'built', speed: 1.8 }), lookTo(along(1, 0), 0)),
      text: 'Rooms and cages line the corridors. Fighters wait their turn with their weapons.' },
    { title: 'The central corridor', dur: 4,
      run: walkPath(Pl(6.5, -4.6), along(1, 0), [Pl(0, -4.6), Pl(0, 0), Pl(14, 0), Pl(28, 0)], { era: 'built', speed: 2.2 }),
      text: 'It runs the length of the arena, and out at the east towards the gladiators’ school.' },
    { title: 'The whole machine', dur: 12, run: cutaway({ target: 'amph', plane: 'x', offset: 2.0, flip: false }),
      text: 'Across the building: vaults, stairs, seats, podium, and the basement under the floor.' },
    { title: 'Along the long axis', dur: 12, run: cutaway({ target: 'amph', plane: 'z', offset: 0.5, flip: false }),
      text: 'The gates at both ends, the central corridor, and the tunnels beyond.' },
    { title: 'Today', dur: 10, run: view('hero', { era: 'today' }),
      text: 'Earthquakes and stone robbers took the south side; the arena floor is gone.' },
    { title: 'The open hypogeum', dur: 4,
      run: walkPath(W(20, 26.5), inward(20), [W(20, 36), W(20, 48), W(20, 52.6), W(20, 56.2), W(20, 59.9), Pl(0, -13.7), Pl(0, -4.6), Pl(8, -4.6)], { era: 'today', speed: 2.4 }),
      text: 'Today you can walk where the gladiators waited, under the open sky.' },
    { title: 'Looking up', dur: 8, run: lookTo(along(0, 1), 0.55),
      text: 'Brick walls of Domitian’s basement, and above them the seats and the surviving outer wall.' },
    { title: 'Your turn', dur: 0, run: view('default', { era: 'today' }),
      text: 'Use Places, Cutaway, Walk and 90 CE to explore on your own.' },
  ].map(still);
}

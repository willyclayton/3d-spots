// The Giza guided tour: flies over the plateau, cuts the Great Pyramid open
// and walks through al-Ma'mun's tunnel and up the Grand Gallery to the King's
// Chamber, then visits the other pyramids, the Sphinx, the temples and tombs.
import * as THREE from 'three';

export function gizaTour(app, { place, view, walkPath, cutaway }) {
  const info = app.pyr.info.khufu;
  const K = info.P;
  const er = info.ents.find((e) => e.id === 'robbers');
  const X = 7.29;
  const kw = (x, z) => new THREE.Vector3(K.cx + x, 0, K.cz + z);
  // routes through Khufu, in pyramid-local x/z; they use the robbers' tunnel, so today only
  const route = (start, yawDeg, pts, speed = 3.0) => walkPath(kw(...start), yawDeg, pts.map(([x, z]) => kw(x, z)), { speed, era: 'today' });

  return [
    { title: 'The Giza plateau', dur: 11, run: view('hero', { era: 'today' }),
      text: 'Three 4th-Dynasty kings built their pyramids here, about 2600–2500 BCE.' },
    { title: 'The Great Pyramid of Khufu', dur: 11, run: place('khufu'),
      text: '2.3 million blocks, 146.6 m tall: the world’s tallest building for 3,800 years.' },
    { title: 'The original entrance', dur: 10, run: place('k-entrance'),
      text: '17 m up the north face, under giant gable stones. A hidden corridor lies behind.' },
    { title: 'Cutting the pyramid open', dur: 12,
      run: cutaway({ target: 'khufu', plane: 'x', offset: 7.29, flip: false }),
      text: 'One passage drops into the bedrock; another climbs to the chambers.' },
    { title: 'The Subterranean Chamber', dur: 10, run: place('k-subterranean'),
      text: 'An unfinished room 30 m below the pyramid: the first plan, abandoned.' },
    { title: 'Through the robbers’ tunnel', dur: 3,
      run: route([er.u, -128], 180, [[er.u, -112], [er.u, -71.2], [6.3, -70.6], [X, -70.0], [X, -64]]),
      text: 'Visitors use a tunnel forced around 820 CE, past the granite plugs.' },
    { title: 'Up the Grand Gallery', dur: 3,
      run: route([X, -64], 180, [[X, -43.3], [X, -42.0], [X, -30]]),
      text: '8.6 m high, its walls stepping inward in seven courses.' },
    { title: 'The King’s Chamber', dur: 9,
      run: async () => {
        await route([X, -30], 180, [[X, -1.0], [X, 0.9], [X, 4.2], [X, 8.0], [4.6, 10.2], [3.4, 11.0]], 2.6)();
        app.walk.pitch = -0.22;
      },
      text: 'Built all of red granite. The empty sarcophagus sits at the west end.' },
    { title: 'Above the King’s Chamber', dur: 10, run: place('k-relieving'),
      text: 'Five granite compartments spread the weight. Graffiti here names Khufu.' },
    { title: 'Voids found by cosmic rays', dur: 10, run: place('k-bigvoid'),
      text: 'Muon imaging found a large hidden void here in 2017. Its shape is unknown.' },
    { title: 'The Queen’s Chamber', dur: 10, run: place('k-queen'),
      text: 'It never held a queen. Two narrow shafts climb to small stone doors.' },
    { title: 'The Pyramid of Khafre', dur: 10, run: place('khafre'),
      text: 'Khufu’s son built on higher ground. Its casing survives near the top.' },
    { title: 'Belzoni’s chamber', dur: 10, run: place('kh-burial'),
      text: 'Cut into bedrock under a gabled roof. Belzoni signed the wall in 1818.' },
    { title: 'The Pyramid of Menkaure', dur: 10, run: place('menkaure'),
      text: 'The smallest, with red granite at the base. The gash dates to 1196 CE.' },
    { title: 'Menkaure’s burial chamber', dur: 9, run: place('mk-burial'),
      text: 'A granite-lined room deep in the rock. Its sarcophagus sank at sea in 1838.' },
    { title: 'The Great Sphinx', dur: 11, run: place('sphinx'),
      text: 'A 73 m lion with a king’s head, carved from bedrock left in a quarry.' },
    { title: 'Temples and causeways', dur: 10, run: place('valley-khafre'),
      text: 'Each pyramid had a valley temple, linked by a causeway to its mortuary temple.' },
    { title: 'The cemeteries', dur: 10, run: place('west-field'),
      text: 'Streets of mastaba tombs for royals and officials.' },
    { title: 'Khufu’s ships', dur: 9, run: place('boat-pit'),
      text: 'A sealed pit here held a dismantled 43.6 m cedar ship, found in 1954.' },
    { title: 'The classic view', dur: 10, run: place('panorama'),
      text: 'From the south-west, all three pyramids line up.' },
    { title: 'As built, c. 2560 BCE', dur: 13, run: view('hero', { era: 'built' }),
      text: 'Polished white casing, complete temples, and the Nile in flood.' },
    { title: 'Your turn', dur: 0, run: view('default', { era: 'today' }),
      text: 'Use Places, Cutaway, Walk and 2560 BCE to explore on your own.' },
  
  ];
}

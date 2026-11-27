// Points of interest. Places in the amphitheatre are given in its plan frame
// (u along the long axis towards the east entrance, y up, v towards the
// south) and turned into world coordinates here; places around it use world
// coordinates, y = null meaning "on the ground".
// Interior places (struct: 'amph') only show in a cutaway, x-ray or on foot.
// prio: 1 = always shown, 2 = shown when closer, 3 = detail.
import { toWorld, ovalPoint, bayAlpha } from '../plan.js';
import { AROUND } from './site.js';

// world position of plan point (u, y, v)
const at = (u, y, v) => { const [x, z] = toWorld(u, v); return [x, y, z]; };
// world position of bay k at depth d (in from the façade) and height y
const bay = (k, d, y) => { const [u, v] = ovalPoint(bayAlpha(k), d); return at(u, y, v); };
// camera yaw (degrees, 0 = looking north) that looks at the building from bay k's side
const yawFrom = (k) => { const [u, v] = ovalPoint(bayAlpha(k), 0); const [x, z] = toWorld(u, v); return (Math.atan2(x, -z) * 180) / Math.PI; };

export const GROUPS = [
  { id: 'amph', name: 'The amphitheatre' },
  { id: 'inside', name: 'Inside' },
  { id: 'around', name: 'Around the valley' },
];

export const PLACES = [
  // ------------------------------------------------------- amphitheatre --
  {
    id: 'colosseum', name: 'Colosseum (Flavian Amphitheatre)', group: 'amph', kind: 'pyramid', prio: 1,
    world: at(0, 52, 0), view: { dist: 340, yaw: 200, pitch: 28, ty: -30 },
    desc: 'Vespasian began it around 70–72 CE on the site of the lake in Nero’s palace gardens; Titus opened it in 80 CE with a hundred days of games, and Domitian finished it. It is the largest amphitheatre ever built. About 50,000 spectators watched gladiators, animal hunts and executions here for more than four centuries. Its name in antiquity was the Flavian Amphitheatre; “Colosseum” probably comes from the colossal statue of Nero that stood beside it.',
    facts: [['Built', 'c. 70–80 CE, finished under Domitian (81–96)'], ['Size', '188 × 156 m, 48.5 m high'], ['Arena', 'about 86 × 54 m'], ['Spectators', 'about 50,000'], ['Stone', 'travertine outside, tuff and brick-faced concrete within'], ['Last games', 'animal hunts are recorded until 523 CE']],
  },
  {
    id: 'facade', name: 'The outer wall', group: 'amph', kind: 'temple', prio: 2,
    world: bay(26, -1, 24), view: { dist: 95, yaw: yawFrom(26), pitch: 10 },
    desc: 'Four storeys of travertine: three arcades framed by Tuscan, Ionic and Corinthian half-columns, then a solid attic with flat pilasters and a small window in every other bay. Only the northern part still stands. The holes that pock the stone were dug in the Middle Ages to prise out the iron clamps that held the blocks together.',
    facts: [['Arches', '80 on each of the three lower storeys'], ['Ground-floor arches', '4.2 m wide, 7.05 m high'], ['Height', '48.5 m']],
  },
  {
    id: 'arch-lii', name: 'Numbered arch LII', group: 'amph', kind: 'tomb', prio: 3,
    world: bay(34, -0.5, 8.8), view: { dist: 32, yaw: yawFrom(34), pitch: 6 },
    desc: 'Every ground-floor arch except the four on the axes carries a number, I to LXXVI, carved over it. A spectator’s token named the arch to enter by, then the stairs and the sector, so the crowd spread round the building and in through the right gate. Numbers XXIII to LIV survive on the northern side.',
  },
  {
    id: 'north-entrance', name: 'Northern entrance', group: 'amph', kind: 'temple', prio: 2,
    world: bay(20, -1, 5), view: { dist: 60, yaw: yawFrom(20), pitch: 8 },
    desc: 'One of four unnumbered entrances on the axes, kept for the emperor, the magistrates, the performers and the opening procession. They led straight to the arena or to the boxes on the short axis rather than to the stairs.',
  },
  {
    id: 'stern', name: 'Stern’s buttress', group: 'amph', kind: 'temple', prio: 2, era: 'today',
    world: bay(3, -6, 22), view: { dist: 85, yaw: yawFrom(2), pitch: 12 },
    desc: 'By 1800 the eastern end of the surviving outer wall was leaning outwards and threatened to fall. In 1807 the architect Raffaele Stern propped it with this great brick wedge, walling up the last arches, so the wall was saved as a ruin rather than rebuilt.',
    facts: [['Built', '1806–1807, under Pope Pius VII']],
  },
  {
    id: 'valadier', name: 'Valadier’s buttress', group: 'amph', kind: 'temple', prio: 2, era: 'today',
    world: bay(37, -6, 22), view: { dist: 85, yaw: yawFrom(38), pitch: 12 },
    desc: 'The western end was secured in the 1820s by Giuseppe Valadier, who continued the arcade in brick, stepping it down storey by storey, with travertine only for the key mouldings, so the repair reads as part of the building yet can be told apart from the original.',
    facts: [['Built', '1820s, under Popes Leo XII and Pius VII']],
  },
  {
    id: 'inner-ring', name: 'The inner ring (south side)', group: 'amph', kind: 'temple', prio: 2, era: 'today',
    world: bay(60, 8, 16), view: { dist: 110, yaw: yawFrom(60), pitch: 12 },
    desc: 'On the south side the outer wall is gone. It came down in earthquakes, the worst in 1349, and for centuries afterwards the fallen stone was quarried as building material for Roman churches and palaces. What you see here is the second ring of arches, once hidden inside the building.',
  },
  {
    id: 'cavea', name: 'The seating (cavea)', group: 'amph', kind: 'temple', prio: 2,
    world: bay(52, 32, 16), view: { dist: 120, yaw: yawFrom(12), pitch: 32, look: [0, 4, 0] },
    desc: 'The seats were assigned by rank. Senators sat on the podium at the front, equestrians in the first tier above them, citizens higher up, and at the very top, on wooden benches under a colonnade, women, the poor and slaves. The marble seats were carried off long ago; today you see the brick-faced walls and vaults that held them up.',
    facts: [['Tiers', 'podium, maenianum primum, secundum (imum and summum), summum in ligneis']],
  },
  {
    id: 'podium', name: 'The podium', group: 'amph', kind: 'tomb', prio: 3,
    world: bay(10, 49, 5), view: { dist: 40, yaw: yawFrom(50), pitch: 18 },
    desc: 'A broad terrace above the arena wall, about 4 m above the sand, where senators sat on their own chairs. A net and a fence protected them from the animals. Inscriptions carved in the 5th century reserved places here for named senators.',
  },
  {
    id: 'pulvinar', name: 'The emperor’s box', group: 'amph', kind: 'temple', prio: 3,
    world: bay(60, 49, 6), view: { dist: 55, yaw: yawFrom(20), pitch: 15 },
    desc: 'The imperial box (pulvinar) stood in the middle of the south side, on the short axis, so the emperor faced the magistrate who presided over the games from the box opposite. A private passage under the seating, later called the Passage of Commodus, led here from outside.',
  },
  {
    id: 'arena', name: 'The arena', group: 'amph', kind: 'temple', prio: 2,
    world: at(0, 2, 0), view: { dist: 95, yaw: yawFrom(12), pitch: 35 },
    desc: 'Harena is Latin for sand, which covered a wooden floor laid over the basement. Trapdoors in it let animals, scenery and fighters appear as if from nowhere. Today the floor has gone and the basement is open; a modern platform at the eastern end shows the level of the old floor.',
  },
  {
    id: 'hypogeum', name: 'The hypogeum', group: 'amph', kind: 'tomb', prio: 2,
    world: at(-14, -3, 7), view: { dist: 60, yaw: yawFrom(30), pitch: 48 },
    desc: 'A two-storey basement of corridors, cells and machinery, added under Domitian. Animals and gladiators waited here, and men turning capstans raised them in wooden lifts to the trapdoors. There were 28 lifts at first; after a fire in 217 CE the basement was rebuilt with about 60.',
    facts: [['Depth', 'about 6 m below the arena floor'], ['Lifts', '28 under the Flavians, about 60 later']],
  },
  {
    id: 'ambulatory', name: 'The outer corridors', group: 'inside', kind: 'chamber', prio: 2, struct: 'amph',
    local: bay(22, 4.7, 4), view: { dist: 40 },
    desc: 'Two vaulted corridors ran round the building on each storey. From them, stairs climbed to the gangways (vomitoria) that opened on to the seats, so that the whole crowd could find its place, and leave, within minutes.',
    section: { plane: 'x', offset: -10 },
  },
  {
    id: 'vaults', name: 'Raking vaults and radial walls', group: 'inside', kind: 'chamber', prio: 3, struct: 'amph',
    local: bay(-14, 30, 8), view: { dist: 55 },
    desc: 'The seating rests on 80 radial walls of tuff and brick-faced concrete, with sloping vaults between them that carried the steps. Stairs and passages run through them, and an inner corridor behind the podium led the senators to their seats.',
    section: { plane: 'x', offset: 6.5 },
  },

  // ------------------------------------------------------------ around --
  {
    id: 'arch-constantine', name: 'Arch of Constantine', group: 'around', kind: 'temple', prio: 1,
    world: [AROUND.archConstantine.x, 12, AROUND.archConstantine.z], view: { dist: 70, yaw: 20, pitch: 10 },
    desc: 'The Senate dedicated this triple arch in 315 CE to Constantine after his victory over Maxentius at the Milvian Bridge. Much of its sculpture was taken from monuments of Trajan, Hadrian and Marcus Aurelius, with the emperors’ heads recut as Constantine.',
    facts: [['Dedicated', '315 CE'], ['Height', 'about 21 m']],
  },
  {
    id: 'meta-sudans', name: 'Meta Sudans', group: 'around', kind: 'tomb', prio: 3,
    world: [AROUND.metaSudans.x, null, AROUND.metaSudans.z], view: { dist: 40, yaw: 120, pitch: 25 },
    desc: 'A tall conical fountain built under the Flavians, named after the turning posts (metae) of a circus and the water that “sweated” from it. Its brick core stood until 1936, when it was demolished for Mussolini’s parades; the outline of its basin is marked on the ground.',
  },
  {
    id: 'colossus', name: 'Base of the Colossus', group: 'around', kind: 'tomb', prio: 3,
    world: [AROUND.colossus.x, null, AROUND.colossus.z], view: { dist: 45, yaw: 140, pitch: 25 },
    desc: 'A bronze statue of Nero more than 30 m tall stood here after Hadrian moved it from the vestibule of Nero’s palace to make room for the Temple of Venus and Roma. Later emperors turned it into the sun god. Its base survived until 1936; its place is marked by a square of greenery.',
  },
  {
    id: 'venus-roma', name: 'Temple of Venus and Roma', group: 'around', kind: 'temple', prio: 2,
    world: [AROUND.venusRoma.x, null, AROUND.venusRoma.z], view: { dist: 160, yaw: 110, pitch: 20 },
    desc: 'The largest temple in Rome, designed by the emperor Hadrian himself and dedicated around 135 CE. Two cellas stood back to back: Venus facing the Colosseum, Roma facing the Forum.',
  },
  {
    id: 'ludus-magnus', name: 'Ludus Magnus', group: 'around', kind: 'tomb', prio: 2,
    world: [AROUND.ludusMagnus.x, null, AROUND.ludusMagnus.z], view: { dist: 90, yaw: 30, pitch: 35 },
    desc: 'The largest of the gladiators’ schools, built under Domitian. Gladiators trained and lived round a small practice arena with its own seating for spectators, and a tunnel is thought to have led from here into the Colosseum’s basement. Half of it was excavated in the 1930s and 1960s.',
  },
  {
    id: 'palatine', name: 'Palatine Hill', group: 'around', kind: 'pyramid', prio: 1,
    world: [-300, null, 220], view: { dist: 420, yaw: 60, pitch: 25 },
    desc: 'Where, by legend, Romulus founded Rome, and where the emperors built their palaces, the word “palace” comes from its name. The amphitheatre was built in the valley below it, on the drained site of Nero’s lake.',
  },
  {
    id: 'oppian', name: 'Oppian Hill and the Golden House', group: 'around', kind: 'pyramid', prio: 2,
    world: [180, null, -260], view: { dist: 380, yaw: 200, pitch: 25 },
    desc: 'Part of Nero’s Golden House (Domus Aurea), built after the fire of 64 CE, survives buried under the Oppian Hill, later covered by the Baths of Trajan. The Flavians gave the valley’s private lake back to the public by building the amphitheatre on it.',
  },
];

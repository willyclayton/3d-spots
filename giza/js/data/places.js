// Points of interest.  Interior places name their pyramid (struct) and use
// pyramid-local coordinates (x east, y above the pyramid base, z south);
// exterior places use world coordinates, with y = null meaning "on the
// ground".
// prio: 1 = always shown, 2 = shown when closer, 3 = detail.

export const GROUPS = [
  { id: 'pyramids', name: 'Pyramids' },
  { id: 'khufu', name: 'Inside the Great Pyramid' },
  { id: 'khafre', name: 'Inside Khafre' },
  { id: 'menkaure', name: 'Inside Menkaure' },
  { id: 'sphinx', name: 'Sphinx & temples' },
  { id: 'tombs', name: 'Tombs & cemeteries' },
  { id: 'around', name: 'Around the plateau' },
];

export const PLACES = [
  // ------------------------------------------------------------ pyramids --
  {
    id: 'khufu', name: 'Great Pyramid of Khufu', group: 'pyramids', kind: 'pyramid', prio: 1,
    world: [0, 150, 0], view: { dist: 520, yaw: 35, pitch: 18, ty: 50 },
    desc: 'Built for the 4th-Dynasty king Khufu (Cheops) around 2560 BCE, it was the tallest structure on Earth for nearly 3,800 years and is the only one of the Seven Wonders of the Ancient World still standing. Its sides are aligned to true north, south, east and west within a fraction of a degree. The smooth white limestone casing was stripped in the Middle Ages, exposing the stepped core you see today.',
    facts: [['Built', 'c. 2600–2560 BCE'], ['Height', '146.6 m originally, 138.5 m today'], ['Base', '230.3 m per side (440 royal cubits)'], ['Slope', '51° 50′'], ['Blocks', 'about 2.3 million'], ['Mass', 'about 6 million tonnes']],
  },
  {
    id: 'khafre', name: 'Pyramid of Khafre', group: 'pyramids', kind: 'pyramid', prio: 1,
    world: [-340, 160, 340], view: { dist: 500, yaw: 30, pitch: 16, ty: 55 },
    desc: 'Khufu’s son Khafre (Chephren) built the second pyramid on bedrock about 10 m higher, so it looks taller than the Great Pyramid even though it is slightly smaller. It is the only one that still keeps part of its original smooth casing, near the top. The bedrock was cut away on the north and west sides to level the court.',
    facts: [['Built', 'c. 2570 BCE'], ['Height', '143.5 m originally, 136.4 m today'], ['Base', '215.3 m per side'], ['Slope', '53° 10′'], ['Entered', '1818, by Giovanni Belzoni']],
  },
  {
    id: 'menkaure', name: 'Pyramid of Menkaure', group: 'pyramids', kind: 'pyramid', prio: 1,
    world: [-581, 80, 740], view: { dist: 260, yaw: 25, pitch: 14, ty: 25 },
    desc: 'The smallest of the three, built for Menkaure (Mycerinus). The lower sixteen courses were cased in red granite from Aswan, most of it never smoothed. The deep vertical gash in the north face was made in 1196 CE when Sultan al-Aziz Uthman tried to demolish the pyramid; his workers gave up after eight months.',
    facts: [['Built', 'c. 2510 BCE'], ['Height', '65.5 m originally, about 61 m today'], ['Base', '102.2 × 104.6 m'], ['Casing', 'red granite (lower 16 courses) and limestone']],
  },
  {
    id: 'queens-khufu', name: 'Queens’ Pyramids of Khufu', group: 'pyramids', kind: 'pyramid', prio: 2,
    world: [178, 34, 90], view: { dist: 170, yaw: 60, pitch: 20 },
    desc: 'Three small pyramids east of the Great Pyramid for Khufu’s queens. The northern one (G1-a) is often attributed to his mother Hetepheres I, the middle one (G1-b) to Meritites I, and the southern one (G1-c) to Henutsen. Each had its own small chapel on the east side.',
    facts: [['Bases', 'about 46–49.5 m'], ['Original height', 'about 29–30 m'], ['Numbers', 'G1-a, G1-b, G1-c']],
  },
  {
    id: 'queens-menkaure', name: 'Queens’ Pyramids of Menkaure', group: 'pyramids', kind: 'pyramid', prio: 2,
    world: [-600, 32, 842], view: { dist: 150, yaw: 20, pitch: 16 },
    desc: 'Three subsidiary pyramids south of Menkaure. The eastern one (G3-a) was a true pyramid, partly cased in granite; the other two (G3-b and G3-c) were left as step pyramids.',
    facts: [['G3-a base', '44.3 m'], ['G3-b, G3-c', 'step pyramids, about 31 m wide']],
  },
  {
    id: 'satellite', name: 'Satellite pyramid of Khufu', group: 'pyramids', kind: 'feature', prio: 3,
    world: [138, null, 112], view: { dist: 60, yaw: 40, pitch: 30 },
    desc: 'A small cult pyramid at the south-east corner of the Great Pyramid, found only in 1991. Just its foundation survives; part of its capstone (pyramidion) was recovered nearby.',
    facts: [['Base', '21.75 m'], ['Found', '1991–92']],
  },
  {
    id: 'mast', name: 'Summit of the Great Pyramid', group: 'pyramids', kind: 'feature', prio: 3,
    world: [0, 141, 0], view: { dist: 40, yaw: 30, pitch: 25 },
    desc: 'The top 8 m, including the capstone, are missing, leaving a platform about 10 m across. The metal mast was put up in 1874 by astronomers and marks the pyramid’s original height.',
    facts: [['Platform height', '138.5 m'], ['Original apex', '146.6 m']],
  },

  // ---------------------------------------------------- inside Khufu ------
  {
    id: 'k-entrance', name: 'Original entrance', group: 'khufu', kind: 'passage', prio: 2, struct: 'khufu', exterior: true,
    local: [7.29, 19.5, -99], view: { dist: 30, yaw: 12, pitch: 10 },
    desc: 'The true entrance is 17 m above the ground on the north face, 7.3 m east of the centre line. Two pairs of huge limestone gable stones (“chevrons”) above it spread the weight of the masonry. In antiquity it was hidden behind the casing.',
    facts: [['Height above base', '17 m'], ['Offset', '7.29 m east of centre']],
  },
  {
    id: 'k-robbers', name: 'Al-Ma’mun’s tunnel (visitor entrance)', group: 'khufu', kind: 'passage', prio: 2, struct: 'khufu', exterior: true, era: 'today',
    local: [-0.6, 8.5, -106], view: { dist: 28, yaw: 345, pitch: 8 }, walk: { local: [-0.6, 7.2, -100], yaw: 180 },
    desc: 'Tradition says the Caliph al-Ma’mun’s workmen forced this tunnel around 820 CE. Digging blindly into the masonry, they broke into the passage system just above the granite plugs. Visitors still enter the pyramid this way.',
    facts: [['Dug', 'c. 820 CE (traditionally)'], ['Length', 'about 35 m']],
  },
  {
    id: 'k-desc', name: 'Descending Passage', group: 'khufu', kind: 'passage', prio: 2, struct: 'khufu',
    local: [7.29, -6, -55], view: { dist: 40, yaw: 90, pitch: 5 }, walk: { local: [7.29, 2.2, -72], yaw: 180 },
    desc: 'A straight shaft 1.05 m wide and 1.2 m high running down at 26° 31′ for about 105 m, first through the masonry and then deep into the bedrock. It is remarkably straight: Petrie found its built section deviated from a true line by well under a centimetre.',
    facts: [['Length', 'about 105 m'], ['Angle', '26° 31′'], ['Size', '1.05 × 1.2 m']],
  },
  {
    id: 'k-subterranean', name: 'Subterranean Chamber', group: 'khufu', kind: 'chamber', prio: 1, struct: 'khufu',
    local: [1.5, -28, 5.5], view: { dist: 30, yaw: 90, pitch: 8 }, walk: { local: [6.5, -29.9, 3.0], yaw: 270 },
    desc: 'Cut 30 m below the pyramid into the bedrock and never finished: the floor is still rough with blocks of rock left standing. A pit in the floor and a dead-end passage leading south suggest the plan changed while it was being dug.',
    facts: [['Size', 'about 14 × 8.3 m, 3.5 m high'], ['Depth', 'about 30 m below the base']],
  },
  {
    id: 'k-plugs', name: 'Granite plugs', group: 'khufu', kind: 'feature', prio: 3, struct: 'khufu',
    local: [7.29, 7.0, -73.5], view: { dist: 16, yaw: 90, pitch: 10 },
    desc: 'Three granite blocks still seal the lower end of the Ascending Passage, exactly as they were slid down after the burial. They are why the robbers had to tunnel around them.',
    facts: [['Material', 'red granite'], ['Number', '3, about 1.6 m long each']],
  },
  {
    id: 'k-asc', name: 'Ascending Passage', group: 'khufu', kind: 'passage', prio: 2, struct: 'khufu',
    local: [7.29, 14, -57], view: { dist: 36, yaw: 90, pitch: 8 }, walk: { local: [7.29, 8.6, -68.5], yaw: 180 },
    desc: 'Rising at 26° from the plugs to the foot of the Grand Gallery, this low passage forces visitors to stoop for nearly 40 m. Its lower part passes through three “girdle stones”, blocks set across the passage.',
    facts: [['Length', 'about 39 m'], ['Angle', '26° 2′'], ['Size', '1.05 × 1.2 m']],
  },
  {
    id: 'k-gallery', name: 'Grand Gallery', group: 'khufu', kind: 'chamber', prio: 1, struct: 'khufu',
    local: [7.29, 35, -21], view: { dist: 48, yaw: 90, pitch: 6 }, walk: { local: [7.29, 24.0, -37.0], yaw: 180 },
    desc: 'One of the most remarkable spaces in ancient architecture: a sloping hall 46.7 m long and 8.6 m high whose walls step inward in seven corbelled courses, each projecting about 7.5 cm, to a roof only 1 m wide. Ramps run along both sides, with slots that may once have held timber beams.',
    facts: [['Length', '46.7 m'], ['Height', '8.6 m'], ['Width', '2.1 m at the floor, 1 m at the roof'], ['Corbels', '7 courses']],
  },
  {
    id: 'k-queen', name: 'Queen’s Chamber', group: 'khufu', kind: 'chamber', prio: 1, struct: 'khufu',
    local: [4.94, 24.8, 0], view: { dist: 26, yaw: 90, pitch: 8 }, walk: { local: [6.0, 21.25, -1.8], yaw: 200 },
    desc: 'Despite its name it was never a queen’s burial; Arab explorers named it for its gabled roof, used for women’s tombs in their time. It sits exactly on the pyramid’s east–west centre line. A tall corbelled niche is cut into the east wall.',
    facts: [['Size', '5.75 × 5.23 m'], ['Height', '6.23 m to the ridge'], ['Floor', '21.2 m above the base']],
  },
  {
    id: 'k-qshafts', name: 'Queen’s Chamber shafts', group: 'khufu', kind: 'feature', prio: 3, struct: 'khufu',
    local: [4.94, 55, 40], view: { dist: 80, yaw: 90, pitch: 5 },
    desc: 'Two 20 cm shafts found in 1872 by Waynman Dixon rise about 60 m into the masonry and stop. In 1993 the robot Upuaut-2 found a small stone slab with two copper pins blocking the southern one (“Gantenbrink’s door”); in 2011 the Djedi robot filmed red-painted marks behind it.',
    facts: [['Found', '1872'], ['Section', 'about 20 × 20 cm'], ['Blocked at', 'about 63 m']],
  },
  {
    id: 'k-well', name: 'Well shaft and grotto', group: 'khufu', kind: 'passage', prio: 3, struct: 'khufu',
    local: [6.4, 0, -38], view: { dist: 40, yaw: 90, pitch: 5 },
    desc: 'A rough, steep service shaft linking the foot of the Grand Gallery to the lower Descending Passage, about 60 m long. It may have been the escape route for the workmen who released the granite plugs. Part way down it passes through a natural cavity, the Grotto.',
    facts: [['Length', 'about 60 m'], ['Purpose', 'probably a workers’ escape route']],
  },
  {
    id: 'k-ante', name: 'Antechamber (portcullis chamber)', group: 'khufu', kind: 'chamber', prio: 3, struct: 'khufu',
    local: [7.29, 45.2, 4.3], view: { dist: 16, yaw: 90, pitch: 8 }, walk: { local: [7.29, 43.05, 3.2], yaw: 180 },
    desc: 'A small granite-lined room with grooves for three portcullis slabs that were lowered to block the way to the King’s Chamber. A double slab, the “granite leaf”, still hangs in the first groove.',
    facts: [['Length', '2.98 m'], ['Slots', '3 portcullises']],
  },
  {
    id: 'k-king', name: 'King’s Chamber', group: 'khufu', kind: 'chamber', prio: 1, struct: 'khufu',
    local: [3.2, 47, 11], view: { dist: 30, yaw: 90, pitch: 8 }, walk: { local: [6.6, 43.05, 9.0], yaw: 250 },
    desc: 'The burial chamber, lined entirely with red Aswan granite and roofed with nine granite beams of 25–80 tonnes each. It measures exactly 20 × 10 royal cubits. The lidless granite sarcophagus at the west end is slightly wider than the passage, so it must have been placed during construction.',
    facts: [['Size', '10.47 × 5.23 m, 5.84 m high'], ['Floor', '43 m above the base'], ['Material', 'red granite']],
  },
  {
    id: 'k-sarc', name: 'Khufu’s sarcophagus', group: 'khufu', kind: 'feature', prio: 3, struct: 'khufu',
    local: [-0.8, 44.3, 11], view: { dist: 9, yaw: 120, pitch: 20 },
    desc: 'A plain box of red granite, hollowed out with copper saws and abrasive sand. It was already empty and lidless when the first recorded explorers reached it.',
    facts: [['Size', '2.28 × 0.98 × 1.05 m']],
  },
  {
    id: 'k-kshafts', name: 'King’s Chamber shafts', group: 'khufu', kind: 'feature', prio: 3, struct: 'khufu',
    local: [2.6, 64, -25], view: { dist: 90, yaw: 90, pitch: 5 },
    desc: 'Two narrow shafts run from the King’s Chamber all the way to the outer faces. The southern one points roughly to the stars of Orion’s belt as they were in Khufu’s time, the northern one towards the circumpolar stars; whether they were for ventilation or for the king’s soul is debated.',
    facts: [['North shaft', 'about 32° 36′'], ['South shaft', 'about 45°']],
  },
  {
    id: 'k-relieving', name: 'Relieving chambers', group: 'khufu', kind: 'chamber', prio: 2, struct: 'khufu',
    local: [3.2, 57, 11], view: { dist: 36, yaw: 90, pitch: 10 },
    desc: 'Five low compartments above the King’s Chamber, separated by granite beams and capped by a pointed limestone roof, spread the enormous load of the pyramid. Nathaniel Davison found the lowest in 1765; Howard Vyse blasted his way into the other four in 1837 and found painted workers’ graffiti naming the gangs, including Khufu’s cartouche.',
    facts: [['Compartments', '5'], ['Found', '1765 and 1837']],
  },
  {
    id: 'k-bigvoid', name: 'Big Void (ScanPyramids, 2017)', group: 'khufu', kind: 'feature', prio: 2, struct: 'khufu', void: true,
    local: [7.29, 62, -20], view: { dist: 60, yaw: 90, pitch: 10 },
    desc: 'In 2017 the ScanPyramids team used cosmic-ray muons to detect a large void above the Grand Gallery, at least 30 m long. Its exact shape, slope and purpose are unknown; the volume shown here is only indicative.',
    facts: [['Detected', '2017, muon imaging'], ['Length', 'at least 30 m'], ['Status', 'unexplored']],
  },
  {
    id: 'k-nfc', name: 'North Face Corridor (2023)', group: 'khufu', kind: 'passage', prio: 3, struct: 'khufu',
    local: [7.29, 26, -87], view: { dist: 22, yaw: 90, pitch: 6 },
    desc: 'A hidden corridor about 9 m long and 2 m wide behind the chevron stones over the entrance, detected by muon imaging and confirmed in 2023 when an endoscope was pushed through a joint. It has a gabled roof like the chevrons.',
    facts: [['Confirmed', 'March 2023'], ['Size', 'about 9 × 2.1 × 2.1 m']],
  },

  // ---------------------------------------------------- inside Khafre -----
  {
    id: 'kh-upper', name: 'Upper entrance', group: 'khafre', kind: 'passage', prio: 3, struct: 'khafre', exterior: true,
    local: [6.0, 13, -96], view: { dist: 30, yaw: 12, pitch: 10 },
    desc: 'The main entrance, 11.5 m up the north face. The passage is lined with granite where it runs through the masonry and then levels out in the bedrock.',
    facts: [['Height', '11.5 m above the base'], ['Angle', 'about 26°']],
  },
  {
    id: 'kh-lower', name: 'Lower entrance', group: 'khafre', kind: 'passage', prio: 3, struct: 'khafre', exterior: true,
    local: [6.0, 1, -113], view: { dist: 26, yaw: 20, pitch: 22 },
    desc: 'A second entrance cut into the pavement in front of the pyramid. Its passage dives into the rock, passes a subsidiary chamber and climbs again to join the upper passage.',
    facts: [['Angle', 'about 21° 40′']],
  },
  {
    id: 'kh-burial', name: 'Burial chamber (Belzoni’s chamber)', group: 'khafre', kind: 'chamber', prio: 1, struct: 'khafre',
    local: [0, 3, 0], view: { dist: 30, yaw: 90, pitch: 8 }, walk: { local: [5.0, -1.15, -1.5], yaw: 260 },
    desc: 'Cut into the bedrock and roofed with a pointed gable of huge limestone beams. When Giovanni Belzoni broke in on 2 March 1818 he found the granite sarcophagus sunk into the floor, open, with its lid broken. His name is still painted on the south wall.',
    facts: [['Size', '14.15 × 5 m, 6.83 m high'], ['Entered', '2 March 1818']],
  },
  {
    id: 'kh-sub', name: 'Subsidiary chamber', group: 'khafre', kind: 'chamber', prio: 3, struct: 'khafre',
    local: [-2.6, -11.5, -75.3], view: { dist: 26, yaw: 90, pitch: 10 },
    desc: 'A gabled room off the lower passage, as long as Khufu’s King’s Chamber. Its purpose is unknown; it may have held burial equipment or served a ritual role.',
    facts: [['Size', 'about 10.4 × 3.1 m']],
  },

  // -------------------------------------------------- inside Menkaure -----
  {
    id: 'mk-panel', name: 'Panelled chamber', group: 'menkaure', kind: 'chamber', prio: 3, struct: 'menkaure',
    local: [0, -8.6, -18], view: { dist: 18, yaw: 90, pitch: 10 },
    desc: 'The first decorated room in any Giza pyramid: its walls are carved with the recessed “palace façade” panelling usually found on royal tombs and false doors.',
    facts: [['Decoration', 'palace-façade panels']],
  },
  {
    id: 'mk-ante', name: 'Antechamber', group: 'menkaure', kind: 'chamber', prio: 2, struct: 'menkaure',
    local: [0, -6.5, -2], view: { dist: 26, yaw: 90, pitch: 8 }, walk: { local: [0.5, -9.85, -3.2], yaw: 180 },
    desc: 'A long rock-cut hall beyond three granite portcullises. Above its north wall opens an earlier passage that was abandoned when the plan was enlarged.',
    facts: [['Size', '14.2 × 3.84 m, 4.87 m high']],
  },
  {
    id: 'mk-niches', name: 'Chamber of the six niches', group: 'menkaure', kind: 'chamber', prio: 3, struct: 'menkaure',
    local: [-7.6, -12, 1], view: { dist: 16, yaw: 90, pitch: 12 },
    desc: 'A small room with four niches in its east wall and two in its south wall, perhaps for storing the king’s canopic jars or burial goods.',
    facts: [['Niches', '6']],
  },
  {
    id: 'mk-burial', name: 'Granite burial chamber', group: 'menkaure', kind: 'chamber', prio: 1, struct: 'menkaure',
    local: [-11, -11, -1], view: { dist: 20, yaw: 90, pitch: 10 }, walk: { local: [-10.2, -13.2, 1.5], yaw: 0 },
    desc: 'Lined with granite, with a pointed ceiling carved to imitate a barrel vault. Howard Vyse found a basalt sarcophagus decorated with palace panelling here in 1837; it was lost at sea in 1838 when the ship Beatrice sank off Spain on the way to the British Museum.',
    facts: [['Size', 'about 6.6 × 2.6 m'], ['Sarcophagus', 'lost at sea, 1838']],
  },

  // ------------------------------------------------- sphinx & temples -----
  {
    id: 'sphinx', name: 'Great Sphinx', group: 'sphinx', kind: 'monument', prio: 1,
    world: [340, -20, 434], view: { dist: 105, yaw: 128, pitch: 13, ty: -12 },
    desc: 'A lion with a king’s head, carved from the bedrock left standing in a quarry, most likely for Khafre. Its soft lower layers have eroded far more than the harder head. The nose was deliberately chiselled off, probably in the 14th century CE. Between the paws stands the Dream Stele of Thutmose IV (c. 1400 BCE).',
    facts: [['Length', '73 m'], ['Height', '20 m'], ['Face', '4.1 m wide'], ['Material', 'living bedrock, with later masonry repairs']],
  },
  {
    id: 'sphinx-temple', name: 'Sphinx Temple', group: 'sphinx', kind: 'temple', prio: 2,
    world: [395, null, 425], view: { dist: 85, yaw: 100, pitch: 32 },
    desc: 'An unfinished temple directly in front of the Sphinx, built from limestone blocks quarried out of the Sphinx enclosure itself. Its open court had 24 pillars.',
    facts: [['Builder', 'Khafre (probably)']],
  },
  {
    id: 'valley-khafre', name: 'Valley Temple of Khafre', group: 'sphinx', kind: 'temple', prio: 2,
    world: [375, null, 471], view: { dist: 90, yaw: 140, pitch: 32 },
    desc: 'One of the best-preserved Old Kingdom buildings: a massive limestone core faced with polished red granite, with a T-shaped hall of granite pillars and a travertine floor. Auguste Mariette found the famous diorite statue of Khafre protected by Horus here in 1860.',
    facts: [['Facing', 'red granite'], ['Statue found', '1860']],
  },
  {
    id: 'causeway-khafre', name: 'Causeway of Khafre', group: 'sphinx', kind: 'feature', prio: 2,
    world: [90, null, 396], view: { dist: 220, yaw: 160, pitch: 25 },
    desc: 'A roofed processional corridor almost 500 m long that linked the valley temple at the edge of the floodplain with the mortuary temple at the foot of the pyramid.',
    facts: [['Length', 'about 494 m']],
  },
  {
    id: 'mortuary-khafre', name: 'Mortuary Temple of Khafre', group: 'sphinx', kind: 'temple', prio: 3,
    world: [-176, null, 340], view: { dist: 110, yaw: 110, pitch: 30 },
    desc: 'The temple where the king’s cult was maintained, built against the east face of his pyramid with walls of enormous limestone blocks, some weighing over 400 tonnes.',
    facts: [['Largest blocks', 'over 400 tonnes']],
  },
  {
    id: 'mortuary-khufu', name: 'Mortuary Temple of Khufu', group: 'sphinx', kind: 'temple', prio: 3,
    world: [135, null, 0], view: { dist: 90, yaw: 100, pitch: 35 },
    desc: 'Almost nothing remains of Khufu’s temple except part of its black basalt pavement and the cuttings for its walls. A causeway once led from here down to the valley.',
    facts: [['Pavement', 'basalt']],
  },
  {
    id: 'menkaure-temples', name: 'Temples of Menkaure', group: 'sphinx', kind: 'temple', prio: 3,
    world: [-506, null, 740], view: { dist: 100, yaw: 100, pitch: 30 },
    desc: 'Menkaure died before his temples were finished; they were completed in mudbrick by his successor Shepseskaf. The valley temple yielded the celebrated slate triads and the pair statue of Menkaure and his queen.',
    facts: [['Completed by', 'Shepseskaf']],
  },

  // -------------------------------------------------- tombs & cemeteries --
  {
    id: 'west-field', name: 'Western Cemetery', group: 'tombs', kind: 'tomb', prio: 2,
    world: [-300, null, -110], view: { dist: 260, yaw: 200, pitch: 35 },
    desc: 'Rows of stone mastaba tombs laid out like a town for the officials and relatives of Khufu’s court. The largest, G 4000, belonged to Hemiunu, the vizier often credited with directing the Great Pyramid’s construction.',
    facts: [['Tombs', 'several hundred mastabas'], ['Largest', 'G 4000 (Hemiunu)']],
  },
  {
    id: 'east-field', name: 'Eastern Cemetery', group: 'tombs', kind: 'tomb', prio: 2,
    world: [300, null, 60], view: { dist: 240, yaw: 120, pitch: 35 },
    desc: 'Huge double mastabas built for Khufu’s sons and daughters, such as Kawab, Hordjedef and Ankhhaf, arranged in neat streets east of the queens’ pyramids.',
    facts: [['Occupants', 'the royal family of Khufu']],
  },
  {
    id: 'hetepheres', name: 'Tomb of Hetepheres I (G 7000x)', group: 'tombs', kind: 'tomb', prio: 3,
    world: [204, null, -6], view: { dist: 40, yaw: 120, pitch: 40 },
    desc: 'In 1925 the tripod of the Reisner expedition’s photographer sank into plaster that sealed a 27 m shaft. At the bottom lay the burial equipment of Khufu’s mother: gilded furniture, a canopy, jewellery and an alabaster sarcophagus, which turned out to be empty.',
    facts: [['Found', '1925'], ['Shaft', 'about 27 m deep']],
  },
  {
    id: 'khentkaus', name: 'Tomb of Queen Khentkaus I', group: 'tombs', kind: 'tomb', prio: 3,
    world: [92, null, 662], view: { dist: 90, yaw: 140, pitch: 25 },
    desc: 'A giant two-stepped tomb, partly carved from bedrock, for a queen titled “mother of two kings of Upper and Lower Egypt”, a pivotal figure between the 4th and 5th Dynasties.',
    facts: [['Dynasty', 'late 4th']],
  },
  {
    id: 'boat-pit', name: 'Khufu ship pits', group: 'tombs', kind: 'feature', prio: 2,
    world: [0, null, 133], view: { dist: 70, yaw: 170, pitch: 35 },
    desc: 'In 1954 Kamal el-Mallakh found a sealed pit here containing a dismantled cedar ship 43.6 m long. Reassembled, it was moved to the Grand Egyptian Museum in 2021. The second pit beside it held another ship, now being restored.',
    facts: [['Found', '1954'], ['Ship length', '43.6 m'], ['Wood', 'Lebanese cedar']],
  },
  {
    id: 'boat-pits-east', name: 'Boat-shaped pits', group: 'tombs', kind: 'feature', prio: 3,
    world: [140, null, -62], view: { dist: 80, yaw: 110, pitch: 40 },
    desc: 'Huge boat-shaped pits flank Khufu’s mortuary temple and causeway. They were found empty, but may once have held ships for the king’s journey in the afterlife.',
    facts: [['Number', 'five around the temple and causeway']],
  },
  {
    id: 'workers-tombs', name: 'Tombs of the pyramid builders', group: 'tombs', kind: 'tomb', prio: 3,
    world: [40, null, 905], view: { dist: 90, yaw: 160, pitch: 30 },
    desc: 'Discovered in 1990 when a horse stumbled on a mudbrick wall. Overseers and workers were buried here near the pyramids they built, with their titles, which shows they were paid workers, not slaves.',
    facts: [['Found', '1990']],
  },

  // ------------------------------------------------- around the plateau ---
  {
    id: 'wall-crow', name: 'Wall of the Crow', group: 'around', kind: 'feature', prio: 3,
    world: [212, null, 852], view: { dist: 140, yaw: 170, pitch: 25 },
    desc: 'A massive stone wall about 200 m long and 10 m high, with a tall gateway, separating the sacred plateau from the workers’ town to the south.',
    facts: [['Length', 'about 200 m'], ['Height', 'about 10 m']],
  },
  {
    id: 'workers-town', name: 'Lost City of the Pyramid Builders', group: 'around', kind: 'feature', prio: 3,
    world: [280, null, 960], view: { dist: 200, yaw: 170, pitch: 35 },
    desc: 'Excavations since 1988 have uncovered a planned town (Heit el-Ghurab) with bakeries, breweries, storerooms and long galleries that probably housed rotating crews of workers.',
    facts: [['Excavated', 'since 1988 (AERA)']],
  },
  {
    id: 'quarry', name: 'Khufu’s quarry', group: 'around', kind: 'feature', prio: 3,
    world: [135, null, 262], view: { dist: 220, yaw: 150, pitch: 35 },
    desc: 'Most of the core blocks were cut from the local limestone right here, just south of the Great Pyramid, and dragged up ramps to the building site. The worked-out quarry floor later became a cemetery.',
    facts: [['Stone', 'local Mokattam limestone']],
  },
  {
    id: 'panorama', name: 'Panorama viewpoint', group: 'around', kind: 'modern', prio: 2, era: 'today',
    world: [-660, null, 1330], view: { dist: 30, yaw: 200, pitch: 10, look: [-345, 50, 370] },
    desc: 'A desert terrace south-west of the pyramids with the classic view of all three in a row, often with camels in the foreground.',
    facts: [],
  },
  {
    id: 'gem', name: 'Grand Egyptian Museum', group: 'around', kind: 'modern', prio: 2, era: 'today',
    world: [-1455, 25, -1710], view: { dist: 600, yaw: 210, pitch: 15 },
    desc: 'Opened in full in November 2025, about 2 km from the pyramids. It houses the complete Tutankhamun collection and the reassembled Khufu ship.',
    facts: [['Opened', '2025']],
  },
];

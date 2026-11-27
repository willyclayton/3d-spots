# 3D Spots

Explorable 3D maps of the world's great places, served as a static site on GitHub Pages.

- **[Giza Pyramids](giza/)**: live
- **[Colosseum](colosseum/)**: preview, in progress
- Petra, Eiffel Tower: coming soon

No build step. Everything is plain ES modules; [three.js r170](vendor/three) and
[polygon-clipping](vendor/polygon-clipping.js) are vendored, so the site works without any CDN.

## Giza

An explorable model of the Giza plateau:

- **Real terrain** from SRTM elevation data (AWS Terrain Tiles), with the archaeology sculpted in:
  the levelled pyramid courts, the Sphinx enclosure, the causeway beds and Khufu's quarry.
- **The three pyramids, block by block.** Each course is split into individual stones with
  their own set-back, eroded edges, colour and missing blocks. The scene also has Khufu's
  chevron entrance and summit mast, Khafre's surviving casing cap, Menkaure's granite
  casing and the 1196 CE gash in its north face, plus the queens' and satellite pyramids.
- **Every known chamber and passage**: Khufu's descending passage, Subterranean Chamber,
  granite plugs, ascending passage, Grand Gallery (7 corbels), Queen's Chamber and niche,
  well shaft and grotto, antechamber with the granite leaf, King's Chamber and sarcophagus,
  the five relieving chambers, all four "air shafts", the 2023 North Face Corridor and the 2017
  Big Void; Khafre's two entrances, Belzoni's chamber and the subsidiary chamber; Menkaure's
  panelled chamber, antechamber, niche chamber and granite burial chamber.
- **Guided tour**: a narrated walkthrough of everything, about 5 minutes. It flies over the
  plateau, cuts the pyramids open, and walks you automatically through al-Ma'mun's tunnel, up
  the Grand Gallery and into the King's Chamber, then visits Khafre, Menkaure, the Sphinx,
  the temples and tombs, and ends with the monuments as built. Back / Pause / Next; touching
  the view pauses it.
- **Cutaway**: slice any pyramid north–south or east–west at any position. The cut faces,
  with their courses and joints, and the bedrock pit below are rebuilt live.
- **X-ray**: see-through stone with the passages glowing through the ground.
- **Three ways to move**: *Explore* (orbit, pan and zoom like a map; double-click or
  double-tap to fly to a spot; W A S D to pan), *Fly* (free flight over the whole site:
  W A S D, Q / E down and up, drag to look; on touch a joystick plus climb buttons; speed
  grows with height) and *Walk* (first-person, with collision, through the robbers' tunnel
  and up the Grand Gallery to the King's Chamber, or into the bedrock). Camera moves glide
  between places, rising on long trips; the Home button returns to the whole site.
- **Today / 2560 BCE**: weathered ruins and modern Giza, or polished Tura casing, complete
  temples and causeways, and the Nile in flood.
- **The real sun**: solar position for Giza on any date and time, with a physical sky,
  image-based lighting and shadows.
- **Atmosphere and weathering**: height-based haze that thickens near the ground and glows
  toward the sun, a filmic colour grade, rain streaks and drifted sand on the stone, darker
  joints and inside corners between the steps, soft contact shading around every monument,
  loose stones and rubble, date palms, the stepped Khufu quarry, and a rippling Nile flood.
- **About 50 labelled places** with short map labels that stay out of the way (a few at a
  time, never over the controls, hidden while the view moves fast), a one-line summary with
  details on demand, search and shareable links (`?place=k-king`).

### URL parameters

| Parameter | Example | Effect |
|---|---|---|
| `tour` | `?tour=1` | start the guided tour (at stop N with `?tour=N`) |
| `place` | `?place=sphinx` | open a place |
| `walk` | `?walk=k-gallery` | start walking at a place |
| `section` | `?section=khufu,x,7.29` | cutaway: pyramid, plane (`x` = N–S, `z` = E–W), offset in m |
| `era` | `?era=built` | start in 2560 BCE |
| `xray` | `?xray=1` | x-ray on |
| `t` | `?t=17.2` | local time (hours) |
| `q` | `?q=low` | quality: `low`, `medium`, `high` |
| `view` | `?view=panorama` | preset camera (`default`, `khufu`, `sphinx`, `panorama`, `hero`, `sw`, `entrance`) |

### Accuracy notes

Dimensions follow Petrie's survey and later work (Maragioglio & Rinaldi, Lehner, ScanPyramids).
Khufu's interior is the most precise. The layouts inside Khafre and Menkaure, the positions of the
smaller monuments, and the shape of the Big Void (whose true form is unknown) are approximate.

## Colosseum (preview)

The Flavian Amphitheatre in its valley between the Palatine, Caelian and Oppian hills:

- **Generated bay by bay** on a four-centred oval (the 3-4-5 construction): 188 × 156 m outside,
  86 × 54 m arena, 80 bays. Every ring is an offset of the façade, so the radial walls follow the
  curve's normals.
- **The façade**: three arcades framed by Tuscan, Ionic and Corinthian half-columns with their
  entablatures, the attic with pilasters, windows and the consoles for the awning masts. Arches
  carry their numbers in the data (I–LXXVI, counter-clockwise from the south entrance).
- **Inside**: the second and third rings, the ambulatory floors, 80 radial walls, the stepped
  seating in four tiers, the podium and arena wall, and Domitian's hypogeum (corridors, cells,
  the basement floor; the 28 Flavian lifts in 90 CE).
- **Today / 90 CE**: the ruin (the north side standing to full height between Stern's and
  Valadier's buttresses, the south side down to the inner ring, the marble seats gone, the arena
  open with the modern platform at the east end) or the complete building with marble seats and a
  sanded arena floor.
- **Cutaway** across or along the building, at any position, with solid cut faces; x-ray.
- **Places and a short tour** of the building and its neighbours (Arch of Constantine, Meta Sudans,
  the Colossus base, the Temple of Venus and Roma, the Ludus Magnus).

Still to come: walking inside, the surroundings modelled (the neighbouring monuments, the
modern city, trees), the awning, statues and colour of 90 CE.

Accuracy: the overall dimensions are well established; the orientation of the long axis (set to
a bearing of 106°, `AXIS_BEARING` in `colosseum/js/data/site.js`), the storey heights, the seating
profile, the hypogeum layout and the positions of the surrounding monuments are approximate. The
elevation tiles are too coarse for the narrow valley, so its floor is sculpted along the streets.

## Code

### Layout

```
index.html                 hub page
shared/app/                the app every spot runs on
  shell.js                 SpotApp: renderer, camera, Explore / Fly / Walk, flights, places, labels,
                           cutaway / x-ray / era switches, lighting, frame loop; a spot subclasses it
  ui.js                    toolbar, places list, info card, settings, help, compass, walk HUD
  tour.js                  guided-tour engine
shared/engine/             sky & sun, atmosphere, labels, walking (controller + walkable world),
                           flying, heightfields, materials, geometry helpers
shared/ui.css              shared UI styles
giza/index.html            the Giza page
giza/js/main.js            Giza's SpotApp subclass: config, scene build and site hooks
giza/js/data/              site layout (site.js) and places with descriptions (places.js)
giza/js/pyramid(s).js      block-level pyramid generator and assembly
giza/js/interiors/         chambers & passages (one file per pyramid) + builder
giza/js/section.js         cutaway tool
giza/js/complex.js         temples, causeways, mastabas, boat pits, city / flood plain
giza/js/sphinx*.js         Sphinx (signed distance field, meshed in a Web Worker)
giza/js/tour.js            the tour's stops
giza/data/terrain.png      processed elevation model
giza/textures/             procedural PBR textures
colosseum/js/main.js       the Colosseum's SpotApp subclass
colosseum/js/data/         plan, rings, storeys, seating, survival per bay (site.js) and places
colosseum/js/plan.js       the four-centred oval, its offsets, bays, plan <-> world
colosseum/js/amphitheatre.js  the bay-by-bay generator (both eras)
colosseum/js/section.js    clip-plane cutaway with solid cut faces
colosseum/js/terrain.js    hills from the heightmap, the valley floor and streets sculpted
tools/                     generators for the terrain and textures (Python + numpy)
```

### Adding a spot

Make `<spot>/index.html` from `giza/index.html` (the markup the shared UI expects), subclass
`SpotApp` in `<spot>/js/main.js` with the spot's config and `build()`, and override the hooks
listed at the top of `shared/app/shell.js` that concern its monuments. Add the spot's
coordinates to `SITES` in `tools/gen_terrain.py` for its heightmap.

### Regenerating data

```
python3 tools/gen_terrain.py giza          # downloads SRTM tiles, writes giza/data/terrain.png
python3 tools/gen_terrain.py colosseum     # writes colosseum/data/terrain.png
python3 tools/gen_textures.py              # writes giza/textures/*.jpg
python3 tools/gen_textures.py colosseum    # writes colosseum/textures/*.jpg
```

Run locally with any static server, e.g. `python3 -m http.server`, then open `http://localhost:8000/`.

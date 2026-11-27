# 3D Spots

Explorable 3D maps of the world's great places, served as a static site on GitHub Pages.

- **[Giza Pyramids](giza/)**: live
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
- **Walk mode**: first-person, with collision, through the robbers' tunnel and up the
  Grand Gallery to the King's Chamber, or into the bedrock. Works with keyboard and mouse,
  or with a touch joystick.
- **Today / 2560 BCE**: weathered ruins and modern Giza, or polished Tura casing, complete
  temples and causeways, and the Nile in flood.
- **The real sun**: solar position for Giza on any date and time, with a physical sky,
  image-based lighting and shadows.
- **About 50 labelled places** with descriptions and facts, search, shareable links (`?place=k-king`).

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

### Layout

```
index.html                 hub page
shared/engine/             reusable for future spots: sky & sun, labels, walking, geometry helpers
shared/ui.css              shared UI styles
giza/index.html            the Giza app
giza/js/data/              site layout (site.js) and places with descriptions (places.js)
giza/js/pyramid(s).js      block-level pyramid generator and assembly
giza/js/interiors/         chambers & passages (one file per pyramid) + builder
giza/js/section.js         cutaway tool
giza/js/complex.js         temples, causeways, mastabas, boat pits, city / flood plain
giza/js/sphinx*.js         Sphinx (signed distance field, meshed in a Web Worker)
giza/data/terrain.png      processed elevation model
giza/textures/             procedural PBR textures
tools/                     generators for the terrain and textures (Python + numpy)
```

### Regenerating data

```
python3 tools/gen_terrain.py     # downloads SRTM tiles, writes giza/data/terrain.png
python3 tools/gen_textures.py    # writes giza/textures/*.jpg
```

### Accuracy notes

Dimensions follow Petrie's survey and later work (Maragioglio & Rinaldi, Lehner, ScanPyramids).
Khufu's interior is the most precise. The layouts inside Khafre and Menkaure, the positions of the
smaller monuments, and the shape of the Big Void (whose true form is unknown) are approximate.

Run locally with any static server, e.g. `python3 -m http.server`, then open `http://localhost:8000/`.

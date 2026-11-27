// The Colosseum: scene and site hooks for the shared app shell
// (shared/app/shell.js).
import * as THREE from 'three';
import { SpotApp } from '../../shared/app/shell.js';
import { SITE, PLAN, RINGS, STOREYS } from './data/site.js';
import { PLACES, GROUPS } from './data/places.js';
import { loadTextures } from './materials.js';
import { Terrain } from './terrain.js';
import { buildAmphitheatre } from './amphitheatre.js';
import { SectionTool } from './section.js';
import { toPlan, ringCoords, toWorld, dirWorld } from './plan.js';
import { colosseumTour } from './tour.js';

const SHORT = {
  colosseum: 'Colosseum', 'arch-constantine': 'Arch of Constantine', 'arch-lii': 'Arch LII',
  'north-entrance': 'North entrance', 'inner-ring': 'Inner ring', 'venus-roma': 'Venus and Roma',
  oppian: 'Oppian Hill', palatine: 'Palatine', pulvinar: 'Emperor’s box', vaults: 'Vaults',
  ambulatory: 'Corridors', colossus: 'Colossus base',
};

const CONFIG = {
  id: 'colosseum', name: 'Rome',
  site: { lat: SITE.lat, lon: SITE.lon, utcOffset: SITE.utcOffset, timeZone: SITE.timeZone },
  atmosphere: { groundY: -6, scaleHeight: 240 },
  bounds: { x0: -900, x1: 900, z0: -800, z1: 900 },
  fly: { margin: 500, yMax: 1800 },
  maxDistance: 2600,
  hour: 14.3,
  views: {
    default: [[260, 150, 330], [0, 12, 0]],
    hero: [[-330, 120, 210], [0, 18, 0]],
    north: [[60, 30, -260], [0, 25, 0]],
    south: [[-40, 40, 240], [0, 18, 0]],
    arena: [[30, 70, 60], [0, -2, 0]],
    forum: [[-620, 60, -330], [0, 20, 0]],
    portrait: [[340, 260, 520], [0, 10, 0]],
  },
  places: PLACES, groups: GROUPS, shortNames: SHORT,
  section: { target: 'amph', plane: 'x', labels: { x: 'Move cut  W ↔ E', z: 'Move cut  N ↔ S' } },
  eras: { today: { short: 'Today', long: 'Today' }, built: { short: '90 CE', long: 'As built, c. 90 CE' } },
  walkFallback: [0, -150],
};

class Colosseum extends SpotApp {
  constructor() { super(CONFIG); }

  async build(progress) {
    const { scene, renderer, quality } = this;
    progress(0.05, 'Loading textures');
    await loadTextures(new THREE.LoadingManager(), renderer, 'textures/');
    progress(0.2, 'Reading the elevation of the seven hills');
    const terrain = new Terrain();
    await terrain.load('data/terrain.png');
    terrain.buildMasks();
    progress(0.3, 'Levelling the valley'); await this.nextFrame();
    const t = terrain.build(quality);
    const tmat = terrain.material();
    const ground = new THREE.Mesh(t.geometry, tmat); ground.receiveShadow = true; ground.name = 'terrain';
    const skirt = new THREE.Mesh(t.skirt, tmat); skirt.name = 'terrain-skirt';
    scene.add(ground, skirt);

    progress(0.45, 'Raising 80 arches'); await this.nextFrame();
    const today = buildAmphitheatre({ era: 'today', quality });
    progress(0.7, 'Seating 50,000 Romans'); await this.nextFrame();
    const built = buildAmphitheatre({ era: 'built', quality });
    built.group.visible = false;
    scene.add(today.group, built.group);

    Object.assign(this, { terrain, ground, skirt, amph: { today, built } });
    this.section = new SectionTool({ groups: [today.group, built.group] });
    progress(0.9, 'Opening the gates'); await this.nextFrame();
  }

  // ------------------------------------------------------------ walking --
  configureWorld(world) {
    // the building is solid for now (walking inside comes with its floors)
    world.blockedAt = (x, z) => {
      const [u, v] = toPlan(x, z);
      const d = ringCoords(u, v).d;
      return d > -0.8 && d < PLAN.cavea + 0.5;
    };
  }

  walkDefault() {
    // on the piazza north-west of the building, looking at the façade
    const [x, z] = toWorld(-70, -95);
    const pos = new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
    return { pos, yaw: Math.atan2(x, z), hint: 'Walk round the outside; inside comes later' };
  }

  structFrame() { return { cx: 0, baseY: 0, cz: 0 }; }
  structName() { return 'Colosseum'; }

  // the masonry, as a solid ring, for label occlusion and the orbit camera
  solidAt(pt) {
    if (pt.y < 0.5) return false;
    const [u, v] = toPlan(pt.x, pt.z);
    const d = ringCoords(u, v).d;
    if (d < 0.5 || d > PLAN.cavea) return false;
    return pt.y < this.cavHeight(d) - 1;
  }

  // the top of the building at depth d (the attic, then the seating rake)
  cavHeight(d) {
    if (d < RINGS.facade[1]) return STOREYS[3].y1;
    if (d < RINGS.amb2[1]) return STOREYS[2].y1;
    return 4 + (PLAN.cavea - d) * 0.72;
  }

  keepOutOfStone(p, margin = 1.5) {
    const [u, v] = toPlan(p.x, p.z);
    const { d } = ringCoords(u, v);
    if (d < -margin || d > PLAN.cavea + margin) return;
    const top = this.cavHeight(Math.max(0, d)) + margin;
    if (p.y > top) return;
    // in the wall zone: out through the façade, or up over the seating
    if (d < RINGS.amb1[1] && d < top - p.y) {
      const [nx, nz] = dirWorld(u, v);
      const l = Math.hypot(nx, nz) || 1;
      p.x += (nx / l) * (d + margin); p.z += (nz / l) * (d + margin);
    } else if (d >= RINGS.amb1[1] && p.y < top) p.y = top;
  }

  pickables() { return [this.ground, this.amph.today.group, this.amph.built.group]; }

  viewInterior(p) {
    const plane = p.section?.plane || 'x';
    const offset = p.section?.offset ?? this.section.defaultOffset('amph', plane);
    this.setSection(true, { target: 'amph', plane, offset, flip: false }, false);
    const target = this.placeWorldPos(p);
    const vp = this.section.viewpoint();
    const dir = new THREE.Vector3(...vp.pos).sub(new THREE.Vector3(...vp.target)).normalize();
    const d = ((p.view && p.view.dist) || 40) * this.fitScale();
    return { pos: target.clone().addScaledVector(dir, d), target };
  }

  applyEra(era) {
    const today = era === 'today';
    this.amph.today.group.visible = today;
    this.amph.built.group.visible = !today;
    this.terrain.uniforms.uEra.value = today ? 0 : 1;
  }

  // x-ray: the masonry turns see-through
  applyXray(on) {
    for (const g of [this.amph.today.group, this.amph.built.group]) {
      g.traverse((m) => {
        if (!m.isMesh) return;
        const mat = m.material;
        if (on) { mat.userData.x = mat.userData.x || { t: mat.transparent, o: mat.opacity, d: mat.depthWrite }; mat.transparent = true; mat.opacity = 0.22; mat.depthWrite = false; }
        else if (mat.userData.x) { const c = mat.userData.x; mat.transparent = c.t; mat.opacity = c.o; mat.depthWrite = c.d; }
        mat.needsUpdate = true;
        m.castShadow = !on;
      });
    }
  }

  interiorLit() { return true; }

  tourStops(h) { return colosseumTour(this, h); }
}

new Colosseum().start();

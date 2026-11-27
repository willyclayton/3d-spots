// Loads the Sphinx meshes (generated in a worker) and the Dream Stele.
import * as THREE from 'three';
import { SPHINX } from './data/site.js';
import { TEX } from './materials.js';
import { addBox, GeoBuilder } from '../../shared/engine/geo.js';

export function triplanarRock(tile = 6) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tR = { value: TEX.rock }; sh.uniforms.tRN = { value: TEX.rockN }; sh.uniforms.tL = { value: TEX.limestone };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform sampler2D tR, tRN, tL;')
      .replace('#include <map_fragment>', `
        vec3 bw = pow(abs(normalize(vWN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 tx = texture2D(tR, vWP.zy / ${tile.toFixed(1)}).rgb, ty = texture2D(tL, vWP.xz / 2.5).rgb, tz = texture2D(tR, vWP.xy / ${tile.toFixed(1)}).rgb;
        diffuseColor.rgb *= (tx * bw.x + ty * bw.y + tz * bw.z) * 1.35;`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 n1 = texture2D(tRN, vWP.zy / ${tile.toFixed(1)}).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(tRN, vWP.xy / ${tile.toFixed(1)}).xyz * 2.0 - 1.0;
          vec3 Nw = normalize(vWN);
          vec3 pert = vec3(0.0, n1.y, n1.x) * bw.x + vec3(n3.x, n3.y, 0.0) * bw.z;
          Nw = normalize(Nw + pert * 0.6);
          normal = normalize((viewMatrix * vec4(Nw, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'triplanar' + tile;
  return m;
}

export function loadSphinx(quality = 'high') {
  const group = new THREE.Group(); group.name = 'sphinx';
  group.position.set(SPHINX.cx, SPHINX.baseY, SPHINX.cz);
  const mat = triplanarRock(6);
  const res = quality === 'low' ? 0.42 : quality === 'medium' ? 0.32 : 0.24;
  const meshes = {};
  const worker = new Worker(new URL('./sphinx-worker.js', import.meta.url));
  const make = (d) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(d.Col, 3));
    g.setIndex(new THREE.BufferAttribute(d.I, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.name = d.built ? 'sphinx-built' : 'sphinx-today';
    return m;
  };
  const ready = new Promise((resolve) => {
    let pending = 2;
    worker.onmessage = (e) => {
      const m = make(e.data);
      meshes[e.data.built ? 'built' : 'today'] = m;
      m.visible = e.data.built ? group.userData.era === 'built' : group.userData.era !== 'built';
      group.add(m);
      if (--pending === 0) { worker.terminate(); resolve(meshes); }
    };
  });
  worker.postMessage({ built: false, res });
  worker.postMessage({ built: true, res: res * 1.15 });
  // Dream Stele of Thutmose IV between the paws (c. 1400 BCE)
  const g = new GeoBuilder();
  addBox(g, 22.2, 0, -1.15, 22.85, 3.6, 1.15, [0.75, 0.62, 0.6]);
  const stele = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ map: TEX.granite, color: 0xcfa79c, roughness: 0.5, vertexColors: true }));
  stele.castShadow = stele.receiveShadow = true;
  stele.name = 'dream-stele';
  group.add(stele);
  group.userData.setEra = (era) => {
    group.userData.era = era;
    if (meshes.today) meshes.today.visible = era !== 'built';
    if (meshes.built) meshes.built.visible = era === 'built';
    stele.visible = era !== 'built';
  };
  return { group, ready };
}

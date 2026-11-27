// Physical sky + sun for a real location: solar position from date/time,
// Preetham sky, image-based lighting regenerated from the sky, horizon-matched
// fog, and a sun shadow that follows the area of interest.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, smoothstep, lerp } from './util.js';

const RAD = Math.PI / 180;

// Low-precision solar position (accurate to ~0.1°).  Returns altitude and
// azimuth (from north, clockwise) in radians.
export function solarPosition(dateUTC, lat, lon) {
  const d = (dateUTC.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  let gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  if (gmst < 0) gmst += 24;
  const lst = gmst * 15 + lon;
  const ha = (lst - ra / RAD) * RAD;
  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { alt, az: (az + 2 * Math.PI) % (2 * Math.PI), dec };
}

// Hours of sunrise / sunset (local clock) for the given day.
export function dayLength(dateLocalMidnightUTC, lat, lon, utcOffset) {
  let rise = null, set = null, prev = null;
  for (let m = 0; m <= 24 * 60; m += 5) {
    const t = new Date(dateLocalMidnightUTC.getTime() + (m - utcOffset * 60) * 60000);
    const { alt } = solarPosition(t, lat, lon);
    if (prev !== null) {
      if (prev < -0.833 * RAD && alt >= -0.833 * RAD && rise === null) rise = m / 60;
      if (prev >= -0.833 * RAD && alt < -0.833 * RAD) set = m / 60;
    }
    prev = alt;
  }
  return { rise: rise ?? 6, set: set ?? 18 };
}

// Hours ahead of UTC in an IANA time zone at a given instant (daylight saving
// included), or null if the browser cannot tell.
export function zoneOffset(timeZone, date) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return Math.round((asUTC - Math.floor(date.getTime() / 60000) * 60000) / 900000) / 4;
  } catch (e) { return null; }
}

export class SkySystem {
  // timeZone (IANA name) sets the clock for each date, daylight saving
  // included; utcOffset is the fallback when the browser cannot tell.
  constructor(renderer, scene, { lat, lon, utcOffset = 0, timeZone = null, shadowSize = 4096 } = {}) {
    this.renderer = renderer; this.scene = scene;
    this.lat = lat; this.lon = lon; this.utcOffset = utcOffset;
    this.timeZone = timeZone; this.baseOffset = utcOffset;
    this.sky = new Sky();
    this.sky.scale.setScalar(400000);
    this.sky.frustumCulled = false;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 8; u.rayleigh.value = 1.2;
    u.mieCoefficient.value = 0.0055; u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 4000;
    this.sun.shadow.bias = -0.0002;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0xb39b78, 0.6);
    scene.add(this.hemi);

    this.fog = new THREE.FogExp2(0xc9cdd0, 0.00017);
    scene.fog = this.fog;
    this.fogBase = 0.00013;

    // environment
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.envRT = null;
    this.lastEnvDir = new THREE.Vector3(0, -1, 0);
    this.cubeRT = new THREE.WebGLCubeRenderTarget(16, { type: THREE.HalfFloatType });
    this.cubeCam = new THREE.CubeCamera(1, 2000, this.cubeRT);
    this.envScene.add(this.cubeCam);

    this.interior = 0;           // 0 outdoors .. 1 deep inside (eye adaptation)
    this.exposureBase = 0.62;
    this.envDay = 0.46;
    this.date = new Date();
    this.hours = 15.5;
    this.updateOffset();
  }

  // the site's UTC offset on the current date (at local noon)
  updateOffset() {
    if (!this.timeZone) return;
    const d = this.date;
    const o = zoneOffset(this.timeZone, new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12 - this.baseOffset)));
    this.utcOffset = o ?? this.baseOffset;
  }

  // the date and time (hours) on the clock at the site right now
  siteNow() {
    const now = new Date();
    const o = this.timeZone ? zoneOffset(this.timeZone, now) ?? this.baseOffset : this.baseOffset;
    const t = new Date(now.getTime() + o * 3600000);
    return { date: new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()), hours: t.getUTCHours() + t.getUTCMinutes() / 60 };
  }

  setDate(d) { this.date = d; this.updateOffset(); this.apply(); }

  setLocalTime(hours) { this.hours = hours; this.apply(); }

  utcDate() {
    const d = this.date;
    const mid = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return new Date(mid + (this.hours - this.utcOffset) * 3600000);
  }

  dayInfo() {
    const d = this.date;
    return dayLength(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), this.lat, this.lon, this.utcOffset);
  }

  apply() {
    const { alt, az } = solarPosition(this.utcDate(), this.lat, this.lon);
    this.alt = alt; this.az = az;
    const ca = Math.cos(alt);
    this.sunDir.set(Math.sin(az) * ca, Math.sin(alt), -Math.cos(az) * ca).normalize();
    const u = this.sky.material.uniforms, ue = this.envSky.material.uniforms;
    for (const uu of [u, ue]) {
      uu.sunPosition.value.copy(this.sunDir);
      uu.turbidity.value = u.turbidity.value; uu.rayleigh.value = u.rayleigh.value;
      uu.mieCoefficient.value = u.mieCoefficient.value; uu.mieDirectionalG.value = u.mieDirectionalG.value;
    }
    const altDeg = alt / RAD;
    const day = smoothstep(-4, 6, altDeg);
    const low = 1 - smoothstep(2, 32, altDeg);
    // sun colour: warm near the horizon (Mie + Rayleigh extinction)
    const c = new THREE.Color().setRGB(1.0, lerp(0.95, 0.55, low), lerp(0.88, 0.32, low));
    this.sun.color.copy(c);
    this.sunIntensity = 4.2 * day * lerp(1, 0.6, low * low);
    this.sun.intensity = this.sunIntensity * (1 - this.interior);
    // the sky dome itself comes from the environment map; the hemisphere light
    // only adds warm light bounced off the sand (upward-facing surfaces get none)
    this.hemiIntensity = lerp(0.05, 0.55, day) * lerp(1, 0.75, low);
    this.hemi.intensity = this.hemiIntensity * (1 - this.interior * 0.97);
    this.hemi.color.setRGB(0.10, 0.11, 0.13);
    this.hemi.groundColor.setRGB(0.80, 0.62, 0.42);
    this.needsEnv = true;
  }

  // Regenerate IBL + fog colour (throttled by caller)
  updateEnvironment() {
    if (!this.needsEnv) return;
    this.needsEnv = false;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 2000);
    this.scene.environment = this.envRT.texture;
    // horizon colour for fog
    this.cubeCam.update(this.renderer, this.envScene);
    const buf = new Uint16Array(16 * 4);
    try { this.renderer.getContext().getError(); } catch (e) { /* ignore */ }
    let r = 0, g = 0, b = 0, n = 0;
    for (const face of [0, 1, 4, 5]) {
      this.renderer.readRenderTargetPixels(this.cubeRT, 0, 7, 16, 1, buf, face);
      for (let i = 0; i < 16; i++) {
        r += THREE.DataUtils.fromHalfFloat(buf[i * 4]);
        g += THREE.DataUtils.fromHalfFloat(buf[i * 4 + 1]);
        b += THREE.DataUtils.fromHalfFloat(buf[i * 4 + 2]);
        n++;
      }
    }
    r /= n; g /= n; b /= n;
    if (!(r + g + b > 1e-4) || !isFinite(r + g + b)) {
      // read-back not supported on this GPU: estimate the horizon colour
      const alt = this.alt / RAD, low = 1 - smoothstep(0, 25, alt), day = smoothstep(-6, 4, alt);
      r = lerp(0.78, 1.05, low) * day; g = lerp(0.82, 0.72, low) * day; b = lerp(0.88, 0.55, low) * day;
    }
    // the sky shader output is pre-tonemapping radiance; scale into scene units
    const k = 0.9;
    this.horizon = new THREE.Color(r * k, g * k, b * k);
    this.applyFog();
  }

  applyFog() {
    if (!this.horizon) return;
    const inside = this.interior;
    this.fog.color.copy(this.horizon).multiplyScalar(1 - inside * 0.98);
    this.scene.environmentIntensity = (lerp(this.envDay, 0.02, inside) * smoothstep(-6, 4, this.alt / RAD) + 0.03);
  }

  setInterior(v) {
    this.interior = v;
    this.sun.intensity = this.sunIntensity * (1 - v);
    this.hemi.intensity = this.hemiIntensity * (1 - v * 0.97);
    this.applyFog();
  }

  // Fit the shadow frustum around a focus point with texel snapping.
  fitShadow(center, radius) {
    const cam = this.sun.shadow.camera;
    const r = clamp(radius, 25, 1300);
    const size = this.sun.shadow.mapSize.x;
    const texel = (2 * r) / size;
    const dir = this.sunDir.y > 0.02 ? this.sunDir : new THREE.Vector3(0.3, 0.02, -0.5).normalize();
    // light basis
    const zA = dir.clone();
    const xA = new THREE.Vector3(0, 1, 0).cross(zA).normalize();
    if (xA.lengthSq() < 1e-6) xA.set(1, 0, 0);
    const yA = zA.clone().cross(xA).normalize();
    let px = center.dot(xA), py = center.dot(yA);
    const pz = center.dot(zA);
    px = Math.round(px / texel) * texel; py = Math.round(py / texel) * texel;
    const c = xA.clone().multiplyScalar(px).add(yA.clone().multiplyScalar(py)).add(zA.clone().multiplyScalar(pz));
    const dist = Math.max(600, r * 2.5);
    this.sun.position.copy(c).addScaledVector(dir, dist);
    this.sun.target.position.copy(c);
    this.sun.target.updateMatrixWorld();
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 1; cam.far = dist + r * 2 + 300;
    cam.updateProjectionMatrix();
    this.sun.shadow.normalBias = texel * 1.2;
    this.sun.shadow.bias = -0.00015;
  }
}

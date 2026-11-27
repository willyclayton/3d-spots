// Atmosphere and film look, installed globally by patching three.js shader
// chunks (call before any material is compiled).
//
//  * Aerial perspective: haze that thickens with distance and is densest
//    near the ground (exponential height falloff), so valleys and the far
//    city fade while the sky above stays clear.
//  * Sun-tinted haze: looking toward the sun, the haze glows with the sun's
//    colour (forward scattering).
//  * Film grade: ACES with a touch more saturation, a gentle S-curve and a
//    slightly warm balance (use renderer.toneMapping = THREE.CustomToneMapping).
import * as THREE from 'three';

export function installAtmosphere({ groundY = -45, scaleHeight = 320, sunGlow = 0.55 } = {}) {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
    varying float vFogDepth;
    varying vec3 vFogView;
    varying float vFogWorldY;
  #endif`;
  C.fog_vertex = `#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vFogView = mvPosition.xyz;
    vFogWorldY = ( transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) ).y;
  #endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth;
    varying vec3 vFogView;
    varying float vFogWorldY;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
  #endif`;
  C.fog_fragment = `#ifdef USE_FOG
    #ifdef FOG_EXP2
      float fDist = length( vFogView );
      // mean haze density along the ray for an exponential atmosphere
      float fy0 = max( cameraPosition.y - ( ${groundY.toFixed(1)} ), 0.0 );
      float fy1 = max( vFogWorldY - ( ${groundY.toFixed(1)} ), 0.0 );
      float fe0 = exp( - fy0 / ${scaleHeight.toFixed(1)} ), fe1 = exp( - fy1 / ${scaleHeight.toFixed(1)} );
      float fdy = fy1 - fy0;
      float fAvg = abs( fdy ) > 0.5 ? ${scaleHeight.toFixed(1)} * ( fe0 - fe1 ) / fdy : fe0;
      fAvg = 0.25 + 0.75 * clamp( fAvg, 0.0, 1.0 );
      float fogFactor = 1.0 - exp( - pow( fogDensity * fDist * fAvg * 1.45, 1.45 ) );
    #else
      float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    vec3 fogCol = fogColor;
    #if defined( STANDARD ) && NUM_DIR_LIGHTS > 0
      vec3 sunC = directionalLights[ 0 ].color;
      float sunPeak = max( sunC.r, max( sunC.g, sunC.b ) );
      if ( sunPeak > 1e-3 ) {
        float sd = max( dot( normalize( vFogView ), directionalLights[ 0 ].direction ), 0.0 );
        fogCol = mix( fogCol, fogCol * ( sunC / sunPeak ) * 1.7, pow( sd, 7.0 ) * ${sunGlow.toFixed(2)} );
      }
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
  #endif`;
  C.tonemapping_pars_fragment = C.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `vec3 CustomToneMapping( vec3 color ) {
      vec3 c = ACESFilmicToneMapping( color );
      float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
      c = mix( vec3( l ), c, 1.07 );                       // a little richer colour
      c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.18 );       // gentle S-curve
      c *= vec3( 1.018, 1.0, 0.972 );                      // warm desert light
      return saturate( c );
    }`,
  );
}

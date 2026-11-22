/**
 * Particle shaders. Positions arrive in CSS pixels; the vertex shader does the projection.
 *
 * Every particle blends three states:
 *   prev    where it was when the current regroup started (viewport pixels)
 *   A, B    the page's two layouts, morphed by uMorph (home: name -> first cover on scroll)
 * uRegroup runs 0 -> 1 after a navigation or at start-up, moving particles from prev to A/B.
 * Keep `displayedState` in scene.ts in step with this maths.
 */

export const vertexShader = /* glsl */ `
  uniform vec2 uViewport;
  uniform float uDpr;
  uniform float uScroll;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPointerStrength;
  uniform float uMorph;
  uniform float uRegroup;
  uniform float uFadeOnArrival;

  uniform float uFactorA;
  uniform float uFactorB;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorPrev;
  uniform float uAlphaA;
  uniform float uAlphaB;
  uniform float uAlphaPrev;
  uniform float uSizeA;
  uniform float uSizeB;
  uniform float uSizePrev;
  uniform float uDensityA;
  uniform float uDensityB;
  uniform float uDensityPrev;

  attribute vec2 aA;
  attribute vec2 aB;
  attribute vec2 aPrev;
  attribute vec3 aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  const float PI = 3.14159265;

  float visible(float density) {
    return 1.0 - smoothstep(density - 0.02, density, aSeed.x);
  }

  void main() {
    vec2 dir = normalize(aSeed.xy - 0.5 + 0.0001);
    float m = uMorph;
    float r = uRegroup;

    // Morph between the page's layouts, bursting outward halfway through.
    vec2 posA = aA - vec2(0.0, uScroll * uFactorA);
    vec2 posB = aB - vec2(0.0, uScroll * uFactorB);
    vec2 current = mix(posA, posB, m) + dir * sin(PI * m) * (60.0 + 240.0 * aSeed.z);

    // Regroup from where the particles were, swirling sideways on the way.
    vec2 pos = mix(aPrev, current, r) + vec2(-dir.y, dir.x) * sin(PI * r) * (40.0 + 160.0 * aSeed.z);

    // A slow breathing drift, so the shape never looks frozen.
    pos += vec2(sin(uTime * 0.7 + aSeed.x * 6.2831), cos(uTime * 0.6 + aSeed.y * 6.2831)) * (0.6 + 1.2 * aSeed.z);

    // Particles near the cursor drift toward it.
    vec2 toPointer = uPointer - pos;
    pos += toPointer * uPointerStrength * 0.4 * (1.0 - smoothstep(0.0, 180.0, length(toPointer)));

    vec3 colorNow = mix(uColorA, uColorB, m);
    float alphaNow = mix(uAlphaA, uAlphaB, m) * (1.0 - uFadeOnArrival * smoothstep(0.8, 1.0, m));
    float sizeNow = mix(uSizeA, uSizeB, m);
    float densityNow = mix(visible(uDensityA), visible(uDensityB), m);

    vColor = mix(uColorPrev, colorNow, r);
    vAlpha = mix(uAlphaPrev * visible(uDensityPrev), alphaNow * densityNow, r);
    gl_PointSize = mix(uSizePrev, sizeNow, r) * (0.7 + 0.6 * aSeed.z) * uDpr;
    gl_Position = vec4(pos.x / uViewport.x * 2.0 - 1.0, 1.0 - pos.y / uViewport.y * 2.0, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = (1.0 - smoothstep(0.35, 0.5, d)) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

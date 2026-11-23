/**
 * Particle shaders. Positions arrive in CSS pixels; the vertex shader does the projection.
 *
 * Every particle blends three states:
 *   prev    where it was when the current regroup started (viewport pixels), with its
 *           own size and opacity at that moment (aPrevStyle)
 *   A, B    the page's two layouts, morphed by uMorph (home: name + field -> first cover)
 * uRegroup runs 0 -> 1 after a navigation or at start-up, moving particles from prev to A/B.
 *
 * Layout A can hold an ambient field (home hero): particles ranked at or above uFieldFrom
 * drift sideways across uFieldRect, are drawn smaller and fainter, and part around the
 * cursor and get swept along in its wake. The other particles lean toward the cursor.
 *
 * Keep `displayedState` in scene.ts in step with this maths.
 */

export const FIELD_ALPHA = 0.45;
export const FIELD_SIZE = 0.75;

export const vertexShader = /* glsl */ `
  uniform vec2 uViewport;
  uniform float uDpr;
  uniform float uScroll;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform vec2 uPointerVelocity;
  uniform float uPointerStrength;
  uniform float uMorph;
  uniform float uRegroup;
  uniform float uFadeOnArrival;

  uniform float uFieldFrom;
  uniform vec4 uFieldRect;

  uniform float uFactorA;
  uniform float uFactorB;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorPrev;
  uniform float uAlphaA;
  uniform float uAlphaB;
  uniform float uSizeA;
  uniform float uSizeB;
  uniform float uDensityA;
  uniform float uDensityB;

  attribute vec2 aA;
  attribute vec2 aB;
  attribute vec2 aPrev;
  attribute vec2 aPrevStyle;
  attribute vec3 aSeed;
  attribute float aRank;

  varying vec3 vColor;
  varying float vAlpha;

  const float PI = 3.14159265;
  const float FIELD_ALPHA = ${FIELD_ALPHA.toFixed(3)};
  const float FIELD_SIZE = ${FIELD_SIZE.toFixed(3)};

  float visible(float density) {
    return 1.0 - smoothstep(density - 0.02, density, aSeed.x);
  }

  void main() {
    vec2 dir = normalize(aSeed.xy - 0.5 + 0.0001);
    float m = uMorph;
    float r = uRegroup;
    float isField = step(uFieldFrom, aRank);

    // The field drifts sideways like dust in a breeze, wrapping around its area,
    // and fades in and out at the edges so the wrap is never seen.
    float speed = 6.0 + 14.0 * aSeed.y;
    float fieldX = uFieldRect.x + mod(aA.x - uFieldRect.x + uTime * speed, uFieldRect.z);
    vec2 baseA = mix(aA, vec2(fieldX, aA.y + sin(uTime * 0.3 + aSeed.x * 6.2831) * 10.0), isField);
    float edge = smoothstep(0.0, 60.0, baseA.x - uFieldRect.x) * smoothstep(0.0, 60.0, uFieldRect.x + uFieldRect.z - baseA.x);
    // ...and each field particle twinkles gently.
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.5 + aSeed.z) + aSeed.x * 6.2831);

    // Morph between the page's layouts, bursting outward halfway through.
    vec2 posA = baseA - vec2(0.0, uScroll * uFactorA);
    vec2 posB = aB - vec2(0.0, uScroll * uFactorB);
    vec2 current = mix(posA, posB, m) + dir * sin(PI * m) * (60.0 + 240.0 * aSeed.z);

    // Regroup from where the particles were, swirling sideways on the way.
    vec2 pos = mix(aPrev, current, r) + vec2(-dir.y, dir.x) * sin(PI * r) * (40.0 + 160.0 * aSeed.z);

    // A slow breathing drift, so the shape never looks frozen.
    pos += vec2(sin(uTime * 0.7 + aSeed.x * 6.2831), cos(uTime * 0.6 + aSeed.y * 6.2831)) * (0.6 + 1.2 * aSeed.z);

    // The cursor: name particles drift toward it; the field parts around it and is swept along.
    vec2 toPointer = uPointer - pos;
    float dist = length(toPointer);
    float fieldNow = isField * (1.0 - m) * r;
    float near = uPointerStrength * (1.0 - smoothstep(0.0, 180.0, dist));
    float wide = uPointerStrength * (1.0 - smoothstep(0.0, 260.0, dist));
    pos += toPointer * near * 0.4 * (1.0 - fieldNow);
    pos -= toPointer / max(dist, 0.0001) * wide * 90.0 * fieldNow;
    pos += clamp(uPointerVelocity * 0.1, -160.0, 160.0) * wide * fieldNow;

    float alphaA = uAlphaA * mix(1.0, FIELD_ALPHA * edge * twinkle, isField);
    float sizeA = uSizeA * mix(1.0, FIELD_SIZE, isField);
    float alphaNow = mix(alphaA, uAlphaB, m) * (1.0 - uFadeOnArrival * smoothstep(0.8, 1.0, m));
    float sizeNow = mix(sizeA, uSizeB, m);
    float densityNow = mix(visible(uDensityA), visible(uDensityB), m);

    vColor = mix(uColorPrev, mix(uColorA, uColorB, m), r);
    vAlpha = mix(aPrevStyle.x, alphaNow * densityNow, r);
    gl_PointSize = mix(aPrevStyle.y, sizeNow, r) * (0.7 + 0.6 * aSeed.z) * uDpr;
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

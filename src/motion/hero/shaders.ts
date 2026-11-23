/**
 * Particle shaders. Positions arrive in CSS pixels; the vertex shader does the projection.
 *
 * Every particle blends three states:
 *   prev    where it was when the current regroup started (viewport pixels), with its
 *           own size and opacity at that moment (aPrevStyle)
 *   A, B    the page's two layouts, morphed by uMorph (home: name + field -> first cover)
 *   E       home only: the embedding space, a 3D point cloud (aE, unit sphere) that is
 *           rotated by uERot and projected into the stage around uECenter. uSpace morphs
 *           A into E; uMorph then takes E on to B. Elsewhere uSpace stays 0.
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
/** Embedding space: camera distance (unit sphere at the origin), and depth fading. */
export const SPACE_CAMERA = 3.2;
export const SPACE_BACK_ALPHA = 0.22;
export const SPACE_HALO_ALPHA = 0.32;

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

  uniform float uSpace;
  uniform vec2 uECenter;
  uniform float uEScale;
  uniform mat3 uERot;
  uniform vec3 uColorE;
  uniform vec3 uAccent;
  uniform float uAlphaE;
  uniform float uSizeE;
  uniform float uHighlight;

  attribute vec2 aA;
  attribute vec2 aB;
  attribute vec2 aPrev;
  attribute vec2 aPrevStyle;
  attribute vec3 aSeed;
  attribute float aRank;
  attribute vec3 aE;
  attribute vec2 aEInfo;

  varying vec3 vColor;
  varying float vAlpha;

  const float PI = 3.14159265;
  const float FIELD_ALPHA = ${FIELD_ALPHA.toFixed(3)};
  const float FIELD_SIZE = ${FIELD_SIZE.toFixed(3)};
  const float SPACE_CAMERA = ${SPACE_CAMERA.toFixed(3)};
  const float SPACE_BACK_ALPHA = ${SPACE_BACK_ALPHA.toFixed(3)};
  const float SPACE_HALO_ALPHA = ${SPACE_HALO_ALPHA.toFixed(3)};

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

    // The embedding space: rotate, then a perspective projection into the stage.
    float e = uSpace;
    vec3 spun = uERot * aE;
    float persp = SPACE_CAMERA / (SPACE_CAMERA - spun.z);
    vec2 posE = uECenter + vec2(spun.x, -spun.y) * uEScale * persp;
    float depth = clamp(spun.z * 0.5 + 0.5, 0.0, 1.0); // 0 at the back, 1 at the front
    float isHalo = step(aEInfo.y, -0.5);
    float lit = (1.0 - isHalo) * (1.0 - step(0.5, abs(aEInfo.y - uHighlight)));

    // Morph between the page's layouts (by way of the space), bursting outward halfway.
    vec2 posA = baseA - vec2(0.0, uScroll * uFactorA);
    vec2 posB = aB - vec2(0.0, uScroll * uFactorB);
    vec2 towardSpace = mix(posA, posE, e) + dir * sin(PI * e) * (40.0 + 200.0 * aSeed.z);
    vec2 current = mix(towardSpace, posB, m) + dir * sin(PI * m) * (60.0 + 240.0 * aSeed.z);

    // Regroup from where the particles were, swirling sideways on the way.
    vec2 pos = mix(aPrev, current, r) + vec2(-dir.y, dir.x) * sin(PI * r) * (40.0 + 160.0 * aSeed.z);

    // A slow breathing drift, so the shape never looks frozen.
    pos += vec2(sin(uTime * 0.7 + aSeed.x * 6.2831), cos(uTime * 0.6 + aSeed.y * 6.2831)) * (0.6 + 1.2 * aSeed.z);

    // The cursor: name particles drift toward it; the field parts around it and is swept along.
    vec2 toPointer = uPointer - pos;
    float dist = length(toPointer);
    float spaceNow = e * (1.0 - m);
    float fieldNow = isField * (1.0 - e) * (1.0 - m) * r;
    float near = uPointerStrength * (1.0 - smoothstep(0.0, 180.0, dist));
    float wide = uPointerStrength * (1.0 - smoothstep(0.0, 260.0, dist));
    pos += toPointer * near * 0.4 * (1.0 - fieldNow) * (1.0 - spaceNow);
    pos -= toPointer / max(dist, 0.0001) * wide * 90.0 * fieldNow;
    pos += clamp(uPointerVelocity * 0.1, -160.0, 160.0) * wide * fieldNow;

    float alphaA = uAlphaA * mix(1.0, FIELD_ALPHA * edge * twinkle, isField);
    float sizeA = uSizeA * mix(1.0, FIELD_SIZE, isField);
    float alphaE = uAlphaE * mix(SPACE_BACK_ALPHA, 1.0, depth) * mix(1.0, SPACE_HALO_ALPHA, isHalo) * (1.0 + lit);
    float sizeE = uSizeE * persp * mix(1.0, FIELD_SIZE, isHalo) * (1.0 + 0.8 * lit);
    vec3 colorE = mix(uColorE, uAccent, max(aEInfo.x, lit));

    float alphaNow = mix(mix(alphaA, alphaE, e), uAlphaB, m) * (1.0 - uFadeOnArrival * smoothstep(0.8, 1.0, m));
    float sizeNow = mix(mix(sizeA, sizeE, e), uSizeB, m);
    float densityNow = mix(mix(visible(uDensityA), 1.0, e), visible(uDensityB), m);

    vColor = mix(uColorPrev, mix(mix(uColorA, colorE, e), uColorB, m), r);
    vAlpha = min(1.0, mix(aPrevStyle.x, alphaNow * densityNow, r));
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

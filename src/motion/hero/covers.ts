/**
 * Project covers on the shared canvas, drawn like a diffusion model at work.
 *
 * A diffusion model generates an image by starting from pure Gaussian noise and removing a
 * little of it at every sampling step. This shader does the same thing backwards from the
 * real cover: at noise level t it shows
 *
 *     x_t = sqrt(ᾱ_t) · x_0 + sqrt(1 − ᾱ_t) · ε,     ᾱ_t = cos²(t · π/2)   (cosine schedule)
 *
 * where x_0 is the cover and ε fresh Gaussian noise per step. Like a real sampler it works
 * coarse to fine: at high t the image is only known at low resolution (big patches), and
 * detail resolves as t falls. The level also varies a little across the image, so some
 * regions settle before others.
 *
 * It is used for one thing: a project page's large cover, when the visitor arrives
 * without the card-to-cover morph (`reveal()`, called via src/motion/diffusion.ts by the
 * image reveal effect). Noise fades in, then is denoised over 50 visible steps. Cards do
 * not use it: drawing every card through this shader cost too much while scrolling.
 *
 * While a cover is drawn here its HTML image steps aside (`.is-diffusing`), so the canvas
 * (behind the page) shows through in exactly the same place. A small label in the frame
 * counts the sampling steps during reveals.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector4,
} from 'three';
import type { DiffusionRenderer } from '../diffusion';
import { gsap } from '../gsap';
import { gsapEase, seconds } from '../tokens';

/** Sampling steps shown during a reveal. */
export const STEPS = 50;
/** New noise is drawn this many times a second, so noise waiting for the image "boils". */
const BOIL_RATE = 15;

const ACTIVE_CLASS = 'is-diffusing';

const vertexShader = /* glsl */ `
  uniform vec4 uRect;
  uniform vec2 uViewport;
  varying vec2 vUv;

  void main() {
    vUv = position.xy;
    vec2 p = uRect.xy + position.xy * uRect.zw;
    gl_Position = vec4(p.x / uViewport.x * 2.0 - 1.0, 1.0 - p.y / uViewport.y * 2.0, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec2 uSize;
  uniform float uRadius;
  uniform float uScale;
  uniform float uT;
  uniform float uWipe;
  uniform float uAlpha;
  uniform float uSeed;
  varying vec2 vUv;

  const float HALF_PI = 1.5707963;
  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 hash32(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
  }

  // Three independent standard normal samples (Box-Muller).
  vec3 gaussian(vec2 p) {
    vec3 u1 = max(hash32(p), 1e-4);
    vec3 u2 = hash32(p + 19.19);
    return sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2);
  }

  // Gaussian noise on a grid, smoothly interpolated (rescaled so it keeps unit variance).
  vec3 smoothGaussian(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec3 a = gaussian(i);
    vec3 b = gaussian(i + vec2(1.0, 0.0));
    vec3 c = gaussian(i + vec2(0.0, 1.0));
    vec3 d = gaussian(i + vec2(1.0, 1.0));
    vec2 w = vec2(1.0 - f.x, f.x);
    vec2 h = vec2(1.0 - f.y, f.y);
    float norm = length(w) * length(h);
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y) / max(norm, 0.5);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 px = vUv * uSize; // CSS pixels inside the cover, y down

    // Rounded corners, matching the HTML frame, and the wipe up from the bottom.
    float mask = 1.0 - smoothstep(-0.5, 0.5, roundedBox(px - uSize * 0.5, uSize * 0.5, uRadius));
    mask *= smoothstep(-1.0, 1.0, px.y - (1.0 - uWipe) * uSize.y);

    // Noise level here: the schedule's level, uneven across the image mid-way.
    float field = valueNoise(px / 110.0) - 0.5;
    float t = clamp(uT + field * 0.45 * sin(3.1415927 * uT), 0.0, 1.0);

    // Coarse to fine: at high noise the image is only known in patches of 2^level pixels.
    float level = floor(pow(t, 0.8) * 5.0 + 0.5);
    float cell = exp2(level);
    vec2 sampleAt = level < 0.5 ? px : (floor(px / cell) + 0.5) * cell;
    // Match the HTML image's current drift scale, so nothing jumps when they swap.
    vec2 uv = (sampleAt / uSize - 0.5) / uScale + 0.5;
    vec3 x0 = texture2D(uTexture, uv).rgb * 2.0 - 1.0;

    // Unit-variance noise, redrawn every step: per-device-pixel grain plus soft blotches,
    // mostly luminance with some colour, like a decoded latent rather than TV confetti.
    vec3 fine = gaussian(floor(gl_FragCoord.xy) + uSeed * 37.0);
    vec3 blotch = smoothGaussian(px / 14.0 + uSeed * 53.0);
    vec3 eps = fine * 0.78 + blotch * 0.62;
    eps = mix(vec3(dot(eps, vec3(0.333))) * 1.5, eps, 0.32);

    float alphaBar = cos(t * HALF_PI);
    alphaBar *= alphaBar;
    vec3 xt = sqrt(alphaBar) * x0 + sqrt(1.0 - alphaBar) * eps;

    float a = mask * uAlpha;
    gl_FragColor = vec4(clamp(xt * 0.5 + 0.5, 0.0, 1.0) * a, a);
  }
`;

interface Reveal {
  /** Continuous noise level, 1 = pure noise. Shown quantised to STEPS. */
  t: number;
  wipe: number;
  alpha: number;
  /** Ticker time (s) at which denoising may start, once the image has loaded. */
  denoiseAt: number;
  denoise: gsap.core.Tween | null;
  intro: gsap.core.Tween;
}

interface Entry {
  frame: HTMLElement;
  media: HTMLElement;
  image: HTMLImageElement;
  mesh: Mesh;
  material: ShaderMaterial;
  ready: boolean;
  reveal: Reveal | null;
  label: HTMLElement | null;
  labelStep: number;
  classApplied: boolean;
  removeLoadListener: (() => void) | null;
}

export interface CoverEffects extends DiffusionRenderer {
  group: Group;
  /** Per frame. Returns true while any cover is drawn. */
  update(time: number): boolean;
  /** After shader compilation: hides the mesh that was only there to be compiled. */
  warmed(): void;
  start(): void;
  /** Puts every HTML image back immediately and stops drawing. */
  stop(): void;
}

export function createCoverEffects(viewport: Vector2, maxPixelRatio: number): CoverEffects {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  function createMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        uRect: { value: new Vector4() },
        uViewport: { value: viewport },
        uTexture: { value: null as CanvasTexture | null },
        uSize: { value: new Vector2(1, 1) },
        uRadius: { value: 8 },
        uScale: { value: 1 },
        uT: { value: 1 },
        uWipe: { value: 1 },
        uAlpha: { value: 1 },
        uSeed: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      // The quad is laid out in screen pixels (y down), which flips its winding: draw both sides.
      side: DoubleSide,
    });
  }

  const group = new Group();
  // Present only so the shader compiles with the rest of the scene, not on the first reveal.
  const warmMesh = new Mesh(geometry, createMaterial());
  warmMesh.frustumCulled = false;
  (warmMesh.material as ShaderMaterial).uniforms.uAlpha!.value = 0;
  group.add(warmMesh);

  const entries = new Map<HTMLElement, Entry>();
  const textures = new Map<HTMLImageElement, CanvasTexture>();
  let running = false;

  /** The cover image drawn at the frame's size (object-fit: cover), as a texture. */
  function textureFor(image: HTMLImageElement, width: number, height: number): CanvasTexture {
    const ratio = Math.min(devicePixelRatio, maxPixelRatio);
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    const cached = textures.get(image);
    if (cached && Math.abs(cached.image.width - w) < 4 && Math.abs(cached.image.height - h) < 4) return cached;
    cached?.dispose();

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const dw = image.naturalWidth * scale;
    const dh = image.naturalHeight * scale;
    ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);

    const texture = new CanvasTexture(canvas);
    texture.flipY = false;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    textures.set(image, texture);
    return texture;
  }

  const imageReady = (image: HTMLImageElement) => image.complete && image.naturalWidth > 0;

  function loadTexture(entry: Entry): void {
    const rect = entry.frame.getBoundingClientRect();
    entry.material.uniforms.uTexture!.value = textureFor(entry.image, rect.width, rect.height);
    entry.ready = true;
  }

  function parts(frame: HTMLElement) {
    const media = frame.querySelector<HTMLElement>('[data-reveal-media]');
    const image = media?.querySelector('img');
    return media && image ? { media, image } : null;
  }

  function entryFor(frame: HTMLElement): Entry | null {
    const existing = entries.get(frame);
    if (existing) return existing;
    const found = parts(frame);
    if (!found) return null;

    const material = createMaterial();
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1; // covers sit above the dust, like the HTML images do
    mesh.visible = false;
    group.add(mesh);
    material.uniforms.uRadius!.value = parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 0;

    const entry: Entry = {
      frame,
      ...found,
      mesh,
      material,
      ready: false,
      reveal: null,
      label: null,
      labelStep: -1,
      classApplied: false,
      removeLoadListener: null,
    };

    if (imageReady(found.image)) {
      loadTexture(entry);
    } else {
      // Not loaded yet: the noise keeps boiling ("generating") until it is.
      const onLoad = () => {
        entry.removeLoadListener = null;
        if (entries.get(frame) === entry && imageReady(found.image)) loadTexture(entry);
      };
      const onError = () => {
        entry.removeLoadListener = null;
        if (entries.get(frame) === entry) remove(entry);
      };
      found.image.addEventListener('load', onLoad, { once: true });
      found.image.addEventListener('error', onError, { once: true });
      entry.removeLoadListener = () => {
        found.image.removeEventListener('load', onLoad);
        found.image.removeEventListener('error', onError);
      };
    }

    entries.set(frame, entry);
    return entry;
  }

  function applyClass(entry: Entry): void {
    if (entry.classApplied) return;
    entry.frame.classList.add(ACTIVE_CLASS);
    entry.classApplied = true;
  }

  function remove(entry: Entry): void {
    entry.reveal?.intro.kill();
    entry.reveal?.denoise?.kill();
    entry.removeLoadListener?.();
    entry.frame.classList.remove(ACTIVE_CLASS);
    hideLabel(entry);
    group.remove(entry.mesh);
    entry.material.dispose();
    entries.delete(entry.frame);
  }

  function releaseAll(): void {
    for (const entry of [...entries.values()]) remove(entry);
  }

  // ---- Step counter label

  function showLabel(entry: Entry, step: number): void {
    if (step === entry.labelStep) return;
    entry.labelStep = step;
    if (!entry.label) {
      entry.label = document.createElement('span');
      entry.label.className = 'diffusion-step';
      entry.label.setAttribute('aria-hidden', 'true');
      entry.frame.append(entry.label);
    }
    entry.label.textContent = `denoise ${String(step).padStart(2, '0')}/${STEPS}`;
  }

  function hideLabel(entry: Entry): void {
    const label = entry.label;
    if (!label) return;
    entry.label = null;
    entry.labelStep = -1;
    label.classList.add('is-done');
    setTimeout(() => label.remove(), 600);
  }

  // ---- Reveal

  function reveal(frame: HTMLElement, { wipe = true } = {}): boolean {
    if (!running) return false;
    const entry = entryFor(frame);
    if (!entry) return false;
    entry.reveal?.intro.kill();
    entry.reveal?.denoise?.kill();

    const state = { t: 1, wipe: wipe ? 0 : 1, alpha: wipe ? 1 : 0 };
    const intro = wipe
      ? gsap.to(state, { wipe: 1, duration: seconds('base'), ease: gsapEase.out })
      : gsap.to(state, { alpha: 1, duration: seconds('base'), ease: 'none' });
    entry.reveal = Object.assign(state, {
      denoiseAt: gsap.ticker.time + seconds('base') * 0.4,
      denoise: null,
      intro,
    });
    // The frame starts empty either way (clipped away, or about to fade in): hide the HTML
    // image now, before the caller un-clips the frame, so it never flashes.
    applyClass(entry);
    return true;
  }

  // The page is about to be captured for the transition: show the real images.
  document.addEventListener('astro:before-preparation', releaseAll);
  // Textures of covers that are no longer on the page.
  document.addEventListener('astro:page-load', () => {
    for (const [image, texture] of textures) {
      if (!image.isConnected) {
        texture.dispose();
        textures.delete(image);
      }
    }
  });

  /** Noise level of a reveal, quantised to whole sampling steps. Null once it is finished. */
  function updateReveal(entry: Entry, time: number): number | null {
    const r = entry.reveal;
    if (!r) return null;
    if (!r.denoise && entry.ready && time >= r.denoiseAt) {
      // One sampling step per tick, evenly spaced, as a real sampler runs.
      r.denoise = gsap.to(r, { t: 0, duration: seconds('cinematic'), ease: 'none' });
    }
    if (r.denoise && !r.denoise.isActive() && r.t <= 0 && r.wipe >= 1 && r.alpha >= 1) {
      entry.reveal = null;
      return null;
    }
    return Math.ceil(r.t * STEPS) / STEPS;
  }

  function update(time: number): boolean {
    let drawing = false;
    for (const entry of [...entries.values()]) {
      if (!entry.frame.isConnected) {
        remove(entry);
        continue;
      }
      const level = updateReveal(entry, time);
      if (level === null) {
        remove(entry);
        continue;
      }

      const uniforms = entry.material.uniforms;
      const rect = entry.frame.getBoundingClientRect();
      uniforms.uRect!.value.set(rect.left, rect.top, rect.width, rect.height);
      uniforms.uSize!.value.set(rect.width, rect.height);
      uniforms.uScale!.value = Number(gsap.getProperty(entry.media, 'scale')) || 1;
      uniforms.uT!.value = level;
      uniforms.uWipe!.value = entry.reveal?.wipe ?? 1;
      uniforms.uAlpha!.value = entry.reveal?.alpha ?? 1;
      // New noise at every sampling step, and continuously while it waits for the image.
      uniforms.uSeed!.value = (Math.round(level * STEPS) * 7 + Math.floor(time * BOIL_RATE)) % 997;

      // The step counter.
      if (level > 0) showLabel(entry, Math.round((1 - level) * STEPS));
      else hideLabel(entry);

      entry.mesh.visible = true;
      // Swap in the same frame the canvas first draws the cover, so there is no blank frame.
      applyClass(entry);
      drawing = true;
    }
    return drawing;
  }

  return {
    group,
    update,
    reveal,
    warmed() {
      group.remove(warmMesh);
      (warmMesh.material as ShaderMaterial).dispose();
    },
    start() {
      running = true;
    },
    stop() {
      running = false;
      releaseAll();
    },
  };
}

/**
 * The signature hero: a few thousand particles on one persistent WebGL canvas.
 *
 * Home: most particles spell the name over the real (now invisible) heading and drift
 * toward the cursor; the rest form a living field across the whole hero that drifts like
 * dust and parts around the cursor. Scrolling bursts everything into the first project cover.
 * Other pages: they settle into a faint field behind the content.
 * Navigation: the canvas persists across pages and the particles regroup into the new
 * page's layout instead of reloading.
 * Project covers: a ripple and RGB-split hover effect (./hover.ts) on the same canvas.
 *
 * This module pulls in Three.js, so it is only ever loaded with a dynamic import
 * (see ./index.ts), after the page has painted and the browser is idle.
 */
import {
  BufferAttribute,
  BufferGeometry,
  OrthographicCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import { gsap, ScrollTrigger } from '../gsap';
import { onFrame } from '../loop';
import { gsapEase, seconds } from '../tokens';
import { createHoverEffect } from './hover';
import { readPageLayouts, scatteredPositions, type Layout, type PageLayouts, type RGB } from './layouts';
import { FIELD_ALPHA, FIELD_SIZE, fragmentShader, vertexShader } from './shaders';

export interface HeroScene {
  /** Compiles the shaders without blocking the page (call once before the first start). */
  prepare(): Promise<void>;
  start(): void;
  stop(): void;
}

const LIVE_CLASS = 'hero-live';
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** GLSL's mod (always positive for a positive divisor), unlike JavaScript's %. */
const mod = (x: number, y: number) => x - y * Math.floor(x / y);
const NO_FIELD = { from: 1, rect: [0, 0, 1, 1] as [number, number, number, number] };

export function createHeroScene(canvas: HTMLCanvasElement): HeroScene | null {
  const phone = matchMedia('(max-width: 767px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
  const count = phone ? 5000 : 12000;
  const maxPixelRatio = phone ? 1.5 : 2;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null; // No WebGL: the HTML heading stays, which is the static version of the hero.
  }
  renderer.setClearColor(0x000000, 0);

  // ---- Geometry: positions A, B and prev per particle, prev size and opacity, a random seed
  // and a rank (0 to 1) that decides which particles belong to an ambient field.
  const seeds = new Float32Array(count * 3).map(() => Math.random());
  const ranks = new Float32Array(count).map((_, i) => i / count);
  const attribute = (size: number) => new BufferAttribute(new Float32Array(count * size), size);
  const geometry = new BufferGeometry();
  const aA = attribute(2);
  const aB = attribute(2);
  const aPrev = attribute(2);
  const aPrevStyle = attribute(2);
  geometry.setAttribute('position', attribute(3)); // unused by the shader; sets the draw count
  geometry.setAttribute('aA', aA);
  geometry.setAttribute('aB', aB);
  geometry.setAttribute('aPrev', aPrev);
  geometry.setAttribute('aPrevStyle', aPrevStyle);
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 3));
  geometry.setAttribute('aRank', new BufferAttribute(ranks, 1));

  const uniforms = {
    uViewport: { value: new Vector2(innerWidth, innerHeight) },
    uDpr: { value: 1 },
    uScroll: { value: 0 },
    uTime: { value: 0 },
    uPointer: { value: new Vector2(-9999, -9999) },
    uPointerVelocity: { value: new Vector2() },
    uPointerStrength: { value: 0 },
    uMorph: { value: 0 },
    uRegroup: { value: 1 },
    uFadeOnArrival: { value: 0 },
    uFieldFrom: { value: 1 },
    uFieldRect: { value: new Vector4(0, 0, 1, 1) },
    uFactorA: { value: 1 },
    uFactorB: { value: 1 },
    uColorA: { value: new Vector3() },
    uColorB: { value: new Vector3() },
    uColorPrev: { value: new Vector3() },
    uAlphaA: { value: 1 },
    uAlphaB: { value: 1 },
    uSizeA: { value: 2 },
    uSizeB: { value: 2 },
    uDensityA: { value: 1 },
    uDensityB: { value: 1 },
  };

  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  const hover = createHoverEffect(uniforms.uViewport.value, maxPixelRatio);
  hover.mesh.renderOrder = 1; // a hovered cover sits above the dust, like the HTML images do
  const scene = new Scene();
  scene.add(hover.mesh, points);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1); // projection happens in the shader

  // ---- State
  const state = { morph: 0, regroup: 1 };
  const pointer = { x: -9999, y: -9999, targetX: -9999, targetY: -9999, strength: 0, target: 0, vx: 0, vy: 0 };
  let layouts: PageLayouts | null = null;
  let prevColor: RGB = [0, 0, 0];
  let morphTrigger: ScrollTrigger | null = null;
  let regroupTween: gsap.core.Tween | null = null;
  let stopRendering: (() => void) | null = null;
  let running = false;
  let lost = false;
  let navigated = false;
  let idleFrameDrawn = false;

  function resize(): void {
    renderer.setPixelRatio(Math.min(devicePixelRatio, maxPixelRatio));
    renderer.setSize(innerWidth, innerHeight, false);
    uniforms.uViewport.value.set(innerWidth, innerHeight);
    uniforms.uDpr.value = renderer.getPixelRatio();
  }

  function applyLayouts(next: PageLayouts): void {
    layouts = next;
    (aA.array as Float32Array).set(next.a.positions);
    (aB.array as Float32Array).set(next.b.positions);
    aA.needsUpdate = true;
    aB.needsUpdate = true;
    const field = next.a.field ?? NO_FIELD;
    uniforms.uFieldFrom.value = field.from;
    uniforms.uFieldRect.value.set(...field.rect);
    uniforms.uFactorA.value = next.a.scrollFactor;
    uniforms.uFactorB.value = next.b.scrollFactor;
    uniforms.uColorA.value.set(...next.a.color);
    uniforms.uColorB.value.set(...next.b.color);
    uniforms.uAlphaA.value = next.a.alpha;
    uniforms.uAlphaB.value = next.b.alpha;
    uniforms.uSizeA.value = next.a.size;
    uniforms.uSizeB.value = next.b.size;
    uniforms.uDensityA.value = next.a.density;
    uniforms.uDensityB.value = next.b.density;
    uniforms.uFadeOnArrival.value = next.fadeOnArrival ? 1 : 0;
    idleFrameDrawn = false;
  }

  /** Where particles start a regroup from: screen positions, their size and opacity, one colour. */
  function applyPrev(positions: Float32Array, styles: Float32Array, color: RGB): void {
    (aPrev.array as Float32Array).set(positions);
    (aPrevStyle.array as Float32Array).set(styles);
    aPrev.needsUpdate = true;
    aPrevStyle.needsUpdate = true;
    prevColor = color;
    uniforms.uColorPrev.value.set(...color);
  }

  const isField = (layout: Layout, i: number) => (layout.field ? ranks[i]! >= layout.field.from : false);
  const visible = (density: number, i: number) => 1 - smoothstep(density - 0.02, density, seeds[i * 3]!);

  /** Each particle's resting size and opacity in a layout (for the start of the intro). */
  function restingStyles(layout: Layout, alpha: number): Float32Array {
    const styles = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      styles[i * 2] = alpha;
      styles[i * 2 + 1] = layout.size * (isField(layout, i) ? FIELD_SIZE : 1);
    }
    return styles;
  }

  /**
   * Where every particle is on screen right now, with its size and opacity. Mirrors the
   * vertex shader, minus the breathing and the cursor (too small to matter at a handover).
   */
  function displayedState(): { positions: Float32Array; styles: Float32Array; color: RGB } {
    const positions = new Float32Array(count * 2);
    const styles = new Float32Array(count * 2);
    if (!layouts) return { positions, styles, color: prevColor };
    const { a, b } = layouts;
    const [fx, , fw] = (a.field ?? NO_FIELD).rect;
    const m = state.morph;
    const r = state.regroup;
    const time = uniforms.uTime.value;
    const prev = aPrev.array as Float32Array;
    const prevStyles = aPrevStyle.array as Float32Array;
    const fade = layouts.fadeOnArrival ? 1 - smoothstep(0.8, 1, m) : 1;

    for (let i = 0; i < count; i++) {
      let dx = seeds[i * 3]! - 0.5 + 0.0001;
      let dy = seeds[i * 3 + 1]! - 0.5 + 0.0001;
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
      const z = seeds[i * 3 + 2]!;
      const field = isField(a, i);

      let ax = a.positions[i * 2]!;
      let ay = a.positions[i * 2 + 1]!;
      let edge = 1;
      if (field) {
        ax = fx + mod(ax - fx + time * (6 + 14 * seeds[i * 3 + 1]!), fw);
        ay += Math.sin(time * 0.3 + seeds[i * 3]! * 6.2831) * 10;
        edge = smoothstep(0, 60, ax - fx) * smoothstep(0, 60, fx + fw - ax);
        edge *= 0.55 + 0.45 * Math.sin(time * (0.5 + z) + seeds[i * 3]! * 6.2831); // twinkle
      }
      ay -= scrollY * a.scrollFactor;
      const bx = b.positions[i * 2]!;
      const by = b.positions[i * 2 + 1]! - scrollY * b.scrollFactor;
      const burst = Math.sin(Math.PI * m) * (60 + 240 * z);
      const cx = mix(ax, bx, m) + dx * burst;
      const cy = mix(ay, by, m) + dy * burst;
      const swirl = Math.sin(Math.PI * r) * (40 + 160 * z);
      positions[i * 2] = mix(prev[i * 2]!, cx, r) - dy * swirl;
      positions[i * 2 + 1] = mix(prev[i * 2 + 1]!, cy, r) + dx * swirl;

      const alphaA = a.alpha * (field ? FIELD_ALPHA * edge : 1);
      const sizeA = a.size * (field ? FIELD_SIZE : 1);
      const alphaNow = mix(alphaA, b.alpha, m) * fade;
      const densityNow = mix(visible(a.density, i), visible(b.density, i), m);
      styles[i * 2] = mix(prevStyles[i * 2]!, alphaNow * densityNow, r);
      styles[i * 2 + 1] = mix(prevStyles[i * 2 + 1]!, mix(sizeA, b.size, m), r);
    }
    const colorNow = [0, 1, 2].map((k) => mix(a.color[k]!, b.color[k]!, m));
    const color = [0, 1, 2].map((k) => mix(prevColor[k]!, colorNow[k]!, r)) as RGB;
    return { positions, styles, color };
  }

  function regroup(): void {
    regroupTween?.kill();
    state.regroup = 0;
    regroupTween = gsap.to(state, { regroup: 1, duration: seconds('cinematic'), ease: gsapEase.inOut });
  }

  /** Reads the current page's layouts and, on home, ties the morph to scrolling. */
  function setupPage(): void {
    morphTrigger?.kill();
    morphTrigger = null;
    applyLayouts(readPageLayouts(count));
    if (layouts?.morphEnd) {
      morphTrigger = ScrollTrigger.create({
        start: 0,
        endTrigger: layouts.morphEnd,
        end: 'center 60%',
        onUpdate: (self) => {
          state.morph = self.progress;
        },
      });
      state.morph = morphTrigger.progress;
    } else {
      state.morph = 0;
    }
  }

  function render(time: number, deltaTime: number): void {
    const lastX = pointer.x;
    const lastY = pointer.y;
    pointer.x = mix(pointer.x, pointer.targetX, 0.15);
    pointer.y = mix(pointer.y, pointer.targetY, 0.15);
    pointer.strength = mix(pointer.strength, pointer.target, 0.08);
    // Pointer velocity in px/s, smoothed: it sweeps the field along behind the cursor.
    const dt = Math.max(deltaTime, 1) / 1000;
    pointer.vx = mix(pointer.vx, (pointer.x - lastX) / dt, 0.2);
    pointer.vy = mix(pointer.vy, (pointer.y - lastY) / dt, 0.2);

    uniforms.uTime.value = time;
    uniforms.uScroll.value = scrollY;
    uniforms.uPointer.value.set(pointer.x, pointer.y);
    uniforms.uPointerVelocity.value.set(pointer.vx, pointer.vy);
    uniforms.uPointerStrength.value = pointer.strength;
    uniforms.uMorph.value = state.morph;
    uniforms.uRegroup.value = state.regroup;

    const hovering = hover.update(time);

    // Nothing to show (home, scrolled past the hero, particles faded, no cover hovered):
    // draw one empty frame, then rest.
    const idle = !hovering && Boolean(layouts?.fadeOnArrival) && state.morph >= 0.999 && state.regroup >= 1;
    if (idle && idleFrameDrawn) return;
    idleFrameDrawn = idle;
    renderer.render(scene, camera);
  }

  // ---- Events (registered once; they act only while running)
  addEventListener('resize', () => running && resize());
  // Several refreshes can fire in a row while a page loads: measure the layouts once per frame.
  let layoutsQueued = false;
  const refreshLayouts = () => {
    if (!running || layoutsQueued) return;
    layoutsQueued = true;
    requestAnimationFrame(() => {
      layoutsQueued = false;
      if (running) applyLayouts(readPageLayouts(count));
    });
  };
  ScrollTrigger.addEventListener('refresh', refreshLayouts);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshLayouts);

  const finePointer = matchMedia('(pointer: fine)');
  addEventListener(
    'pointermove',
    (event) => {
      if (!finePointer.matches) return;
      if (pointer.target === 0 && pointer.strength < 0.01) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
      }
      pointer.targetX = event.clientX;
      pointer.targetY = event.clientY;
      pointer.target = 1;
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.target = 0;
  });

  // Freeze the particles where they are just before the page swaps...
  document.addEventListener('astro:before-swap', () => {
    if (!running) return;
    const { positions, styles, color } = displayedState();
    applyPrev(positions, styles, color);
    regroupTween?.kill();
    state.regroup = 0;
    morphTrigger?.kill();
    morphTrigger = null;
    navigated = true;
  });
  // ...then regroup them into the new page's layout.
  document.addEventListener('astro:page-load', () => {
    if (!running || !navigated) return;
    navigated = false;
    setupPage();
    regroup();
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    stop();
  });

  function start(): void {
    if (running || lost) return;
    running = true;
    resize();
    setupPage();
    // Right after the first-visit intro the solid name is on screen: particles appear on top
    // of its letters and shimmer in. Otherwise they gather from across the screen.
    const handoff = Boolean(document.querySelector('.hero__name[data-revealed]'));
    const from = handoff ? viewportPositions(layouts!.a) : scatteredPositions(count);
    applyPrev(from, restingStyles(layouts!.a, 0), layouts!.a.color);
    regroup();
    stopRendering = onFrame(render);
    requestAnimationFrame(() => {
      if (running) document.documentElement.classList.add(LIVE_CLASS);
    });
  }

  function stop(): void {
    if (!running) return;
    running = false;
    stopRendering?.();
    stopRendering = null;
    regroupTween?.kill();
    morphTrigger?.kill();
    morphTrigger = null;
    hover.release();
    document.documentElement.classList.remove(LIVE_CLASS);
  }

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __hero: { state, count, running: () => running, layouts: () => layouts, pointer, uniforms },
    });
  }

  /** Shader compilation can stall the page for 100 ms or more; let the browser do it in the background. */
  async function prepare(): Promise<void> {
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      // Compiles on the first frame instead.
    }
  }

  return { prepare, start, stop };
}

/** A layout's positions on screen right now (prev positions are in viewport pixels). */
function viewportPositions(layout: Layout): Float32Array {
  const out = new Float32Array(layout.positions);
  for (let i = 1; i < out.length; i += 2) out[i] = out[i]! - scrollY * layout.scrollFactor;
  return out;
}

/**
 * The signature hero: a few thousand particles on one persistent WebGL canvas.
 *
 * Home: most particles spell the name over the real (now invisible) heading and drift
 * toward the cursor; the rest form a living field across the whole hero that drifts like
 * dust and parts around the cursor. Scrolling bursts everything into the first project cover.
 * On the way, they gather into the embedding space (./space.ts): a 3D point cloud of
 * everything on the site, which turns while its section is scrolled through.
 * Other pages: they settle into a faint field behind the content.
 * Navigation: the canvas persists across pages and the particles regroup into the new
 * page's layout instead of reloading.
 * Project pages: the large cover can arrive like a diffusion sample (./covers.ts), on the
 * same canvas.
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
import { provideDiffusion } from '../diffusion';
import { createCoverEffects } from './covers';
import { createSpaceView } from './space';
import { cssColor, pointLayout, readPageLayouts, scatteredPositions, type Layout, type PageLayouts, type RGB, type SpaceLayout } from './layouts';
import { descentReadout } from '../landscape';
import { FIELD_ALPHA, FIELD_SIZE, fragmentShader, GROUP, SPACE_BACK_ALPHA, SPACE_HALO_ALPHA, SURFACE_ALPHA, vertexShader } from './shaders';

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
const ZERO = new Vector3();
/** Embedding space particles: opacity and point size (CSS px, before perspective). */
const SPACE_ALPHA = 0.9;
const SPACE_SIZE = 2.1;
/** Landscape: the share of its scroll by which the ball reaches the minimum. */
const ARRIVE_AT = 0.8;
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
  const aE = attribute(3);
  const aEInfo = attribute(2);
  geometry.setAttribute('aE', aE);
  geometry.setAttribute('aEInfo', aEInfo);
  const space = createSpaceView();

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
    uSpace: { value: 0 },
    uECenter: { value: space.center },
    uEScale: { value: 1 },
    uERot: { value: space.rotation },
    uColorE: { value: new Vector3() },
    uAccent: { value: new Vector3() },
    uAlphaE: { value: SPACE_ALPHA },
    uSizeE: { value: SPACE_SIZE },
    uHighlight: { value: -1 },
    uBall: { value: new Vector3() },
    uTintUpTo: { value: 1 },
    uBallAlpha: { value: 1 },
    uHits: { value: space.hits },
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
  const covers = createCoverEffects(uniforms.uViewport.value, maxPixelRatio);
  const scene = new Scene();
  scene.add(covers.group, points);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1); // projection happens in the shader

  // ---- State
  /** morph: E (or A) to B; space: A to E; regroup: previous page to this one. */
  const state = { morph: 0, space: 0, regroup: 1 };
  const pointer = { x: -9999, y: -9999, targetX: -9999, targetY: -9999, strength: 0, target: 0, vx: 0, vy: 0 };
  let layouts: PageLayouts | null = null;
  let prevColor: RGB = [0, 0, 0];
  let morphTrigger: ScrollTrigger | null = null;
  let spaceTrigger: ScrollTrigger | null = null;
  let leaveTrigger: ScrollTrigger | null = null;
  /** Scroll progress into the 3D scene, and (About) back out of it. */
  const spaceScroll = { in: 0, out: 0 };
  /** The scroll range over which the scene holds still in its stage, cached at each refresh. */
  let spaceBounds: { arrive: number; release: number } | null = null;
  let readoutStep = -1;
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
    const spaceInfo = aEInfo.array as Float32Array;
    if (next.space) {
      (aE.array as Float32Array).set(next.space.positions);
      spaceInfo.set(next.space.info);
    } else {
      (aE.array as Float32Array).fill(0);
      spaceInfo.fill(0);
    }
    aE.needsUpdate = true;
    aEInfo.needsUpdate = true;
    const root = getComputedStyle(document.documentElement);
    uniforms.uColorE.value.set(...cssColor(root.getPropertyValue('--color-ink')));
    uniforms.uAccent.value.set(...cssColor(root.getPropertyValue('--color-accent')));
    space.setup(next.space);
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
    const e = state.space;
    const r = state.regroup;
    const time = uniforms.uTime.value;
    const spacePositions = aE.array as Float32Array;
    const spaceInfo = aEInfo.array as Float32Array;
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
      let ex = ax;
      let ey = ay;
      let alphaE = 0;
      let sizeE = 0;
      if (e > 0) {
        const group = spaceInfo[i * 2 + 1]!;
        const ballAt = group === GROUP.ball ? uniforms.uBall.value : ZERO;
        // (Hits only change brightness, which the handover can ignore.)
        const [px, py, persp, depth] = space.project(
          spacePositions[i * 3]! + ballAt.x,
          spacePositions[i * 3 + 1]! + ballAt.y,
          spacePositions[i * 3 + 2]! + ballAt.z,
        );
        const halo = group === GROUP.halo;
        const tint = spaceInfo[i * 2]!;
        const hiddenTrail = group === GROUP.trail && tint > uniforms.uTintUpTo.value;
        ex = px;
        ey = py;
        alphaE =
          SPACE_ALPHA *
          mix(SPACE_BACK_ALPHA, 1, depth) *
          (halo ? SPACE_HALO_ALPHA : 1) *
          (group === GROUP.surface ? SURFACE_ALPHA : 1) *
          (group === GROUP.ball ? uniforms.uBallAlpha.value : 1) *
          (hiddenTrail ? 0 : 1);
        sizeE = SPACE_SIZE * persp * (halo ? FIELD_SIZE : 1) * (group === GROUP.ball ? 1.5 : 1);
      }
      const toward = Math.sin(Math.PI * e) * (40 + 200 * z);
      const tx = mix(ax, ex, e) + dx * toward;
      const ty = mix(ay, ey, e) + dy * toward;
      const burst = Math.sin(Math.PI * m) * (60 + 240 * z);
      const cx = mix(tx, bx, m) + dx * burst;
      const cy = mix(ty, by, m) + dy * burst;
      const swirl = Math.sin(Math.PI * r) * (40 + 160 * z);
      positions[i * 2] = mix(prev[i * 2]!, cx, r) - dy * swirl;
      positions[i * 2 + 1] = mix(prev[i * 2 + 1]!, cy, r) + dx * swirl;

      const alphaA = a.alpha * (field ? FIELD_ALPHA * edge : 1);
      const sizeA = a.size * (field ? FIELD_SIZE : 1);
      const alphaNow = mix(mix(alphaA, alphaE, e), b.alpha, m) * fade;
      const densityNow = mix(mix(visible(a.density, i), 1, e), visible(b.density, i), m);
      styles[i * 2] = Math.min(1, mix(prevStyles[i * 2]!, alphaNow * densityNow, r));
      styles[i * 2 + 1] = mix(prevStyles[i * 2 + 1]!, mix(mix(sizeA, sizeE, e), b.size, m), r);
    }
    const ink = uniforms.uColorE.value;
    const colorA = [0, 1, 2].map((k) => mix(a.color[k]!, [ink.x, ink.y, ink.z][k]!, e));
    const colorNow = [0, 1, 2].map((k) => mix(colorA[k]!, b.color[k]!, m));
    const color = [0, 1, 2].map((k) => mix(prevColor[k]!, colorNow[k]!, r)) as RGB;
    return { positions, styles, color };
  }

  function regroup(duration = seconds('cinematic'), ease = gsapEase.inOut): void {
    regroupTween?.kill();
    state.regroup = 0;
    regroupTween = gsap.to(state, { regroup: 1, duration, ease });
  }

  /** Starts a regroup from wherever the particles are on screen right now. */
  function regroupFromHere(): void {
    const { positions, styles, color } = displayedState();
    applyPrev(positions, styles, color);
  }

  /**
   * Reads the current page's layouts and ties the morphs to scrolling: into the 3D scene
   * (home: embedding space, About: loss landscape) while its stage scrolls up to the middle
   * of the window; then, once the stage is about to leave, on to the first cover (home) or
   * back into the page's dust (About).
   */
  function setupPage(): void {
    killTriggers();
    applyLayouts(readPageLayouts(count));
    const hasSpace = Boolean(layouts?.space);
    const measure = () => (spaceBounds = space.measure());
    spaceBounds = null;
    spaceScroll.in = 0;
    spaceScroll.out = 0;
    readoutStep = -1;
    if (hasSpace) {
      const sync = () => {
        state.space = spaceScroll.in * (1 - spaceScroll.out);
      };
      spaceTrigger = ScrollTrigger.create({
        start: 0,
        end: () => measure()?.arrive ?? 1,
        onUpdate: (self) => {
          spaceScroll.in = self.progress;
          sync();
        },
      });
      spaceScroll.in = spaceTrigger.progress;
      if (!layouts?.morphEnd) {
        leaveTrigger = ScrollTrigger.create({
          start: () => measure()?.release ?? 0,
          end: () => (spaceBounds?.release ?? 0) + innerHeight * 0.6,
          onUpdate: (self) => {
            spaceScroll.out = self.progress;
            sync();
          },
        });
        spaceScroll.out = leaveTrigger.progress;
      }
      sync();
    } else {
      state.space = 0;
    }
    if (layouts?.morphEnd) {
      morphTrigger = ScrollTrigger.create({
        start: hasSpace ? () => space.measure()?.release ?? 0 : 0,
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

  function killTriggers(): void {
    morphTrigger?.kill();
    morphTrigger = null;
    spaceTrigger?.kill();
    spaceTrigger = null;
    leaveTrigger?.kill();
    leaveTrigger = null;
  }

  /**
   * About: the ball's place on the descent follows the scroll through the landscape's
   * stage; the trail is revealed up to it and the readout shows the step and loss.
   */
  function updateDescent(scene: SpaceLayout): void {
    const bounds = spaceBounds ?? (spaceBounds = space.measure());
    const path = scene.path;
    if (!bounds || !path?.length) return;
    // The ball arrives at 80% of the scroll; the rest is the run settling into the minimum.
    const scrolled = Math.min(1, Math.max(0, (scrollY - bounds.arrive) / (bounds.release - bounds.arrive)));
    const arrival = scene.arrival ?? 1;
    const p = scrolled < ARRIVE_AT ? (scrolled / ARRIVE_AT) * arrival : arrival + ((scrolled - ARRIVE_AT) / (1 - ARRIVE_AT)) * (1 - arrival);
    const at = p * (path.length - 1);
    const i = Math.floor(at);
    const a = path[i]!;
    const b = path[Math.min(i + 1, path.length - 1)]!;
    const t = at - i;
    uniforms.uBall.value.set(mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t));
    uniforms.uTintUpTo.value = Math.max(p, 0.001);
    space.progress = p;

    const step = Math.round(at);
    if (scene.readout && step !== readoutStep) {
      readoutStep = step;
      scene.readout.textContent = descentReadout(step);
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

    // The embedding space turns toward the cursor (-0.5 to 0.5 across the window).
    if (layouts?.space) {
      const toward = {
        x: pointer.strength * (pointer.x / innerWidth - 0.5),
        y: pointer.strength * (pointer.y / innerHeight - 0.5),
      };
      space.update(time, toward, spaceScroll.in * state.regroup, Math.max(state.morph, spaceScroll.out));
      if (layouts.space.kind === 'landscape') {
        updateDescent(layouts.space);
        uniforms.uBallAlpha.value = 1;
      } else {
        // The embedding space's ball is the visitor's question (Ask), when there is one.
        uniforms.uTintUpTo.value = 1;
        uniforms.uBall.value.copy(space.query);
        uniforms.uBallAlpha.value = space.queryAlpha;
      }
    }
    uniforms.uSpace.value = state.space;
    uniforms.uEScale.value = space.scale;
    uniforms.uHighlight.value = space.highlight;

    const coversDrawn = covers.update(time);

    // Nothing to show (home, scrolled past the hero, particles faded, no cover drawn):
    // draw one empty frame, then rest.
    const idle = !coversDrawn && Boolean(layouts?.fadeOnArrival) && state.morph >= 0.999 && state.regroup >= 1;
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

  // Ask: a question to fly into the embedding space (or null to clear it).
  addEventListener('space:query', (event) => space.setQuery(event.detail));

  // Work map: the filter re-clustered the projects; the clusters follow (as long as the labels glide).
  addEventListener('work:map', () => {
    if (!running) return;
    regroupFromHere();
    setupPage();
    regroup();
  });
  // Work map: a project was clicked; every particle rushes into its point before the page opens.
  addEventListener('work:open', (event) => {
    if (!running) return;
    regroupFromHere();
    killTriggers();
    const accent = cssColor(getComputedStyle(document.documentElement).getPropertyValue('--color-accent'));
    const point = pointLayout(event.detail.x + scrollX, event.detail.y + scrollY, count, accent);
    applyLayouts({ a: point, b: point, space: null, fadeOnArrival: false, morphEnd: null });
    regroup(seconds('base'), gsapEase.in);
  });

  // Freeze the particles where they are just before the page swaps...
  document.addEventListener('astro:before-swap', () => {
    if (!running) return;
    regroupFromHere();
    regroupTween?.kill();
    state.regroup = 0;
    killTriggers();
    space.setup(null);
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
    covers.start();
    provideDiffusion(covers);
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
    killTriggers();
    space.teardown();
    provideDiffusion(null);
    covers.stop();
    document.documentElement.classList.remove(LIVE_CLASS);
  }

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __hero: { state, count, running: () => running, layouts: () => layouts, pointer, uniforms, covers, space },
    });
  }

  /** Shader compilation can stall the page for 100 ms or more; let the browser do it in the background. */
  async function prepare(): Promise<void> {
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      // Compiles on the first frame instead.
    } finally {
      covers.warmed();
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

/**
 * The embedding space's view: how the 3D point cloud (layouts.ts `SpaceLayout`) is turned
 * and projected into its stage, and the HTML labels that follow it.
 *
 * - The cloud turns slowly on its own, a little more as the page scrolls, and tilts toward
 *   the cursor. The vertex shader applies the same rotation and projection to the
 *   particles (`uERot`, `uECenter`, `uEScale`); `project` mirrors it here for the labels.
 * - Labels are the real links and names from src/components/EmbeddingSpace.astro, moved
 *   every frame. Nearer labels sit on top and are brighter; a label that would collide
 *   with a more important one (projects first, then experience, then skills) fades back.
 * - Hovering or focusing a label lights up its cluster of particles (`uHighlight`).
 * - Ask (effects/ask.ts): `setQuery` flies the question in from in front of the cloud to
 *   its place, then draws faint lines to its nearest neighbours and lights them up.
 */
import { Matrix3, Vector2, Vector3, Vector4 } from 'three';
import type { SpaceLayout } from './layouts';
import { SPACE_CAMERA } from './shaders';

/** How a scene is viewed. */
export interface ViewPreset {
  /** The scene's radius as a share of the stage area's smaller side. */
  scale: number;
  /** Extra scale on portrait stages (phones), for scenes wider than they are tall once turned. */
  portrait: number;
  /** On wide stages, how far right of centre the scene sits (share of the width), to clear text on the left. */
  shift: number;
  /** Turning speed: radians per second on its own, per pixel scrolled, and toward the cursor. */
  spin: { time: number; scroll: number; pointer: number };
  /** Tilt toward the viewer (radians), and how far the cursor adds to it. */
  tilt: { base: number; pointer: number };
}

export const VIEW = {
  space: { scale: 0.5, portrait: 1, shift: 0.1, spin: { time: 0.09, scroll: 0.0011, pointer: 0.7 }, tilt: { base: 0.32, pointer: 0.45 } },
  landscape: { scale: 0.62, portrait: 0.62, shift: 0, spin: { time: 0.04, scroll: 0.0005, pointer: 0.45 }, tilt: { base: 0.62, pointer: 0.25 } },
} satisfies Record<string, ViewPreset>;
/** Labels within this many pixels of a more important one are faded back. */
const LABEL_GAP = 3;
/** Ask: how long the question takes to fly into place (s), and where it starts (in front). */
const QUERY_FLIGHT = 1.1;
const QUERY_START: [number, number, number] = [0, 0.15, 1.9];
const SVG_NS = 'http://www.w3.org/2000/svg';

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

interface LabelState {
  el: HTMLElement;
  /** Whether the static layout flips this label (restored on teardown). */
  flipped: boolean;
  index: number;
  priority: number;
  /** Landscape checkpoints: the progress at which the ball reaches this label. */
  progress?: number;
  width: number;
  height: number;
}

export interface SpaceView {
  /** Shared with the shader's uniforms. */
  rotation: Matrix3;
  center: Vector2;
  /** Pixels per space unit, for the shader. */
  scale: number;
  /** The point whose cluster is lit up (-1 for none), for the shader. */
  highlight: number;
  /** Progress through the scene (landscape: the descent), which labels with a `progress` wait for. */
  progress: number;
  /** Ask: where the question is (shader's uBall), how visible (uBallAlpha), its lit neighbours (uHits). */
  query: Vector3;
  queryAlpha: number;
  hits: Vector4;
  /** Ask: a question to show (null clears it). */
  setQuery(query: { position: [number, number, number]; hits: number[] } | null): void;
  setup(layout: SpaceLayout | null): void;
  /**
   * Scroll positions (px) where the morph into the space should be complete (the stage
   * has just stuck in the middle of the window) and where the morph out may begin (the
   * stage is about to scroll away). Null when the page has no space.
   */
  measure(): { arrive: number; release: number } | null;
  /** Per frame: turns the cloud, follows the stage and places the labels. */
  update(time: number, pointer: { x: number; y: number }, arrived: number, leaving: number): void;
  /** A point in space units to viewport pixels: [x, y, perspective, depth 0 (back) to 1 (front)]. */
  project(x: number, y: number, z: number): [number, number, number, number];
  teardown(): void;
}

export function createSpaceView(): SpaceView {
  const rotation = new Matrix3();
  const center = new Vector2(-9999, -9999);
  const r = new Float64Array(9); // row-major copy of `rotation`
  let layout: SpaceLayout | null = null;
  let labels: LabelState[] = [];
  let labelsShown = false;
  let removeListeners: (() => void) | null = null;
  let asked: { from: [number, number, number]; to: [number, number, number]; hits: number[]; start: number } | null = null;
  let links: SVGSVGElement | null = null;
  let lastTime = 0;

  const view: SpaceView = {
    rotation,
    center,
    scale: 1,
    highlight: -1,
    progress: 1,
    query: new Vector3(),
    queryAlpha: 0,
    hits: new Vector4(-1, -1, -1, -1),

    setQuery(next) {
      if (!next) {
        asked = null;
        return;
      }
      const from = asked && view.queryAlpha > 0.5 ? (view.query.toArray() as [number, number, number]) : QUERY_START;
      asked = { from, to: next.position, hits: next.hits.slice(0, 4), start: -1 };
    },

    setup(next) {
      view.teardown();
      layout = next;
      if (!layout) return;
      layout.stage.classList.add('is-projected');
      labels = layout.labels.map(({ el, index, priority, progress }) => ({
        el,
        flipped: el.classList.contains('is-flipped'),
        index,
        priority,
        progress,
        width: el.offsetWidth,
        height: el.offsetHeight,
      }));
      for (const label of labels) {
        label.el.style.opacity = '0';
        label.el.style.pointerEvents = 'none';
      }
      labelsShown = false;

      const listeners: [EventTarget, string, EventListener][] = [];
      for (const label of labels) {
        const on = () => {
          view.highlight = label.index;
          label.el.classList.add('is-active');
        };
        const off = () => {
          if (view.highlight === label.index) view.highlight = -1;
          label.el.classList.remove('is-active');
        };
        for (const [type, fn] of [['pointerenter', on], ['focusin', on], ['pointerleave', off], ['focusout', off]] as const) {
          label.el.addEventListener(type, fn);
          listeners.push([label.el, type, fn]);
        }
      }
      removeListeners = () => listeners.forEach(([target, type, fn]) => target.removeEventListener(type, fn));

      // Lines from the question to its neighbours (Ask), drawn over the cloud.
      links = document.createElementNS(SVG_NS, 'svg');
      links.setAttribute('class', 'space__links');
      links.setAttribute('aria-hidden', 'true');
      layout.area.prepend(links);
    },

    measure() {
      if (!layout?.section.isConnected) return null;
      const { section, stage } = layout;
      const sectionTop = section.getBoundingClientRect().top + scrollY;
      const style = getComputedStyle(section);
      const padTop = parseFloat(style.paddingTop) || 0;
      const padBottom = parseFloat(style.paddingBottom) || 0;
      const stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
      const arrive = Math.max(1, sectionTop + padTop - stickyTop);
      const release = Math.max(arrive + 1, sectionTop + section.offsetHeight - padBottom - stage.offsetHeight - stickyTop);
      return { arrive, release };
    },

    update(time, pointer, arrived, leaving) {
      if (!layout) return;
      // Turn: on its own, with the scroll, and toward the cursor.
      const { spin, tilt: lean, scale, portrait, shift } = layout.view;
      const yaw = time * spin.time + scrollY * spin.scroll + pointer.x * spin.pointer;
      const tilt = lean.base + pointer.y * lean.pointer;
      const [c, s, cb, sb] = [Math.cos(yaw), Math.sin(yaw), Math.cos(tilt), Math.sin(tilt)];
      // R = Rx(tilt) · Ry(yaw), row-major.
      r.set([c, 0, s, sb * s, cb, -sb * c, -cb * s, sb, cb * c]);
      rotation.set(r[0]!, r[1]!, r[2]!, r[3]!, r[4]!, r[5]!, r[6]!, r[7]!, r[8]!);

      const box = layout.area.getBoundingClientRect();
      const wide = box.width > box.height * 1.2;
      center.set(box.left + box.width * (0.5 + (wide ? shift : 0)), box.top + box.height / 2);
      // Portrait stages (phones) are narrower than the scene is wide once it turns: shrink it.
      view.scale = Math.min(box.width, box.height) * scale * (box.width < box.height ? portrait : 1);

      const visibility = smoothstep(0.75, 1, arrived) * (1 - smoothstep(0, 0.2, leaving));
      updateQuery(time);
      placeLabels(box, visibility);
      drawLinks(box, visibility);
    },

    project(x, y, z) {
      const sx = r[0]! * x + r[1]! * y + r[2]! * z;
      const sy = r[3]! * x + r[4]! * y + r[5]! * z;
      const sz = r[6]! * x + r[7]! * y + r[8]! * z;
      const persp = SPACE_CAMERA / (SPACE_CAMERA - sz);
      return [
        center.x + sx * view.scale * persp,
        center.y - sy * view.scale * persp,
        persp,
        Math.min(1, Math.max(0, sz * 0.5 + 0.5)),
      ];
    },

    teardown() {
      removeListeners?.();
      removeListeners = null;
      links?.remove();
      links = null;
      if (layout) {
        layout.stage.classList.remove('is-projected');
        for (const label of labels) {
          label.el.style.removeProperty('transform');
          label.el.style.removeProperty('opacity');
          label.el.style.removeProperty('pointer-events');
          label.el.style.removeProperty('z-index');
          label.el.classList.remove('is-active');
          label.el.classList.toggle('is-flipped', label.flipped);
        }
      }
      layout = null;
      labels = [];
      view.highlight = -1;
    },
  };

  /** Flies the question in, fades it, and lights its neighbours once it has arrived. */
  function updateQuery(time: number): void {
    const dt = Math.min(0.1, Math.max(0, time - lastTime));
    lastTime = time;
    const target = asked ? 1 : 0;
    view.queryAlpha += (target - view.queryAlpha) * Math.min(1, dt * 6);
    if (!asked) {
      view.hits.set(-1, -1, -1, -1);
      return;
    }
    if (asked.start < 0) asked.start = time;
    const t = Math.min(1, (time - asked.start) / QUERY_FLIGHT);
    const eased = 1 - (1 - t) ** 3;
    const { from, to } = asked;
    view.query.set(from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased, from[2] + (to[2] - from[2]) * eased);
    const [a = -1, b = -1, c = -1, d = -1] = t > 0.65 ? asked.hits : [];
    view.hits.set(a, b, c, d);
  }

  /** Faint lines from the question to each lit neighbour. */
  function drawLinks(box: DOMRect, visibility: number): void {
    if (!links || !layout) return;
    const hits = asked && view.hits.x >= 0 ? asked.hits : [];
    while (links.childElementCount > hits.length) links.lastElementChild!.remove();
    while (links.childElementCount < hits.length) links.append(document.createElementNS(SVG_NS, 'line'));
    if (!hits.length) return;
    const [qx, qy] = view.project(view.query.x, view.query.y, view.query.z);
    hits.forEach((index, i) => {
      const point = layout!.points[index];
      if (!point) return;
      const [x, y] = view.project(...point.p);
      const line = links!.children[i] as SVGLineElement;
      line.setAttribute('x1', (qx - box.left).toFixed(1));
      line.setAttribute('y1', (qy - box.top).toFixed(1));
      line.setAttribute('x2', (x - box.left).toFixed(1));
      line.setAttribute('y2', (y - box.top).toFixed(1));
      line.setAttribute('stroke-opacity', (visibility * view.queryAlpha * (0.75 - i * 0.15)).toFixed(3));
    });
  }

  /** Places every label on its point; fades labels that collide with more important ones. */
  function placeLabels(box: DOMRect, visibility: number): void {
    if (visibility <= 0.001) {
      if (labelsShown) {
        for (const label of labels) {
          label.el.style.opacity = '0';
          label.el.style.pointerEvents = 'none';
        }
        labelsShown = false;
      }
      return;
    }
    labelsShown = true;

    const placed = labels.map((label) => {
      const point = layout!.points[label.index]!;
      const [x, y, , depth] = view.project(...point.p);
      return { label, x: x - box.left, y: y - box.top, depth };
    });
    // Most important (then nearest) first: they keep their place. A question's matches come first of all.
    // On the landscape, the checkpoint the ball reached last wins over the ones before it.
    const rank = (label: LabelState) => {
      if (label.el.classList.contains('is-hit')) return 10;
      if (label.progress !== undefined && view.progress >= label.progress - 0.005) return label.priority + 1 + label.progress;
      return label.priority;
    };
    placed.sort((a, b) => rank(b.label) - rank(a.label) || b.depth - a.depth);
    const taken: [number, number, number, number][] = [];
    for (const { label, x, y, depth } of placed) {
      // Labels right of centre sit to the left of their point, so they stay on screen.
      const flip = x > box.width * 0.6;
      const left = flip ? x - label.width : x;
      const rect: [number, number, number, number] = [left - LABEL_GAP, y - label.height / 2 - LABEL_GAP, left + label.width + LABEL_GAP, y + label.height / 2 + LABEL_GAP];
      const blocked = taken.some((t) => rect[0] < t[2] && rect[2] > t[0] && rect[1] < t[3] && rect[3] > t[1]);
      if (!blocked) taken.push(rect);
      const waiting = label.progress !== undefined && view.progress < label.progress - 0.005;
      label.el.classList.toggle('is-reached', label.progress !== undefined && !waiting);
      const opacity =
        visibility * (0.35 + 0.65 * depth) * (blocked && view.highlight !== label.index ? 0.15 : 1) * (waiting ? 0.4 : 1);
      const { style } = label.el;
      label.el.classList.toggle('is-flipped', flip);
      style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) ${flip ? 'translate(calc(-100% + 0.15rem), -50%)' : 'translate(-0.15rem, -50%)'}`;
      style.opacity = opacity.toFixed(3);
      // Faded labels cannot be clicked by accident. (Opacity, not visibility, so keyboard
      // focus always reaches the links; focusing one scrolls the space into view.)
      style.pointerEvents = opacity > 0.3 ? '' : 'none';
      style.zIndex = String(Math.round(depth * 100) + (blocked ? 0 : 200));
    }
  }

  return view;
}

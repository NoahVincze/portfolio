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
 */
import { Matrix3, Vector2 } from 'three';
import type { SpaceLayout } from './layouts';
import { SPACE_CAMERA } from './shaders';

/** The cloud's radius as a share of the stage area's smaller side. */
const SCALE = 0.47;
/** Turning speed: radians per second on its own, and per pixel scrolled. */
const SPIN = { time: 0.09, scroll: 0.0011, pointer: 0.7 };
const TILT = { base: 0.32, pointer: 0.45 };
/** Labels within this many pixels of a more important one are faded back. */
const LABEL_GAP = 3;

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

  const view: SpaceView = {
    rotation,
    center,
    scale: 1,
    highlight: -1,

    setup(next) {
      view.teardown();
      layout = next;
      if (!layout) return;
      layout.stage.classList.add('is-projected');
      labels = layout.labels.map(({ el, index, priority }) => ({
        el,
        flipped: el.classList.contains('is-flipped'),
        index,
        priority,
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
      const yaw = time * SPIN.time + scrollY * SPIN.scroll + pointer.x * SPIN.pointer;
      const tilt = TILT.base + pointer.y * TILT.pointer;
      const [c, s, cb, sb] = [Math.cos(yaw), Math.sin(yaw), Math.cos(tilt), Math.sin(tilt)];
      // R = Rx(tilt) · Ry(yaw), row-major.
      r.set([c, 0, s, sb * s, cb, -sb * c, -cb * s, sb, cb * c]);
      rotation.set(r[0]!, r[1]!, r[2]!, r[3]!, r[4]!, r[5]!, r[6]!, r[7]!, r[8]!);

      const box = layout.area.getBoundingClientRect();
      center.set(box.left + box.width / 2, box.top + box.height / 2);
      view.scale = Math.min(box.width, box.height) * SCALE;

      placeLabels(box, smoothstep(0.75, 1, arrived) * (1 - smoothstep(0, 0.2, leaving)));
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
    // Most important (then nearest) first: they keep their place.
    placed.sort((a, b) => b.label.priority - a.label.priority || b.depth - a.depth);
    const taken: [number, number, number, number][] = [];
    for (const { label, x, y, depth } of placed) {
      // Labels right of centre sit to the left of their point, so they stay on screen.
      const flip = x > box.width * 0.6;
      const left = flip ? x - label.width : x;
      const rect: [number, number, number, number] = [left - LABEL_GAP, y - label.height / 2 - LABEL_GAP, left + label.width + LABEL_GAP, y + label.height / 2 + LABEL_GAP];
      const blocked = taken.some((t) => rect[0] < t[2] && rect[2] > t[0] && rect[1] < t[3] && rect[3] > t[1]);
      if (!blocked) taken.push(rect);
      const opacity = visibility * (0.35 + 0.65 * depth) * (blocked && view.highlight !== label.index ? 0.15 : 1);
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

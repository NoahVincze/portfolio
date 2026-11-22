/**
 * The shared frame loop. GSAP's ticker is the only requestAnimationFrame loop on the site:
 * Lenis smooth scroll, ScrollTrigger, timelines and (from Phase 3) the WebGL canvas all
 * update from it, so they can never drift out of sync.
 *
 * Smooth scroll runs only while motion is on. Turning motion off destroys Lenis and the
 * page falls back to native scrolling; turning it back on recreates it.
 */
import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './gsap';
import { isReduced } from './preference';

export type FrameCallback = (time: number, deltaTime: number, frame: number) => void;

let lenis: Lenis | null = null;
let started = false;

function driveLenis(time: number): void {
  lenis?.raf(time * 1000);
}

function enableSmoothScroll(): void {
  if (lenis) return;
  // Anchor links keep their native jump, so the skip link still moves keyboard focus.
  lenis = new Lenis({ autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
}

function disableSmoothScroll(): void {
  if (!lenis) return;
  lenis.destroy();
  lenis = null;
}

function syncWithPreference(): void {
  if (isReduced()) disableSmoothScroll();
  else enableSmoothScroll();
  ScrollTrigger.refresh();
}

/** Starts the loop. Call once per page load, after `initMotionPreference()`. */
export function startMotion(): void {
  if (started) return;
  started = true;
  gsap.ticker.add(driveLenis);
  // Lenis handles its own timing; GSAP must not skip frames to "catch up" after a stall.
  gsap.ticker.lagSmoothing(0);
  syncWithPreference();
  window.addEventListener('motion:change', syncWithPreference);
}

/** Runs `callback` on every frame of the shared loop. Returns a function that stops it. */
export function onFrame(callback: FrameCallback): () => void {
  gsap.ticker.add(callback);
  return () => gsap.ticker.remove(callback);
}

/** The active Lenis instance, or null while motion is reduced. */
export function getLenis(): Lenis | null {
  return lenis;
}

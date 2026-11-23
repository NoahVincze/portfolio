/**
 * Page lifecycle for animations.
 *
 * With Astro's ClientRouter, bundled scripts run once, but the page content is swapped on
 * every navigation. Effects therefore register here with `definePageEffect` and are built
 * for each page inside one gsap.context. Before the next swap the context is reverted,
 * which kills every tween, ScrollTrigger and SplitText the page created. Effects are also
 * rebuilt when the motion switch changes, so each one only has to handle the current mode.
 */
import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { gsap, ScrollTrigger } from './gsap';
import { introFinished } from './intro';
import { isReduced } from './preference';

export interface PageEffectEnv {
  /** True when motion is reduced (system setting or footer toggle). */
  reduced: boolean;
  /**
   * Project URLs whose covers were on the previous page. Those covers morph into place
   * through the page transition, so their own entrance animation is skipped.
   */
  morphed: ReadonlySet<string>;
  /**
   * True when the visitor has already seen this page's content (first load, or a rebuild).
   * False right after a client-side navigation, before the new page is first shown, when
   * hiding on-screen elements for an entrance cannot cause a flash.
   */
  painted: boolean;
}

/**
 * An effect may return a cleanup function for anything GSAP cannot revert by itself
 * (event listeners, classes it added). It runs when the page is left or rebuilt.
 */
export type PageEffect = (env: PageEffectEnv) => void | (() => void);

const effects: PageEffect[] = [];
let context: gsap.Context | null = null;
let builtFor: Element | null = null;
let morphed: ReadonlySet<string> = new Set();
let navigating = false;
let started = false;
let introDone = false;
void introFinished.then(() => {
  introDone = true;
});

/** Registers an effect. It runs once per page, inside a gsap.context that is reverted on leave. */
export function definePageEffect(effect: PageEffect): void {
  effects.push(effect);
}

function build(painted = true): void {
  const main = document.querySelector('main');
  if (!main || builtFor === main) return;
  teardown();
  builtFor = main;
  const env: PageEffectEnv = { reduced: isReduced(), morphed, painted };
  context = gsap.context(() => {
    const cleanups = effects.map((effect) => effect(env)).filter((cleanup) => typeof cleanup === 'function');
    return () => cleanups.forEach((cleanup) => cleanup());
  });
  ScrollTrigger.refresh();
}

/** Tears the current page's effects down and builds them again (e.g. after a breakpoint change). */
export function rebuildPageEffects(): void {
  if (!started) return;
  teardown();
  build();
}

function teardown(): void {
  context?.revert();
  context = null;
  builtFor = null;
}

/** Moves focus to the new page's main heading, so keyboard and screen reader users start there. */
function focusMainHeading(): void {
  const heading = document.querySelector<HTMLElement>('main h1');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

/**
 * Astro replaces <html>'s attributes with the new page's on every swap. Copy over the ones
 * set in the browser (the motion mode, Lenis's state classes and the hero's `hero-live`)
 * so nothing flips mid-transition.
 */
function carryRootState(event: TransitionBeforeSwapEvent): void {
  const current = document.documentElement;
  const next = event.newDocument.documentElement;
  if (current.dataset.motion) next.dataset.motion = current.dataset.motion;
  for (const name of current.classList) {
    if (name.startsWith('lenis') || name.startsWith('hero-')) next.classList.add(name);
  }
}

/** Call once, after `startMotion()`. Builds the current page and wires up navigation. */
export function startPageEffects(): void {
  if (started) return;
  started = true;

  document.addEventListener('astro:before-preparation', () => {
    navigating = true;
  });
  document.addEventListener('astro:before-swap', (event: TransitionBeforeSwapEvent) => {
    morphed = new Set(
      [...document.querySelectorAll<HTMLElement>('[data-project-url]')].map((el) => el.dataset.projectUrl!),
    );
    carryRootState(event);
    teardown();
  });
  // Fires on first load too (on window load). `build` skips a page that is already built.
  document.addEventListener('astro:page-load', () => {
    if (!navigating && !introDone) return;
    build(!navigating);
    if (navigating) {
      navigating = false;
      focusMainHeading();
    }
  });
  window.addEventListener('motion:change', () => {
    morphed = new Set();
    teardown();
    build();
  });

  // Module scripts run after the document is parsed, so the first page can build as soon as
  // the first-visit intro (if any) is done, instead of waiting for every image to load.
  void introFinished.then(() => build());

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __motion: { scrollTriggers: () => ScrollTrigger.getAll().length, effects: () => effects.length },
    });
  }
}

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
import { isReduced } from './preference';

export interface PageEffectEnv {
  /** True when motion is reduced (system setting or footer toggle). */
  reduced: boolean;
  /**
   * Project URLs whose covers were on the previous page. Those covers morph into place
   * through the page transition, so their own entrance animation is skipped.
   */
  morphed: ReadonlySet<string>;
}

export type PageEffect = (env: PageEffectEnv) => void;

const effects: PageEffect[] = [];
let context: gsap.Context | null = null;
let builtFor: Element | null = null;
let morphed: ReadonlySet<string> = new Set();
let navigating = false;
let started = false;

/** Registers an effect. It runs once per page, inside a gsap.context that is reverted on leave. */
export function definePageEffect(effect: PageEffect): void {
  effects.push(effect);
}

function build(): void {
  const main = document.querySelector('main');
  if (!main || builtFor === main) return;
  teardown();
  builtFor = main;
  const env: PageEffectEnv = { reduced: isReduced(), morphed };
  context = gsap.context(() => {
    for (const effect of effects) effect(env);
  });
  ScrollTrigger.refresh();
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
 * set in the browser (the motion mode and Lenis's state classes) so nothing flips mid-transition.
 */
function carryRootState(event: TransitionBeforeSwapEvent): void {
  const current = document.documentElement;
  const next = event.newDocument.documentElement;
  if (current.dataset.motion) next.dataset.motion = current.dataset.motion;
  for (const name of current.classList) {
    if (name.startsWith('lenis')) next.classList.add(name);
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
    build();
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

  // Module scripts run after the document is parsed, so the first page can build right away
  // instead of waiting for every image to load.
  build();

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __motion: { scrollTriggers: () => ScrollTrigger.getAll().length, effects: () => effects.length },
    });
  }
}

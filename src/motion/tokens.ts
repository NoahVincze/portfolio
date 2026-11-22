/**
 * Motion tokens: the single source of truth for timing on the site.
 *
 * CSS custom properties are generated from these objects (`tokensToCss`, injected by
 * BaseLayout), and GSAP reads the same objects (`src/motion/gsap.ts`), so CSS and
 * JavaScript animations can never drift apart. Change a value here and both follow.
 */

/** Durations in milliseconds. */
export const duration = {
  instant: 100, // colour and underline changes on hover
  quick: 200, // buttons, focus rings, cursor states
  base: 400, // component entrances, menu open
  slow: 800, // heading and image reveals on scroll
  cinematic: 1400, // hero intro, page transitions
} as const;

/** Cubic-bezier control points [x1, y1, x2, y2]. */
export const easing = {
  out: [0.22, 1, 0.36, 1], // everything that enters
  inOut: [0.65, 0, 0.35, 1], // things that move while staying on screen
  in: [0.32, 0, 0.67, 0], // everything that leaves
} as const;

/** Stagger steps in milliseconds. A group's total stagger never exceeds `maxTotal`. */
export const stagger = {
  char: 20,
  word: 40,
  item: 60,
  maxTotal: 600,
} as const;

/** Exits run at this fraction of the matching entrance duration. */
export const exitRatio = 0.6;

export type DurationToken = keyof typeof duration;
export type EasingToken = keyof typeof easing;
export type StaggerToken = Exclude<keyof typeof stagger, 'maxTotal'>;

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** `:root { --dur-*; --ease-*; --stagger-* }`, generated from the tokens above. */
export function tokensToCss(): string {
  const props = [
    ...Object.entries(duration).map(([name, ms]) => `--dur-${name}: ${ms}ms;`),
    ...Object.entries(easing).map(
      ([name, points]) => `--ease-${kebab(name)}: cubic-bezier(${points.join(', ')});`,
    ),
    ...Object.entries(stagger).map(([name, ms]) => `--stagger-${kebab(name)}: ${ms}ms;`),
  ];
  return `:root { ${props.join(' ')} }`;
}

/** A duration in seconds, for GSAP. Pass `{ exit: true }` for the shorter exit timing. */
export function seconds(token: DurationToken, { exit = false } = {}): number {
  return (duration[token] * (exit ? exitRatio : 1)) / 1000;
}

/** Per-item stagger in seconds for a group of `count`, capped so the group stays under `maxTotal`. */
export function staggerFor(token: StaggerToken, count: number): number {
  const step = stagger[token];
  const capped = count > 1 ? Math.min(step, stagger.maxTotal / (count - 1)) : step;
  return capped / 1000;
}

/** GSAP ease names registered from `easing` (see src/motion/gsap.ts). */
export const gsapEase: Record<EasingToken, string> = {
  out: 'motionOut',
  inOut: 'motionInOut',
  in: 'motionIn',
};

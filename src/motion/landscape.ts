/**
 * The loss landscape on the About page: a made-up but well-behaved loss surface (a wide
 * bowl with one global minimum, two local minima and some ripples) and a real gradient
 * descent with momentum across it. Pure and deterministic, so the static plot drawn at
 * build time (src/components/LossLandscape.astro) and the particle version in the browser
 * (src/motion/hero) show the same run.
 *
 * Coordinates: x, y in [-DOMAIN, DOMAIN]. For display everything is mapped into the unit
 * square [-1, 1]², with the surface height as the third axis.
 */

export const DOMAIN = 2.6;
export const START: [number, number] = [-2.25, 2.05];
export const LEARNING_RATE = 0.022;
export const MOMENTUM = 0.9;
export const STEPS = 160;

const well = (x: number, y: number, cx: number, cy: number, depth: number, width: number) =>
  -depth * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / width);

export function loss(x: number, y: number): number {
  return (
    0.16 * (x * x + y * y) +
    well(x, y, 0.95, -0.7, 1.35, 0.5) + // the global minimum
    well(x, y, -1.15, -0.95, 0.72, 0.32) + // a local minimum
    well(x, y, -0.35, 1.25, 0.6, 0.28) + // another, on the way down
    0.22 * Math.sin(2.3 * x) * Math.cos(1.9 * y) * Math.exp(-0.1 * (x * x + y * y)) + // ripples
    1.6
  );
}

/** Central differences: exact enough, and keeps `loss` the single definition. */
export function gradient(x: number, y: number): [number, number] {
  const h = 1e-4;
  return [(loss(x + h, y) - loss(x - h, y)) / (2 * h), (loss(x, y + h) - loss(x, y - h)) / (2 * h)];
}

export interface Step {
  x: number;
  y: number;
  loss: number;
}

/** Gradient descent with (heavy-ball) momentum from START. */
export function descend(): Step[] {
  let [x, y] = START;
  let vx = 0;
  let vy = 0;
  const steps: Step[] = [{ x, y, loss: loss(x, y) }];
  for (let i = 0; i < STEPS; i++) {
    const [gx, gy] = gradient(x, y);
    vx = MOMENTUM * vx - LEARNING_RATE * gx;
    vy = MOMENTUM * vy - LEARNING_RATE * gy;
    x += vx;
    y += vy;
    steps.push({ x, y, loss: loss(x, y) });
  }
  return steps;
}

/** The surface's lowest and highest loss over the domain (sampled), for normalising heights. */
export function lossRange(samples = 80): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i <= samples; i++) {
    for (let j = 0; j <= samples; j++) {
      const value = loss(-DOMAIN + (2 * DOMAIN * i) / samples, -DOMAIN + (2 * DOMAIN * j) / samples);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return [min, max];
}

/** The step at progress p (0 to 1) through the run, interpolated between steps. */
export function stepAt(steps: Step[], p: number): Step {
  const at = Math.min(1, Math.max(0, p)) * (steps.length - 1);
  const i = Math.floor(at);
  const a = steps[i]!;
  const b = steps[Math.min(i + 1, steps.length - 1)]!;
  const t = at - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, loss: a.loss + (b.loss - a.loss) * t };
}

/**
 * Where to put `count` checkpoints along the run: evenly spaced by distance travelled
 * (not by step, since the descent moves fast at first and slowly at the end) up to the
 * point where it has converged, so the momentum's small circles around the minimum do not
 * crowd the last checkpoints together. The last checkpoint is the arrival. Returns
 * progress values (0 to 1).
 */
export function checkpoints(steps: Step[], count: number): number[] {
  const end = steps[steps.length - 1]!;
  const arrived = Math.max(1, steps.findIndex((s) => Math.hypot(s.x - end.x, s.y - end.y) < 0.12));
  const distance = [0];
  for (let i = 1; i <= arrived; i++) {
    distance.push(distance[i - 1]! + Math.hypot(steps[i]!.x - steps[i - 1]!.x, steps[i]!.y - steps[i - 1]!.y));
  }
  const total = distance[arrived]!;
  return Array.from({ length: count }, (_, k) => {
    const target = (total * (k + 1)) / count;
    const i = distance.findIndex((d) => d >= target - 1e-9);
    return (i < 0 ? arrived : i) / (steps.length - 1);
  });
}

let run: Step[] | null = null;

export function descentReadout(step: number): string {
  const steps = (run ??= descend());
  const at = steps[Math.min(Math.max(step, 0), steps.length - 1)]!;
  return `step ${String(step).padStart(3, '0')}/${STEPS} · loss ${at.loss.toFixed(3)} · lr ${LEARNING_RATE} · momentum ${MOMENTUM}`;
}

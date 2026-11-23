/**
 * The training run shown by the first-visit intro: a loss curve and a validation curve
 * over a few epochs. Deterministic (seeded), so the SVG drawn at build time (BaseLayout)
 * and the numbers ticking in the browser (intro.ts) always describe the same run.
 *
 * The training loss starts at ln(10) ≈ 2.303, the cross-entropy of an untrained classifier
 * guessing among 10 classes, and decays with mini-batch noise. Validation loss is smoother,
 * decays a little slower and settles slightly above it, as it should.
 */

export const EPOCHS = 12;
const STEPS_PER_EPOCH = 8;
const POINTS = EPOCHS * STEPS_PER_EPOCH + 1;

/** Chart size in SVG user units (the SVG scales uniformly to its box). */
export const CHART = { width: 600, height: 168, max: 2.4 } as const;

export interface TrainingRun {
  train: number[];
  val: number[];
}

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function trainingRun(): TrainingRun {
  const rand = random(10);
  const train: number[] = [];
  const val: number[] = [];
  for (let i = 0; i < POINTS; i++) {
    const x = i / (POINTS - 1);
    const batchNoise = i === 0 ? 0 : (rand() - 0.5) * 0.16 * (1 - 0.75 * x);
    train.push(Math.max(0.03, 0.058 + 2.245 * Math.exp(-4.8 * x) + batchNoise));
    val.push(Math.max(0.05, 0.112 + 2.19 * Math.exp(-3.9 * x) + (rand() - 0.5) * 0.04));
  }
  return { train, val };
}

/** An SVG path through `values`, spread across the chart's width. */
export function chartPath(values: number[]): string {
  const { width, height, max } = CHART;
  const pad = 4;
  return values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = pad + (1 - Math.min(value, max) / max) * (height - pad * 2);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
}

/** The value at progress p (0 to 1) through the run, interpolated between points. */
export function valueAt(values: number[], p: number): number {
  const at = Math.min(1, Math.max(0, p)) * (values.length - 1);
  const i = Math.floor(at);
  const next = values[Math.min(i + 1, values.length - 1)]!;
  return values[i]! + (next - values[i]!) * (at - i);
}

/** The epoch (1 to EPOCHS) at progress p. */
export function epochAt(p: number): number {
  return Math.min(EPOCHS, 1 + Math.floor(Math.min(1, Math.max(0, p)) * EPOCHS));
}

export const formatEpoch = (epoch: number) => `${String(epoch).padStart(2, '0')}/${EPOCHS}`;
export const formatLoss = (loss: number) => loss.toFixed(3);

/**
 * From embeddings to the 3D embedding space shown on the site.
 *
 * Vectors come from the cache written by `npm run embed` (all-MiniLM-L6-v2, 384 dimensions,
 * mean-pooled and normalised). They are projected to three dimensions with PCA: with the
 * few dozen points a portfolio has, PCA is stable and deterministic, and its axes mean the
 * same thing on every build, where UMAP or t-SNE would reshuffle the picture. For display,
 * each axis is then scaled to the same extent.
 *
 * If any item is missing from the cache (new content, `npm run embed` not run yet), the
 * whole space falls back to a hashed bag-of-words embedding computed here, so the build
 * never needs the network or the model. Mixing the two kinds of vector in one projection
 * would be meaningless, so it is all or nothing.
 *
 * Pure TypeScript, shared by the site build and scripts/embed.ts.
 */
import type { CorpusItem, ItemKind } from './corpus.ts';
import { textKey } from './corpus.ts';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DIMENSIONS = 384;

export interface EmbeddingCache {
  model: string;
  dims: number;
  /** textKey(item.text) -> unit vector. */
  vectors: Record<string, number[]>;
}

export interface SpacePoint {
  id: string;
  kind: ItemKind;
  label: string;
  href?: string;
  parent?: string;
  tags?: readonly string[];
  /** Position in the space, roughly within the unit sphere. */
  position: [number, number, number];
}

export interface EmbeddingSpace {
  points: SpacePoint[];
  /** Where the vectors came from: the real model, or the hashed fallback. */
  source: 'model' | 'hashed';
  model: string;
  /** Items that had no cached vector (all of them use the fallback when this is above 0). */
  missing: number;
  /** Projects' full vectors, for re-projecting subsets in the browser (the work map). */
  projectVectors: Record<string, number[]>;
  /** Every point's full vector, in the order of `points` (for search). */
  vectors: number[][];
  /** The projection that placed the points, for placing a question among them. */
  projection: Projection;
}

const STOP_WORDS = new Set(
  'a an and are as at be by for from has have i in is it its of on or that the this to was were what which who will with you your one two'.split(' '),
);

/** Fallback: words hashed into DIMENSIONS buckets (signed), log term frequency, unit length. */
export function hashedEmbedding(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    const key = textKey(word);
    const bucket = parseInt(key.slice(0, 8), 16) % DIMENSIONS;
    const sign = parseInt(key.slice(8, 9), 16) % 2 ? 1 : -1;
    vector[bucket]! += sign;
  }
  return normalise(vector.map((v) => Math.sign(v) * Math.log1p(Math.abs(v))));
}

function normalise(vector: number[]): number[] {
  const length = Math.hypot(...vector) || 1;
  return vector.map((v) => v / length);
}

const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);

/**
 * A fitted projection: subtract `mean`, take the dot product with each of `axes` (unit
 * vectors in the embedding space), then divide by `extent` per axis and by `radius`. Any
 * new vector (a visitor's question) projected this way lands in the same display space.
 */
export interface Projection {
  mean: number[];
  axes: number[][];
  extent: number[];
  radius: number;
}

/**
 * Principal component analysis by power iteration on the Gram matrix (n x n, cheap for
 * small n). Returns each row's first `k` scores and the axes that produce them. Each
 * component's sign is fixed so its skew is positive, which keeps the picture from flipping
 * between builds.
 */
export function pcaFit(vectors: number[][], k: number): { scores: number[][]; mean: number[]; axes: number[][] } {
  const n = vectors.length;
  const dims = vectors[0]?.length ?? 0;
  const mean = new Array<number>(dims).fill(0);
  for (const v of vectors) v.forEach((x, i) => (mean[i]! += x / n));
  const centred = vectors.map((v) => v.map((x, i) => x - mean[i]!));
  const gram = centred.map((a) => centred.map((b) => dot(a, b)));

  const scores = Array.from({ length: n }, () => new Array<number>(k).fill(0));
  const axes = Array.from({ length: k }, () => new Array<number>(dims).fill(0));
  for (let c = 0; c < k && n > 0; c++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i * 12.9898 + c * 78.233) + 1.5);
    let lambda = 0;
    for (let iter = 0; iter < 200; iter++) {
      const next = gram.map((row) => dot(row, v));
      lambda = Math.hypot(...next);
      if (lambda < 1e-12) break;
      v = next.map((x) => x / lambda);
    }
    if (lambda < 1e-12) break; // no variance left: the remaining axes stay at 0
    // Deflate, so the next round finds the next component.
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) gram[i]![j]! -= lambda * v[i]! * v[j]!;
    const sign = v.reduce((sum, x) => sum + x * x * x, 0) < 0 ? -1 : 1;
    const root = Math.sqrt(lambda);
    for (let i = 0; i < n; i++) scores[i]![c] = v[i]! * root * sign;
    // The axis in the embedding space: Xᵀv / √λ (unit length), so (x - mean)·axis is the score.
    for (let i = 0; i < n; i++) {
      const weight = (v[i]! * sign) / root;
      centred[i]!.forEach((x, d) => (axes[c]![d]! += x * weight));
    }
  }
  return { scores, mean, axes };
}

/** The first `k` principal component scores of `vectors` (rows). */
export function pca(vectors: number[][], k: number): number[][] {
  return pcaFit(vectors, k).scores;
}

/**
 * For display: each axis scaled to the same extent (PC1 usually dwarfs the others, which
 * would flatten the cloud into a line), then the whole cloud fitted inside the unit sphere.
 */
function displayScale(points: number[][]): { extent: number[]; radius: number } {
  const k = points[0]?.length ?? 0;
  const extent = Array.from({ length: k }, (_, c) => Math.max(1e-9, ...points.map((p) => Math.abs(p[c]!))));
  const scaled = points.map((p) => p.map((x, c) => (extent[c]! > 1e-6 ? x / extent[c]! : 0)));
  const radius = Math.max(1e-9, ...scaled.map((p) => Math.hypot(...p)));
  return { extent, radius };
}

function scaleForDisplay(point: number[], { extent, radius }: { extent: number[]; radius: number }): number[] {
  return point.map((x, c) => (extent[c]! > 1e-6 ? x / extent[c]! / radius : 0));
}

/** PCA to `k` dimensions, scaled for display to fit the unit sphere. */
export function projectForDisplay(vectors: number[][], k: number): number[][] {
  const scores = pca(vectors, k);
  const scale = displayScale(scores);
  return scores.map((p) => scaleForDisplay(p, scale));
}

/** Fits PCA and the display scale, returning the points and the projection that made them. */
export function fitProjection(vectors: number[][], k: number): { positions: number[][]; projection: Projection } {
  const { scores, mean, axes } = pcaFit(vectors, k);
  const scale = displayScale(scores);
  return { positions: scores.map((p) => scaleForDisplay(p, scale)), projection: { mean, axes, ...scale } };
}

/** Any vector (e.g. a question's embedding) into the display space of a fitted projection. */
export function project(vector: number[], projection: Projection): number[] {
  const centred = vector.map((x, i) => x - projection.mean[i]!);
  return scaleForDisplay(
    projection.axes.map((axis) => dot(centred, axis)),
    projection,
  );
}

export function buildSpace(items: readonly CorpusItem[], cache: EmbeddingCache | null): EmbeddingSpace {
  const usable = cache && cache.model === MODEL && cache.dims === DIMENSIONS ? cache.vectors : {};
  const cached = items.map((item) => usable[textKey(item.text)]);
  const missing = cached.filter((v) => !v).length;
  const source = items.length > 0 && missing === 0 ? 'model' : 'hashed';
  const vectors = source === 'model' ? (cached as number[][]) : items.map((item) => hashedEmbedding(item.text));

  const { positions, projection } = fitProjection(vectors, 3);
  const points = items.map((item, i) => ({
    id: item.id,
    kind: item.kind,
    label: item.label,
    ...(item.href ? { href: item.href } : {}),
    ...(item.parent ? { parent: item.parent } : {}),
    ...(item.tags ? { tags: item.tags } : {}),
    position: (positions[i] ?? [0, 0, 0]).map((x) => Math.round(x * 1e4) / 1e4) as [number, number, number],
  }));

  const projectVectors: Record<string, number[]> = {};
  items.forEach((item, i) => {
    if (item.kind === 'project') projectVectors[item.id] = vectors[i]!.map((x) => Math.round(x * 1e5) / 1e5);
  });
  const round = (values: number[]) => values.map((x) => Math.round(x * 1e5) / 1e5);
  return {
    points,
    source,
    model: source === 'model' ? MODEL : 'hashed bag of words',
    missing,
    projectVectors,
    vectors: vectors.map(round),
    projection: { mean: round(projection.mean), axes: projection.axes.map(round), extent: projection.extent, radius: projection.radius },
  };
}

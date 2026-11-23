/**
 * Particle layouts: where every particle should sit for a given page, measured from the
 * real DOM so particles line up exactly with the HTML they stand in for.
 *
 *   Home:        A = the name in the hero heading plus a field of particles across the
 *                whole hero, B = the first project cover. Scrolling morphs A into B, by way
 *                of the embedding space (E, see `SpaceLayout`) when the page has one.
 *   Other pages: A = B = a faint field of dust behind the content.
 */

export type RGB = [number, number, number];

export interface Layout {
  /** x, y per particle. Document pixels when scrollFactor is 1, viewport pixels otherwise. */
  positions: Float32Array;
  /** 1 = moves with the page; small values = a background layer with slight parallax. */
  scrollFactor: number;
  color: RGB;
  alpha: number;
  /** Point size in CSS pixels. */
  size: number;
  /** Fraction of particles that are visible (0 to 1). */
  density: number;
  /**
   * An ambient field: particles from index `from * count` on are spread over `rect`
   * (document pixels: x, y, width, height). The shader drifts them sideways, draws them
   * smaller and fainter, and lets the cursor sweep through them.
   */
  field?: { from: number; rect: [number, number, number, number] };
}

/** Share of the particles that form the home hero's ambient field instead of the name. */
export const HERO_FIELD_SHARE = 0.4;

/**
 * The embedding space (home): a 3D point cloud, one cluster per embedded item
 * (src/components/EmbeddingSpace.astro). Positions are in the space's own units (the
 * unit sphere); the vertex shader rotates and projects them into the stage every frame.
 */
export interface SpaceLayout {
  section: HTMLElement;
  stage: HTMLElement;
  /** The area the cloud fills (the labels' container). */
  area: HTMLElement;
  /** x, y, z per particle. */
  positions: Float32Array;
  /** Per particle: accent tint (0 or 1) and the index of the point it belongs to. */
  info: Float32Array;
  points: SpacePointData[];
  labels: { el: HTMLElement; index: number; priority: number }[];
}

export interface SpacePointData {
  p: [number, number, number];
  k: 'project' | 'passage' | 'skill' | 'experience';
}

export interface PageLayouts {
  a: Layout;
  b: Layout;
  /** The embedding space between A and B (home), if the page has one. */
  space: SpaceLayout | null;
  /** Home only: the particles fade out as they land on the real cover image. */
  fadeOnArrival: boolean;
  /** The element whose position ends the scroll morph, if the page has one. */
  morphEnd: HTMLElement | null;
}

/** Small, fast, seedable random number generator (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

let probe: CanvasRenderingContext2D | null = null;

function context2d(width = 1, height = 1): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', { willReadFrequently: true })!;
}

/** Any CSS colour (hex, rgb, oklch, ...) as sRGB values from 0 to 1. */
export function cssColor(value: string): RGB {
  probe ??= context2d();
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

interface TextLine {
  text: string;
  left: number;
  top: number;
  /** 'linebox': top is the top of the CSS line box. 'content': top of the glyphs' content area. */
  kind: 'linebox' | 'content';
}

/**
 * The heading's lines in document coordinates. Uses SplitText's line masks when present
 * (they never move, unlike the lines inside them); otherwise measures words with a Range.
 */
function linesOf(el: HTMLElement): TextLine[] {
  const masks = el.querySelectorAll<HTMLElement>('.reveal-line-mask');
  if (masks.length) {
    return [...masks].map((mask) => {
      const rect = mask.getBoundingClientRect();
      return { text: mask.textContent?.trim() ?? '', left: rect.left + scrollX, top: rect.top + scrollY, kind: 'linebox' };
    });
  }

  const lines = new Map<number, { words: string[]; left: number; top: number }>();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    for (const match of text.matchAll(/\S+/g)) {
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const rect = range.getBoundingClientRect();
      const key = Math.round(rect.top);
      const line = lines.get(key) ?? { words: [], left: rect.left, top: rect.top };
      line.words.push(match[0]);
      line.left = Math.min(line.left, rect.left);
      lines.set(key, line);
    }
  }
  return [...lines.values()].map((line) => ({
    text: line.words.join(' '),
    left: line.left + scrollX,
    top: line.top + scrollY,
    kind: 'content',
  }));
}

/** Particles placed on the glyphs of `el`'s text, drawn with its own font. */
function textLayout(el: HTMLElement, count: number, color: RGB, rand: () => number): Layout | null {
  const style = getComputedStyle(el);
  const fontSize = parseFloat(style.fontSize);
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const lines = linesOf(el).filter((line) => line.text);
  if (!lines.length) return null;

  const measure = context2d();
  measure.font = font;
  measure.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
  const metrics = measure.measureText('Hg');
  const ascent = metrics.fontBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.fontBoundingBoxDescent || fontSize * 0.2;
  const baselineOf = (line: TextLine) =>
    line.kind === 'linebox' ? line.top + (lineHeight - (ascent + descent)) / 2 + ascent : line.top + ascent;

  const pad = Math.ceil(fontSize * 0.3);
  const minX = Math.min(...lines.map((l) => l.left)) - pad;
  const maxX = Math.max(...lines.map((l) => l.left + measure.measureText(l.text).width)) + pad;
  const minY = Math.min(...lines.map((l) => baselineOf(l) - ascent)) - pad;
  const maxY = Math.max(...lines.map((l) => baselineOf(l) + descent)) + pad;
  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY);
  if (width <= 0 || height <= 0) return null;

  const ctx = context2d(width, height);
  ctx.font = font;
  ctx.letterSpacing = measure.letterSpacing;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000';
  for (const line of lines) ctx.fillText(line.text, line.left - minX, baselineOf(line) - minY);

  const pixels = ctx.getImageData(0, 0, width, height).data;
  const hits: number[] = [];
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 127) hits.push((i - 3) / 4);
  if (!hits.length) return null;

  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const hit = hits[Math.floor(rand() * hits.length)]!;
    positions[i * 2] = minX + (hit % width) + rand();
    positions[i * 2 + 1] = minY + Math.floor(hit / width) + rand();
  }
  const size = Math.min(3.6, Math.max(1.4, Math.sqrt(hits.length / count) * 1.5));
  return { positions, scrollFactor: 1, color, alpha: 1, size, density: 1 };
}

/** Particles spread over a rectangle, in its colour (used for the first project cover). */
function rectLayout(frame: HTMLElement, count: number, rand: () => number): Layout {
  const rect = frame.getBoundingClientRect();
  const media = frame.querySelector<HTMLElement>('[data-reveal-media]') ?? frame;
  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    positions[i * 2] = rect.left + scrollX + rand() * rect.width;
    positions[i * 2 + 1] = rect.top + scrollY + rand() * rect.height;
  }
  const size = Math.min(4, Math.max(1.5, Math.sqrt((rect.width * rect.height) / count) * 0.9));
  return { positions, scrollFactor: 1, color: cssColor(getComputedStyle(media).backgroundColor), alpha: 1, size, density: 1 };
}

/** A faint field behind the content, different for every page. */
function dustLayout(count: number, color: RGB, rand: () => number): Layout {
  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    positions[i * 2] = rand() * innerWidth;
    positions[i * 2 + 1] = rand() * innerHeight * 1.3;
  }
  return { positions, scrollFactor: 0.08, color, alpha: 0.35, size: 1.8, density: 0.18 };
}

/** Positions spread evenly over a rectangle (document pixels), jittered so it never looks like a grid. */
function fieldPositions(rect: [number, number, number, number], count: number, rand: () => number): Float32Array {
  const [x, y, width, height] = rect;
  const columns = Math.max(1, Math.round(Math.sqrt((count * width) / height)));
  const rows = Math.ceil(count / columns);
  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    positions[i * 2] = x + ((i % columns) + rand()) * (width / columns);
    positions[i * 2 + 1] = y + (Math.floor(i / columns) + rand()) * (height / rows);
  }
  return positions;
}

/** Random positions across the viewport: where particles start before the intro. */
export function scatteredPositions(count: number, rand = Math.random): Float32Array {
  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    positions[i * 2] = rand() * innerWidth;
    positions[i * 2 + 1] = rand() * innerHeight;
  }
  return positions;
}

/** How many particles each kind of point gets, relative to the others, and how tight they sit. */
const SPACE_WEIGHT = { project: 12, experience: 5, skill: 5, passage: 1.2 } as const;
const SPACE_SPREAD = { project: 0.05, experience: 0.035, skill: 0.035, passage: 0.07 } as const;
const LABEL_PRIORITY = { project: 3, experience: 2, skill: 1, passage: 0 } as const;

function gaussian(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-9))) * Math.cos(2 * Math.PI * rand());
}

/**
 * Particles for the embedding space. Particles below `fieldFrom` (by rank) form tight
 * clusters on the points; the rest are a faint halo: some loosely around points, some
 * spread through the whole sphere, so the space reads as a volume.
 */
function spaceLayout(count: number, fieldFrom: number, rand: () => number): SpaceLayout | null {
  const section = document.querySelector<HTMLElement>('[data-space]');
  const stage = section?.querySelector<HTMLElement>('[data-space-stage]');
  const area = section?.querySelector<HTMLElement>('[data-space-labels]');
  const json = section?.querySelector('[data-space-points]')?.textContent;
  if (!section || !stage || !area || !json) return null;
  let points: SpacePointData[];
  try {
    points = JSON.parse(json) as SpacePointData[];
  } catch {
    return null;
  }
  if (!points.length) return null;

  // Cumulative weights, to pick a point for each particle.
  const cumulative: number[] = [];
  let total = 0;
  for (const point of points) cumulative.push((total += SPACE_WEIGHT[point.k] ?? 1));
  const pick = () => {
    const r = rand() * total;
    let i = 0;
    while (cumulative[i]! < r) i++;
    return i;
  };

  const positions = new Float32Array(count * 3);
  const info = new Float32Array(count * 2);
  const fieldStart = Math.floor(fieldFrom * count);
  for (let i = 0; i < count; i++) {
    const index = pick();
    const point = points[index]!;
    let spread: number = SPACE_SPREAD[point.k] ?? 0.04;
    let [x, y, z] = point.p;
    if (i >= fieldStart) {
      if (rand() < 0.55) {
        spread = 0.2;
      } else {
        // Anywhere in a sphere a little larger than the cloud.
        const r = 1.15 * Math.cbrt(rand());
        const theta = 2 * Math.PI * rand();
        const phi = Math.acos(2 * rand() - 1);
        [x, y, z] = [r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)];
        spread = 0;
      }
    }
    positions[i * 3] = x + gaussian(rand) * spread;
    positions[i * 3 + 1] = y + gaussian(rand) * spread;
    positions[i * 3 + 2] = z + gaussian(rand) * spread;
    info[i * 2] = point.k === 'project' && i < fieldStart ? 1 : 0;
    info[i * 2 + 1] = i < fieldStart ? index : -1;
  }

  const labels = [...area.querySelectorAll<HTMLElement>('[data-space-point]')].map((el) => {
    const index = Number(el.dataset.spacePoint);
    return { el, index, priority: LABEL_PRIORITY[points[index]?.k ?? 'passage'] };
  });
  return { section, stage, area, positions, info, points, labels };
}

export function readPageLayouts(count: number): PageLayouts {
  const rand = random(hash(location.pathname));
  const root = getComputedStyle(document.documentElement);
  const ink = cssColor(root.getPropertyValue('--color-ink'));
  const muted = cssColor(root.getPropertyValue('--color-muted'));

  const name = document.querySelector<HTMLElement>('.hero__name');
  const hero = name?.closest<HTMLElement>('.hero');
  const nameCount = Math.round(count * (1 - HERO_FIELD_SHARE));
  const nameLayout = name ? textLayout(name, nameCount, ink, rand) : null;
  if (nameLayout && hero) {
    // The rest of the particles fill the whole hero, edge to edge of the window.
    const box = hero.getBoundingClientRect();
    const rect: [number, number, number, number] = [0, box.top + scrollY, document.documentElement.clientWidth, box.height];
    const positions = new Float32Array(count * 2);
    positions.set(nameLayout.positions);
    positions.set(fieldPositions(rect, count - nameCount, rand), nameCount * 2);
    const a: Layout = { ...nameLayout, positions, field: { from: nameCount / count, rect } };
    const cover = document.querySelector<HTMLElement>('main [data-reveal="image"]');
    return {
      a,
      b: cover ? rectLayout(cover, count, rand) : { ...a, field: undefined },
      space: spaceLayout(count, nameCount / count, rand),
      fadeOnArrival: Boolean(cover),
      morphEnd: cover,
    };
  }

  const dust = dustLayout(count, muted, rand);
  return { a: dust, b: dust, space: null, fadeOnArrival: false, morphEnd: null };
}

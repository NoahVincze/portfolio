/**
 * Particle layouts: where every particle should sit for a given page, measured from the
 * real DOM so particles line up exactly with the HTML they stand in for.
 *
 *   Home:        A = the name in the hero heading, B = the first project cover.
 *                Scrolling morphs A into B.
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
}

export interface PageLayouts {
  a: Layout;
  b: Layout;
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

/** Random positions across the viewport: where particles start before the intro. */
export function scatteredPositions(count: number, rand = Math.random): Float32Array {
  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    positions[i * 2] = rand() * innerWidth;
    positions[i * 2 + 1] = rand() * innerHeight;
  }
  return positions;
}

export function readPageLayouts(count: number): PageLayouts {
  const rand = random(hash(location.pathname));
  const root = getComputedStyle(document.documentElement);
  const ink = cssColor(root.getPropertyValue('--color-ink'));
  const muted = cssColor(root.getPropertyValue('--color-muted'));

  const name = document.querySelector<HTMLElement>('.hero__name');
  const nameLayout = name ? textLayout(name, count, ink, rand) : null;
  if (nameLayout) {
    const cover = document.querySelector<HTMLElement>('main [data-reveal="image"]');
    return {
      a: nameLayout,
      b: cover ? rectLayout(cover, count, rand) : nameLayout,
      fadeOnArrival: Boolean(cover),
      morphEnd: cover,
    };
  }

  const dust = dustLayout(count, muted, rand);
  return { a: dust, b: dust, fadeOnArrival: false, morphEnd: null };
}

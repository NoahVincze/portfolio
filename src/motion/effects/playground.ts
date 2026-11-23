/**
 * The Lab's MLP playground (src/components/MlpPlayground.astro): trains the network a few
 * epochs per frame on the shared frame loop while the experiment is on screen and playing,
 * and draws its predictions.
 *
 * - Plot: the prediction as a soft two-colour field (a small grid, scaled up smoothly) and
 *   the decision boundary (p = 0.5) traced with marching squares, then the points.
 * - Panel: epoch, loss, accuracy; the loss curve (log scale); the network, with each
 *   connection drawn by its weight (thickness by size, colour by sign).
 * - Clicking the plot adds a point; shift-click adds the other class.
 *
 * With motion reduced it starts paused (the Play button starts it).
 */
import { DATASETS, makeDataset, type DatasetName } from '../../lab/datasets';
import { MLP } from '../../lab/mlp';
import { onFrame } from '../loop';
import { definePageEffect } from '../page';

const GRID = 64;
const EPOCHS_PER_FRAME = 3;
const LEARNING_RATE = 0.02;
const CURVE_LENGTH = 240;
const NETWORK_EVERY = 0.2; // seconds between network redraws
const SVG_NS = 'http://www.w3.org/2000/svg';

type RGB = [number, number, number];

function cssColor(value: string): RGB {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

definePageEffect(({ reduced }) => {
  const root = document.querySelector<HTMLElement>('[data-mlp]');
  const canvas = root?.querySelector<HTMLCanvasElement>('[data-mlp-canvas]');
  const ctx = canvas?.getContext('2d');
  if (!root || !canvas || !ctx) return;
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector);
  const layers = (root.dataset.layers ?? '2,10,10,1').split(',').map(Number);

  // ---- State
  let seed = 1;
  let net = new MLP(layers, seed);
  let dataset: DatasetName = DATASETS[0]!.name;
  let points: number[] = [];
  let labels: number[] = [];
  let xs = new Float64Array();
  let ys = new Uint8Array();
  let addClass = 1;
  let playing = !reduced;
  let visible = false;
  let lossHistory: number[] = [];
  let lastNetwork = -Infinity;
  let stats = { loss: NaN, accuracy: NaN };

  const sync = () => {
    xs = Float64Array.from(points);
    ys = Uint8Array.from(labels);
    q<HTMLElement>('[data-mlp-count]')!.textContent = String(labels.length);
  };
  const load = (name: DatasetName) => {
    dataset = name;
    ({ points, labels } = makeDataset(name));
    sync();
  };
  const resetWeights = () => {
    net = new MLP(layers, ++seed);
    lossHistory = [];
    stats = { loss: NaN, accuracy: NaN };
  };
  load(dataset);

  // ---- Drawing
  const field = document.createElement('canvas');
  field.width = GRID;
  field.height = GRID;
  const fieldCtx = field.getContext('2d')!;
  const image = fieldCtx.createImageData(GRID, GRID);
  const probabilities = new Float64Array((GRID + 1) * (GRID + 1));
  let colors = { a: [0, 0, 0] as RGB, b: [0, 0, 0] as RGB, bg: [0, 0, 0] as RGB, ink: '#000', accent: '#000', bgCss: '#fff' };
  const readColors = () => {
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--color-accent').trim();
    const ink = style.getPropertyValue('--color-ink').trim();
    const bg = style.getPropertyValue('--color-surface').trim();
    colors = { a: cssColor(accent), b: cssColor(ink), bg: cssColor(bg), ink, accent, bgCss: bg };
  };
  readColors();
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', readColors);

  let size = 0;
  let ratio = 1;
  const resize = () => {
    ratio = Math.min(devicePixelRatio, 2);
    size = canvas.clientWidth;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
  };
  resize();
  const observer = new ResizeObserver(() => {
    resize();
    draw();
  });
  observer.observe(canvas);

  /** Plot coordinates ([-1, 1], y up) to canvas pixels and back. */
  const toPx = (v: number) => ((v + 1) / 2) * size;
  const toPy = (v: number) => ((1 - v) / 2) * size;

  function drawField(): void {
    // Predictions on the grid's corners (GRID + 1 per side), for the field and the contour.
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) probabilities[j * (GRID + 1) + i] = net.predict((i / GRID) * 2 - 1, 1 - (j / GRID) * 2);
    }
    const { a, b, bg } = colors;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const p = probabilities[j * (GRID + 1) + i]!;
        const strength = 0.34 * Math.pow(Math.abs(p - 0.5) * 2, 0.7);
        const tint = p >= 0.5 ? a : b;
        const k = (j * GRID + i) * 4;
        image.data[k] = bg[0] + (tint[0] - bg[0]) * strength;
        image.data[k + 1] = bg[1] + (tint[1] - bg[1]) * strength;
        image.data[k + 2] = bg[2] + (tint[2] - bg[2]) * strength;
        image.data[k + 3] = 255;
      }
    }
    fieldCtx.putImageData(image, 0, 0);
    ctx!.imageSmoothingEnabled = true;
    ctx!.drawImage(field, 0, 0, size, size);
  }

  /** The p = 0.5 contour through the corner grid (marching squares, linear interpolation). */
  function drawBoundary(): void {
    const c = ctx!;
    const cell = size / GRID;
    const at = (i: number, j: number) => probabilities[j * (GRID + 1) + i]! - 0.5;
    const lerp = (v0: number, v1: number) => v0 / (v0 - v1);
    c.beginPath();
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const tl = at(i, j);
        const tr = at(i + 1, j);
        const br = at(i + 1, j + 1);
        const bl = at(i, j + 1);
        const crossings: [number, number][] = [];
        if (tl > 0 !== tr > 0) crossings.push([i + lerp(tl, tr), j]);
        if (tr > 0 !== br > 0) crossings.push([i + 1, j + lerp(tr, br)]);
        if (bl > 0 !== br > 0) crossings.push([i + lerp(bl, br), j + 1]);
        if (tl > 0 !== bl > 0) crossings.push([i, j + lerp(tl, bl)]);
        for (let k = 0; k + 1 < crossings.length; k += 2) {
          c.moveTo(crossings[k]![0] * cell, crossings[k]![1] * cell);
          c.lineTo(crossings[k + 1]![0] * cell, crossings[k + 1]![1] * cell);
        }
      }
    }
    c.strokeStyle = colors.ink;
    c.lineWidth = 1.5;
    c.globalAlpha = 0.7;
    c.stroke();
    c.globalAlpha = 1;
  }

  function drawPoints(): void {
    const c = ctx!;
    const radius = Math.max(3, size / 110);
    c.lineWidth = 1.5;
    c.strokeStyle = colors.bgCss;
    for (let k = 0; k < labels.length; k++) {
      c.beginPath();
      c.arc(toPx(points[k * 2]!), toPy(points[k * 2 + 1]!), radius, 0, Math.PI * 2);
      c.fillStyle = labels[k] ? colors.accent : colors.ink;
      c.fill();
      c.stroke();
    }
  }

  function draw(): void {
    if (!size) return;
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawField();
    drawBoundary();
    drawPoints();
  }

  // ---- Panel
  const epochEl = q<HTMLElement>('[data-mlp-epoch]')!;
  const lossEl = q<HTMLElement>('[data-mlp-loss]')!;
  const accuracyEl = q<HTMLElement>('[data-mlp-accuracy]')!;
  const curve = q<SVGPathElement>('[data-mlp-curve]')!;
  const network = q<SVGSVGElement>('[data-mlp-network]')!;

  function drawStats(): void {
    epochEl.textContent = String(net.epochs);
    lossEl.textContent = Number.isFinite(stats.loss) ? stats.loss.toFixed(3) : '–';
    accuracyEl.textContent = Number.isFinite(stats.accuracy) ? `${Math.round(stats.accuracy * 100)}%` : '–';
    // Loss on a log scale, from 1 at the top to 0.001 at the bottom.
    const y = (loss: number) => Math.min(48, Math.max(0, (-Math.log10(Math.max(loss, 1e-3)) / 3) * 48));
    curve.setAttribute(
      'd',
      lossHistory.map((loss, i) => `${i ? 'L' : 'M'}${((i / (CURVE_LENGTH - 1)) * 200).toFixed(1)} ${y(loss).toFixed(1)}`).join(''),
    );
  }

  /** Nodes in columns; one line per weight. Built once, then only restyled. */
  const lines: { el: SVGLineElement; layer: number; index: number }[] = [];
  (function buildNetwork() {
    network.replaceChildren();
    const node = (l: number, j: number) => [10 + (l / (layers.length - 1)) * 180, 60 + (j - (layers[l]! - 1) / 2) * 11] as const;
    for (let l = 0; l < layers.length - 1; l++) {
      for (let j = 0; j < layers[l + 1]!; j++) {
        for (let i = 0; i < layers[l]!; i++) {
          const [x1, y1] = node(l, i);
          const [x2, y2] = node(l + 1, j);
          const el = document.createElementNS(SVG_NS, 'line');
          el.setAttribute('x1', String(x1));
          el.setAttribute('y1', String(y1));
          el.setAttribute('x2', String(x2));
          el.setAttribute('y2', String(y2));
          network.append(el);
          lines.push({ el, layer: l, index: j * layers[l]! + i });
        }
      }
    }
    for (let l = 0; l < layers.length; l++) {
      for (let j = 0; j < layers[l]!; j++) {
        const [cx, cy] = node(l, j);
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', '2.6');
        network.append(circle);
      }
    }
  })();

  function drawNetwork(): void {
    for (const { el, layer, index } of lines) {
      const w = net.weights[layer]![index]!;
      el.setAttribute('stroke', w >= 0 ? colors.accent : colors.ink);
      el.setAttribute('stroke-width', (0.25 + Math.min(2.2, Math.abs(w) * 0.9)).toFixed(2));
      el.setAttribute('stroke-opacity', (0.15 + Math.min(0.8, Math.abs(w) * 0.35)).toFixed(2));
    }
  }

  function refresh(): void {
    draw();
    drawStats();
    drawNetwork();
  }

  // ---- Training loop (only while on screen and playing)
  function frame(time: number): void {
    if (!playing || !visible) return;
    if (labels.length) {
      for (let k = 0; k < EPOCHS_PER_FRAME; k++) stats = net.train(xs, ys, LEARNING_RATE);
      lossHistory.push(stats.loss);
      if (lossHistory.length > CURVE_LENGTH) lossHistory.shift();
    }
    draw();
    drawStats();
    if (time - lastNetwork > NETWORK_EVERY) {
      lastNetwork = time;
      drawNetwork();
    }
  }
  const stopLoop = onFrame(frame);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
  });
  intersection.observe(canvas);

  // ---- Controls
  const buttons = <T extends HTMLElement>(selector: string) => [...root.querySelectorAll<T>(selector)];
  const press = (group: HTMLElement[], active: HTMLElement) => group.forEach((b) => b.setAttribute('aria-pressed', String(b === active)));
  const datasetButtons = buttons<HTMLButtonElement>('[data-mlp-dataset]');
  const classButtons = buttons<HTMLButtonElement>('[data-mlp-class]');
  const playButton = q<HTMLButtonElement>('[data-mlp-play]')!;
  const setPlaying = (next: boolean) => {
    playing = next;
    playButton.setAttribute('aria-pressed', String(next));
    playButton.textContent = next ? 'Pause' : 'Play';
  };
  setPlaying(playing);

  const onClick = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.mlpDataset) {
      press(datasetButtons, button);
      load(button.dataset.mlpDataset as DatasetName);
      resetWeights();
    } else if (button.dataset.mlpClass) {
      press(classButtons, button);
      addClass = Number(button.dataset.mlpClass);
    } else if (button === playButton) {
      setPlaying(!playing);
    } else if (button.hasAttribute('data-mlp-reset')) {
      resetWeights();
    } else if (button.hasAttribute('data-mlp-clear')) {
      points = [];
      labels = [];
      sync();
      resetWeights();
    } else {
      return;
    }
    refresh();
  };
  root.addEventListener('click', onClick);

  const onPointerDown = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    points.push(x, y);
    labels.push(event.shiftKey ? 1 - addClass : addClass);
    sync();
    refresh();
  };
  canvas.addEventListener('pointerdown', onPointerDown);

  refresh();

  return () => {
    stopLoop();
    observer.disconnect();
    intersection.disconnect();
    scheme.removeEventListener('change', readColors);
    root.removeEventListener('click', onClick);
    canvas.removeEventListener('pointerdown', onPointerDown);
  };
});

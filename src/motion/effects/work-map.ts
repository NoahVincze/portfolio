/**
 * The work map (src/components/WorkMap.astro) follows the work filter: on every change it
 * re-runs PCA on the embeddings of just the projects the filter shows, so the map
 * re-clusters around what they have in common rather than only hiding points. Labels
 * glide to their new places (CSS transitions on --x and --y); a `work:map` event tells the
 * particle hero to regroup its clusters there.
 *
 * With the particle hero running, clicking a project on the map first pulls every particle
 * into its point (`work:open`, handled by the hero scene), then opens the project.
 */
import { navigate } from 'astro:transitions/client';
import { projectForDisplay } from '../../embedding/space';
import { definePageEffect } from '../page';

export interface WorkOpenDetail {
  /** The project's point, in viewport pixels. */
  x: number;
  y: number;
}

declare global {
  interface WindowEventMap {
    'work:filter': CustomEvent<string>;
    'work:map': Event;
    'work:open': CustomEvent<WorkOpenDetail>;
  }
}

interface MapData {
  ids: string[];
  tags: string[][];
  vectors: number[][];
}

/** How long the particles take to rush into the point before the project opens (ms). */
const OPEN_DELAY = 420;
const percent = (value: number) => `${(50 + value * 40).toFixed(2)}%`;

definePageEffect(({ reduced }) => {
  const map = document.querySelector<HTMLElement>('[data-work-map]');
  const json = map?.querySelector('[data-work-map-data]')?.textContent;
  if (!map || !json) return;
  let data: MapData;
  try {
    data = JSON.parse(json) as MapData;
  } catch {
    return;
  }
  const points = data.ids.map((id) => map.querySelector<HTMLElement>(`[data-map-project="${CSS.escape(id)}"]`));
  const original = points.map((point) => point?.getAttribute('style') ?? '');
  const originalFlip = points.map((point) => Boolean(point?.classList.contains('is-flipped')));
  const canProject = data.vectors.every((vector) => vector.length > 0);

  function layout(tag: string): void {
    const shown = data.ids.map((_, i) => tag === 'all' || data.tags[i]!.includes(tag));
    const indices = shown.flatMap((on, i) => (on ? [i] : []));
    const positions = canProject ? projectForDisplay(indices.map((i) => data.vectors[i]!), 2) : [];
    indices.forEach((i, k) => {
      const [x = 0, y = 0] = positions[k] ?? [];
      points[i]?.style.setProperty('--x', percent(x));
      points[i]?.style.setProperty('--y', percent(-y));
    });
    placeSides();
    points.forEach((point, i) => {
      if (point) point.hidden = !shown[i];
    });
    window.dispatchEvent(new Event('work:map'));
  }

  /**
   * Each label goes on the side of its point that has room for it, and a label that would
   * overlap another is nudged down below it (its point and particles stay put).
   */
  function placeSides(): void {
    const width = stage?.clientWidth ?? 0;
    const height = stage?.clientHeight ?? 0;
    if (!width) return;
    const placed: { left: number; right: number; top: number; bottom: number }[] = [];
    const shown = points
      .filter((point): point is HTMLElement => Boolean(point && !point.hidden))
      .map((point) => ({
        point,
        x: (parseFloat(point.style.getPropertyValue('--x')) / 100) * width,
        y: (parseFloat(point.style.getPropertyValue('--y')) / 100) * height,
      }))
      .sort((a, b) => a.y - b.y);
    for (const { point, x, y } of shown) {
      const w = point.offsetWidth;
      const h = point.offsetHeight;
      const flip = x + w > width && x > width - x;
      point.classList.toggle('is-flipped', flip);
      const box = { left: flip ? x - w : x, right: flip ? x : x + w, top: y - h / 2, bottom: y + h / 2 };
      let nudge = 0;
      for (const other of placed) {
        const overlaps = box.left < other.right && box.right > other.left && box.top + nudge < other.bottom && box.bottom + nudge > other.top;
        if (overlaps) nudge = other.bottom - box.top + 4;
      }
      point.style.setProperty('--nudge', `${nudge.toFixed(1)}px`);
      placed.push({ ...box, top: box.top + nudge, bottom: box.bottom + nudge });
    }
  }

  const stage = map.querySelector<HTMLElement>('[data-work-map-stage]');
  placeSides();
  const onFilter = (event: CustomEvent<string>) => layout(event.detail);
  addEventListener('work:filter', onFilter);
  addEventListener('resize', placeSides);
  // Labels get wider once the particle clusters replace the dots.
  const live = new MutationObserver(placeSides);
  live.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  let opening: ReturnType<typeof setTimeout> | undefined;
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('[data-map-link]');
    const live = document.documentElement.classList.contains('hero-live');
    if (!link || reduced || !live || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const rect = link.getBoundingClientRect();
    // The point is the start of the label (where the dot would be), vertically centred.
    window.dispatchEvent(new CustomEvent('work:open', { detail: { x: rect.left + 5, y: rect.top + rect.height / 2 } }));
    clearTimeout(opening);
    opening = setTimeout(() => void navigate(link.href), OPEN_DELAY);
  };
  map.addEventListener('click', onClick);

  return () => {
    removeEventListener('work:filter', onFilter);
    removeEventListener('resize', placeSides);
    live.disconnect();
    map.removeEventListener('click', onClick);
    clearTimeout(opening);
    points.forEach((point, i) => {
      point?.setAttribute('style', original[i]!);
      point?.classList.toggle('is-flipped', originalFlip[i]!);
      if (point) point.hidden = false;
    });
  };
});

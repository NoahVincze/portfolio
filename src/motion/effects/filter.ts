/**
 * Work page filter: buttons with `data-filter` show only projects carrying that tag.
 * Full motion: the grid reflows with GSAP Flip (cards slide to their new places, others
 * fade out and in). Reduced motion: the grid changes instantly.
 *
 * Every change is announced with a `work:filter` event on window (detail: the tag), which
 * the work map (work-map.ts) follows.
 *
 * The buttons only show when JavaScript runs (CSS keys off <html data-motion>), so without
 * it visitors simply see every project.
 */
import { Flip } from 'gsap/Flip';
import { gsap, ScrollTrigger } from '../gsap';
import { definePageEffect } from '../page';
import { gsapEase, seconds, staggerFor } from '../tokens';

gsap.registerPlugin(Flip);

definePageEffect(({ reduced }) => {
  const controls = document.querySelector<HTMLElement>('[data-filters]');
  const grid = document.querySelector<HTMLElement>('[data-filter-grid]');
  if (!controls || !grid) return;

  const items = [...grid.children] as HTMLElement[];
  const buttons = [...controls.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const count = document.querySelector<HTMLElement>('[data-filter-count]');

  const matches = (item: HTMLElement, tag: string) =>
    tag === 'all' || (item.dataset.tags ?? '').split('|').includes(tag);

  function apply(tag: string): void {
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === tag));
    const shown = items.filter((item) => matches(item, tag)).length;
    if (count) count.textContent = `${shown} ${shown === 1 ? 'project' : 'projects'}`;
    window.dispatchEvent(new CustomEvent('work:filter', { detail: tag }));

    if (reduced) {
      for (const item of items) item.hidden = !matches(item, tag);
      ScrollTrigger.refresh();
      return;
    }

    const state = Flip.getState(items);
    for (const item of items) item.hidden = !matches(item, tag);
    Flip.from(state, {
      duration: seconds('base'),
      ease: gsapEase.inOut,
      absolute: true,
      stagger: staggerFor('item', items.length),
      onEnter: (entering) =>
        gsap.fromTo(entering, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: seconds('base'), ease: gsapEase.out }),
      onLeave: (leaving) =>
        gsap.to(leaving, { opacity: 0, scale: 0.96, duration: seconds('base', { exit: true }), ease: gsapEase.in }),
      onComplete: () => ScrollTrigger.refresh(),
    });
  }

  const onClick = (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-filter]');
    if (button && button.getAttribute('aria-pressed') !== 'true') apply(button.dataset.filter!);
  };
  controls.addEventListener('click', onClick);

  return () => {
    controls.removeEventListener('click', onClick);
    for (const item of items) item.hidden = false;
  };
});

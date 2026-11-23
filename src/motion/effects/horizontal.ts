/**
 * Pinned sideways scrolling: a section with `data-horizontal` pins while its
 * `data-horizontal-track` slides left as the visitor scrolls down (home: Selected work).
 * Only on screens at least 768 px wide with full motion; otherwise the cards stay a
 * normal grid. Crossing the breakpoint rebuilds the page's effects.
 */
import { gsap } from '../gsap';
import { definePageEffect, rebuildPageEffects } from '../page';
import { registerHorizontalTrack } from './horizontal-registry';

const wide = matchMedia('(min-width: 768px)');

definePageEffect(({ reduced }) => {
  const section = document.querySelector<HTMLElement>('[data-horizontal]');
  const track = section?.querySelector<HTMLElement>('[data-horizontal-track]');
  if (!section || !track) return;

  const onBreakpoint = () => rebuildPageEffects();
  wide.addEventListener('change', onBreakpoint);
  const cleanups = [() => wide.removeEventListener('change', onBreakpoint)];

  if (!reduced && wide.matches) {
    section.classList.add('is-horizontal');
    const distance = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const slide = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
      },
    });
    cleanups.push(registerHorizontalTrack(track, slide), () => section.classList.remove('is-horizontal'));
  }

  return () => cleanups.forEach((cleanup) => cleanup());
});

/**
 * Reading progress bar on project pages: `<div class="progress" data-progress>`.
 * Browsers with CSS scroll-driven animations run it entirely in CSS (see global.css).
 * Others get the same bar driven by ScrollTrigger.
 */
import { gsap } from '../gsap';
import { definePageEffect } from '../page';

const supportsScrollTimeline = () =>
  typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');

definePageEffect(() => {
  if (supportsScrollTimeline()) return;
  for (const bar of document.querySelectorAll<HTMLElement>('[data-progress]')) {
    gsap.fromTo(
      bar,
      { scaleX: 0 },
      { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } },
    );
  }
});

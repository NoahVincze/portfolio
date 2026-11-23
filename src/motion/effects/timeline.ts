/**
 * About page: the career timeline draws itself as the visitor scrolls. The line grows
 * with the scroll position, and each entry's dot and text arrive as the line reaches them.
 * Reduced motion: entries fade in; the line is simply there.
 *
 * Markup: `data-timeline` on a wrapper holding `.timeline__line` and the list of entries,
 * each with a `.timeline__dot`.
 */
import { gsap } from '../gsap';
import { definePageEffect } from '../page';
import { gsapEase, seconds } from '../tokens';

definePageEffect(({ reduced }) => {
  const list = document.querySelector<HTMLElement>('[data-timeline]');
  if (!list) return;
  const entries = [...list.querySelectorAll<HTMLElement>('li')];

  if (reduced) {
    for (const entry of entries) {
      gsap.from(entry, {
        autoAlpha: 0,
        duration: seconds('quick'),
        ease: 'none',
        scrollTrigger: { trigger: entry, start: 'top 85%', once: true },
      });
    }
    return;
  }

  const line = list.querySelector<HTMLElement>('.timeline__line');
  if (line) {
    gsap.fromTo(
      line,
      { scaleY: 0 },
      { scaleY: 1, ease: 'none', scrollTrigger: { trigger: list, start: 'top 75%', end: 'bottom 55%', scrub: true } },
    );
  }

  for (const entry of entries) {
    const scrollTrigger = { trigger: entry, start: 'top 70%', once: true };
    const dot = entry.querySelector('.timeline__dot');
    if (dot) gsap.from(dot, { scale: 0, duration: seconds('base'), ease: gsapEase.out, scrollTrigger });
    // From the left, out of the line (a start position to the right would widen the page on phones).
    gsap.from(entry.querySelectorAll('.timeline__content > *, .timeline__years'), {
      autoAlpha: 0,
      x: -24,
      duration: seconds('slow'),
      ease: gsapEase.out,
      stagger: 0.06,
      scrollTrigger,
    });
  }
});

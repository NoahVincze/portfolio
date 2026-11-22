/**
 * Images wipe in from the bottom as they enter the viewport, then drift (scale 1.15 to 1)
 * while the visitor scrolls past. Reduced motion: a short fade, no drift.
 *
 * Markup:
 *   <div data-reveal="image" data-project-url="/work/x/">   the clipped frame
 *     <div data-reveal-media>…</div>                         the image that drifts
 *   </div>
 * `data-parallax` on a frame gives it the drift without the wipe (used on project covers,
 * which arrive through the page-transition morph). `data-project-url` ties a frame to its
 * project, so a cover that morphs in from the previous page skips the wipe.
 */
import { gsap } from '../gsap';
import { definePageEffect } from '../page';
import { gsapEase, seconds } from '../tokens';

const HIDDEN = 'inset(100% 0% 0% 0%)';
const SHOWN = 'inset(0% 0% 0% 0%)';

function drift(frame: HTMLElement, from = 1.15): void {
  const media = frame.querySelector<HTMLElement>('[data-reveal-media]');
  if (!media) return;
  gsap.fromTo(
    media,
    { scale: from },
    {
      scale: 1,
      ease: 'none',
      scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
    },
  );
}

definePageEffect(({ reduced, morphed }) => {
  for (const frame of document.querySelectorAll<HTMLElement>('[data-reveal="image"]')) {
    const scrollTrigger = { trigger: frame, start: 'top 90%', once: true };

    if (reduced) {
      gsap.fromTo(frame, { autoAlpha: 0 }, { autoAlpha: 1, duration: seconds('quick'), ease: 'none', scrollTrigger });
      continue;
    }

    gsap.set(frame, { visibility: 'visible' });
    // Covers that were on the previous page morph into place: no second entrance.
    if (frame.dataset.projectUrl && morphed.has(frame.dataset.projectUrl)) {
      drift(frame);
      continue;
    }
    gsap.fromTo(
      frame,
      { clipPath: HIDDEN },
      { clipPath: SHOWN, duration: seconds('slow'), ease: gsapEase.out, clearProps: 'clipPath', scrollTrigger },
    );
    drift(frame);
  }

  if (!reduced) {
    for (const frame of document.querySelectorAll<HTMLElement>('[data-parallax]')) drift(frame, 1.1);
  }
});

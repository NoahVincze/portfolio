/**
 * Images reveal as they enter the viewport, then drift (scale 1.15 to 1) while the visitor
 * scrolls past. Reduced motion: a short fade, no drift.
 *
 * The reveal is a diffusion model's sampling run when the WebGL cover renderer is running
 * (src/motion/hero/covers.ts): noise wipes up from the bottom and is denoised step by step
 * into the image. Without it (WebGL unavailable or not loaded yet), the image itself wipes
 * up from the bottom. The choice is made when the reveal starts, not when the page loads,
 * because the renderer arrives after the page is idle.
 * Images are visible in the HTML; only ones the visitor has not seen yet are hidden for
 * their entrance, so the page's largest image is never held back by the scripts.
 *
 * Markup:
 *   <div data-reveal="image" data-project-url="/work/x/">   the clipped frame
 *     <div data-reveal-media>…</div>                         the image that drifts
 *   </div>
 * `data-parallax` on a frame gives it the drift without the wipe (used on project covers,
 * which arrive through the page-transition morph). When such a cover did not morph in, it
 * gets a diffusion reveal in place (noise fading in, then denoising), if the renderer runs. `data-project-url` ties a frame to its
 * project, so a cover that morphs in from the previous page skips the wipe.
 *
 * Frames inside a sideways-scrolling track (horizontal.ts) are timed to the track's
 * movement instead of the vertical scroll, unless they are already on screen when it starts.
 */
import { diffusion } from '../diffusion';
import { gsap, ScrollTrigger } from '../gsap';
import { definePageEffect } from '../page';
import { gsapEase, seconds } from '../tokens';
import { horizontalAnimationFor } from './horizontal-registry';

const HIDDEN = 'inset(100% 0% 0% 0%)';
const SHOWN = 'inset(0% 0% 0% 0%)';

/** ScrollTrigger settings for a frame: vertical, or along its horizontal track. */
function triggers(frame: HTMLElement) {
  const track = horizontalAnimationFor(frame);
  const offscreenRight = frame.getBoundingClientRect().left > innerWidth;
  if (track && offscreenRight) {
    return {
      enter: { trigger: frame, containerAnimation: track, start: 'left 95%', once: true },
      drift: { trigger: frame, containerAnimation: track, start: 'left right', end: 'right left', scrub: true },
    };
  }
  return {
    enter: { trigger: frame, start: 'top 90%', once: true },
    drift: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
  };
}

function drift(frame: HTMLElement, scrollTrigger: ScrollTrigger.Vars, from = 1.15): void {
  const media = frame.querySelector<HTMLElement>('[data-reveal-media]');
  if (!media) return;
  gsap.fromTo(media, { scale: from }, { scale: 1, ease: 'none', scrollTrigger });
}

const onScreen = (el: Element) => {
  const rect = el.getBoundingClientRect();
  return rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
};

definePageEffect(({ reduced, morphed, painted }) => {
  for (const frame of document.querySelectorAll<HTMLElement>('[data-reveal="image"]')) {
    const { enter, drift: driftTrigger } = triggers(frame);
    // Already on screen and seen (first load): images are never hidden before scripts run, so
    // the largest image can paint at once. Hiding it now would flash; it just drifts.
    const alreadySeen = painted && onScreen(frame);

    if (reduced) {
      if (!alreadySeen) {
        gsap.fromTo(frame, { autoAlpha: 0 }, { autoAlpha: 1, duration: seconds('quick'), ease: 'none', scrollTrigger: enter });
      }
      continue;
    }

    // Covers that were on the previous page morph into place: no second entrance.
    const morphedIn = Boolean(frame.dataset.projectUrl && morphed.has(frame.dataset.projectUrl));
    if (!alreadySeen && !morphedIn) {
      gsap.fromTo(
        frame,
        { clipPath: HIDDEN },
        {
          clipPath: SHOWN,
          duration: seconds('slow'),
          ease: gsapEase.out,
          clearProps: 'clipPath',
          scrollTrigger: {
            ...enter,
            // The shader takes over: un-clip the frame at once and let the noise wipe in instead.
            onEnter: (self) => {
              if (onScreen(frame) && diffusion()?.reveal(frame, { wipe: true })) self.animation?.progress(1);
            },
          },
        },
      );
    }
    drift(frame, driftTrigger);
  }

  if (!reduced) {
    for (const frame of document.querySelectorAll<HTMLElement>('[data-parallax]')) {
      const { enter, drift: driftTrigger } = triggers(frame);
      const morphedIn = Boolean(frame.dataset.projectUrl && morphed.has(frame.dataset.projectUrl));
      if (!morphedIn && !(painted && onScreen(frame))) {
        ScrollTrigger.create({ ...enter, onEnter: () => void diffusion()?.reveal(frame, { wipe: false }) });
      }
      drift(frame, driftTrigger, 1.1);
    }
  }
});

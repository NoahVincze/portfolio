/**
 * Text reveals as it enters the viewport: streamed token by token like a language model
 * writing it (./stream.ts). The hero name instead rises line by line from behind a mask,
 * because the particle hero measures its lines. Reduced motion: a short fade instead.
 *
 * Markup: add `data-reveal="lines"` to any text element. Optional `data-reveal-delay`
 * in milliseconds. Headings inside `.prose` (project write-ups) are included automatically.
 * CSS keeps these hidden until this effect runs, with a fallback that shows them after 3 s.
 */
import { SplitText } from 'gsap/SplitText';
import { gsap } from '../gsap';
import { definePageEffect } from '../page';
import { gsapEase, seconds, staggerFor } from '../tokens';
import { streamTokens } from './stream';

gsap.registerPlugin(SplitText);

export const LINE_REVEAL_SELECTOR = '[data-reveal="lines"], .prose h2';

const delayOf = (el: HTMLElement) => Number(el.dataset.revealDelay ?? 0) / 1000;

/** Text the particle hero reads line by line: keeps the masked line reveal. */
const LINE_ONLY = '.hero__name';

definePageEffect(({ reduced }) => {
  const cleanups: (() => void)[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(LINE_REVEAL_SELECTOR)) {
    // Already shown another way (the first-visit intro reveals the hero name itself).
    if (el.hasAttribute('data-revealed')) continue;
    const scrollTrigger = { trigger: el, start: 'top 90%', once: true };

    if (reduced) {
      gsap.fromTo(
        el,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: seconds('quick'), ease: 'none', delay: delayOf(el), scrollTrigger },
      );
      continue;
    }

    if (!el.matches(LINE_ONLY)) {
      cleanups.push(streamTokens(el, { delay: delayOf(el), scrollTrigger }));
      continue;
    }

    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'reveal-line',
      // Only whole lines are wrapped, so the text reads normally to screen readers. No
      // aria-label (not allowed on <p>), and spans so paragraphs stay valid markup.
      aria: 'none',
      tag: 'span',
      autoSplit: true,
      onSplit(split) {
        gsap.set(el, { visibility: 'visible' });
        // Returning the tween lets SplitText re-split on resize without restarting it.
        return gsap.from(split.lines, {
          yPercent: 110,
          duration: seconds('slow'),
          ease: gsapEase.out,
          stagger: staggerFor('item', split.lines.length),
          delay: delayOf(el),
          scrollTrigger,
        });
      },
    });
  }
  return () => cleanups.forEach((cleanup) => cleanup());
});

/**
 * Contact page: the email address scrambles when hovered or focused (full motion), and a
 * Copy button copies it with a "Copied" confirmation, announced to screen readers.
 * The button shows whenever JavaScript runs (CSS keys off <html data-motion>) and is hidden
 * here if the Clipboard API is unavailable.
 */
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { gsap } from '../gsap';
import { definePageEffect } from '../page';
import { gsapEase, seconds } from '../tokens';

gsap.registerPlugin(ScrambleTextPlugin);

definePageEffect(({ reduced }) => {
  const cleanups: (() => void)[] = [];

  for (const link of document.querySelectorAll<HTMLElement>('[data-scramble]')) {
    if (reduced) break;
    const text = link.textContent ?? '';
    // Random letters have different widths: hold the link's width so nothing beside it jitters.
    const holdWidth = { display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', verticalAlign: 'bottom' };
    const scramble = () => {
      if (!gsap.isTweening(link)) gsap.set(link, { ...holdWidth, width: link.getBoundingClientRect().width });
      gsap.to(link, {
        duration: seconds('slow'),
        scrambleText: { text, chars: 'lowerCase', revealDelay: 0.15, speed: 0.6 },
        ease: 'none',
        overwrite: true,
        onComplete: () => gsap.set(link, { clearProps: 'display,whiteSpace,overflow,verticalAlign,width' }),
      });
    };
    link.addEventListener('pointerenter', scramble);
    link.addEventListener('focus', scramble);
    cleanups.push(() => {
      link.removeEventListener('pointerenter', scramble);
      link.removeEventListener('focus', scramble);
      link.textContent = text;
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    if (!navigator.clipboard) {
      button.hidden = true;
      continue;
    }
    const label = button.querySelector<HTMLElement>('.copy__label') ?? button;
    const status = document.querySelector<HTMLElement>(button.dataset.copyStatus ?? '');
    const idle = label.textContent ?? 'Copy';
    let reset: ReturnType<typeof setTimeout> | undefined;

    const show = (text: string) => {
      label.textContent = text;
      if (!reduced) gsap.fromTo(label, { yPercent: 100 }, { yPercent: 0, duration: seconds('base'), ease: gsapEase.out });
    };
    const onClick = async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy!);
        show('Copied');
        if (status) status.textContent = 'Email address copied to the clipboard';
      } catch {
        show('Copy failed');
        if (status) status.textContent = 'Could not copy. Select the address instead.';
      }
      clearTimeout(reset);
      reset = setTimeout(() => {
        show(idle);
        if (status) status.textContent = '';
      }, 2400);
    };
    button.addEventListener('click', onClick);
    cleanups.push(() => {
      button.removeEventListener('click', onClick);
      clearTimeout(reset);
      label.textContent = idle;
    });
  }

  return () => cleanups.forEach((cleanup) => cleanup());
});

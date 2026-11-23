/**
 * Magnetic links and buttons: elements with `data-magnetic` lean toward the cursor while
 * it is near them and spring back when it leaves. Optional value = strength (default 0.35).
 * Mouse and trackpad only, full motion only. Purely decorative: the links work the same
 * without it, and keyboard focus keeps its normal outline.
 */
import { gsap } from '../gsap';
import { definePageEffect } from '../page';
import { gsapEase, seconds } from '../tokens';

const finePointer = matchMedia('(pointer: fine) and (hover: hover)');

definePageEffect(({ reduced }) => {
  if (reduced || !finePointer.matches) return;
  const cleanups: (() => void)[] = [];

  for (const el of document.querySelectorAll<HTMLElement>('[data-magnetic]')) {
    const strength = Number(el.dataset.magnetic) || 0.35;

    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const rect = el.getBoundingClientRect();
      // The rect includes the current offset; measure from the element's resting centre.
      const centerX = rect.left + rect.width / 2 - Number(gsap.getProperty(el, 'x'));
      const centerY = rect.top + rect.height / 2 - Number(gsap.getProperty(el, 'y'));
      gsap.to(el, {
        x: (event.clientX - centerX) * strength,
        y: (event.clientY - centerY) * strength,
        duration: seconds('base'),
        ease: gsapEase.out,
        overwrite: 'auto',
      });
    };
    // Springs are reserved for things the visitor pulls (see the motion principles).
    const leave = () =>
      gsap.to(el, { x: 0, y: 0, duration: seconds('slow'), ease: 'elastic.out(1, 0.4)', overwrite: 'auto' });

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    cleanups.push(() => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    });
  }

  return () => cleanups.forEach((cleanup) => cleanup());
});

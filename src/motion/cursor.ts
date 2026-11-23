/**
 * Custom cursor: a small dot that follows the pointer, grows into a ring over links and
 * buttons, and becomes a filled circle reading "View" over projects (`data-cursor="view"`).
 *
 * Mouse and trackpad only, full motion only. It is an addition, not a replacement: the
 * system cursor stays visible, so nothing depends on this working.
 */
import { gsap } from './gsap';
import { isReduced } from './preference';
import { gsapEase, seconds } from './tokens';

type CursorState = 'default' | 'link' | 'view';

const INTERACTIVE = 'a, button, [role="switch"], label, summary, select, input, textarea';
const finePointer = matchMedia('(pointer: fine) and (hover: hover)');
let started = false;

export function startCursor(): void {
  if (started) return;
  started = true;
  const cursor = document.querySelector<HTMLElement>('.cursor');
  if (!cursor) return;

  const xTo = gsap.quickTo(cursor, 'x', { duration: seconds('quick'), ease: gsapEase.out });
  const yTo = gsap.quickTo(cursor, 'y', { duration: seconds('quick'), ease: gsapEase.out });
  let visible = false;

  const enabled = () => finePointer.matches && !isReduced();

  const setState = (state: CursorState) => {
    if (cursor.dataset.cursorState !== state) cursor.dataset.cursorState = state;
  };

  const show = (show: boolean) => {
    visible = show;
    cursor.classList.toggle('is-visible', show);
  };

  addEventListener(
    'pointermove',
    (event) => {
      if (!enabled() || event.pointerType !== 'mouse') return;
      if (!visible) {
        gsap.set(cursor, { x: event.clientX, y: event.clientY });
        show(true);
      }
      xTo(event.clientX);
      yTo(event.clientY);
    },
    { passive: true },
  );

  document.addEventListener('pointerover', (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>(`[data-cursor], ${INTERACTIVE}`);
    setState((target?.dataset.cursor as CursorState | undefined) ?? (target ? 'link' : 'default'));
  });

  document.documentElement.addEventListener('pointerleave', () => show(false));
  // After a page swap the element under the pointer is new: start plain until the next move.
  document.addEventListener('astro:after-swap', () => setState('default'));
  addEventListener('motion:change', () => {
    if (!enabled()) show(false);
  });
  finePointer.addEventListener('change', () => {
    if (!enabled()) show(false);
  });
}

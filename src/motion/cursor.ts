/**
 * Custom cursor: a small dot that sits exactly on the pointer, grows into a ring over links
 * and buttons, and becomes a filled circle reading "View" over projects (`data-cursor="view"`).
 *
 * While it is showing it replaces the system cursor (see "Custom cursor" in global.css).
 * It only shows with a mouse or trackpad and motion on, and hides again when the pointer
 * leaves the window. Text fields keep the system text cursor. If this script never runs,
 * nothing is hidden, so the page never ends up without a cursor.
 */
import { gsap } from './gsap';
import { isReduced } from './preference';

type CursorState = 'default' | 'link' | 'view' | 'text';

const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"]';
const INTERACTIVE = 'a, button, [role="switch"], label, summary';
const finePointer = matchMedia('(pointer: fine) and (hover: hover)');
let started = false;

export function startCursor(): void {
  if (started) return;
  started = true;
  const cursor = document.querySelector<HTMLElement>('.cursor');
  if (!cursor) return;

  // No easing: with the system cursor hidden, any lag would make clicking feel off.
  const setX = gsap.quickSetter(cursor, 'x', 'px');
  const setY = gsap.quickSetter(cursor, 'y', 'px');
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
      if (!enabled() || event.pointerType !== 'mouse') {
        if (visible) show(false);
        return;
      }
      setX(event.clientX);
      setY(event.clientY);
      if (!visible) show(true);
    },
    { passive: true },
  );

  document.addEventListener('pointerover', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(TEXT_FIELD)) return setState('text');
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

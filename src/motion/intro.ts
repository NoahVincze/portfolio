/**
 * First-visit intro: a small model trains (a loss curve draws itself over 12 epochs and the
 * run converges), the name crystallises out of a blur in the hero's place, and the panel
 * wipes away, uncovering the page (1.85 s). It plays once per device and never with
 * reduced motion. Any click, key, wheel or touch skips straight to the end.
 *
 * The animation itself is CSS that starts with the first paint (see `.site-intro` in
 * global.css), so it does not wait for any JavaScript. The inline script in BaseLayout
 * decides whether it plays by setting <html data-intro="play">. This module records that
 * it was seen, ticks the epoch and loss readouts in step with the curve (it reads the CSS
 * animation's clock, so the numbers match even if this script starts late), and lets the
 * page effects start once the panel is gone.
 */
import { epochAt, formatEpoch, formatLoss, trainingRun, valueAt } from './training';

const STORAGE_KEY = 'intro-seen';
const SKIP_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

function finish(): void {
  // The intro already showed the name: the hero heading should not play its own reveal.
  document.querySelector('.hero__name')?.setAttribute('data-revealed', '');
  delete document.documentElement.dataset.intro;
}

const animationNamed = (el: Element | null | undefined, name: string) =>
  el?.getAnimations().find((a) => (a as CSSAnimation).animationName === name);

/** Updates the epoch and loss numbers every frame from the curve's own animation clock. */
function tickReadout(overlay: HTMLElement, done: Promise<void>): void {
  const draw = animationNamed(overlay.querySelector('.site-intro__curve--train'), 'intro-draw');
  const epoch = overlay.querySelector<HTMLElement>('[data-intro-epoch]');
  const loss = overlay.querySelector<HTMLElement>('[data-intro-loss]');
  const val = overlay.querySelector<HTMLElement>('[data-intro-val]');
  if (!draw || !epoch || !loss || !val) return;

  const run = trainingRun();
  const duration = Number(draw.effect?.getComputedTiming().duration) || 1;
  let running = true;
  void done.then(() => {
    running = false;
  });

  const tick = () => {
    const p = draw.playState === 'finished' ? 1 : Number(draw.currentTime ?? 0) / duration;
    epoch.textContent = formatEpoch(epochAt(p));
    loss.textContent = formatLoss(valueAt(run.train, p));
    val.textContent = formatLoss(valueAt(run.val, p));
    if (running && p < 1) requestAnimationFrame(tick);
  };
  tick();
}

/** Any input jumps every intro animation to its end, which ends the intro. */
function allowSkip(overlay: HTMLElement, done: Promise<void>): void {
  const skip = () => {
    for (const animation of overlay.getAnimations({ subtree: true })) animation.finish();
  };
  for (const type of SKIP_EVENTS) addEventListener(type, skip, { passive: true, once: true });
  void done.then(() => {
    for (const type of SKIP_EVENTS) removeEventListener(type, skip);
  });
}

function waitForIntro(): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Not remembered: the intro may play again next visit. Harmless.
  }
  const overlay = document.querySelector<HTMLElement>('.site-intro');
  const wipe = animationNamed(overlay, 'intro-wipe');
  // A safety net in case the animation never reports back.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2600));
  // `finished` rejects if the animation is cancelled; the intro is over either way.
  const ended = wipe?.finished.then(() => undefined, () => undefined) ?? Promise.resolve();
  const done = Promise.race([ended, timeout]).then(finish);
  if (overlay) {
    tickReadout(overlay, done);
    allowSkip(overlay, done);
  }
  return done;
}

/** Resolves when the intro is over, or immediately when there is none. */
export const introFinished: Promise<void> =
  document.documentElement.dataset.intro === 'play' ? waitForIntro() : Promise.resolve();

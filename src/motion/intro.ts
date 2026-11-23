/**
 * First-visit intro: the letters of the name assemble on a panel that then wipes away,
 * uncovering the page (at most 1.2 s). It plays once per device and never with reduced motion.
 *
 * The animation itself is CSS that starts with the first paint (see `.site-intro` in global.css),
 * so it does not wait for any JavaScript. The inline script in BaseLayout decides whether it
 * plays by setting <html data-intro="play">. This module records that it was seen and lets
 * the page effects start once the panel is gone.
 */

const STORAGE_KEY = 'intro-seen';

function finish(): void {
  // The intro already showed the name: the hero heading should not play its own reveal.
  document.querySelector('.hero__name')?.setAttribute('data-revealed', '');
  delete document.documentElement.dataset.intro;
}

function waitForIntro(): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Not remembered: the intro may play again next visit. Harmless.
  }
  const overlay = document.querySelector<HTMLElement>('.site-intro');
  const wipe = overlay?.getAnimations().find((a) => (a as CSSAnimation).animationName === 'intro-wipe');
  // A safety net in case the animation never reports back.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1600));
  return Promise.race([wipe?.finished.then(() => undefined) ?? Promise.resolve(), timeout]).then(finish);
}

/** Resolves when the intro is over, or immediately when there is none. */
export const introFinished: Promise<void> =
  document.documentElement.dataset.intro === 'play' ? waitForIntro() : Promise.resolve();

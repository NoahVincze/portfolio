/**
 * Starts the particle hero when it should run, and only then loads Three.js.
 *
 * - Motion reduced (system setting or footer toggle): no WebGL at all. The HTML heading
 *   is the still version of the hero.
 * - No WebGL support, or the scene fails to start: the HTML heading stays.
 * - Otherwise: after the page has loaded, the first-visit intro (if any) is over and the
 *   browser is idle, the scene module (and Three.js with it) is fetched and started. Waiting
 *   for the intro keeps it smooth and lets the particles appear on the name it leaves behind. It stays alive across page navigations.
 */
import { introFinished } from '../intro';
import { isReduced } from '../preference';
import type { HeroScene } from './scene';

let loading: Promise<HeroScene | null> | null = null;
let started = false;

function supportsWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

function afterLoadWhenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const idle = () =>
      'requestIdleCallback' in window ? requestIdleCallback(() => resolve(), { timeout: 2000 }) : setTimeout(resolve, 200);
    if (document.readyState === 'complete') idle();
    else addEventListener('load', idle, { once: true });
  });
}

/** Hands control back to the browser, so input is handled between the heavy start-up steps. */
const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function loadScene(canvas: HTMLCanvasElement): Promise<HeroScene | null> {
  loading ??= introFinished
    .then(afterLoadWhenIdle)
    .then(() => import('./scene'))
    .then(async ({ createHeroScene }) => {
      await yieldToBrowser();
      const scene = createHeroScene(canvas);
      await scene?.prepare();
      await yieldToBrowser();
      return scene;
    })
    .catch(() => null);
  return loading;
}

/** Call once per page load. The canvas persists across client-side navigations. */
export function startHero(): void {
  if (started) return;
  started = true;
  const canvas = document.querySelector<HTMLCanvasElement>('canvas.hero-canvas');
  if (!canvas || !supportsWebGL()) return;

  const sync = async () => {
    if (isReduced()) {
      (await loading)?.stop();
      return;
    }
    const scene = await loadScene(canvas);
    if (!isReduced()) scene?.start();
  };
  addEventListener('motion:change', () => void sync());
  void sync();
}

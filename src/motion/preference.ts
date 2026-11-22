/**
 * The motion switch. Motion is reduced when the visitor turned animations off with the
 * footer toggle or, if they never chose, when their system asks for reduced motion.
 *
 * The result is written to <html data-motion="full|reduced"> and announced with a
 * `motion:change` event on window. An inline script in BaseLayout sets the attribute
 * before first paint using the same storage key, so the page never flashes the wrong mode.
 */

export type MotionSetting = 'system' | 'full' | 'reduced';

export interface MotionChangeDetail {
  reduced: boolean;
  setting: MotionSetting;
}

declare global {
  interface WindowEventMap {
    'motion:change': CustomEvent<MotionChangeDetail>;
  }
}

/** Also used by the inline script in BaseLayout. Keep the two in sync. */
export const STORAGE_KEY = 'motion-preference';
const SYSTEM_QUERY = '(prefers-reduced-motion: reduce)';

let setting: MotionSetting = 'system';
let initialised = false;

function loadSetting(): MotionSetting {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'full' || stored === 'reduced') return stored;
  } catch {
    // Storage can be blocked (private windows, disabled site data): follow the system.
  }
  return 'system';
}

export function getSetting(): MotionSetting {
  return setting;
}

export function systemPrefersReduced(): boolean {
  return window.matchMedia(SYSTEM_QUERY).matches;
}

export function isReduced(): boolean {
  return setting === 'system' ? systemPrefersReduced() : setting === 'reduced';
}

/** Re-evaluates the mode and announces it if it changed. */
function apply(): void {
  const reduced = isReduced();
  const value = reduced ? 'reduced' : 'full';
  if (document.documentElement.dataset.motion === value) return;
  document.documentElement.dataset.motion = value;
  window.dispatchEvent(
    new CustomEvent<MotionChangeDetail>('motion:change', { detail: { reduced, setting } }),
  );
}

/** Saves the visitor's choice on this device and applies it immediately. */
export function setSetting(next: MotionSetting): void {
  setting = next;
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not remembered across visits, but still applied for this one.
  }
  apply();
}

/** Call once per page load, before anything reads `isReduced()`. */
export function initMotionPreference(): void {
  if (initialised) return;
  initialised = true;
  setting = loadSetting();
  window.matchMedia(SYSTEM_QUERY).addEventListener('change', apply);
  apply();
}

/**
 * The bridge between page effects and the WebGL cover renderer (src/motion/hero/covers.ts).
 *
 * The renderer lives in the lazily loaded hero scene (it needs Three.js), so page effects
 * cannot import it. Instead the scene registers it here while it is running, and effects
 * ask for it at the moment they need it. When it is missing (motion reduced, no WebGL, the
 * scene not loaded yet), `diffusion()` returns null and effects use their CSS fallback.
 */

export interface DiffusionRenderer {
  /**
   * Starts a diffusion reveal on a cover frame: the frame fills with Gaussian noise that is
   * then denoised step by step into the image. Returns false if the frame cannot be drawn
   * (no <img> inside), in which case the caller should reveal it another way.
   *
   * `wipe`: the noise wipes up from the bottom first. Without it, the noise fades in where
   * it is (how a project page's large cover uses it).
   */
  reveal(frame: HTMLElement, options?: { wipe?: boolean }): boolean;
}

let current: DiffusionRenderer | null = null;

/** Called by the hero scene when it starts (with its renderer) and stops (with null). */
export function provideDiffusion(renderer: DiffusionRenderer | null): void {
  current = renderer;
}

/** The running cover renderer, or null when the shader is unavailable. */
export function diffusion(): DiffusionRenderer | null {
  return current;
}

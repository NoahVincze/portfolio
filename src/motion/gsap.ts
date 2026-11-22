/**
 * The one place GSAP is configured. Import `gsap` and `ScrollTrigger` from here,
 * never from 'gsap' directly, so plugins and token-based eases are always registered.
 */
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { easing, gsapEase, seconds, type EasingToken } from './tokens';

gsap.registerPlugin(CustomEase, ScrollTrigger);

for (const name of Object.keys(easing) as EasingToken[]) {
  const [x1, y1, x2, y2] = easing[name];
  CustomEase.create(gsapEase[name], `M0,0 C${x1},${y1} ${x2},${y2} 1,1`);
}

gsap.defaults({ ease: gsapEase.out, duration: seconds('base') });

export { gsap, ScrollTrigger };

/**
 * Footer marquee: the name runs across the footer in a loop. Scrolling pushes it faster,
 * and the scroll direction sets which way it runs. Full motion only; with reduced motion
 * it simply stands still.
 *
 * Markup: `data-marquee-track` holding two identical groups side by side (the loop shifts
 * the track by exactly one group, so it repeats seamlessly).
 */
import { gsap, ScrollTrigger } from '../gsap';
import { onFrame } from '../loop';
import { definePageEffect } from '../page';

/** Speed at rest, in pixels per second. */
const BASE_SPEED = 60;
/** How strongly scroll speed (px/s) adds to it, and the most it may add. */
const SCROLL_FACTOR = 0.6;
const MAX_BOOST = 2400;

definePageEffect(({ reduced }) => {
  const track = document.querySelector<HTMLElement>('[data-marquee-track]');
  const group = track?.firstElementChild as HTMLElement | null;
  if (!track || !group || reduced) return;

  let groupWidth = group.offsetWidth;
  let wrap = gsap.utils.wrap(-groupWidth, 0);
  const setX = gsap.quickSetter(track, 'x', 'px');
  let offset = 0;
  let boost = 0;
  let direction = 1;

  // Runs only while the footer is on screen; scrolling there feeds the boost.
  const watch = ScrollTrigger.create({
    trigger: track,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => {
      const velocity = self.getVelocity();
      if (velocity !== 0) direction = velocity > 0 ? 1 : -1;
      boost = Math.max(boost, Math.min(Math.abs(velocity) * SCROLL_FACTOR, MAX_BOOST));
    },
    onRefresh: () => {
      groupWidth = group.offsetWidth;
      wrap = gsap.utils.wrap(-groupWidth, 0);
    },
  });

  const stopFrames = onFrame((_time, deltaTime) => {
    if (!watch.isActive) return;
    offset = wrap(offset - ((BASE_SPEED + boost) * direction * deltaTime) / 1000);
    setX(offset);
    // The boost fades away within about half a second once scrolling stops.
    boost *= Math.pow(0.92, deltaTime / 16.7);
  });

  return () => {
    stopFrames();
    gsap.set(track, { clearProps: 'transform' });
  };
});

/**
 * Sections that scroll sideways (see horizontal.ts) register their track here, so other
 * effects can time their animations to the sideways movement (ScrollTrigger's
 * containerAnimation) instead of the page's vertical scroll.
 */
const tracks = new Map<Element, gsap.core.Animation>();

export function registerHorizontalTrack(track: Element, animation: gsap.core.Animation): () => void {
  tracks.set(track, animation);
  return () => tracks.delete(track);
}

/** The sideways animation `el` moves with, if it sits in a horizontal track. */
export function horizontalAnimationFor(el: Element): gsap.core.Animation | undefined {
  for (const [track, animation] of tracks) if (track.contains(el)) return animation;
  return undefined;
}

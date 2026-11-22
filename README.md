# portfolio

Personal portfolio site, built with [Astro](https://astro.build), [GSAP](https://gsap.com), [Lenis](https://lenis.darkroom.engineering) and (from Phase 3) [Three.js](https://threejs.org).

The animation plan lives in the Personal Website Animation Spec. This branch is **Phase 1: Foundation**: real page structure, motion tokens, the shared frame loop and the motion switch, with no decorative animation yet.

## Getting started

Requires Node 22.23 or newer.

```bash
npm install
npm run dev       # http://localhost:4321
npm run check     # type-check .astro and .ts files
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
```

## Where things live

| Path | What it is |
| --- | --- |
| `src/site.ts` | Name, tagline, email, social links, navigation |
| `src/content/projects/*.md` | One file per project. The file name becomes the URL (`/work/<file-name>/`). Fields are defined in `src/content.config.ts`. |
| `src/pages/` | Home, Work, project pages, About, Contact, 404 |
| `src/styles/global.css` | Colours, type scale, spacing, layout helpers |
| `src/motion/tokens.ts` | Motion tokens: durations, easing curves, stagger steps |
| `src/motion/gsap.ts` | GSAP setup. Import `gsap` and `ScrollTrigger` from here. |
| `src/motion/loop.ts` | The shared frame loop and Lenis smooth scroll |
| `src/motion/preference.ts` | The motion switch (system setting + footer toggle) |

## Motion foundation

**One set of tokens.** `src/motion/tokens.ts` is the only place timing is defined. BaseLayout turns it into CSS custom properties (`--dur-slow`, `--ease-out`, `--stagger-item`, ...), and `src/motion/gsap.ts` registers the same curves as GSAP eases (`motionOut`, `motionInOut`, `motionIn`). Use `seconds('slow')` and `staggerFor('word', count)` in GSAP code.

**One frame loop.** GSAP's ticker drives Lenis, ScrollTrigger and every timeline. Anything that needs a per-frame update (the WebGL canvas in Phase 3) subscribes with `onFrame(callback)` instead of calling `requestAnimationFrame`.

**One motion switch.** `<html data-motion="full|reduced">` says whether motion is on. It follows the system "reduce motion" setting until the visitor uses the Animations toggle in the footer, which is then remembered on that device. Every effect must check it: in CSS with `[data-motion='full']`, in scripts with `isReduced()` and the `motion:change` event. When motion is reduced, Lenis is switched off and the page scrolls natively.

## Placeholder content

Copy marked `PLACEHOLDER` (in `src/site.ts`, the project files, and the About, Contact and Home pages) is sample text to replace. The contact address is `hello@example.com` until you set your own in `src/site.ts`.

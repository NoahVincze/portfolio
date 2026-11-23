# portfolio

Personal portfolio site, built with [Astro](https://astro.build), [GSAP](https://gsap.com), [Lenis](https://lenis.darkroom.engineering) and (from Phase 3) [Three.js](https://threejs.org).

The animation plan lives in the Personal Website Animation Spec. Built so far: **Phase 1** (page structure, motion tokens, shared frame loop, motion switch), **Phase 2** (line and image reveals, page transitions with the thumbnail-to-cover morph, reading progress bar), **Phase 3** (the particle hero), **Phase 4** (custom cursor, magnetic links, first-visit intro, sideways work section, cover hover shader, work filter, self-drawing timeline, contact scramble and copy) and **Phase 5** (physics skill chips, scroll-speed footer marquee).

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
| `public/covers/` | Cover images, referenced by `cover:` in each project file. The current ones are placeholders. |
| `src/pages/` | Home, Work, project pages, About, Contact, 404 |
| `src/styles/global.css` | Colours, type scale, spacing, layout helpers |
| `src/motion/tokens.ts` | Motion tokens: durations, easing curves, stagger steps |
| `src/motion/gsap.ts` | GSAP setup. Import `gsap` and `ScrollTrigger` from here. |
| `src/motion/loop.ts` | The shared frame loop and Lenis smooth scroll |
| `src/motion/preference.ts` | The motion switch (system setting + footer toggle) |
| `src/motion/page.ts` | Per-page lifecycle: builds effects on each page, cleans them up before the next |
| `src/motion/effects/` | Per-page effects: reveals, progress bar, magnetic links, sideways section, filter, timeline, contact, physics chips, footer marquee |
| `src/motion/intro.ts` | First-visit intro (the animation itself is CSS, `.site-intro` in `global.css`) |
| `src/motion/cursor.ts` | Custom cursor |
| `src/motion/hero/` | The particle hero: startup (`index.ts`), Three.js scene (`scene.ts`), layouts measured from the page (`layouts.ts`), shaders (`shaders.ts`), cover hover effect (`hover.ts`) |

## Motion foundation

**One set of tokens.** `src/motion/tokens.ts` is the only place timing is defined. BaseLayout turns it into CSS custom properties (`--dur-slow`, `--ease-out`, `--stagger-item`, ...), and `src/motion/gsap.ts` registers the same curves as GSAP eases (`motionOut`, `motionInOut`, `motionIn`). Use `seconds('slow')` and `staggerFor('word', count)` in GSAP code.

**One frame loop.** GSAP's ticker drives Lenis, ScrollTrigger and every timeline. Anything that needs a per-frame update (the WebGL canvas in Phase 3) subscribes with `onFrame(callback)` instead of calling `requestAnimationFrame`.

**One motion switch.** `<html data-motion="full|reduced">` says whether motion is on. It follows the system "reduce motion" setting until the visitor uses the Animations toggle in the footer, which is then remembered on that device. Every effect must check it: in CSS with `[data-motion='full']`, in scripts with `isReduced()` and the `motion:change` event. When motion is reduced, Lenis is switched off and the page scrolls natively.

## Adding animation to a page

Mark elements with data attributes; the effects in `src/motion/effects/` pick them up on every page, in both motion modes.

| Attribute | Effect (full motion) | Reduced motion |
| --- | --- | --- |
| `data-reveal="lines"` | Text reveals line by line from behind a mask as it scrolls into view. Optional `data-reveal-delay="200"` (ms). Headings in `.prose` get this automatically. | 200 ms fade |
| `data-reveal="image"` on a frame, `data-reveal-media` on the image inside | The frame wipes in from the bottom, then the image drifts from 1.15 to 1 while scrolling past | 200 ms fade |
| `data-parallax` on a frame | Drift only, no wipe | Nothing |
| `transition:name` (Astro) | Elements with the same name on two pages morph into each other during navigation | 200 ms crossfade |
| `data-magnetic` (optional strength, default `0.35`) | Leans toward the cursor, springs back on leave | Nothing |
| `data-cursor="view"` | The custom cursor reads "View" over it | No custom cursor |
| `data-hover-shader` on a link containing a cover with an `<img>` | Ripple and RGB-split hover on the cover | Nothing |
| `data-horizontal` on a section, `data-horizontal-track` on its list | The section pins and the list slides sideways (768 px and wider) | A normal grid |
| `data-scramble` | Text scrambles on hover and focus | Nothing |
| `data-physics` on a list | Its items drop into a box and can be thrown around (Matter.js, loaded only when the box is about to appear) | A plain list |
| `data-marquee-track` holding two identical groups | Loops sideways; scrolling speeds it up and sets its direction | Stands still |

Project cards and project page covers share `transition:name="cover-<project>"`, so the card morphs into the cover. They also carry `data-project-url`, so a cover that just morphed in does not play its wipe again.

To add a new effect, create a file in `src/motion/effects/`, call `definePageEffect(({ reduced }) => { … })`, and import it from `src/motion/effects/index.ts`. Everything created inside (tweens, ScrollTriggers, SplitText) is cleaned up automatically before the next page, and rebuilt when the motion switch changes. Return a function from the effect to remove anything GSAP cannot (event listeners, classes).

Images are never hidden in the HTML. Only images the visitor has not seen yet are hidden for their entrance, so a cover that is on screen when the page opens shows immediately (it is often the page's largest element).

Page transitions are CSS in `src/styles/global.css` (section "Page transitions"), driven by Astro's `<ClientRouter />`. Browsers without the View Transitions API swap pages instantly.

## The particle hero

One WebGL canvas sits behind every page and survives client-side navigation (`transition:persist`).

- **Home:** the particles spell the name exactly over the real `<h1>`, which then fades out. The heading stays in the page for screen readers and search engines. Particles near the cursor drift toward it. Scrolling bursts them apart and gathers them onto the first project cover, where they fade as the real cover takes over.
- **Other pages:** they settle into a faint field behind the content, different on each page.
- **Navigation:** the particles regroup from wherever they are into the new page's layout (1.4 s) instead of reloading.

Positions are measured from the live page (`layouts.ts`): the name is drawn with the heading's own font onto an offscreen canvas and sampled, so changing the name or its CSS needs no code change.

**Loading and fallbacks.** Three.js is loaded only after the page has loaded and the browser is idle, as a separate chunk (about 130 KB gzipped), and start-up is split into small tasks. With motion reduced it is never downloaded, and the HTML heading is the still version of the hero. Without WebGL, or if the context is lost, the heading simply stays. Phones get 3,000 particles instead of 7,000 and a pixel-ratio cap of 1.5 (2 on desktop). Once the home hero has scrolled away and faded, the scene stops drawing.

## Phase 4 details

**First-visit intro.** On a device's first visit (and never with reduced motion) the letters of the name assemble on a panel that wipes away after 1.1 s, uncovering the hero name in the same place. It is pure CSS from the first paint, so it does not delay the page. To see it again, remove `intro-seen` from the site's local storage.

**Hover effects and their touch and keyboard equivalents.** Every hover effect is decoration on top of a normal link or button:

| Hover effect | Keyboard | Touch |
| --- | --- | --- |
| Custom cursor and "View" label (replaces the system cursor while showing) | Normal focus outline | Not shown; the system cursor is used |
| Magnetic links | Normal focus outline | Not shown |
| Cover ripple and RGB split | Triggered by keyboard focus on the card | Not shown; tapping opens the project |
| Email scramble | Triggered by keyboard focus | The Copy button works by tap |

**Cover images.** Set `cover: /covers/your-image.jpg` in a project file and put the image in `public/covers/`. The cards, the page-transition morph, the hover effect and the particle hero all use it. `accent:` is the colour shown while it loads.

## Placeholder content

Copy marked `PLACEHOLDER` (in `src/site.ts`, the project files, and the About, Contact and Home pages) is sample text to replace, and the covers in `public/covers/` are placeholder images. The contact address is `hello@example.com` until you set your own in `src/site.ts`.

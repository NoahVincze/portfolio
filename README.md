# portfolio

Personal portfolio site, built with [Astro](https://astro.build), [GSAP](https://gsap.com), [Lenis](https://lenis.darkroom.engineering) and (from Phase 3) [Three.js](https://threejs.org).

The animation plan lives in the Personal Website Animation Spec. Built so far: **Phase 1** (page structure, motion tokens, shared frame loop, motion switch), **Phase 2** (line and image reveals, page transitions with the thumbnail-to-cover morph, reading progress bar), **Phase 3** (the particle hero), **Phase 4** (custom cursor, magnetic links, first-visit intro, sideways work section, cover hover shader, work filter, self-drawing timeline, contact scramble and copy), **Phase 5** (physics skill chips, scroll-speed footer marquee) and **Phase 6** (an AI-themed visual identity: the diffusion cover shader, where a project page's cover can arrive like a diffusion sample, generated from Gaussian noise step by step (it was on the cards too, but cost too much while scrolling); the first-visit training intro, where a loss curve trains over 12 epochs before the name crystallises; and token-streaming text reveals, where text is written token by token with the decoder's top candidates flickering beside the caret). **Phase 7** turns the site's own content into an embedding space: a build-time pipeline embeds every project, passage, skill and experience entry; on the home page the particles gather into that space as a 3D point cloud between the hero and the first cover; and the Work page gets a semantic map that re-clusters with the filter. **Phase 8** adds a loss landscape to the About page (the particles form a 3D loss surface and a ball rolls down it by gradient descent with momentum as the visitor scrolls, with the experience entries as checkpoints) a Lab page where a small neural network trains live in the browser, and Ask: visitors type a question, which is embedded in their browser and flown into the embedding space, where its nearest neighbours light up.

## Getting started

Requires Node 22.23 or newer.

```bash
npm install
npm run dev       # http://localhost:4321
npm run check     # type-check .astro and .ts files
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
npm run embed     # re-embed the site's content after changing projects or src/profile.ts
```

## Deploying (Vercel)

The repository is ready for Vercel; no build settings need changing.

1. Sign in to [Vercel](https://vercel.com) with GitHub, create a new project and import `NoahVincze/portfolio`.
2. Vercel detects Astro. Keep the suggested settings (build `npm run build`, output `dist`) and deploy.
3. From then on, every push to `main` deploys the live site, and every pull request gets its own preview link. Vercel keeps preview deployments out of search engines.

**The site's address** (canonical URLs, sitemap, share previews) comes from Vercel automatically: the `.vercel.app` address, or your custom domain once you add one under the project's Domains settings. No code change is needed. To force a different address, set a `SITE_URL` environment variable in Vercel.

**`vercel.json`** sets trailing-slash URLs (`/work` redirects to `/work/`), one-year caching for the fingerprinted files in `/_astro/`, and basic security headers.

**Share preview and home-screen icon.** `public/og.png` (1200 x 630, shown when a link to the site is shared) and `public/apple-touch-icon.png` are rendered from the templates in `scripts/`. After changing the name or tagline, edit `scripts/og-image.html` and run:

```bash
npx playwright screenshot --viewport-size=1200,630 scripts/og-image.html public/og.png
```

## Where things live

| Path | What it is |
| --- | --- |
| `src/site.ts` | Name, tagline, email, social links, navigation |
| `src/profile.ts` | Skills and experience (About page and embedding space) |
| `src/content/projects/*.md` | One file per project. The file name becomes the URL (`/work/<file-name>/`). Fields are defined in `src/content.config.ts`. |
| `public/covers/` | Cover images, referenced by `cover:` in each project file. The current ones are placeholders. |
| `src/pages/` | Home, Work, project pages, About, Contact, 404 |
| `src/styles/global.css` | Colours, type scale, spacing, layout helpers |
| `src/motion/tokens.ts` | Motion tokens: durations, easing curves, stagger steps |
| `src/motion/gsap.ts` | GSAP setup. Import `gsap` and `ScrollTrigger` from here. |
| `src/motion/loop.ts` | The shared frame loop and Lenis smooth scroll |
| `src/motion/preference.ts` | The motion switch (system setting + footer toggle) |
| `src/motion/page.ts` | Per-page lifecycle: builds effects on each page, cleans them up before the next |
| `src/motion/effects/` | Per-page effects: reveals (token streaming in `stream.ts`), progress bar, magnetic links, sideways section, filter, timeline, contact, physics chips, footer marquee |
| `src/motion/intro.ts` | First-visit intro (the animation itself is CSS, `.site-intro` in `global.css`; this ticks its numbers and handles skipping) |
| `src/embedding/` | The embedding space: the corpus (`corpus.ts`), PCA and the hashed fallback (`space.ts`), and the build's entry point (`index.ts`) |
| `src/data/embeddings.json` | Cached embedding vectors, written by `npm run embed`. Commit it. |
| `scripts/embed.ts` | `npm run embed`: embeds the corpus with all-MiniLM-L6-v2 |
| `src/motion/landscape.ts` | The About page's loss surface and gradient descent (shared by the static plot and the particles) |
| `src/ask/` | Ask: keyword and semantic ranking (`search.ts`), the in-browser question encoder (`encoder.ts`) |
| `src/lab/` | The Lab's experiments: the MLP and its datasets |
| `src/motion/tokenizer.ts` | A tiny deterministic BPE-style tokenizer for the streaming reveal (`▁inter` + `active`) |
| `src/motion/training.ts` | The intro's training run: the seeded loss curves, drawn at build time and read back in the browser |
| `src/motion/cursor.ts` | Custom cursor |
| `src/motion/hero/` | The particle hero: startup (`index.ts`), Three.js scene (`scene.ts`), layouts measured from the page (`layouts.ts`), shaders (`shaders.ts`), diffusion reveal for project page covers (`covers.ts`) |
| `src/motion/diffusion.ts` | How page effects reach the cover shader, which loads lazily with the hero; returns null when it is unavailable, so effects fall back to CSS |

## Motion foundation

**One set of tokens.** `src/motion/tokens.ts` is the only place timing is defined. BaseLayout turns it into CSS custom properties (`--dur-slow`, `--ease-out`, `--stagger-item`, ...), and `src/motion/gsap.ts` registers the same curves as GSAP eases (`motionOut`, `motionInOut`, `motionIn`). Use `seconds('slow')` and `staggerFor('word', count)` in GSAP code.

**One frame loop.** GSAP's ticker drives Lenis, ScrollTrigger and every timeline. Anything that needs a per-frame update (the WebGL canvas in Phase 3) subscribes with `onFrame(callback)` instead of calling `requestAnimationFrame`.

**One motion switch.** `<html data-motion="full|reduced">` says whether motion is on. It follows the system "reduce motion" setting until the visitor uses the Animations toggle in the footer, which is then remembered on that device. Every effect must check it: in CSS with `[data-motion='full']`, in scripts with `isReduced()` and the `motion:change` event. When motion is reduced, Lenis is switched off and the page scrolls natively.

## Adding animation to a page

Mark elements with data attributes; the effects in `src/motion/effects/` pick them up on every page, in both motion modes.

| Attribute | Effect (full motion) | Reduced motion |
| --- | --- | --- |
| `data-reveal="lines"` | Text streams in token by token, like a language model writing it, as it scrolls into view: a caret leads and a small panel shows the top three candidate tokens with their probabilities. The hero name instead rises line by line from behind a mask. Optional `data-reveal-delay="200"` (ms). Headings in `.prose` get this automatically. | 200 ms fade |
| `data-reveal="image"` on a frame, `data-reveal-media` on the image inside | The frame wipes in from the bottom, then the image drifts from 1.15 to 1 while scrolling past | 200 ms fade |
| `data-parallax` on a frame | Drift only, no wipe | Nothing |
| `transition:name` (Astro) | Elements with the same name on two pages morph into each other during navigation | 200 ms crossfade |
| `data-magnetic` (optional strength, default `0.35`) | Leans toward the cursor, springs back on leave | Nothing |
| `data-cursor="view"` | The custom cursor reads "View" over it | No custom cursor |
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

- **Home:** most particles spell the name exactly over the real `<h1>`, which then fades out. The heading stays in the page for screen readers and search engines. Particles near the cursor drift toward it. The rest (40%, `HERO_FIELD_SHARE` in `layouts.ts`) form a living field across the whole hero: they drift sideways like dust, twinkle, and part around the cursor and get swept along in its wake. Scrolling bursts everything apart and gathers it onto the first project cover, where it fades as the real cover takes over.
- **Other pages:** they settle into a faint field behind the content, different on each page.
- **Navigation:** the particles regroup from wherever they are into the new page's layout (1.4 s) instead of reloading.

Positions are measured from the live page (`layouts.ts`): the name is drawn with the heading's own font onto an offscreen canvas and sampled, so changing the name or its CSS needs no code change.

**Loading and fallbacks.** Three.js is loaded only after the page has loaded and the browser is idle, as a separate chunk (about 130 KB gzipped), and start-up is split into small tasks. With motion reduced it is never downloaded, and the HTML heading is the still version of the hero. Without WebGL, or if the context is lost, the heading simply stays. Phones get 5,000 particles instead of 12,000 and a pixel-ratio cap of 1.5 (2 on desktop). Shaders are compiled in the background before the first frame. Once the home hero has scrolled away and faded, the scene stops drawing.

## Phase 4 details

**First-visit intro.** On a device's first visit (and never with reduced motion) a small model trains on a panel (a loss curve draws itself over 12 epochs while the epoch and loss numbers tick and the run reports "converged"), the name crystallises out of a blur, and the panel wipes away after 1.85 s, uncovering the hero name in the same place. Any click, key, scroll or touch skips it. It is CSS from the first paint, so it does not delay the page; the particle hero waits for it to end. To see it again, remove `intro-seen` from the site's local storage.

**Hover effects and their touch and keyboard equivalents.** Every hover effect is decoration on top of a normal link or button:

| Hover effect | Keyboard | Touch |
| --- | --- | --- |
| Custom cursor and "View" label (replaces the system cursor while showing) | Normal focus outline | Not shown; the system cursor is used |
| Magnetic links | Normal focus outline | Not shown |
| Cover ripple and RGB split | Triggered by keyboard focus on the card | Not shown; tapping opens the project |
| Email scramble | Triggered by keyboard focus | The Copy button works by tap |

**Cover images.** Set `cover: /covers/your-image.jpg` in a project file and put the image in `public/covers/`. The cards, the page-transition morph, the hover effect and the particle hero all use it. `accent:` is the colour shown while it loads.

## Embedding space

Everything on the site is embedded with [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) (384 dimensions): each project (title, summary, tags and write-up), each paragraph of a write-up, each skill and each experience entry (`src/embedding/corpus.ts`). PCA projects the vectors to three dimensions, each axis scaled to the same extent for display.

On the home page (`src/components/EmbeddingSpace.astro`) this is a labelled scatter plot without WebGL or with motion reduced. With the particle hero running, the particles leave the name and gather into the space as a 3D point cloud while its section scrolls up; the stage sticks in the middle of the window and the cloud turns as the visitor scrolls through, tilting toward the cursor. Labels are the real links and follow their points; hovering one lights up its cluster. Scrolling on, the particles burst onward and land on the first cover. The view lives in `src/motion/hero/space.ts`.

**Work map.** Above the project grid, `src/components/WorkMap.astro` places the projects by PCA of their own embeddings, so neighbours are projects about similar things. Choosing a filter re-runs the projection in the browser on just the matching projects (`src/motion/effects/work-map.ts`), so the map re-clusters rather than only hiding points; labels glide to their new places and pick the side of their point with room. With the particle hero running, each project is a cluster of particles (they regroup straight into the map when arriving from the home page), and clicking a project pulls every particle into its point before the page opens. Without WebGL or with motion reduced, it is a plain labelled plot.

**Ask.** Under the space's caption, visitors can ask about the work (`src/motion/effects/ask.ts`). The question is embedded in the visitor's browser with the same model (quantised, about 23 MB, loaded from jsDelivr and the Hugging Face hub when the box is focused, then cached by the browser) and never leaves it; the items are ranked by cosine similarity against the vectors in `/embedding/search.json` (built by `src/pages/embedding/search.json.ts`, fetched when the section comes into view). Until the model has loaded, questions are answered instantly by BM25 keyword search (`src/ask/search.ts`) and re-ranked by meaning once it is ready. The question is projected with the same PCA as everything else, flies into its place in the space, and lines run to its nearest neighbours, whose clusters light up. With save-data on, the model loads only when the first question is asked; without WebGL or with motion reduced, the results list and highlighted labels still work. Rough timings: first question instant (keywords), model a few seconds on a fast connection, then about 20–50 ms per question.

**After changing projects or `src/profile.ts`, run `npm run embed` and commit `src/data/embeddings.json`.** The build only reads that cache: it never downloads the model, so Vercel and CI builds need no network or native code. If anything is missing from the cache, the build warns and the whole space falls back to a hashed bag-of-words embedding (it is all or nothing, since vectors from two different embeddings cannot share one projection). transformers.js is not a project dependency, so Vercel and CI never install it or its ONNX runtime: `npm run embed` installs it on the spot without saving it (a later `npm ci` removes it again). The model (about 90 MB) downloads once per machine into `~/.cache/portfolio-embed`.

## Loss landscape (About)

`src/components/LossLandscape.astro` shows a gradient descent with momentum down a made-up loss surface (`src/motion/landscape.ts`: a bowl with a global minimum, two local minima and ripples; the descent is computed, not drawn by hand). The experience entries from `src/profile.ts` are checkpoints along the run, oldest first, spaced evenly by distance travelled until the run converges.

Without WebGL or with motion reduced it is a top-down plot: the surface as a dot matrix (bigger dots are lower loss), the path and the checkpoints. With the particle hero running, the particles leave the page's dust and form the surface in 3D while the section scrolls up; its stage then sticks, and scrolling through it rolls a ball down the path, revealing its trail, lighting the checkpoints as it reaches them and ticking the step and loss readout. The ball reaches the minimum at 80% of the scroll; the rest is the run settling. Scrolling on, the particles return to dust. It uses the same 3D view as the embedding space (`src/motion/hero/space.ts`, `VIEW.landscape`).

## Lab

`/lab/` holds small machine learning experiments that run in the browser. The first, `src/components/MlpPlayground.astro`, trains a 2–10–10–1 multilayer perceptron (`src/lab/mlp.ts`: tanh, sigmoid output, cross-entropy, full-batch Adam, written from scratch) on a toy dataset (`src/lab/datasets.ts`: moons, circles, spiral, XOR). `src/motion/effects/playground.ts` trains a few epochs per frame while the experiment is on screen and draws the prediction field, the decision boundary (marching squares at p = 0.5), the points, the loss curve and the network with each connection drawn by its weight. Visitors can switch datasets, add points (click; shift-click for the other class), pause and reset. With motion reduced it starts paused.

## Placeholder content

The projects in `src/content/projects/` and their covers in `public/covers/` are real. Copy marked `PLACEHOLDER` (in `src/site.ts`, `src/profile.ts`, and the About, Contact and Home pages) is still sample text to replace. The contact address is `hello@example.com` until you set your own in `src/site.ts`.

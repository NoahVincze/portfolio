---
title: This portfolio
summary: This site. A motion system built around how machine learning works, where particles become an embedding space, images arrive like diffusion samples and search runs in your browser.
year: 2026
role: Design and development
tags: [Web, WebGL, ML]
featured: false
order: 2
cover: /covers/portfolio.svg
repo: https://github.com/NoahVincze/portfolio
---

A portfolio for data science and AI engineering, where the animation is not decoration but a picture of the work. It is built with Astro, GSAP and Three.js, and everything runs on one persistent WebGL canvas of about 12,000 particles that carries over between pages.

## Approach

Covers are drawn like a diffusion model sampling them, from Gaussian noise to the image in fifty steps, and the cursor adds noise back. The first visit opens with a small training run. Text streams in token by token with the decoder's top candidates beside it. Everything on the site is embedded with all-MiniLM-L6-v2 at build time and projected with PCA: on the home page the particles gather into that space, the work page re-clusters it with every filter, and visitors can ask a question that is embedded in their own browser and flown into the space next to its nearest neighbours. The About page rolls a gradient descent down a loss surface, and the Lab trains a small neural network live.

## Constraints

Every effect has a static version for reduced motion and for browsers without WebGL, nothing blocks the first paint, and the build never needs the network: embeddings are computed once and cached in the repository.

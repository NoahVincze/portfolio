---
title: Token in One
summary: Code golf for prompts. A daily browser game where you make an AI say an exact target with the shortest prompt you can write.
year: 2026
role: Game design and full-stack development
tags: [LLMs, Game, Web]
featured: true
order: 5
accent: '#b9b383'
cover: /covers/token-in-one.svg
link: https://token-in-one.com/
repo: https://github.com/NoahVincze/token-in-one
---

Each hole gives you a target, a list of banned words (the hazards) and six swings. You write a prompt, the model replies, and a deterministic checker decides whether you sank it. Your score is the token count of the prompt that sank the hole, against par. Five holes make the daily course, and when it closes, the best prompts are revealed. It is learned in ten seconds and rewards a real feel for how models behave.

## Approach

The hard part is not the interface but fairness: a game scored on model output has to be reproducible. So the rules, checkers and scoring were built and tested first as a pure Python package, with the swing pipeline and model gateway behind a FastAPI service, before any UI. The browser game is a Next.js app; the season model runs on Groq, the database on Neon, and the API on Render.

The repository is built with two ideas: an LLM-maintained wiki that turns raw sources into cross-linked knowledge and decision records, and spec-driven development, where nothing is built without an accepted spec checked against a written constitution.

## Result

A playable game with a daily course, a practice range, leaderboards and the reveal, built from more than twenty specs and about seventy hole definitions.

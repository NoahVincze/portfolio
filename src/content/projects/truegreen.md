---
title: truegreen
summary: A skill for coding agents. When a test fails, fix the code, or leave the test red and ask, instead of quietly editing the check to make CI green.
year: 2026
role: 'Author: the skill, its audit script and the evals'
tags: [Agents, Evals, Tooling]
featured: true
order: 4
cover: /covers/truegreen.svg
repo: https://github.com/NoahVincze/true-green
---

Agents now write more code than anyone can read, so the green check becomes the review, and the green check is exactly what an agent works toward. When it is stuck on a failing test, the quickest way to green is to change the test. truegreen hands that decision back to the developer: if the code is wrong, the agent fixes it; if the test looks wrong, it leaves it red, reports `BLOCKED` and proposes the exact change for approval.

## Approach

The whole skill is one Markdown file of about 100 lines and a standard-library Python script that audits the agent's own diff for edited tests, hardcoded answers, made-up data and swallowed errors. Every report starts with `DONE`, `DONE WITH CAVEATS` or `BLOCKED` and lists any tests it changed. It installs in Claude Code, Codex, Cursor and other agents that read skills.

## Result

I evaluated it in 96 graded agent runs on Claude Sonnet and Haiku, grading with hidden tests and byte-for-byte checks of the test files rather than the agents' own claims. On tasks with a test that contradicted the spec and a request to "just get CI green", agents without the skill edited the test in 11 of 12 runs and led their report with "CI is green". With the skill, none did: they fixed the code, left the test alone and asked. On simple tasks and controls it changed nothing, at a cost of about 3,000 to 5,000 tokens per run. The samples are small and Claude-only, and the results say so.

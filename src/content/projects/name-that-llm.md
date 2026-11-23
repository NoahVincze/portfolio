---
title: Name that LLM
summary: A Kaggle entry that tells 18 frontier language models apart from a single short passage, from stylometry to triplet-trained LoRA adapters on Qwen3.
year: 2026
role: 'Solo competitor: research, modelling and the Kaggle pipeline'
tags: [ML, LLMs, Kaggle]
featured: true
order: 3
cover: /covers/name-that-llm.svg
repo: https://github.com/NoahVincze/name-that-llm
---

A Kaggle code competition: attribute each of about 4,000 passages, 40 to 250 words long, to the one of 18 frontier models that wrote it, across six labs (OpenAI, Google, Anthropic, Qwen, ZAI and Moonshot AI). Test prompts are unseen, the metric is balanced accuracy, and the submission notebook has to train and predict offline in nine hours.

## Approach

Cross-validation is grouped by prompt, because the test prompts are new. On top of that sits an ensemble of very different members: TF-IDF and stylometry models that predict the model family first and the version second, a character-level "stylegram" SVM, frozen features from DeBERTa-v3-large and Qwen3 decoders, and LoRA adapters on Qwen3-1.7B and Qwen3-8B trained on same-prompt triplets on Kaggle's T4s. The members are combined in a log-linear blend.

The biggest gains came from structure rather than single models. Passages written for the same prompt can be clustered at test time, so I centre features within each cluster and enforce that labels are not repeated inside it (a mean-field Potts step). A simulation of sparse prompt groups predicts the public leaderboard to within a few points (LB ≈ 0.94 × simulation), which made it possible to test ideas without spending submissions.

## Result

The public leaderboard score went from 0.328 for the TF-IDF baseline to 0.526, with the 8B triplet LoRA as the best single model (CV 0.478). Three experiments that looked like gains in simulation did not transfer, which led to a prompt-level bootstrap of the standard error and a stricter rule for what gets submitted. The competition runs until January 2027; the repository holds the specs, a research wiki and the metrics of every run.

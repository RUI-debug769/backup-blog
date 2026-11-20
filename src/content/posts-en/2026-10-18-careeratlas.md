---
title: "Turning One Journey of Self-Exploration into a Reusable 'Career Assessment Operating System'"
published: 2026-10-18
category: "项目"
tags: ["项目", "AI", "职业规划"]
description: "CareerAtlas: a complete workflow asset library for structured self-assessment + career planning—a provenance-verified 79-question item bank, standard SOPs, external calibration, a Claude Skill, plus a Next.js assessment wizard app. AI is the test administrator, not a fortune teller."
lang: "en"
draft: false
---

Ask AI "What should I do with my life?" during a period of confusion, and you will mostly get a pile of correct-sounding platitudes: "The key is to find a direction you are passionate about." The problem is not that the model is unintelligent; it is the **lack of a process**: no standardized inputs, no calibration, and no output constraints, so AI can only keep you company in conversation, not administer an assessment.

[CareerAtlas](https://github.com/RUI-debug769/careeratlas-app) distills a real, in-depth "self-assessment → career planning" process into a reusable library of methodological assets: **6 provenance-verified question banks (79 questions in total) + standard SOPs + report templates + an external calibration checklist + a Claude Skill**, and in phase two turns it into an assessment wizard web app.

## Core Idea: Constrain AI with Process Instead of Letting It Improvise

**AI is the test administrator, not a fortune teller.** The backbone of the whole system is a standard operating procedure: "exploration and assessment → positioning and decision-making → path planning"—collect 7 input variables, run 3 rounds of in-depth assessment (about 50 questions, administered in batches), uncover contradictions between answers, bring in external calibration, and finally produce a *Career Direction Analysis Report* and action checklist following a template. Every step has a definition of done, leaving AI no room to improvise.

**Evidence-based, not vibes.** The question banks were not assembled on a whim: Big Five personality, Holland RIASEC, Super's values, capability inventory, and contradiction probes have all undergone provenance verification and come with automated validation scripts—any change to the question banks must pass validation, preventing casual edits from undermining measurement consistency. Market and policy data in reports must pass a verification checklist, and all media data is labeled "pending verification."

**Privacy is an architectural issue, not an attitude.** The repository is physically separated into public and private layers: methodological assets (question banks, SOPs, templates) can be open-sourced after de-identification; raw corpora, consultation records, and personal career files are physically isolated in the private layer. The remote repository's explicitly configured private status is a line of defense, written into the project constitution.

## Implementation Steps

**1. Distill the process from real use.** Phase one was not "designed" out of thin air; it was knowledge distillation of a complete self-exploration process actually carried out in dsh: which questions genuinely uncovered something, which steps needed calibration against external data, and what report structure could genuinely guide action.

**2. Engineer the question banks.** The six question banks were converted to JSON and de-identified; validation scripts turned "question-to-dimension mapping and option completeness" into CI-style checks; templates and SOPs were versioned in sync.

**3. Package it as a Claude Skill.** The full execution orchestration was packaged as the career-atlas Skill: trigger scenarios (career exploration, converging on a direction during a period of confusion, graduate-school versus employment decisions) → collect inputs → administer tests in batches → uncover contradictions → external calibration → generate a report from the template. Assets and the Skill are packaged with relative paths, so they can be copied and distributed as-is.

**4. Phase two: web app (CareerAtlasApp).** Next.js 15 + Tailwind + better-sqlite3; question banks are synchronized one-way from the asset library by a sync script (the asset library is the single source of truth); the LLM uses Volcengine Ark's OpenAI-compatible endpoint. Two practical pitfalls are worth recording:

- **Reasoning models can consume the entire token budget**: `max_tokens` for report generation must be set to 16384—at 8192, the reasoning chain causes the output to be cut off in the latter sections, and the prompt must hard-require that "all six sections be output";
- **Fallback paths need tests**: `pnpm e2e:no-llm` runs 7 fallback cases, ensuring the app remains usable and demonstrable when no API Key is configured.

## What Ideas It Draws On

- **Psychometrics**: the Big Five personality model, Holland's RIASEC vocational interest model, and Donald Super's values scale—the classic instruments help ask the right questions accurately, while provenance verification keeps them from being degraded by edits.
- **Socratic questioning**: contradiction probes are dedicated to uncovering inconsistencies between answers—"You say stability matters most, yet you gave the highest score to a high-risk option"; divergence is the entry point to self-knowledge.
- **Evidence-based consulting**: every external assertion must be verified before being cited, and media data is "pending verification" by default—bringing the attitude of evidence-based medicine into career counseling.
- **Privacy engineering / data minimization**: physical separation of public and private layers, with de-identification as a prerequisite for distribution.
- **Single source of truth**: the app does not maintain its own copy of the question banks; it always syncs from the asset library—the same engineering principle as "lockfile reproducibility" in the AnimaEVA post.

## Current Status and Remaining Work

Phase one is complete (15 commits in the asset library, privately backed up); the phase-two app is complete and open source ([careeratlas-app](https://github.com/RUI-debug769/careeratlas-app), MIT, 20 unit tests + full e2e). Still to come: deploy it for friends and acquaintances to try, an annual retest mechanism, and weekly tracking of action-checklist updates.

**Disclaimer**: This project is not a psychometric instrument, does not constitute any psychological diagnosis or clinical conclusion, and is intended only for self-understanding and career exploration.

---

AI cannot give you a direction in life, but a good process can let AI help you see yourself clearly.

---
title: "Every Day at 8, AI Delivers an 'AI Frontier Daily' It Wrote Itself"
published: 2026-10-18
category: "项目"
tags: ["项目", "AI", "自动化"]
description: "frontier-report: a zero-dependency Python package—headless Claude deeply researches the day's AI frontier, strict JSON contract validation, warm terracotta dark HTML, and direct SMTP delivery to your inbox. It also includes a spaced-repetition learning machine based on a KDD paper."
lang: "en"
draft: false
---

The usual answer to AI information overload is to subscribe to yet another newsletter. But someone else's curation always sits at a remove—the granularity is wrong, the taste is wrong, the timing is wrong. What I wanted was this: every morning at 8, an **AI frontier daily with sections designed by me, researched and written on the spot by AI**, waiting in my inbox.

[frontier-report](https://github.com/RUI-debug769/frontier-report) does exactly that (open source, MIT): headless Claude deeply researches the day's (or week's) AI frontier → strict JSON contract validation → warm terracotta dark HTML (compatible with email clients) → direct SMTP delivery. **Pure Python standard library, zero third-party dependencies**, and works on Windows / Linux / macOS.

## Core Idea: Deterministic Code Owns the Pipeline; the Model Only Owns the Content

The whole system is a pipeline that sandwiches "unreliable model output" between layers of "reliable deterministic code":

```
cron / Task Scheduler  →  build the prompt (inject the date / aggregate the last 7 dailies)
→  headless `claude -p` (live deep research with WebSearch/WebFetch)
→  three-stage JSON extraction (tolerates repr / code fences / telemetry noise)
→  strict schema validation (exit 1 on failure; better to send nothing)
→  render plain text + warm terracotta dark HTML (table layout / fully inlined CSS / 640px)
→  archive .md → deliver via SMTP STARTTLS (3 retries on failure, backing off 15s/45s)
```

Two iron rules: **if the contract fails, send no email** (a bad daily is worse than no daily—it erodes your trust); **failed delivery does not consume state** (a concept review that was never delivered does not count).

The daily contains: today's quick overview + four sections (leading figures / companies and the industry chain / major events / policy and regulation) + hot papers and techniques + concept of the day + recommended deep reads, about a 5-minute skim; the weekly aggregates the last 7 dailies into a cross-day synthesis for weekend deep reading.

## The Most Interesting Part: A Spaced-Repetition Learning Machine

The "concept of the day" is not a random term with an explanation; it is a complete learning machine, with ideas distilled from **the KDD 2022 paper on spaced-repetition scheduling by the team behind the MaiMemo vocabulary app**:

- Each concept stores a **memory half-life h**; after an interval of Δ days, recall probability is approximately 2^(-Δ/h);
- When Δ ≥ h (you are **about to forget** it), the concept is automatically scheduled into that day's issue and reviewed again with a "recall cue + concise restatement";
- After each review, the half-life is multiplied by 2.3, so review intervals naturally widen: 1 → 2.3 → 5.3 → 12 → 28 → 64 days.

Crucially, the responsibilities are split: **scheduling is handled deterministically by `concepts.py`** (its state is simply a concepts.json in the data directory), while the model only generates the review text. Learning science decides when to learn; the LLM decides how to explain.

## Implementation Steps

**1. Start with zero dependencies.** Pure standard library (urllib/smtplib/json/tomllib), so any machine with Python 3.11+ is ready to use after `pip install`—the fewer the dependencies, the less likely scheduled jobs are to break in a bare cron environment.

**2. Three-stage extraction to keep the model's whims in check.** Headless model output is never clean: first parse it as strict JSON; if that fails, strip code fences; if that fails too, extract the first JSON object—only when all three fallbacks have failed is it declared a contract violation.

**3. Retro engineering for email HTML.** Email clients' CSS support is still stuck in 2003: table layout, fully inlined styles, and a fixed width of 640px, with warm terracotta dark colors plus a plain-text alternative. `frontier-report sample` can generate a local sample at any time for layout checks.

**4. Get the engineering details right in one pass.** The `doctor` command runs a health check (claude CLI / SMTP / data directory at a glance); four-level configuration precedence (CLI > environment variables > config.toml > defaults); on Windows, fall back to reading persistent environment variables from the registry; three scheduling examples (cron / systemd timer `Persistent=true` to catch up on missed runs / Windows Task Scheduler).

**5. Production takeover.** The local instance sends a daily at 08:00 every day and a weekly at 08:30 every Saturday (aggregating the previous 7 days), with all outputs archived in a Git repository for traceability.

## Ideas It Draws On

- **Unix philosophy**: do one thing and do it well; text in, text out; leave scheduling to cron instead of building your own daemon.
- **Design by Contract**: model output is untrusted input, schema validation is the gate, and any validation failure triggers an immediate exit 1.
- **Defensive programming**: three-stage JSON extraction, SMTP backoff retries, and no state consumption on failed delivery—assume the outside world will always go wrong.
- **The learning science of spaced repetition**: a modern, computable version of the Ebbinghaus forgetting curve—the half-life regression model from MaiMemo's KDD 2022 paper.
- **Newsletter craft**: warm terracotta dark colors + retro table layout—an aesthetic shaped by functional constraints.

## Current Status and What Remains

v0.2.1 has taken over production (running every day), the public repository carries a CI badge, and there is also a thin Claude Code skill wrapper (just say "run the daily report" in a session). Still to come: more customizable sections and cross-device synchronization of the concept library.

---

The best information diet is to design your own menu, then have AI cook it fresh every day.

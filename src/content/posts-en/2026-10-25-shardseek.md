---
title: "Building Something That Gives You No Advice: ShardSeek and a Board That Actually Lights Up"
published: 2026-10-25
category: "产品思考"
tags: ["产品思考", "React", "LVGL", "嵌入式", "工程"]
description: "Every tool I have made helps you become a better person. This one does the opposite: it puts what you have said, the costs you have chosen, and the realities blocking you on the same screen, then shuts up. Technically, it is a pnpm monorepo + contract-first design + 998 tests, plus LVGL 9 firmware on a Tuya T5AI development board."
lang: "en"
draft: false
---

Over the past two days, I pushed something called **ShardSeek (the Vision Revealer)** from a “skeleton” to running on real hardware. I am not writing this to show it off; I am writing it because its idea runs **in the opposite direction** from my previous work, and that is worth explaining.

## 1. The Core Idea: It Must Not Generate Anything

My previous tools mostly followed the same formula: you provide a little input, and they give you a “better you”—a better résumé, a better plan, a better persona. The problem with this kind of tool is not inaccuracy. It is that **it makes a judgment on your behalf**, and does it so smoothly that you never think to push back.

ShardSeek is my way of doing the reverse. Its core has only three rules:

**1) Reveal, rather than generate.** Users make a few micro-choices in short scenarios lasting 1–2 minutes, and the system distills “choices + real-world obstacles + the smallest next step” into a card (we call it stardust). Every word on the card is **something the users themselves said**, with nothing invented by the model. The model may only submit proposals, and each must include evidence; it may not write identity, may not write traits, and may not assign scores.

**2) Contrast, rather than encourage.** Feedback is not “you're amazing” or “you can do it.” It places “what you want” and “what stands in your way in reality” on the same screen. The tension itself is the feedback. The product explicitly forbids personality conclusions such as “you are the kind of person who…”—not as a stylistic preference, but as a hard constraint written into the principles (P-02).

**3) Delay, rather than respond instantly.** No evaluation in the moment. Only after both gates—accumulation + time—have been passed is a card promoted to a stardust you can revisit; until then, it is merely an unsettled record that you can disown at any time.

Two derived rules say even more about what this product is than the three above: **interruptible** (you can leave at any point within 120 seconds, with no penalty for skipping) and **deniable** (history can be revoked, revisions follow a version chain, and nothing is overwritten). Something that only goes along with whatever you say would never dare let you revoke it.

So if I could keep only one sentence: **it does not show you the future; it shows you the few sentences you keep repeating.**

## 2. Tech Stack: Turn “What It Must Not Do” into Architecture First

The whole thing is a pnpm monorepo split into five layers:

```
apps/web ──→ packages/polaris ──→ packages/memory ──→ packages/contracts
    │              │
    │              └──→ packages/llm ───┘
    └──→ packages/engine ─────────────────┘
```

Those arrows are not just for looks; CI runs assertions on them:

- **`contracts` depends on no internal package**. It is the sole source of schema truth (JSON Schema).
- **`engine` / `memory` / `polaris` may not import React, the DOM, `fetch`, or `localStorage`**. They are pure domain layers and must be testable in Node. The number of `fetch` calls in `apps/web/src` is now **0**—content is compiled into the bundle at build time.
- **Only `packages/llm` may make network requests**; a model call anywhere else counts as a defect.
- **Only `apps/web/src/lib/adapters/` may touch browser storage**; the domain layer gets data through ports.

The easiest way for a developer to break layering is a casual “I'll just import this,” so these rules are executable assertions in `tests/contract/layers.test.ts`, not aspirational lines in a document.

The frontend is React 19 + Vite, with a 431 KB build (133 KB gzipped). **All data is local by default**: IndexedDB, no default server-side database, no third-party analytics, and exports must include the complete version chain.

## 3. Testing: 998 Tests in Three Categories

`pnpm check` runs typechecking, 998 tests, ESLint, and four content validations in one go. The tests are not there to pad the count; they are split into three layers by purpose:

| Type | Purpose | Example |
|---|---|---|
| Contract tests | One valid sample + one counterexample per schema | A stardust card missing `supersedes` must raise an error |
| Replay tests | Fixed event sequence → deterministic state and stardust sequence, reproducible byte for byte | Running the same conversation twice must produce identical artifact hashes |
| Principle tests | At least one executable assertion per product principle | Scan the entire repository; any “you are the kind of person who…” turns the run red |

The golden path has 4 scenarios (five years from now / studying abroad / the unanswered message / what it protects), each completing within a 95–105 second budget; the storyline is the seven-act “White Night” with six finales, and its continuity checks pass 7/7. The concept library has 36 entries (aesthetics 8 / narrative 8 / philosophy 12 / psychology 8), with self-checks passing 36/36.

One more number: **33 ADRs**. Every “we decided not to do this” is documented, including rejected alternatives and the reasons for rejecting them. This will save our lives later.

## 4. Then I Actually Built a Board

A webpage can prove that “the flow works,” but not “what a card feels like in your hand.” So I turned this one card into firmware and flashed it onto a Tuya T5AI development board (BK7258, 320×480 LCD, 8 MB PSRAM).

- **LVGL 9 + C11**, not a webpage stuffed into a WebView.
- **Three cards, one per screen**, using LVGL's native horizontal scrolling and centered snapping (`LV_SCROLL_SNAP_CENTER` + `SCROLL_ONE`)—no custom gestures, because custom gestures always break on rapid successive swipes.
- Touch comes from the board's GT1151 capacitive panel, through the `lv_port_indev` pointer driver.
- Each card has its own reveal, breathing, and claim states, but **only the current card runs animations**; the rest stay still—8 MB PSRAM cannot handle three sets of animations.
- Numbering has two layers: the star-trail sequence number in the top bar (`No.023` / `No.041` / `No.067`) and the `2 / 3` position in the lower-right corner.

The hardest part was the background texture. Visually, I wanted a “dark-gold diamond grid with darkened corners,” with gold **used only for texture, never glowing** and never treated as a light source. I could not just slap on a PNG—the screen is 320×480, and an image would blur as the card scales. So I wrote a pure-integer pixel algorithm: blend in a little gold when `(x+y)` or `(x-y)` modulo the pitch equals 0, darken pixels toward the corners, use integer arithmetic throughout, and compute all 153,600 pixels individually.

I extracted it into **an independent unit that compiles on the host and has no LVGL dependency**, watched over by 16 assertions: grid-line pixels must account for 10%–30% of the image (measured at 15.3%); grid lines may be only slightly brighter than adjacent pixels (22 vs. 12, a brightness difference ≤12—anything more means the gold has started glowing); the four corners must be darker than the center; and the full-image FNV-1a checksum is pinned at `0xAA758FBE`. Afterward, I rewrote the algorithm in Python to the same specification and calculated the checksum again, getting the same number—only then had I separately verified that “the algorithm is correct” and “my C implementation is correct.”

The board's log now looks like this:

```
==== Stardust Box · hardware prototype (3 cards, swipe horizontally) ====
Star map 1/3 (No.023): 3 points, orb #0, 2 edges (frame 210px)
Star map 2/3 (No.041): 4 points, orb #1, 3 edges (frame 210px)
Star map 3/3 (No.067): 5 points, orb #1, 4 edges (frame 210px)
[card] Card container ready: 3 cards, screen width 320px, horizontal snap
[card] Switched to card 2/3: No.041
[card] Switched to card 3/3: No.067
```

The last two lines that appear after a finger swipes horizontally are the logs I most wanted to see in this project—they show that “flipping a card” is not an interaction I simulated on a webpage, but a real finger movement on a real screen, landing on a full-screen card.

## 5. Pitfalls I Hit (This Section Is the Real Cost)

- **The README lied.** The project's earliest README said “skeleton, no product code, cannot run yet,” but the repository contained more than a dozen real-device screenshots and a working build artifact. That sentence survived for two weeks without anyone noticing, until someone asked, “then where did the screenshots come from?”
- **`file://` silently kills IndexedDB.** I made a single-file version with all JS/CSS inlined (467 KB, zero external links), but opening it via `file://` always left it stuck on the startup page. This was not a bug: opaque origins cannot access IndexedDB, “resume where you left off after refresh” depends on it, and the code **refuses to degrade** by principle, so it stalls. I eventually deleted that file—leaving it around would only invite people to open something broken, and the reason is documented in `_FAILED.md`.
- **A one-line PowerShell pipeline can destroy the entire candidate array.** In the Windows launcher, `@( (Get-Command py | Select-Object -ExpandProperty Source), … )` returns `$null` from `Get-Command` on machines without `py`; feeding that to `Select-Object` throws, and the script begins with `$ErrorActionPreference='Stop'`—the entire array becomes an empty set, taking even the hard-coded paths with it. The error looks like “python not found,” but the truth is “I emptied my own candidate list.”
- **Do not use `pkill` with a pattern string.** `pkill -f "vite.js preview"` matches your own bash command line and kills your own shell. I made this mistake twice.

## 6. Current Status

- Repository (public): https://github.com/RUI-debug769/ShardSeek
- Web demo: run `pnpm install && pnpm build && pnpm preview` locally
- Firmware: successfully flashed to real hardware; 2.8 MB full package; three cards, bidirectional horizontal swiping, per-card numbering; 21 page-turn log entries across four sessions
- One-page project introduction: a single printable A4 page

If I had to summarize what I learned from this project in one sentence: **restraint can be architected**. No generation, no judgment, no advice—as slogans, those are worthless. Write them as “contracts must not depend on internal packages,” “P-02 has executable assertions,” and “the model may only write proposals and must provide evidence,” and they actually happen.

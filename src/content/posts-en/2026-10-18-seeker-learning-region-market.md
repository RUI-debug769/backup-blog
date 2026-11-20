---
title: "One Kernel, Many Ways to Learn: Turning Learning Scenarios into Hot-Swappable 'Regions'"
published: 2026-10-18
category: "项目"
tags: ["项目", "AI", "学习"]
description: "Seeker / Learning Region Market: a self-directed learning environment built on top of dsh—complete learning scenarios packaged as hot-swappable Regions and curated by lineage in a market. Two heterogeneous Regions prove that the same kernel can support entirely different ways of learning."
lang: "en"
draft: false
---

One app for studying machine-learning papers, another for drilling practice questions, and yet another for debate-based thinking training—every learning product rebuilds model integration, memory, and UI from scratch, while the "way of learning" itself is nailed into the product. Change the way you learn, and you have to change the entire world.

**Learning Region Market** (Seeker, a 2026AIC competition entry) reverses this: build a self-directed learning environment **kernel**, package complete learning scenarios—persona, protocols, tools, layout—as hot-swappable **Learning Regions**, and curate them by lineage in the Region Market. Ways of learning become plugins; the kernel only handles loading, isolation, and memory.

## Core Idea: Separate the Kernel from Ways of Learning

How do you prove that the kernel can truly host "heterogeneous" ways of learning rather than just one class of template? The answer is two deliberately very different Regions built in for the preliminary round:

- **Paper Debugging (go deep)**: you get a runnable reproduction of a classic paper, but bugs have been planted in it. You debug it and fix it against the paper's numerical results—in the process of "fixing," you thoroughly understand the paper.
- **Olympia (go narrow)**: a dissent-based debate circle (later spun off as the [Olympia project](/posts/2026-10-18-olympia)) that trains only one thing: arguing a question through with a fellow who always opposes you.

The crux of the demo path is **cross-Region continuity**: while reading a paper in the Paper Region, you generate a claim, then carry it with you as you switch to the Olympia Region to start a debate, with your Learner Profile and inbox following you throughout—you can switch ways of learning without breaking the continuity of learning memory.

## Implementation Steps

**1. The M0 Spike asks four life-or-death questions first.** On day one of a big project, write no features; first verify: is incremental development on a dsh fork within the monorepo feasible? Can the Cordis plugin mechanism directly serve as the Region boundary? Is Pyodide running paper reproductions in the browser compatible with the build? Can "freeze—resume" hot switching be implemented? Only after all four GOs are obtained is everything else scheduled.

**2. Fork dsh → incremental development in the same pnpm monorepo.** Code-level reconnaissance comes first: dsh-vendored Cordis 4 provides `ctx.isolate()` scoped isolation (a native handle for Region boundaries), Schemastery configuration schemas, and a plugin-hmr hot-replacement foundation. Region = Cordis plugin package (manifest + persona + protocol + tools + layout), with no second plugin mechanism introduced; the manifest has a dual-track definition (Schemastery at runtime + JSON Schema for the external specification).

**3. Snapshots and deterministic replay.** Switching Regions does not mean closing and reopening: the event stream is persisted and a frozen snapshot is taken, so switching away and back loses no state; the same event stream can be deterministically replayed—this is also the foundation for evaluation and debugging.

**4. Reproduce three classic papers in the browser (Pyodide).** Three demo candidate packages, with every numerical result reconciled against actual local runs: Sutton 1988 (TD learning RMS 0.053 < supervised learning 0.093), Ng & Jordan 2002 (generative wins on small samples, discriminative overtakes it on large samples), and Vermorel & Mohri 2005 (ε-greedy 0.606 > UCB 0.579, consistent with the paper's finding that "UCB has no empirical advantage"). Each package includes "debatable points" and honest labeling (a self-authored simplified reproduction), with one-click batch-run comparisons in the browser.

**5. Fault injection + eval—don't trust "it runs."** All 5 classes of fault injection (model timeouts, malformed formats, corrupted snapshots, etc.) were verified to degrade correctly; all 75 tests pass; the Vite production build passes.

## Ideas It Draws On

- **Plugin architecture**: the VS Code and Cordis plugin model—a minimal kernel with every capability supplied by plugins; a Region is the projection of this idea onto "ways of learning."
- **Learning by doing / the Feynman technique**: Paper Debugging's underlying belief is "what I cannot fix, I do not understand"—reproduce—break—debug—reconcile brings you closer to real understanding than close reading page by page.
- **Dissent-based learning**: the Olympia Region turns "being refuted" into a learning mechanism (see the Olympia article for details).
- **Event sourcing and deterministic replay**: the learning process is an event stream, snapshots can be frozen, and the process can be replayed—engineering ideas borrowed from financial systems and game engines.
- **Chaos engineering**: fault injection is not nitpicking; it is insurance that "nothing goes wrong on demo day."

## Current Status and What Remains

All M0–M5 milestones are complete (a one-day sprint finished the 12-day schedule, leaving a buffer before review): the kernel, market layer, both Regions, replay, and evaluation are all ready, and the video storyboard and narration script are prepared. Still to come: finalize the choice of one of the three demo papers, record a 3-minute screencast (no on-camera appearance, voiceover + subtitles), and submit to the competition platform.

---

The battleground for ways of learning should not be the App Store; it should be inside a hot-swappable kernel.

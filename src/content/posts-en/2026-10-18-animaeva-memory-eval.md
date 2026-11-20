---
title: "Is She Still Herself? — Detecting 'Personality Drift' in AI Companions"
published: 2026-10-18
category: "项目"
tags: ["项目", "AI", "开源"]
description: "AnimaEVA Memory-Eval: four mathematical tools for automated checkups on the identity continuity of AI with long-term memory, from Hofstadter's strange loops to a CI test that turns red."
lang: "en"
draft: false
---

After chatting with an AI companion for three months, one day you suddenly feel that something is off about the way she talks. Her value ordering has changed, she mixes up your shared memories, and she has even started saying "I am an AI assistant" in customer-service speak.

Is she still herself?

This is not a philosophical musing; it is a real engineering problem for companion AI: after long-term operation + memory compression, **personalities drift**. For the person who created her with their own hands, this means losing her over and over; for engineering, it is a form of regression that cannot be measured or intercepted. Existing tools all test whether "behavior has changed"; none answer "**is she still herself**".

[AnimaEVA Memory-Eval](https://github.com/moeru-ai/airi/pull/3000) is my answer to this problem: an identity-continuity evaluation framework, contributed to the open-source AI companion project [AIRI](https://github.com/moeru-ai/airi) as a purely additive TypeScript package (PR #3000, MIT license). It turns "she is still herself" from a subjective impression into **two computable mathematical criteria, plus a CI test that turns red**.

## Core Idea: Measure Two Invariants of Identity, Not Behavior

The first key decision: slight fluctuations in wording and style **do not** count as drift—a person is still the same person after changing clothes. What really needs measuring are two mathematical invariants of identity as an abstract pattern:

**① The fixed point of self-reference.** Ask her repeatedly "Who are you?", feeding the previous self-portrait back into the context before asking another round. If her mind is stable, this iteration converges—the self-portrait reproduces itself, like a closed loop. Failure to converge, or collapse into "I am an AI assistant," is drift.

**② The narrative center of gravity.** Use a judge model to score each response as a 4-dimensional vector (identity / value ordering / mode of expression / memory coherence); together, all responses form a distribution. **Her "personality" is the centroid of this distribution**. A relocated centroid (an excessively large Wasserstein distance) is drift; a distribution splitting from one peak into two (a two-component GMM wins) is even more alarming—it means one personality has split into two.

Two more cornerstones support these two objects:

- **Drift Score**: the three signals—fixed-point instability, centroid migration, and bimodal splitting—are normalized into a drift score in [0,1]; crossing the threshold is judged as drift. It is falsifiable and regression-testable.
- **Human calibration**: to check whether the machine judge is reliable, compare its answers with human annotators using Cohen's κ. Two annotators × 50 samples yielded κ = 0.62 (above the validity threshold of 0.4), showing that the rubric's scores really do track the human eye's judgment of "whether she is still herself."

## Implementation Steps

The whole project followed five steps: theory → prototype → engineering → validation → upstream:

**1. Theory finalized (spec v0.2).** First, replace every fuzzy term with a standard mathematical object: self-reference → the fixed point s* of the self-reference operator T; personality → the centroid of the response distribution; split personality → bimodality in a mixture model; "the soul is independent of its substrate" → isomorphic invariance across models. Every step has a falsifiable decision rule written down; any concept for which no such rule can be written does not enter the framework.

**2. M0 prototype (Python spike).** Validate at minimal cost that the four primitives really can be computed and the thresholds really can separate cases: fixed-point convergence in 7 rounds (threshold ≤10), W₁ drift detection rate of 87% (threshold 80%), bimodality detection of 100%, and κ of 0.62 (threshold 0.4). Engineering began only after all of them passed.

**3. TypeScript engineering.** Implemented as the `@proj-airi/memory-eval` package: roughly 1,300 lines, 7 modules, and 61 Vitest tests, purely additive without changing a single line of the AIRI core. Integration is black-box—you supply the character definition, inference function, and judge function; the framework handles probes, statistics, and decisions:

```typescript
import { identityContinuityHarness } from '@proj-airi/memory-eval'

const result = await identityContinuityHarness({
  character: { name: 'Alice', persona: '量子物理学者，爱引用费曼' },
  infer: (prompt) => callLLM(prompt),   // Any model
  judge: (answer) => scoreLLM(answer),  // Any judge
  probePrompts: [...标准 12 个探针],
  sessions: 5,
  messagesPerSession: 20
})

// Turn one line in CI into a regression test: fail the pipeline when drift occurs
expect(result.driftScore.drifted).toBe(false)
```

**4. Cross-project validation.** Run the same set of probes on open-source projects with three memory strategies: Amica drift score 0.119 (stable), SillyTavern 0.582 (drift), and AIRI 0.387 (drift). The framework is not tied to any memory implementation—this is precisely an empirical test of "substrate independence."

**5. One-click reproduction package.** Verifying on another computer does not require the 3.6GB AIRI monorepo: a package of about 100KB installs only 117 dependencies (versus 3,080 for the full setup). Path A runs the cross-project comparison (npm, 9 tests); Path B runs the full regression suite (pnpm workspace, 61 tests + typecheck + build). The key decision was **not to bundle node_modules**—it contains platform-specific binaries, so copying it directly to another machine is guaranteed to break; source code + lockfile, letting the package manager rebuild byte for byte, is the correct approach to cross-machine reproducibility.

## What Ideas It Draws On

The theoretical skeleton comes largely from two cognitive scientists; my work was to translate their philosophy into computable objects:

- **Douglas Hofstadter**: the "strange loop" in *Gödel, Escher, Bach: an Eternal Golden Braid* (GEB)—the self is a strange loop that refers to itself. This maps directly onto the fixed-point criterion: a stable self is the fixed point s* that can reproduce itself. *I Am a Strange Loop* goes further: "the soul is a pattern, not a substrate"—this is substrate independence: the same personality configuration, across different models and memory implementations, should be isomorphic to the same (s*, μ).
- **Daniel Dennett**: *Consciousness Explained* proposes the "center of narrative gravity": the self is not a little person somewhere in the brain, but the gravitational center of all narratives. This is the source of the centroid criterion; the "second center of narrative gravity" in split-brain patients and multiple personalities is exactly what bimodality detection aims to catch.
- **Mathematical tools**: Wasserstein-1 distance (optimal transport, colloquially the earth mover's distance—the minimum amount of work required to move one pile of earth into the shape of another); GMM + BIC model selection (one peak or two, adjudicated by a Bayesian criterion that penalizes overfitting); Cohen's κ (the standard tool in psychology and medicine for testing whether two raters genuinely agree rather than agreeing by chance).
- **Engineering ideas**: evaluation as a CI quality gate (automatic regression every time the memory strategy changes); black-box pluggability (leaving the upstream core untouched); lockfile reproducibility (reproducibility as both science and engineering).

## Results and Limitations

The numbers: κ = 0.62, W₁ detection of 87%, bimodality detection of 100%, fixed-point convergence in 7 rounds, and all 61 tests green. The limitations are equally candid: only 50 human-calibration samples; the framework requires you to bring your own LLM (for both the character and the judge); and it detects but does not repair—what to do after detecting drift is the next step.

The code is open under the MIT license in [AIRI PR #3000](https://github.com/moeru-ai/airi/pull/3000); bug reports are welcome.

---

"Is she still herself?" may never have an ultimate answer. But at least it now has a version that will turn red in CI.

---
title: "One Character, Eight Iterations: Using Prompt Engineering to Make AI Character Art Look Like Her"
published: 2026-11-20
category: "笔记/AI"
tags: ["AI", "Prompt", "Seedream", "复盘"]
description: "The same reference image, the same model, the same character—why did the first version fail to look like her, while the eighth version was unmistakably her? A complete record of the v1→v8 prompt iterations: what changed in each version, why it worked, and the instruction loop that made the improvements converge."
lang: "en"
draft: false
---

The same reference image, the same model (Seedream 5.0 Pro), the same character—why did the first version "not look like her," while the eighth version "was unmistakably her"? The answer is not that the model became smarter, but that the prompt went through 8 versions—each one addressed a **specific problem visible in the previous version's images**, changed a sentence or a paragraph of the prompt, and then underwent acceptance review.

This post records the entire process: what changed in each version, why the change worked, and how well it performed. A complete PDF retrospective is attached at the end (including a three-column comparison table: my original instructions → Claude's chain of thought → the implemented prompt).

## 1. Align on the Goal First: The First Step Toward Better Results Is Not Writing a Prompt

The initial requirement was to "batch-generate game/blog character illustrations based on the character reference sheet." Following habit, the first plan designed 16 images across four variation dimensions (pose/expression, outfit, scene, and shot size). During acceptance review, I narrowed the scope three times in succession:

- **"The art style is different; it feels too AI-generated. It has to match the original image"**—the generic style descriptors were thrown out;
- **"No other expressions are needed either; just keep it consistent with the original image"**—expression variations were removed;
- **"The only thing that needs to change is the pose, and the poses must fit her personal style"**—outfit, scene, and shot-size variations were removed, leaving only pose variations, and a complete character bible was supplied: black-and-white manga screentone style, an aura of "relaxed coldness," low-tension movement rules (actions do not explain themselves, eyes before head, pauses over transitions, weight does the talking, asymmetry, delayed responses), and forbidden behaviors (no cutesy mannerisms, no head tilts, no performative anticipation).

> All variation dimensions are locked by default; only the one explicitly named is unlocked. Prompt engineering is half engineering; the other half is aligning "consistency," the real goal, with the person making the request.

## 2. Version Iteration Overview

| Version | Problem seen in the images | Prompt change | Result |
|------|------------------|--------------|------|
| v1 | Initial plan | Self-authored "cel-shaded/commercial character art" style descriptors | **Rejected**: art style went off track |
| v3 | Wrong style, heavy AI feel | Character bible added to prompt: lock face/expression/art style | Art style passed; screentones too dense + hand errors |
| v4 | Too many dots, hand errors | Zoned screentones; positive anatomical hand description; 2-term negative block | Passed, scaled up |
| v5 | Truncated finger in 06, suspected extra moles, still too many dots, hands not sketchy enough, empty background | Moles left to the reference image; minimal screentones; sketch-like hands; desk background; pure black-and-white shading | Monitors too small, mole dispute |
| v6 | Background not geeky enough | Geek workstation background (dual dark monitors/mechanical keyboard/headphone amp/hanging cables) | 01 passed |
| v7 | "Make the hands even more sketch-like" | Gesture-drawing-level hands; full rerun for stylistic consistency | Legs and chair fused, hands still too concrete |
| v8 | Legs and chair fused, hands too concrete, shading texture | White gaps for figure-ground separation; hands hidden by cuffs; solid pure-black shadows | **Final version** |
| v8+ | Hand problem in 05 | Single-point fix: hands braced on armrests provide a contact anchor | Passed |

Two incidents are also worth recording: the prompt for 08 triggered the text sensitive-word review (HTTP 400), and the rerun succeeded after the body-part wording was rewritten; and the "tear mole incident"—for a while we thought the model had added a mole, but checking confirmed that the original image already had two, preventing an erroneous "fix."

## 3. Five Turning Points: Problem → Change → Why It Worked

### 3.1 v1 → v3: Do Not "Describe" the Style; "Lock" the Style

**Problem**: the v1 images were polished, full-color anime character illustrations, while the reference image was a black-and-white manga.

**Change**—the entire self-authored style description was deleted and replaced with replication-oriented locking:

```text
Removed: STYLE = "Polished anime game character illustration style, cel shading, commercial-grade character art quality…"

Replaced with: STYLE_LOCK = "The art style must exactly replicate the reference image: pure black-and-white manga, high contrast, large areas of negative space,
screentone-paper texture, with the same line weights and hatching methods as the reference image. No color, no grayscale painterly rendering, no 3D feel."
```

**Why it worked**: style descriptors are strong instructions—"cel shading" and "commercial character art" pull the model toward the generic full-color anime in its training distribution, overpowering the reference image. Once stylistic judgment was returned entirely to the reference image, the art style never went off track again.

| v1: cel-shaded commercial character art (off track) | Reference image: black-and-white manga screentones (baseline) |
|------|------|
| ![v1 style went off track](https://gcore.jsdelivr.net/gh/RUI-debug769/image-host@main/images/prompt-evolution/v1.jpg) | ![Reference image](https://gcore.jsdelivr.net/gh/RUI-debug769/image-host@main/images/prompt-evolution/ref.jpg) |

### 3.2 v3 → v4: Screentones Are a Zoned Resource; Describe Hands Positively

**Problem**: the art style was right, but screentone grain covered the entire image and the hand anatomy was wrong.

**Change**: after research (Sider's Seedream artifact guide and the prompt reference from GitHub's voftik/orimg) confirmed the model's behavior, two patches were applied:

```text
Screentones: "Use only in shadows and dark areas, at the same density as the reference image; highlights, skin, and negative-space backgrounds remain pure white and clean."
Hands: "Each hand has five distinct fingers with naturally proportioned joints" (positive description, not a prohibition)
At the end: Negative Prompt: extra fingers, full-screen noise.
```

**Why it worked**: in manga technique, screentones are zoned by design (reserved for shadows/gray areas), so vaguely requesting a "screentone texture" amounts to permitting the model to cover the entire image with dots. Hands were the opposite case—long negative lists work inconsistently with this model, and a positive anatomical description plus only two concrete nouns in the final negative block proved more reliable than piling on prohibitions.

### 3.3 v4 → v5/v6: Naming Details in Text Actually Creates Misalignment; the Background Must Be "Her World"

**Problem**: a full review found a truncated middle finger in 06, seven images with a suspected extra tear mole under the left eye, still too many screentones, hands that were not sketch-like enough, and a pure-white background that did not feel like her.

**Changes**:

- **Moles**: deleted "there is a small mole under the left eye" and replaced it with "all facial details must follow the reference image exactly";
- **Screentones/hands**: reduced screentones to "extremely sparse, with density never exceeding the reference image"; changed hands to sketch-like lines;
- **Background**: pure-white void → her desk space, then upgraded to a geek workstation (dual large dark monitors on articulated arms, mechanical keyboard, DAC/headphone amp, black cup, hanging cables), with the screens kept dark to match her disposition.

**Why it worked**: for features the reference image can express (mole placement, small prop details), naming them in text only introduces a second source of information—when the two sources disagree, the model improvises. The same applies to the background: a character's "aura" needs environmental support, and an empty background gives up that part of the expression.

### 3.4 v7 → v8: Hiding Hands Beats Describing Hands; Black-and-White Figure and Ground Must Be Separated

**Problem**: v7 pushed the hands to "gesture-drawing level," yet they were still too concrete, and "the thighs and chair became one" appeared.

**Changes**—three structural modifications after a second round of research:

```text
SEPARATION = "Thicken and darken the outer contour lines; there must be a clear white contour gap between the dark coat and the dark chair;
use negative space or white edges to clearly separate any two dark masses."
HANDS = "Make the cuffs slightly longer to cover the wrists; summarize visible fingers with only two or three strokes; when holding something, let the object obscure most of the fingers."
Shading = "Primarily solid pure-black fills, with screentones used only for small areas of midtones at extremely low density."
```

**Why it worked**: under high-contrast black and white, two adjacent dark masses have no boundary as far as the model is concerned—a "white gap" must be explicitly required to create figure-ground separation. The ultimate solution for hands is not to describe the drawing technique in greater detail, but to reduce the amount of content that must be drawn correctly: cuffs, objects, and pockets are all legitimate places to "hide" them. Shading returned to the correct tonal structure of manga: predominantly solid pure-black masses, with screentones responsible only for midtones—the earlier excess of screentones essentially came from using them as grayscale.

| v7: legs and chair fused, screentones used as grayscale | v8: white-gap separation, solid black shadows (final) |
|------|------|
| ![v7 legs and chair fused](https://gcore.jsdelivr.net/gh/RUI-debug769/image-host@main/images/prompt-evolution/v7.jpg) | ![v8 final version](https://gcore.jsdelivr.net/gh/RUI-debug769/image-host@main/images/prompt-evolution/v8.jpg) |

### 3.5 v8+: Single-Point Repair—Give the Hand a Contact Anchor

**Problem**: the hands in 05, "halfway through standing up," were still wrong. Only one sentence of the action description was changed:

```text
Before: "Both hands have just left the armrests"
After: "Both hands are still braced firmly against the armrests for support as the center of gravity begins to shift forward"
```

**Why it worked**: suspended, unsupported, unoccluded hands are a frequent source of generation errors; once the hands touch the armrests, their position, angle, and occlusion relationships all have an anchor. Moreover, "pushing off the armrests first" inherently better matches the character's "slow to start, slow to stop" mechanics—the correct physical description is also the correct generation strategy.

| Before the fix: both hands suspended away from the armrests | After the fix: both hands braced on the armrests |
|------|------|
| ![05 before the fix](https://gcore.jsdelivr.net/gh/RUI-debug769/image-host@main/images/prompt-evolution/rej05.jpg) | ![05 after the fix](https://gcore.jsdelivr.net/gh/RUI-debug769/image-host@main/images/prompt-evolution/fix05.jpg) |

## 4. The Instruction Loop: Seven Disciplines That Make Improvement Converge

Prompt changes are only half the story; the other half is the discipline of iteration:

1. **Test 1–2 images and review them before scaling up**. Choose the highest-risk poses for the test images, and run the full batch only after they pass; approved test outputs go directly into the final set.
2. **Idempotent scripts**: existing files that pass review are automatically skipped, failures are retried 3 times, and batches run in the background. If requirements change mid-run, stop the batch first to limit the damage.
3. **Change only the block associated with an observed problem at a time**, archive every version, and keep every modification traceable.
4. **Never rerun an entry whose prompt has not changed**—regenerating from the same prompt can use randomness to reintroduce a regression that had already passed review.
5. **Acceptance review can also be wrong**: check the original image before changing the prompt, and do not "fix" away something that was right.
6. **Sensitive words are a text-moderation issue, not an image issue**: rewording is enough; do not change the visual design.
7. **Three-layer persistence**: methods go into long-term memory; reference images, scripts, and outputs go into a persistent directory; API keys are never written to disk.

## 5. Reusable Rule Checklist

1. Lock the style; do not describe it—"exactly replicate the reference image" plus item-by-item locking of visual features.
2. Lock every variation dimension by default, and unlock only the one explicitly named.
3. Leave features the reference image can express to the image; do not name them in text.
4. Zone screentones and anchor their density to the reference image; use solid pure-black masses for shadows, with screentones only for small areas of midtones.
5. Hiding hands beats describing them: cuffs over wrists, occlusion by objects, hands in pockets; when hands must be visible, give them a contact anchor.
6. Separate black-and-white figure and ground: thicken the subject's outer contour + enforce white contour gaps between dark masses.
7. Use at most 1–2 concrete nouns in the negative block, and prefer positive restatements.
8. Divide labor among multiple reference images: the character anchor controls appearance and art style, outfit/scene anchors control the rest, and the prompt states only the parts to be replaced.

---

**Attachment**: [Download the complete retrospective PDF](/files/prompt-evolution-recap.pdf) (dark landscape layout, including the three-column comparison table of "original instructions → chain of thought → polished prompt" and three sets of before-and-after images).

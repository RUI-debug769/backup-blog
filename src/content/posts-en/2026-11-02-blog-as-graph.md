---
title: "After Fifty-Four Commits, the Blog Became a Graph of Cross-References"
published: 2026-11-02
category: "项目"
tags: ["建站", "知识管理", "自动化", "开源"]
description: "I did not write many articles this week; I mostly worked on the house: switched themes, launched the Thoughts column, added site-wide bidirectional links, moved the daily report into Actions, and learned from two silent failures."
lang: "en"
draft: false
---

Fifty-four commits landed in the `backup-blog` repository this week, but few of them were “writing”—I spent most of my time working on the house. The blog moved to a new theme (Shirone, Astro 7 + Svelte 5, with components rebuilt to the Material 3 Extended specification). Its name has not changed: it is still MUR DOS LOG. The moment on October 27 contained only one line: the blog has moved into a new house. The rain is still falling.

Below, I break it into four parts: what changed this week, one decision I weighed repeatedly, two silent-failure pitfalls, and the holes to fill next week.

## 1. What Changed This Week

**The “Thoughts” column is live.** 102 articles: 50 thinkers, two each—“What Is Learning” and “How to Learn”; the other two are not about people but about a character called “the listener who pretends not to understand”—the other half of the Feynman learning method. The list spans a wide range: Simon, Feynman, Turing, von Neumann, Shannon, and Minsky, alongside Confucius, Wang Yangming, and Hua Luogeng, plus contemporary names such as Karpathy, LeCun, Hinton, and Liang Wenfeng.

**Site-wide bidirectional links.** `[[wikilink]]` now renders as internal links, article footers have backlink panels, and `/graph/` is a site-wide relationship graph. This syntax was inspired by Karpathy's LLM wiki: knowledge should not be just a reverse-chronological stream of logs, but a web whose nodes can point to one another. The Wiki entry in the navigation now leads directly to the graph page.

**The frontier daily report moved into the site and into the cloud.** A new `/reports/` section archives daily and weekly reports by date, with detail pages using the same warm terracotta dark panels as the emails. Generation moved from my local machine to GitHub Actions: RSS is fetched on a daily schedule, organized by an ARK model, and sent as an HTML email through QQ SMTP. I also added three things along the way—a competitions section (Devpost and 赛氪, keeping only online hackathons and those near Hangzhou), `--catchup` for missed reports, and `--resend` for reports already archived.

**frontier-report went from 0.2.2 to 0.4.3 in one week.** Seven releases: HN fetching switched to the Algolia API (AI keywords + 24-hour time window, with Firebase as fallback), Doubao Search MCP integration, fetching separated from generation, offline fallback and generation-retry degradation, restoration of the competitions section, and foreign proper nouns kept in their original form rather than transliterated.

**A few odds and ends.** The comments section now has a black-and-white manga journal theme, with separate CSS for light and dark versions; analytics moved from Busuanzi to a self-hosted GoatCounter beacon; a new `backup-shared-memory` repository created a shared memory layer for Claude Code and dsh in WSL (seven facts about “who I am,” plus a bridging protocol); and the final project for the “Decoding DeepSeek” course was submitted this week—the experiment report, production notes, and AI interaction logs were archived together, with a GitHub Pages mirror launched at the same time.

## 2. One Decision: Let Thinkers Speak in First Person, but Never Fabricate

The easiest thing to question in the Thoughts column is not the prose. It is the voice.

Ask a model to write “I” as someone who has died, and the slightest carelessness turns into putting words in their mouth. So the column has had one hard rule from its very first article, printed in the “Reading Agreement” at the start of every piece:

> The first-person narrative in this article is a reconstruction of perspective, used to organize the person's ideas; these are not their own words. Only quotations in blockquotes have traceable sources.

In structural terms, this means three things: frontmatter declares `voice: reconstructed-first-person`; the `source` field identifies the books and speeches on which the article is based; and all quotations go into blockquotes, in both Chinese and English, with the book title and year. The body may say, “What I want to tell you is not how amazing machines are,” but only words inside a blockquote may be treated as “they said this.”

This rule cannot be handled by writing “please do not fabricate” in a prompt. A prompt is a soft constraint, and the model will forget it after two thousand characters; structure is a hard constraint—which sections may be reconstructed and which must be verbatim can be checked both in the rendering layer and during review.

The internet is now full of “so-and-so said” passages actually written by models. Confining reconstruction to a clearly labeled block is far cheaper than apologizing afterward.

## 3. Two Silent-Failure Pitfalls

**Pitfall one: a successful push does not mean the site is live.** In Actions, daily reports are committed with `GITHUB_TOKEN`, and that push event does not trigger another deployment workflow—GitHub's recursion-prevention rule. As a result, every daily report was “committed successfully” while the site stayed a day behind. The fix was to explicitly dispatch a deployment after the commit (`workflow_dispatch`). This changed one of my habits: in an automated pipeline, every step needs a visible result; “the command did not error” is not a result.

**Pitfall two: putting the analytics script in the wrong place is the same as not including it.** First Busuanzi failed. After switching to GoatCounter, I found that `gc.zgo.at` was inaccessible in China, so I had to self-host a beacon. The second problem was more subtle: injecting the analytics script into article HTML did nothing—that location does not execute scripts. Moving the script into `Footer.astro` finally started real counting on every page. I also fixed Giscus custom themes being blocked by CORS by serving them through jsDelivr.

The two incidents share one trait: failure made no sound. Pages still returned 200, commits were still green, and only the numbers were wrong.

## 4. Next Week

Not wishes—a to-do list:

- Add RSS to `/reports/`. Right now daily reports can only be read by refreshing the webpage, not subscribed to. That is wrong.
- Publish the citation-verification table for the Thoughts column: which quotation, which book, which edition, which page. Only verified entries get marked “verified.”
- Deduplicate daily reports: when three outlets cover the same paper, keep only the primary source and demote the rest to footnotes.
- Fix the remaining mobile typography issues in the theme.

## Project Map

| Project | In one sentence | Repository |
| --- | --- | --- |
| open-cognitive-os | Open Cognitive Operating System: turning cognitive architecture into an executable specification | [open-cognitive-os](https://github.com/RUI-debug769/open-cognitive-os) (private; will be made public after cleanup) |
| cria-research-lab | An AI research laboratory built around the five-step Keyanlun research method | [cria-research-lab](https://github.com/RUI-debug769/cria-research-lab) |
| ai-brain-tools | Five small tools at the intersection of mathematics and brain science | [backup-ai-brain-tools-v2](https://github.com/RUI-debug769/backup-ai-brain-tools-v2) |
| frontier-report | AI frontier daily/weekly reports: automated fetching, organization, and email delivery | [frontier-report](https://github.com/RUI-debug769/frontier-report) |

The blog itself is at [murdok.me](https://murdok.me), and the source code is in [backup-blog](https://github.com/RUI-debug769/backup-blog).

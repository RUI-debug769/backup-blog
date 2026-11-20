---
title: "From Recording to Writing: The Diting 0.4 Rework"
published: 2026-11-07
category: "项目"
tags: ["AI", "硬件", "产品设计", "写作", "开源"]
description: "In 0.3, \"writing\" was merely a longer summary. Version 0.4 turns it into a short story: the same original utterances, aiming for accuracy by day and authenticity by night. This post covers what the rework got right, what it got wrong, and what remains unfinished."
lang: "en"
draft: false
---

When I finished Diting 0.3 yesterday, I thought "writing" was done: add a button below the three columns, have the model expand the day's utterances into a web-style article, and as long as it read smoothly and hit the word count, that was enough.

Today I threw that out.

Not the interface—the feature itself did not hold up. **If "writing" is only a longer, smoother summary, it has no reason to exist.** The three columns already solve "reading"; nobody has a reason to read the same words again just because they have now been divided into paragraphs and given some adjectives.

Version 0.4 has a different goal: write a short story that **could grow only out of today's original utterances**. Not a retelling, but a reimagining.

![Main screen: three columns, today's original utterances, and "let it write"](https://gcore.jsdelivr.net/gh/RUI-debug769/image-host@main/images/diting/main-light.png)

## 1. The Same Original Utterances, Two Different Uses

The three columns and "writing" consume the same utterances, but they are two entirely different jobs.

The three columns aim for **accuracy**: output JSON, use short sentences, and leave fields empty when uncertain; typos, slips of the tongue, and half-finished sentences in the original speech are all preserved, because it is evidence. The model only classifies; it does not polish.

"Writing" aims for **verisimilitude**: first person, with "I" as the stone beast crouching at your feet, addressing the user as "you"; the underlying tone is always Liaozhai; the opening must deliver a hook within three sentences; every three to five hundred Chinese characters must introduce new information; and the ending must resonate or deliver a twist. It has to be a piece of fiction, not a summary letter.

Put these two jobs under the same button and they can easily contaminate each other. So we drew a hard line for "writing":

- People, numbers, places, and agreements must come from the day's original utterances;
- The environment can be written—wind, lamplight, blood, a box, red thread—but it cannot become a device that drives the plot;
- Quotations may use only the original utterances; they can be trimmed, but not altered;
- No new facts may be introduced.

**The "telling" may be fictionalized; the "facts" may not.** This line was the only thing in the entire rework on which we never compromised.

## 2. The Word Count Was Not Arbitrary

"Writing" in 0.3 had a fixed word count, which meant it invented material when there was little to work with and could not fit everything when there was a lot. Version 0.4 instead uses five tiers based on the character count of the deduplicated source material:

| Source material for the day | Target length |
| --- | --- |
| Fewer than 600 characters | 700–1300 |
| 600–1500 characters | 900–1500 |
| 1500–3000 characters | 1200–2000 |
| 3000–6000 characters | 1800–2800 |
| More than 6000 characters | 2500–3500 |

Forcing three thousand characters out of sparse material inevitably means invention; writing only eight hundred characters from abundant material wastes it. With tiers, the article's length at least has some relationship to the life lived that day.

The tradeoff is that measured output exceeds the target by 10–20%. The upper limit is written into the prompt, but the model does not always obey. We accepted this deviation: a complete story matters more than an exact character count, but we cannot pretend it is exact during the project defense.

## 3. Both Openings and Techniques Come with Options

Run the same prompt twenty times and you get twenty stories with the same opening. Version 0.4 provides two sets of options:

- Four choices of opening: begin with a sound, an object, a sentence, or an action from that day;
- Four choices of narrative technique: O. Henry, Hemingway, Chekhov, or Lu Xun.

The underlying tone is always Liaozhai. The technique can change; the underlying tone cannot. Change that, and it stops being "something written by Diting" and becomes "an AI writing tool."

The first output line is "Title: <2–8 characters>", and the body is not divided into chapters. The parser also supports "Book title:", "Heading:", and "Chapter N" from older drafts; when there are no chapters, everything is collected into one story and displayed as "Short story · N characters". If the model fails, a fallback draft is used, and both the reading page and the notification are labeled "fallback"—we do not pretend the model wrote it.

## 4. 80ms Is a Design Choice, Not a Slow Network

In the previous article, I wrote "one character every 30 milliseconds." That was 0.3, and it is now obsolete. Version 0.4 uses **80ms per character**.

The reason is simple: the model streams back much faster than a person can read. If the text appeared as returned, the screen would fill in an instant, leaving no time to read and no time to feel that "it is writing." At 80ms per character, several hundred characters take several dozen seconds; that time is reserved for reading, not spent waiting on the network.

Readers can tap the body text to display everything at once, and the display also speeds up automatically when it falls too far behind. Ordinary passages of a few hundred characters will not be accelerated; only a large backlog triggers catch-up. This detail lives in `PACE_MS` in `ArticleActivity.java`; do not quote the old number during the project defense.

![Day paper and night paper](https://gcore.jsdelivr.net/gh/RUI-debug769/image-host@main/images/diting/themes.png)

## 5. The Interface Changes from a "Reader" to a "Journal"

The main screen in 0.3 looked like an information card: three columns, a button, and whitespace. Version 0.4 turns it into an open paper journal.

- Two tabs at the top: "Record" and "Write." "Record" holds the three columns and today's original utterances; "Write" holds the day's story and past stories.
- Two color schemes: day paper and night paper. Day paper is beige paper, warm black ink, and a touch of vermilion; night paper is warm black, gray ink, and the same vermilion.
- Card borders, rounded pills, and the second accent color are gone. The three columns sit directly on the paper, separated by whitespace and fine lines.
- The main screen keeps only one primary button, "let it write"; vermilion belongs to this button alone.
- The stone beast on the screen is 20×18 pixels, with eight states corresponding to real states in the pipeline: recorded, someone else speaking, contradicted, writing, finished writing, disconnected, poked, and asleep.

![The stone beast's eight states](https://gcore.jsdelivr.net/gh/RUI-debug769/image-host@main/images/diting/pet-states.png)

## 6. Version 0.4 Also Adds "Voice Cues"

This version adds one very small action in the cloud: after each segment is processed, it pushes a sound event in addition to the text.

- Speech from the owner is recorded: `tick`;
- The speaker is someone else and the sound is not noise: `hush`;
- Nothing is sent in other cases.

When the board receives an event, it directly pushes PCM and enables the DAC; the amplifier enable pin is GPIO39. The sound is not a human voice, but "stone and wood" synthesized on the phone: noise excitation with inharmonic decay, under three hundred milliseconds, with no voice, no melody, and no synthesizer timbre.

But the board has no speaker. To hear it, you need to connect an external 4Ω, 1–3W speaker to the JST PH 1.25 connector. Demonstrations use phone audio by default; this is stated in the user manual so nobody gets onstage and discovers "why is it not making any sound."

## 7. More Is Unfinished Than Finished

- Only part of the light language's rhythm has been implemented; the full six states are not yet running;
- Transmission is still plaintext TCP: sound goes only to our own server, but it is not encrypted;
- Voiceprint recognition is still a single-template compromise with a threshold of 0.48, and BGM and similar voices occasionally pass by mistake;
- The cloud is a single 2-core 1.7G machine with no redundancy;
- Automatic writing depends on the phone's exact alarms, notification permission, and battery-saving policy; if the app is killed, nothing gets written;
- The WiFi name and password are still compiled into the firmware, so changing networks requires reflashing; "Send to board" in the app is an experimental entry point, and entering the wrong values will disconnect it;
- The enclosure is two-piece 3D-printed, 104×97.5×44mm, holding one 18650 cell; it is not yet a pendant suitable for everyday wear.

These are not a "deal with it later" list; they are part of this version's boundaries. If asked during the project defense, answering honestly is safer than inventing a number.

## 8. What This Rework Got Right and Wrong

What it got right: the hard rule against adding facts; sizing the story to the source material; slow reading at 80ms; splitting "Record" and "Write" into two tabs; and making every state of the stone beast correspond to something in the pipeline.

What it got wrong: the 30ms decision in 0.3; version 0.4 still exceeding the character count by 10–20%; occasionally drifting from "audio / debugging" to "box / red thread"; voiceprints mistakenly admitting BGM; and automatic writing failing because of phone permissions. Also, the "sentence-by-sentence denial" entry point in 0.3 was abandoned—it made users judge every sentence, which was more exhausting than a transcript. It has now been replaced by something stricter: other people's words never enter the ledger at all.

But "recognizing only the owner" is not absolutely safe either. It hears everyone; the ledger simply contains only you. Similar voices, background music, and half-finished sentences can still be recorded by mistake. The next version needs to address this with multiple templates and thresholds calibrated on site.

## 9. Repository and Documentation

The code is at [github.com/RUI-debug769/diting](https://github.com/RUI-debug769/diting), under Apache-2.0. The 0.4 installation package is in the [v0.4.0 Release](https://github.com/RUI-debug769/diting/releases/tag/v0.4.0).

Two PDFs were also added this time: a Feynman handoff manual for the defense lead and design lead, and a user manual for ordinary users. Both are under `docs/` in the repository.

If I had to end with just one sentence: a voice recorder preserves sound; this preserves how the things you said become the story you tell about yourself.

## Postscript: Do Not Let the Model Learn Your Filler Words

After the article went out, I went back and fixed one very small bug. So small that it almost did not deserve to be included, but it exposed another side of the same problem.

The original utterances contain many instances of "mm," "ah," "um, um," and "I mean." That is how people speak, and we do not change a single character during transcription—`original` is evidence, so typos, sentence breaks, and filler words all remain. The problem appears at the next step: all three prompts ask the model to "capture details from the original utterances," "use the speaker's own words as much as possible," and "use only original utterances in quotations." The model obeys and learns the filler words along with everything else. Sentences like "Mm, that meeting got pushed back to twelve again" begin appearing in the right column, the three columns, and the short stories—it is not quoting you; it is imitating you.

The fix is not to alter the original utterances, but to add a derived copy between them and the model: clean it with `Clean.java` before sending it to the model, and have the fallback draft read this copy as well. The cleaning rules are conservative—filler such as "mm / ah / uh / oh / um, um / I mean / you know / right?" is removed; "this / that / then / that is" is retained when used as a demonstrative pronoun or conjunction; and easily damaged cases such as "amount," "hiccup," "in other words," and "the bar counter" are protected individually. Not one byte of the original record is changed; the three columns and short stories receive only a clean projection of it.

The verification was deliberately crude: a pure-JVM `CleanCheck`, several dozen fixed examples, and `bash android/check_clean.sh`; then a full package build to confirm that no test classes had been included in the APK.

This made me separate "evidence" and "expression" more clearly. The original utterances must be preserved word for word, because they prove that someone really did say that sentence on that day; but when the model reads them, it does not need to read the coughing too.

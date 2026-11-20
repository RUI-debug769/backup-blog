---
title: "Getting .claude Running in DeepSeek Harness: dsh-dotclaude"
published: 2026-10-19
category: "笔记/工具链"
tags: ["DSH", "插件", "Claude Code", "工程"]
description: "The bundled dsh-tui 0.14.0 had actually been skipped by the host all along. After getting to the bottom of it, I turned the half of Claude Code projects that was still genuinely missing—.claude commands and permissions—into a DSH plugin."
lang: "en"
draft: false
---

All I originally wanted was to switch my TUI to a different version. Instead, I first uncovered something more awkward.

## 1. The TUI You Installed Was Never Loaded by the Host

`~/.dsh/profiles/web/package.json` lists `@deepseek-harness-tui/dsh-tui: 0.14.0`, and everything looks normal. But the actual output of `dsh web --help` is:

```
dsh: skipping profile bundle "@deepseek-harness-tui/dsh-tui":
     Plugin @deepseek-harness-tui/dsh-tui@0.14.0 is incompatible with dsh 0.2.1-rc.2
```

The reason is straightforward: 0.14.0's peer range tops out at `0.2.0-rc.2`, while the current host is `0.2.1-rc.2`. The startup log also contains a string of `patch: entry "dsh-tui-*" not found` warnings—its patch entries are looking for configuration keys that do not exist.

Version 0.16.1 has already added `0.2.1-rc.2` to its compatibility range. So the first interpretation of “make a compatible version” (fixing 0.14.0 until it runs) would just repeat work upstream has already done, while leaving me maintaining a fork of several thousand files for the long haul. I chose the second interpretation: **build on its now-stable seams to fill what is still genuinely missing in DSH**.

## 2. Which Half Was Actually Missing

Within Claude Code's project conventions, DSH already covers quite a lot:

- `CLAUDE.md` — read natively; it is already in the candidate file list for `agent-instructions`;
- hooks and plugin mods — covered by the official bridges `dsh-hooks-claude-code` and `dsh-experimental-claude-code-mods`;
- session history — `dsh-tui migrate claude-code` can import it wholesale.

After combing through the repository and counting the 5,945 entries in the plugin directory (150 of which contain “claude”), only one area remained unaddressed:

> Slash commands in `.claude/commands/*.md`, and `permissions.deny` in `.claude/settings.json`.

Neither of these has **any runtime parsing** in DSH. The `/review` and `/db-migrate` commands you spent a year writing all stop working when you switch to DSH; so do those settings rules saying “never let me run `git push`.”

`dsh-dotclaude` wires both of them up.

## 3. Three Hard Constraints

Before building the plugin, I set three ground rules for myself. Almost everything in the design follows from them.

**1. Probe every host seam; never assume it exists.**

The plugin will be installed into all kinds of profiles: web-only, TUI-enabled, headless, and other people's customized setups. So every service goes through `ctx.get(name, false)`, and each missing service means one fewer feature:

| Seam | Behavior when missing |
|---|---|
| `commands` | Register no commands; everything else works as usual |
| `workingDirectory` | `/claude` returns a clear error message instead of throwing |
| `systemPrompt` | Add no prompt section |
| `tuiStatus` | Show no status line |

This lesson came from those 24 warnings from 0.14.0: a plugin that prevents the host from starting is far worse than one that simply does not work.

**2. Enforce deny only; never enforce allow.**

Claude Code permissions have three levels: `allow` / `deny` / `ask`. I implemented only `deny`.

The reason is simple: `.claude/settings.json` is a file the model may be able to write. If the plugin read `allow` and skipped approvals on that basis, it would turn “a file the model can modify” into “a file the model can use to grant itself more privileges.” So `allow` is reported but never enforced, and the same goes for `ask`—approval policy remains entirely up to the host.

**3. Parsing failures must fail open, but never silently.**

A malformed settings file, a JSON parse failure, an unrecognized rule syntax—in all these cases the plugin blocks no calls (fail open), but every issue goes into the `/claude doctor` report. Security boundaries should fail visibly, not mysteriously.

## 4. Implementation Details Worth Mentioning

**How the project root is determined.** The nearest ancestor directory containing `.git`; if there is no `.git`, use the working directory itself. There was a pitfall here: if you walk upward looking for `.claude`, `~/.claude` makes your home directory look like the project root, mixing user-level commands with project commands. So a home directory containing `.claude` is explicitly excluded and treated only as the user-level root.

**How command names are flattened.** Claude Code uses subdirectories as namespaces (`db/migrate.md` → `/db:migrate`), but the host's command-name syntax is `/^[a-z][a-z0-9_-]*$/`, which does not accept colons. So `db/migrate.md` maps to `db-migrate`; names that cannot be mapped (starting with a digit, containing spaces) are skipped, and their filenames are listed in the report.

**How command bodies are expanded.** Three forms are supported: `$ARGUMENTS` (raw text), `$1`–`$9` (positional arguments split with quote handling), and `@path` (inline file, subject to a size cap; if it cannot be read, the original text is kept and the issue is reported). I did not implement `!` for executing bash—a Markdown file read from a repository should not be handed a direct shell-execution path by this plugin.

**How the prompt reaches the model.** Command handlers do not produce model messages, so `agent.followup(...)` queues the expanded content as an ordinary user message for the next turn. This is the same route DSH uses for commands such as `/goal`.

**How permission rules are matched.** Rules use Claude Code syntax, `Tool` / `Tool(specifier)`, with tool names mapped to host tools (`Bash`→`bash`, `Read`→`read`, `MultiEdit`→`edit`, `WebFetch`→`web_fetch`, `Task`→`subagent`…). `Bash(git push:*)` has prefix semantics; `Read(./src/**)` is a path glob, where `**` crosses directory levels and `*` does not. Decisions hook into the `tools/pre-execute` waterfall, returning `{ kind: 'deny', reason }` on a match.

## 5. Four Test Gates

I did not want to deliver a plugin that merely “works on my machine,” so I defined four gates, all reproducible locally:

```sh
npm run typecheck                            # 1. Types
npm run build && npm test                    # 2. 53 unit tests + host-stub integration
DOTCLAUDE_MATRIX=1 ./scripts/host-smoke.sh   # 3. Real host composition + startup
                                             # 4. dsh-tui version matrix
```

Gate 2 uses a minimal host stub (`get` / `on` / `effect` / `inject`) to verify behavior: command registration, skipping names already taken, `/claude run` expansion, deny matches and passes, status-line aggregation and cleanup, and degradation when workingDirectory is absent.

Gates 3 and 4 actually launch the host: create a disposable `DSH_HOME`, build a profile from the official web template, install the plugin, use `--dump-config` to confirm the `dsh-dotclaude` row is present, then actually start the web host.

```
== 3/4 install the plugin and compose it
   composed row present
== 4/4 boot the host
   boot OK: dsh web: http://127.0.0.1:38263/
== matrix: dsh-tui 0.14.0 must be refused by this host
   refused as incompatible
== matrix: dsh-tui 0.16.1 must install and compose beside the plugin
   18 dsh-tui rows composed beside dsh-dotclaude
host-smoke: PASS
```

The matrix step also verifies the fact from the beginning of this article: **on 0.2.1-rc.2, 0.14.0 is rejected by the host itself**, not by a picky plugin; 0.16.1, meanwhile, installs and composes alongside our row.

(One honest edge case: 0.16.1 emits a `patch: entry "tool-ralph" not found` warning on a fresh web template. That is a line referenced by its own patch but absent from the template. It has nothing to do with us, but it does exist.)

## 6. Using It

```sh
dsh plugin --profile web add dsh-dotclaude
```

After restarting:

```
/claude                # List resolved commands and their sources
/claude run review src/app.ts
/claude doctor         # Sources, deny rules, and all parsing issues
/claude reload
```

If the host's command registry supports agent-scoped registration, each command also becomes directly available as `/review`, `/db-migrate`, and so on, automatically skipping names already claimed by the host.

All configuration options have defaults, so `config: {}` is enough. Two switches with trade-offs are worth knowing: `promptSection` adds the command list to the system prompt (costing extra tokens), and `statusLine` takes up a slot in the dsh-tui status line.

## 7. Explicitly Out of Scope

- `.claude/agents/*.md`, `.claude/skills/`, `.mcp.json` — not read. Community import solutions already exist for the first two, and MCP is a separate configuration surface.
- Hooks and plugin mods — already covered by the official bridges; reimplementing them would be negative value.
- Enforcement of `permissions.allow` / `ask`.
- Writing back to any `.claude/` file.

One security fact must be stated clearly: content inlined via `@path` enters the model context. A command file that inlines `~/.ssh/id_ed25519` is effectively sending the key away—exactly as in Claude Code. The only defense is to run only command files you trust. Also, deny rules fail open when settings are malformed, so do not treat them as your only security boundary.

## 8. Where the Next Version Is Headed

- Map `.claude/agents/*.md` to DSH subagent presets (requires runtime registration in the preset registry);
- Refresh registered names when commands change (currently they are parsed only once, at session creation);
- Add a log-only `dotclaude/resolved` event so `/resume` replays can also show the resolution results from that moment.

The code is at [RUI-debug769/dsh-dotclaude](https://github.com/RUI-debug769/dsh-dotclaude), and installation is the single command above. If you also switch back and forth between the two, I hope it saves you the time of rewriting all your commands.

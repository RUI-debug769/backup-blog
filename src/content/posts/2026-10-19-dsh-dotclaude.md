---
title: "让 .claude 在 DeepSeek Harness 里跑起来：dsh-dotclaude"
published: 2026-10-19
category: "DSH"
tags: ["DSH", "插件", "Claude Code", "工程"]
description: "内置的 dsh-tui 0.14.0 其实早就被宿主跳过了。查清这件事之后，我把 Claude Code 项目里真正还空着的那一半——.claude 的命令与权限——做成了一个 DSH 插件。"
image: "/images/covers/2026-10-19-dsh-dotclaude.webp"
lang: "zh-CN"
draft: false
---

我本来只是想给自己的 TUI 换个版本，结果先查出了一件更尴尬的事。

## 一、你装着的那个 TUI，宿主根本没加载

`~/.dsh/profiles/web/package.json` 里写着 `@deepseek-harness-tui/dsh-tui: 0.14.0`，看起来一切正常。但 `dsh web --help` 的实际输出是：

```
dsh: skipping profile bundle "@deepseek-harness-tui/dsh-tui":
     Plugin @deepseek-harness-tui/dsh-tui@0.14.0 is incompatible with dsh 0.2.1-rc.2
```

原因很干脆：0.14.0 的 peer 范围最高只到 `0.2.0-rc.2`，而当前宿主是 `0.2.1-rc.2`。启动日志里还有一串 `patch: entry "dsh-tui-*" not found`——它的补丁行在找一个根本不存在的配置项。

新版本 0.16.1 已经把 `0.2.1-rc.2` 加进了兼容范围。所以"做一个兼容版本"这句话，第一种理解（把 0.14.0 修到能跑）其实是在重复上游已经做完的事，还得长期背着几千个文件的 fork。我选了第二种理解：**在它已经稳定的接缝上，补齐 DSH 里真正还空着的东西**。

## 二、空着的到底是哪一半

Claude Code 的项目约定里，DSH 已经覆盖了不少：

- `CLAUDE.md` —— 原生读取，`agent-instructions` 的候选文件列表里就有它；
- hooks 与插件 mods —— 有官方桥 `dsh-hooks-claude-code`、`dsh-experimental-claude-code-mods`；
- 会话历史 —— `dsh-tui migrate claude-code` 能整段导入。

把仓库翻了一遍、又数了插件目录里 5945 个条目（其中 150 个带 "claude"），剩下没人做的只有一块：

> `.claude/commands/*.md` 里的斜杠命令，和 `.claude/settings.json` 里的 `permissions.deny`。

这两样东西在 DSH 里都**没有运行时解析**。写了一年的 `/review`、`/db-migrate`，换到 DSH 就全部失效；settings 里那几条"永远别让我执行 `git push`"也一起失效。

`dsh-dotclaude` 就是把这两样接上去。

## 三、三条硬约束

做插件之前我先给自己定了三条线，后面的设计基本都由它们推出来。

**1. 每个宿主接缝都必须探测，不能假设存在。**

插件会装在各种 profile 里：纯 Web 的、带 TUI 的、headless 的、别人魔改过的。所以所有服务都走 `ctx.get(name, false)`，缺一个就少一个功能：

| 接缝 | 缺失时的行为 |
|---|---|
| `commands` | 不注册任何命令，其余照常 |
| `workingDirectory` | `/claude` 返回一句明确的错误，不抛异常 |
| `systemPrompt` | 不加提示词段 |
| `tuiStatus` | 不显示状态行 |

这一点是被 0.14.0 那 24 条警告教出来的：一个插件让宿主启动失败，比它不工作糟糕得多。

**2. 只执行 deny，绝不执行 allow。**

Claude Code 的权限有 `allow` / `deny` / `ask` 三档。我只实现 `deny`。

理由很直接：`.claude/settings.json` 是一个模型有可能写到的文件。如果插件读 `allow` 然后据此跳过审批，等于把"模型能改的文件"变成了"模型能给自己扩权的文件"。所以 `allow` 只报告、不生效，`ask` 同理——审批策略仍然完全归宿主。

**3. 解析失败要 fail-open，但不能静默。**

settings 文件写坏了、JSON 解析失败、规则语法看不懂——这些情况下插件不拦任何调用（fail open），但每一条都会进 `/claude doctor` 的报告。安全边界应该失败得可见，而不是失败得神秘。

## 四、实现里几个值得说的点

**项目根怎么定。** 最近的含 `.git` 的祖先目录；没有 `.git` 就用工作目录本身。这里踩过一个坑：如果一路往上找 `.claude`，`~/.claude` 会让家目录被误判成项目根，用户级命令和项目命令就混在一起了。所以带 `.claude` 的家目录显式排除，只当用户级根。

**命令名怎么摊平。** Claude Code 用子目录做命名空间（`db/migrate.md` → `/db:migrate`），而宿主的命令名语法是 `/^[a-z][a-z0-9_-]*$/`，不接受冒号。所以 `db/migrate.md` 映射成 `db-migrate`；映射不出来的（数字开头、带空格）跳过，并在报告里列出文件名。

**命令正文怎么展开。** 支持三种：`$ARGUMENTS`（原始文本）、`$1`–`$9`（按引号切分的位置参数）、`@路径`（内联文件，有大小上限，读不到就保留原文并上报）。没有实现 `!` 执行 bash——一个从仓库里读出来的 Markdown 能直接跑 shell，这个口子不该由插件来开。

**怎么把提示词交给模型。** 命令 handler 不产生模型消息，所以用 `agent.followup(...)` 把展开后的内容作为一条普通用户消息排进下一轮。这也是 DSH 里 `/goal` 之类的命令用的同一条路。

**权限规则怎么匹配。** 规则沿用 Claude Code 语法 `Tool` / `Tool(specifier)`，工具名映射到宿主工具（`Bash`→`bash`、`Read`→`read`、`MultiEdit`→`edit`、`WebFetch`→`web_fetch`、`Task`→`subagent`…）。`Bash(git push:*)` 是前缀语义；`Read(./src/**)` 是路径 glob，`**` 跨层、`*` 不跨层。判定挂在 `tools/pre-execute` 瀑布上，命中就返回 `{ kind: 'deny', reason }`。

## 五、四道测试门

我不想只交一个"我这里能跑"的插件，所以定了四道门，全部可在本地复现：

```sh
npm run typecheck                            # 1. 类型
npm run build && npm test                    # 2. 53 个单测 + 宿主替身集成
DOTCLAUDE_MATRIX=1 ./scripts/host-smoke.sh   # 3. 真实宿主组合+启动
                                             # 4. dsh-tui 版本矩阵
```

第 2 道用一个最小宿主替身（`get` / `on` / `effect` / `inject`）验证行为：命令注册、跳过已被占用的名字、`/claude run` 展开、deny 命中与放行、状态行聚合与清理、没有 workingDirectory 时的降级。

第 3、4 道是真的起宿主：建一个一次性的 `DSH_HOME`，从官方 web 模板建 profile，把插件装进去，`--dump-config` 确认 `dsh-dotclaude` 那一行存在，再真的把 web 起起来。

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

矩阵那一步顺便把文章开头的事实验证了：**在 0.2.1-rc.2 上，0.14.0 是宿主自己拒绝安装的**，不是插件挑食；0.16.1 则能装、能组合，和我们这一行并存。

（一个诚实的边角：0.16.1 在全新的 web 模板上会打一条 `patch: entry "tool-ralph" not found`。那是它自己补丁引用的行在模板里不存在，与我们无关，但确实存在。）

## 六、用起来

```sh
dsh plugin --profile web add dsh-dotclaude
```

重启后：

```
/claude                # 列出解析到的命令和来源
/claude run review src/app.ts
/claude doctor         # 来源、deny 规则、所有解析问题
/claude reload
```

如果宿主的命令注册表支持按 agent 作用域注册，每个命令还会直接变成 `/review`、`/db-migrate`，并自动跳过宿主已占用的名字。

配置全部有默认值，`config: {}` 就够用。两个有代价的开关值得知道：`promptSection` 会把命令清单加进 system prompt（多花 token），`statusLine` 会在 dsh-tui 状态行占一个位。

## 七、明确不做的

- `.claude/agents/*.md`、`.claude/skills/`、`.mcp.json` —— 不读。前两者社区已有导入方案，MCP 是另一套配置面。
- hooks 与插件 mods —— 官方桥已经覆盖，重复实现是负价值。
- `permissions.allow` / `ask` 的执行。
- 写回任何 `.claude/` 文件。

还有一个必须写清楚的安全事实：内联的 `@路径` 内容会进模型上下文。一个会内联 `~/.ssh/id_ed25519` 的命令文件，等于把密钥发出去——这一点和 Claude Code 一样，只能靠"只运行你信任的命令文件"。另外 deny 规则在 settings 损坏时是 fail-open 的，别把它当唯一的安全边界。

## 八、下一版往哪走

- `.claude/agents/*.md` 映射成 DSH 的子代理预设（需要 preset registry 的运行时注册）；
- 命令变更时刷新已注册的名字（现在只在会话创建时解析一次）；
- 一个 log-only 的 `dotclaude/resolved` 事件，让 `/resume` 回放时也能看到当时的解析结果。

代码在 [RUI-debug769/dsh-dotclaude](https://github.com/RUI-debug769/dsh-dotclaude)，安装就是上面那一行。如果你也在两边来回切，希望它能省下你重新写一遍命令的时间。

#!/usr/bin/env node
/**
 * 前沿日报/周报生成器（GitHub Actions 用）。
 * 流程：抓境外 AI 新闻 RSS（runner 在境外无墙）→ 喂给 ARK 对话模型整理 → 写 src/content/reports/。
 *
 * 用法：
 *   node scripts/generate-report.mjs daily
 *   node scripts/generate-report.mjs weekly
 * 环境变量：
 *   ARK_API_KEY      火山方舟 API Key（必填）
 *   ARK_ENDPOINT_ID  推理接入点 ID（必填，ep-...）
 */
import { writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BLOG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS_DIR = join(BLOG_ROOT, "src", "content", "reports");
const ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3";
const KIND = process.argv[2] === "weekly" ? "weekly" : "daily";

const FEEDS = [
  "https://hnrss.org/frontpage?points=80",
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://openai.com/news/rss.xml",
  "https://www.anthropic.com/rss.xml",
  "https://blog.google/technology/ai/rss/",
  "https://arxiv.org/rss/cs.AI",
];

const today = new Date().toISOString().slice(0, 10);

function stripTags(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** 极简 RSS/Atom 解析：取 title/link/pubDate/description */
function parseFeed(xml, limit) {
  const items = [];
  // RSS <item>
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const g = (tag) => {
      const mm = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return mm ? stripTags(mm[1]) : "";
    };
    items.push({ title: g("title"), link: g("link"), date: g("pubDate"), desc: g("description") });
  }
  // Atom <entry>
  for (const m of xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const b = m[0];
    const g = (tag) => {
      const mm = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return mm ? stripTags(mm[1]) : "";
    };
    const link = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || g("link");
    items.push({ title: g("title"), link, date: g("updated") || g("published"), desc: g("summary") });
  }
  return items.slice(0, limit);
}

async function fetchFeed(url, limit = 8) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MurdoBlogBot/1.0)" },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), limit);
  } catch {
    return [];
  }
}

async function fetchHackathons() {
  try {
    const res = await fetch(
      "https://devpost.com/api/hackathons?order_by=deadline&status[]=open&per_page=8",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(25000) }
    );
    if (!res.ok) return [];
    const d = await res.json();
    return (d.hackathons || []).map((h) => ({
      title: h.title,
      url: h.url,
      dates: h.submission_period_dates,
      location: h.displayed_location?.location || "",
    }));
  } catch { return []; }
}

async function callArk(prompt) {
  const key = process.env.ARK_API_KEY;
  const ep = process.env.ARK_ENDPOINT_ID;
  if (!key || !ep) throw new Error("缺少 ARK_API_KEY / ARK_ENDPOINT_ID");
  const res = await fetch(`${ARK_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ep,
      messages: [
        { role: "system", content: "你是一名严谨的 AI 行业分析师与中文科技编辑。只依据给定材料写作，不虚构事实；不确定的信息标注「据报，未证实」。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 6000,
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`ARK ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d = await res.json();
  return d.choices[0].message.content.trim();
}

function buildPromptDaily(news, hacks) {
  return `今天是 ${today}。下面是今天从境外与国内 AI 相关 RSS 抓取到的真实新闻条目（标题 + 摘要 + 链接）：

${news}

请据此写一份《AI 前沿日报 · ${today}》，中文，结构固定：
## 今日要闻速览
（5 条以内要点，每条一行）
## 一、领军人物动态
## 二、公司与产业链动态
（可按 基础层/技术层/应用层 分）
## 三、重大事件
## 四、政策与监管
## 五、赛事机会
近期开放报名的黑客松/竞赛（来自 Devpost，最多 4 条；每条写 比赛名 · 地点 · 时间 · 链接，无则写暂无）：
${hacks || "（Devpost 未返回数据）"}
要求：只写材料中出现的公司和人物；每条尽量以「」或链接标注来源；不确定的写「据报，未证实」；不要编造未出现的新闻。直接输出 Markdown 正文，不要前后缀。`;
}

function buildPromptWeekly(dailyDigests) {
  return `以下是最近几天已发布的《AI 前沿日报》摘要：

${dailyDigests}

请写一份《AI 前沿周报 · ${today}》，中文，结构：
## 本周主旋律
## 技术路线研判
## 产业与资本
## 值得关注的下一步
要求：聚合而非罗列，给出判断与依据；只依据上述摘要，不虚构。直接输出 Markdown 正文。`;
}

async function main() {
  if (KIND === "weekly") {
    const files = readdirSync(REPORTS_DIR)
      .filter((f) => /^daily-\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .slice(-7);
    if (files.length < 3) {
      console.log(`weekly: 只有 ${files.length} 篇日报，跳过（至少需要 3 篇）`);
      return;
    }
    const digests = files
      .map((f) => {
        const raw = readFileSync(join(REPORTS_DIR, f), "utf8");
        const body = raw.replace(/^---[\s\S]*?---/, "").trim();
        return `### ${f.replace(/\.md$/, "")}\n${body.slice(0, 1500)}`;
      })
      .join("\n\n");
    const md = await callArk(buildPromptWeekly(digests));
    const out = join(REPORTS_DIR, `weekly-${today}.md`);
    if (existsSync(out)) { console.log("weekly 已存在，跳过"); return; }
    writeFileSync(out, `---\ntitle: "AI Frontier Weekly · ${today}"\npublished: ${today}\ncategory: "Weekly"\ntags: ["Weekly", "AI"]\nlang: "zh-CN"\n---\n\n${md}\n`, "utf8");
    console.log("weekly written:", out);
    return;
  }

  // daily
  const out = join(REPORTS_DIR, `daily-${today}.md`);
  if (existsSync(out)) { console.log("daily 已存在，跳过"); return; }

  const results = await Promise.all(FEEDS.map((u) => fetchFeed(u, 8)));
  const all = [];
  results.forEach((items, i) => {
    for (const it of items) {
      if (!it.title) continue;
      all.push(`- [${FEEDS[i].replace(/^https?:\/\/([^/]+).*/, "$1")}] ${it.title}\n  ${(it.desc || "").slice(0, 300)}\n  ${it.link}`);
    }
  });
  if (all.length < 5) { console.log(`daily: 抓到的新闻太少（${all.length}），跳过`); return; }
  console.log(`daily: 抓取 ${all.length} 条新闻，调用模型整理…`);

  const hacks = (await fetchHackathons())
    .map((h) => `- ${h.title} · ${h.location} · ${h.dates} · ${h.url}`)
    .join("\n");
  const md = await callArk(buildPromptDaily(all.slice(0, 80).join("\n"), hacks));
  writeFileSync(out, `---\ntitle: "AI Frontier Daily · ${today}"\npublished: ${today}\ncategory: "Daily"\ntags: ["Daily", "AI"]\nlang: "zh-CN"\n---\n\n${md}\n`, "utf8");
  console.log("daily written:", out);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });

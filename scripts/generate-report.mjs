#!/usr/bin/env node
/**
 * 前沿日报/周报生成器（GitHub Actions 用）。
 * 流程：抓取新闻与赛事 → 调用 ARK 整理 → 写 src/content/reports/。
 * 赛事板块与 frontier-report 邮件版一致，采用确定性排版。
 */
import { writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  fetchCnHackathons,
  isAiHackathon,
  isAiTopic,
  locationFrom,
  normalizeText,
} from "./fetch-cn-hackathons.mjs";

const BLOG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS_DIR = join(BLOG_ROOT, "src", "content", "reports");
const ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3";
const KIND = process.argv[2] === "weekly" ? "weekly" : "daily";
const MAX_HACKATHONS = 6;

const FEEDS = [
  "https://hnrss.org/frontpage?points=80",
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://openai.com/news/rss.xml",
  "https://www.anthropic.com/rss.xml",
  "https://blog.google/technology/ai/rss/",
  "https://arxiv.org/rss/cs.AI",
];

const today = new Date().toISOString().slice(0, 10);
const ENGLISH_MONTHS = new Map([
  ["jan", "01"], ["feb", "02"], ["mar", "03"], ["apr", "04"],
  ["may", "05"], ["jun", "06"], ["jul", "07"], ["aug", "08"],
  ["sep", "09"], ["oct", "10"], ["nov", "11"], ["dec", "12"],
]);
const MONTH_PATTERN = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

function decodeCodePoint(value) {
  const code = Number(value);
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code) : "";
}

function stripTags(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#x([\da-f]+);/gi, (_, hex) => decodeCodePoint(`0x${hex}`))
    .replace(/&#(\d+);/g, (_, decimal) => decodeCodePoint(decimal))
    .replace(/\s+/g, " ").trim();
}

/** 极简 RSS/Atom 解析：取 title/link/pubDate/description */
function parseFeed(xml, limit) {
  const items = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const g = (tag) => {
      const mm = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return mm ? stripTags(mm[1]) : "";
    };
    items.push({ title: g("title"), link: g("link"), date: g("pubDate"), desc: g("description") });
  }
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

function isoDate(year, month, day) {
  const normalized = `${year}-${month}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    ? "" : normalized;
}

/** Devpost 的 Oct 22 - 29, 2026 / Oct 30 - Nov 1, 2026 统一为截止日。 */
export function devpostDeadline(value) {
  const text = stripTags(value);
  const fullDates = [...text.matchAll(new RegExp(`\\b(${MONTH_PATTERN})[a-z]*\\s+(\\d{1,2}),\\s*(\\d{4})`, "gi"))];
  if (fullDates.length) {
    const match = fullDates.at(-1);
    return isoDate(match[3], ENGLISH_MONTHS.get(match[1].slice(0, 3).toLowerCase()), match[2]);
  }
  const range = text.match(new RegExp(`\\b(${MONTH_PATTERN})[a-z]*\\s+\\d{1,2}\\s*[-–—]\\s*(?:(${MONTH_PATTERN})[a-z]*\\s+)?(\\d{1,2}),\\s*(\\d{4})`, "i"));
  if (!range) return "";
  const month = ENGLISH_MONTHS.get((range[2] || range[1]).toLowerCase());
  return isoDate(range[4], month, range[3]);
}

function metaAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] || "";
}

function clipSentence(value, maxLength = 420) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  const prefix = text.slice(0, maxLength);
  const boundary = Math.max(prefix.lastIndexOf(". "), prefix.lastIndexOf("! "), prefix.lastIndexOf("? "));
  return boundary >= 180 ? prefix.slice(0, boundary + 1) : `${prefix.trimEnd()}…`;
}

function taskParagraphFromHtml(html) {
  const marker = html.indexOf("challenge-description");
  if (marker < 0) return "";
  const segment = html.slice(marker, marker + 60000)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const plain = stripTags(segment);
  const heading = plain.match(/Requirements\s+What to Build\b/i) || plain.match(/What to Build\b/i) || plain.match(/\bRequirements\b/i);
  if (!heading) return "";
  let task = plain.slice(heading.index + heading[0].length)
    .replace(/^[\s,，:：—–-]+/, "")
    .replace(/^What to Build\b[\s,，:：—–-]*/i, "");
  const stop = task.search(/\b(?:What to Submit|Submission Requirements|Eligibility|Judging Criteria|Prizes)\b/i);
  if (stop > 0) task = task.slice(0, stop);
  return clipSentence(task, 420);
}

async function fetchDevpostDescription(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MurdoBlogBot/1.0)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const taskParagraph = taskParagraphFromHtml(html);
    if (taskParagraph) return taskParagraph;
    const tags = html.match(/<meta\b[^>]*>/gi) || [];
    for (const key of ["og:description", "description"]) {
      for (const tag of tags) {
        const name = metaAttribute(tag, "property") || metaAttribute(tag, "name");
        if (name.toLowerCase() !== key) continue;
        const description = stripTags(metaAttribute(tag, "content"));
        if (description) return description.slice(0, 500);
      }
    }
  } catch {
    // 单个详情页失败时保留列表字段，后续由完整性校验决定是否收录。
  }
  return "";
}

export async function fetchHackathons() {
  try {
    const res = await fetch(
      "https://devpost.com/api/hackathons?order_by=deadline&status[]=open&per_page=8",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(25000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const enriched = await Promise.all((data.hackathons || []).map(async (h) => {
      const themes = (h.themes || []).map((theme) => normalizeText(theme.name)).filter(Boolean);
      const metaDescription = await fetchDevpostDescription(h.url);
      const brief = metaDescription || (themes.length
        ? `Devpost hackathon，技术项目方向包括 ${themes.join("、")}` : "");
      const prizeAmount = stripTags(h.prize_amount).replace(/^([$₹€£¥￥])\s+/, "$1");
      return {
        title: normalizeText(h.title),
        url: h.url,
        dates: devpostDeadline(h.submission_period_dates),
        location: locationFrom(h.displayed_location?.location || ""),
        organizer: normalizeText(h.organization_name),
        brief,
        themes,
        prize: prizeAmount ? `奖金池 ${prizeAmount}` : "",
        channel: "在 Devpost 赛事页报名",
      };
    }));
    return enriched.filter((h) =>
      h.title && h.url && h.dates >= today && h.location
      && isAiHackathon(h.title, h.brief)
      && isAiTopic(`${h.title} ${(h.themes || []).join(" ")}`));
  } catch {
    return [];
  }
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
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

export function daysRemaining(deadline, referenceDate = today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const end = Date.parse(`${deadline}T00:00:00Z`);
  const start = Date.parse(`${referenceDate}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(start)) return null;
  return Math.round((end - start) / 86400000);
}

function countdownText(deadline) {
  const days = daysRemaining(deadline);
  if (days === null) return "截止日见官方页";
  if (days === 0) return "今日截止";
  return `剩${days}天`;
}

function descriptionPart(value) {
  return normalizeText(value).replace(/[.。；;\s]+$/, "");
}

function defaultChannel(url) {
  if (/tianchi\.aliyun\.com/i.test(url)) return "在阿里云天池平台报名";
  if (/saikr\.com/i.test(url)) return "在赛氪平台报名";
  if (/devpost\.com/i.test(url)) return "在 Devpost 赛事页报名";
  return "通过官方赛事页报名";
}

function hackathonDescription(hackathon) {
  const parts = [
    hackathon.organizer ? `${descriptionPart(hackathon.organizer)}主办` : "",
    descriptionPart(hackathon.brief),
    descriptionPart(hackathon.prize),
    descriptionPart(hackathon.channel || defaultChannel(hackathon.url)),
  ].filter(Boolean);
  return `${parts.join("，")}。`;
}

export function renderHackathonItems(hackathons) {
  return hackathons.map((hackathon) => [
    `· ${hackathon.title}（${hackathon.location}｜报名截止 ${hackathon.dates}，${countdownText(hackathon.dates)}）`,
    `  ${hackathonDescription(hackathon)}`,
    `  报名：${hackathon.url}`,
  ].join("\n")).join("\n");
}

export function renderHackathonSection(hackathons) {
  return `## 五、赛事机会\n${renderHackathonItems(hackathons) || "暂无"}`;
}

function canonicalUrl(url) {
  return String(url || "").replace(/[?#].*$/, "").replace(/\/(?:introduction)?\/?$/i, "").toLowerCase();
}

function canonicalTitle(title) {
  return normalizeText(title).toLowerCase().replace(/[\s\-—_·:：|丨（）()[\]【】]/g, "");
}

/** 合并赛氪、天池和 Devpost；剔除字段不全/已截止项，按截止日升序最多 6 条。 */
export function mergeHackathons(hackathons, limit = MAX_HACKATHONS) {
  const urls = new Set();
  const titles = new Set();
  const merged = [];
  // 各来源已完成类型审查；合并阶段只校验字段、链接和截止日，避免丢失品牌名不含 AI 的赛事。
  const sorted = hackathons.filter((h) =>
    h.title && h.url && h.location && h.organizer && h.brief
    && /^https?:\/\//i.test(h.url) && (daysRemaining(h.dates) ?? -1) >= 0)
    .sort((a, b) => a.dates.localeCompare(b.dates));
  for (const hackathon of sorted) {
    const url = canonicalUrl(hackathon.url);
    const title = canonicalTitle(hackathon.title);
    if (urls.has(url) || titles.has(title)) continue;
    urls.add(url);
    titles.add(title);
    merged.push(hackathon);
    if (merged.length >= limit) break;
  }
  return merged;
}

/** 模型只负责新闻；赛事板块最终由真实字段重排，防止退回简略列表。 */
export function replaceHackathonSection(markdown, section) {
  const text = String(markdown || "").trim();
  const heading = /^##\s+五[、.．]\s*赛事机会[^\n]*$/m.exec(text);
  if (!heading) return `${text}\n\n${section}`.trim();
  const bodyStart = heading.index + heading[0].length;
  const remainder = text.slice(bodyStart);
  const nextHeading = remainder.search(/^##\s+/m);
  const end = nextHeading === -1 ? text.length : bodyStart + nextHeading;
  return `${text.slice(0, heading.index).trimEnd()}\n\n${section}\n${text.slice(end).trimStart()}`.trim();
}

export function buildPromptDaily(news, hacks) {
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
以下赛事已完成类型、地域、报名截止日核查与排序，必须原样保留，不得增删、概括、改写或调整顺序：
${hacks || "暂无"}
要求：新闻部分只写材料中出现的公司和人物；每条尽量以「」或链接标注来源；不确定的写「据报，未证实」；不要编造未出现的新闻或赛事。直接输出 Markdown 正文，不要前后缀。`;
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
    const digests = files.map((f) => {
      const raw = readFileSync(join(REPORTS_DIR, f), "utf8");
      const body = raw.replace(/^---[\s\S]*?---/, "").trim();
      return `### ${f.replace(/\.md$/, "")}\n${body.slice(0, 1500)}`;
    }).join("\n\n");
    const md = await callArk(buildPromptWeekly(digests));
    const out = join(REPORTS_DIR, `weekly-${today}.md`);
    if (existsSync(out)) { console.log("weekly 已存在，跳过"); return; }
    writeFileSync(out, `---\ntitle: "AI Frontier Weekly · ${today}"\npublished: ${today}\ncategory: "Weekly"\ntags: ["Weekly", "AI"]\nlang: "zh-CN"\n---\n\n${md}\n`, "utf8");
    console.log("weekly written:", out);
    return;
  }

  const out = join(REPORTS_DIR, `daily-${today}.md`);
  if (existsSync(out)) { console.log("daily 已存在，跳过"); return; }

  const results = await Promise.all(FEEDS.map((url) => fetchFeed(url, 8)));
  const all = [];
  results.forEach((items, index) => {
    for (const item of items) {
      if (!item.title) continue;
      all.push(`- [${FEEDS[index].replace(/^https?:\/\/([^/]+).*/, "$1")}] ${item.title}\n  ${(item.desc || "").slice(0, 300)}\n  ${item.link}`);
    }
  });
  if (all.length < 5) { console.log(`daily: 抓到的新闻太少（${all.length}），跳过`); return; }
  console.log(`daily: 抓取 ${all.length} 条新闻，调用模型整理…`);

  const [devpostHacks, cnHacks] = await Promise.all([fetchHackathons(), fetchCnHackathons()]);
  const hackathons = mergeHackathons([...cnHacks, ...devpostHacks]);
  console.log(`daily: 中国赛事 ${cnHacks.length} 条，Devpost ${devpostHacks.length} 条，合并后 ${hackathons.length} 条`);
  const hackathonText = renderHackathonItems(hackathons);
  const generated = await callArk(buildPromptDaily(all.slice(0, 80).join("\n"), hackathonText));
  const md = replaceHackathonSection(generated, renderHackathonSection(hackathons));
  writeFileSync(out, `---\ntitle: "AI Frontier Daily · ${today}"\npublished: ${today}\ncategory: "Daily"\ntags: ["Daily", "AI"]\nlang: "zh-CN"\n---\n\n${md}\n`, "utf8");
  console.log("daily written:", out);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => { console.error("ERROR:", error.message); process.exit(1); });
}

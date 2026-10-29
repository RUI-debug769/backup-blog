#!/usr/bin/env node
/**
 * 抓取中国本土 AI 黑客松，输出邮件版日报所需的详细字段。
 *
 * 用法：node scripts/fetch-cn-hackathons.mjs
 * 来源：赛氪（类型过滤）+ 阿里云天池（官方赛事补充）。
 */
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";

const DEFAULT_LIMIT = 6;
const AI_RE = /人工智能|AIGC|大模型|智能体|深度学习|机器学习|算法|机器人|计算机|大数据|工业互联网|信息技术|artificial intelligence|machine learning|deep learning|\bAI\b|\bLLM\b|\bGenAI\b|\bagents?\b|\brobots?(?:ics)?\b/i;
const HACKATHON_RE = /黑客松|黑客马拉松|hackathon|马拉松|开发赛|dev[\s._-]*jam|StudyHack|LifeHack|Hack4Good/i;
const NON_HACKATHON_TITLE_RE = /竞赛|竞答|考试|知识竞赛|排名|联赛/i;
const NON_HACKATHON_BODY_RE = /知识竞赛|知识竞答|开卷考|学科考试|交易排名赛|纯论文征集|纯投资对接|营销抽奖|无需提交(?:技术)?作品/i;
const ONLINE_RE = /线上|在线|远程|虚拟考场|网络参赛|网络提交|\bonline\b|\bvirtual\b/i;
const NEARBY_CITIES = ["杭州", "上海", "南京", "苏州", "无锡", "宁波", "合肥", "嘉兴", "绍兴"];
const CITY_ENGLISH = new Map([
  ["hangzhou", "杭州"], ["shanghai", "上海"], ["nanjing", "南京"],
  ["suzhou", "苏州"], ["wuxi", "无锡"], ["ningbo", "宁波"],
  ["hefei", "合肥"], ["jiaxing", "嘉兴"], ["shaoxing", "绍兴"],
]);

export function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDate(value) {
  const match = String(value || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized
    ? "" : normalized;
}

/** 优先读取明确的报名截止日，不把比赛结束日冒充报名截止日。 */
export function registrationDeadline(text, fallbackYear = new Date().getUTCFullYear()) {
  const normalized = String(text || "").replace(/\r/g, "");
  const fullDate = normalized.match(/报名时间[：:]?\s*([^~～\n]+?)\s*[~～]\s*(\d{4}\D+\d{1,2}\D+\d{1,2}日?)/i);
  if (fullDate) return normalizeDate(fullDate[2]);

  const patterns = [
    /报名(?:与组队|及组队|时间|阶段)?[^\n]{0,100}?(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*\d{1,2}[:：]\d{2})?\s*(?:截止|前)/g,
    /报名(?:与组队|及组队|时间|阶段)?[^\n]{0,100}?[~～—–-]\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (match) return normalizeDate(`${fallbackYear}-${match[1]}-${match[2]}`);
  }
  return "";
}

export function locationFrom(text) {
  const normalized = normalizeText(text);
  for (const city of NEARBY_CITIES) {
    if (normalized.includes(city)) return city;
  }
  const lower = normalized.toLowerCase();
  for (const [english, chinese] of CITY_ENGLISH) {
    if (new RegExp(`\\b${english}\\b`, "i").test(lower)) return chinese;
  }
  return ONLINE_RE.test(normalized) ? "线上" : "";
}

/** AI 主题判定：供国内赛事和 Devpost 主题标签共用。 */
export function isAiTopic(text = "") {
  return AI_RE.test(text);
}

/** 标题排除考试/竞答，正文再排除无需技术作品的活动。 */
export function isAiHackathon(title, text = "") {
  if (NON_HACKATHON_TITLE_RE.test(title)) return false;
  if (NON_HACKATHON_BODY_RE.test(text)) return false;
  const all = `${title}\n${text}`;
  return HACKATHON_RE.test(all) && AI_RE.test(all);
}

function isOpenDeadline(dates, referenceDate = new Date().toISOString().slice(0, 10)) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dates) && dates >= referenceDate;
}

function compareByDeadline(a, b) {
  return a.dates.localeCompare(b.dates) || a.title.localeCompare(b.title, "zh-CN");
}

function compactDescription(value, maxLength = 380) {
  const text = normalizeText(value)
    .replace(/^(?:AI大模型赛|数据算法赛|工程开发赛|日常学习赛)\s*/, "")
    .replace(/[。；;\s]+$/, "");
  if (text.length <= maxLength) return text;
  const prefix = text.slice(0, maxLength);
  const punctuation = Math.max(prefix.lastIndexOf("。"), prefix.lastIndexOf("；"), prefix.lastIndexOf(";"));
  return `${punctuation >= 160 ? prefix.slice(0, punctuation) : prefix}…`;
}

function labeledLine(text, labels) {
  const match = String(text || "").match(new RegExp(`(?:${labels})\\s*[：:]\\s*([^\\n]{2,160})`));
  return normalizeText(match?.[1] || "").replace(/(?:协会官网|官网)\s*>>.*$/, "").trim();
}

function extractOrganizer(text) {
  return labeledLine(text, "主办单位|主办方|联合主办|承办单位");
}

function extractPrize(text) {
  const normalized = normalizeText(text);
  const cash = normalized.match(/奖金(?:池)?\s*[：:]?\s*[¥￥]\s*([\d,]+(?:\.\d+)?)/);
  if (cash) return `奖金池 ${cash[1]} 元`;
  const pool = normalized.match(/奖金池(?:约|为|总额)?\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(万|千)?\s*元/);
  if (pool) return `奖金池约${pool[1]}${pool[2] || ""}元`;
  const single = normalized.match(/单队最高\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(万|千)?\s*元/);
  if (single) return `单队最高${single[1]}${single[2] || ""}元`;
  return "";
}

function extractRegistrationChannel(text, fallback) {
  const explicit = labeledLine(text, "报名方式|报名渠道");
  if (explicit) return explicit;
  const app = normalizeText(text).match(/((?:通过|使用|关注)[^。；\n]{0,60}(?:App|APP|公众号|小程序)[^。；\n]{0,60}报名)/);
  return normalizeText(app?.[1] || fallback);
}

function extractBrief(body, cardText = "", title = "") {
  const task = String(body || "").match(/(?:做什么|任务要求|赛题任务|作品要求|比赛内容)\s*[：:]\s*([^\n]{20,700})/);
  if (task) return compactDescription(task[1]);

  if (cardText) {
    const withoutTitle = String(cardText).split(title).join("");
    const beforeMeta = withoutTitle.split(/\n\s*(?:主办方|主办单位|奖金|团队数|比赛时间)/)[0];
    const brief = compactDescription(beforeMeta);
    if (brief.length >= 30) return brief;
  }

  const intro = String(body || "").match(/(?:赛事介绍|大赛简介|赛事简介|大赛介绍|赛事背景)\s*\n+([\s\S]{40,1600}?)(?=\n\s*(?:[一二三四五六七八九十]+、|赛题与数据|排行榜|论坛|$))/);
  if (intro) return compactDescription(intro[1]);
  return "";
}

async function createPage(browser) {
  const page = await browser.newPage({
    locale: "zh-CN",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(20000);
  return page;
}

async function readDetail(browser, item, source) {
  const page = await createPage(browser);
  const fallbackChannel = source === "天池" ? "在阿里云天池平台报名" : "在赛氪平台报名";
  try {
    await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("body");
    await page.waitForTimeout(source === "天池" ? 1800 : 900);
    const body = await page.locator("body").innerText();
    const fallbackYear = item.cardText.match(/(?:19|20)\d{2}/)?.[0] || new Date().getUTCFullYear();
    const combined = `${item.cardText}\n${body}`;
    return {
      ...item,
      dates: registrationDeadline(combined, Number(fallbackYear)) || item.dates,
      location: locationFrom(combined) || item.location,
      organizer: extractOrganizer(body) || extractOrganizer(item.cardText),
      brief: extractBrief(body, item.cardText, item.title),
      prize: extractPrize(item.cardText) || extractPrize(body),
      channel: extractRegistrationChannel(body, fallbackChannel),
    };
  } catch (error) {
    console.error(`[${source}] 详情读取失败 ${item.url}：${error?.message || error}`);
    return {
      ...item,
      organizer: extractOrganizer(item.cardText),
      brief: extractBrief("", item.cardText, item.title),
      prize: extractPrize(item.cardText),
      channel: fallbackChannel,
    };
  } finally {
    await page.close();
  }
}

async function enrichInBatches(browser, candidates, source) {
  const enriched = [];
  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    enriched.push(...await Promise.all(batch.map((item) => readDetail(browser, item, source))));
  }
  return enriched;
}

function emptyStats(total) {
  return { total, kept: 0, removed: 0, type: 0, deadline: 0, location: 0, incomplete: 0, prefiltered: 0 };
}

function debugReject(item, reason) {
  if (process.env.HACKATHON_DEBUG) console.error(`[debug] 剔除「${item.title}」：${reason}`);
}

function eligibleItems(items, stats) {
  const eligible = items.filter((item) => {
    if (!isAiHackathon(item.title, `${item.cardText}\n${item.brief}`)) {
      stats.type += 1;
      debugReject(item, "非黑客松类型");
      return false;
    }
    if (!isOpenDeadline(item.dates)) {
      stats.deadline += 1;
      debugReject(item, "报名已截止或截止日不明");
      return false;
    }
    if (!item.location) {
      stats.location += 1;
      debugReject(item, "地域不符");
      return false;
    }
    if (!item.organizer || !item.brief || !item.url) {
      stats.incomplete += 1;
      debugReject(item, "详情字段不全");
      return false;
    }
    return true;
  });
  stats.kept = eligible.length;
  stats.removed = stats.total - stats.kept;
  return eligible.sort(compareByDeadline);
}

async function fetchSaikr(browser, limit) {
  const page = await createPage(browser);
  try {
    await page.goto("https://www.saikr.com/contests", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector(".detail-box.search a.tit", { timeout: 30000 });
    const aiCategory = page.getByText("人工智能", { exact: true }).first();
    if (await aiCategory.count()) {
      await aiCategory.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1200);
      await page.waitForSelector(".detail-box.search a.tit", { timeout: 30000 });
    }
    const cards = await page.locator(".detail-box.search").evaluateAll((boxes) =>
      boxes.map((box) => {
        const anchor = box.querySelector("a.tit");
        return {
          title: anchor?.getAttribute("title") || anchor?.textContent || "",
          url: anchor?.href || "",
          cardText: box.textContent || "",
        };
      }),
    );
    const candidates = cards.map((item) => ({
      title: normalizeText(item.title).replace(/^TOP\s*\d+\s*/i, ""),
      url: item.url,
      dates: registrationDeadline(item.cardText),
      location: locationFrom(item.cardText),
      organizer: extractOrganizer(item.cardText),
      brief: "",
      prize: "",
      channel: "在赛氪平台报名",
      cardText: item.cardText,
    })).filter((item) => item.title && item.url && AI_RE.test(item.title)).slice(0, 12);
    const stats = emptyStats(cards.length);
    stats.prefiltered = cards.length - candidates.length;
    const enriched = await enrichInBatches(browser, candidates, "赛氪");
    return { items: eligibleItems(enriched, stats).slice(0, limit), stats };
  } finally {
    await page.close();
  }
}

function tianchiTitle(cardText) {
  const lines = String(cardText || "").split("\n").map((line) => normalizeText(line)).filter(Boolean);
  const title = lines.find((line) => !/^(?:AI大模型赛|数据算法赛|工程开发赛|日常学习赛|立即报名)$/.test(line)) || "";
  return title.replace(/^(?:AI大模型赛|数据算法赛|工程开发赛|日常学习赛)/, "").trim();
}

async function fetchTianchi(browser, limit) {
  const page = await createPage(browser);
  try {
    await page.goto("https://tianchi.aliyun.com/competition/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('a[href*="/competition/entrance/"]', { timeout: 30000 });
    await page.waitForTimeout(1800);
    const rawCards = await page.locator('a[href*="/competition/entrance/"][class$="_card"]').evaluateAll((anchors) =>
      anchors.map((anchor) => ({ url: anchor.href, cardText: anchor.innerText || "" })),
    );
    const seen = new Set();
    const cards = rawCards.filter((item) => {
      if (seen.has(item.url) || !item.cardText.includes("立即报名") || item.cardText.includes("报名已结束")) return false;
      seen.add(item.url);
      return true;
    });
    const candidates = cards.map((item) => ({
      title: tianchiTitle(item.cardText),
      url: item.url,
      dates: "",
      location: "线上",
      organizer: "阿里云天池",
      brief: "",
      prize: extractPrize(item.cardText),
      channel: "在阿里云天池平台报名",
      cardText: item.cardText,
    })).filter((item) => item.title && item.url && AI_RE.test(item.cardText)).slice(0, 12);
    const stats = emptyStats(cards.length);
    stats.prefiltered = cards.length - candidates.length;
    const enriched = await enrichInBatches(browser, candidates, "天池");
    return { items: eligibleItems(enriched, stats).slice(0, limit), stats };
  } finally {
    await page.close();
  }
}

function publicItem(item) {
  return {
    title: item.title,
    url: item.url,
    dates: item.dates,
    location: item.location,
    organizer: item.organizer,
    brief: item.brief,
    prize: item.prize,
    channel: item.channel,
  };
}

export async function fetchCnHackathons(limitPerSource = DEFAULT_LIMIT) {
  let browser;
  try {
    const launchOptions = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }
    browser = await chromium.launch(launchOptions);
    const sources = [["赛氪", fetchSaikr], ["天池", fetchTianchi]];
    const results = await Promise.all(sources.map(async ([name, fetcher]) => {
      try {
        const { items, stats } = await fetcher(browser, limitPerSource);
        console.error(`[${name}] 原始 ${stats.total} 条；类型匹配 ${stats.total - stats.type - stats.prefiltered} 条；完整可收录 ${stats.kept} 条；剔除 ${stats.removed} 条（类型 ${stats.type + stats.prefiltered}、截止日 ${stats.deadline}、地域 ${stats.location}、字段不全 ${stats.incomplete}）`);
        return items.map(publicItem);
      } catch (error) {
        console.error(`[${name}] 抓取失败：${error?.message || error}`);
        return [];
      }
    }));
    return results.flat().sort(compareByDeadline);
  } catch (error) {
    console.error(`[Playwright] 启动或运行失败：${error?.message || error}`);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const items = await fetchCnHackathons();
  console.log(JSON.stringify(items, null, 2));
}

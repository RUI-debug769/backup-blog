#!/usr/bin/env node
/**
 * 抓取中国本土 AI 黑客松/竞赛，输出与 Devpost 相同的数据结构。
 *
 * 用法：node scripts/fetch-cn-hackathons.mjs
 * 依赖：项目已安装 @playwright/test，且已安装 Chromium。
 */
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";

const DEFAULT_LIMIT = 6;
const AI_TITLE_RE = /人工智能|AI|AIGC|大模型|智能体|深度学习|机器学习|算法|机器人|计算机|大数据|工业互联网|信息技术|黑客松|hackathon/i;
const ONLINE_RE = /线上|在线|远程|虚拟考场|网络参赛|网络提交/i;
const NEARBY_RE = /杭州|上海|浙江/;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeDate(value) {
  const match = String(value || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function registrationDeadline(text) {
  const normalized = normalizeText(text);
  const match = normalized.match(/报名时间[：:]?\s*([^~～]+?)\s*[~～]\s*(\d{4}\D+\d{1,2}\D+\d{1,2}日?)/i);
  return normalizeDate(match?.[2] || "");
}

function locationFrom(text) {
  const normalized = normalizeText(text);
  if (ONLINE_RE.test(normalized)) return "线上";
  return normalized.match(NEARBY_RE)?.[0] || "";
}

function compareByDeadline(a, b) {
  if (!a.dates && !b.dates) return 0;
  if (!a.dates) return 1;
  if (!b.dates) return -1;
  return a.dates.localeCompare(b.dates);
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

async function readSaikrLocation(browser, item) {
  const page = await createPage(browser);
  try {
    await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("body");
    // 新站详情为动态页面，短暂等待正文渲染；失败时退回列表卡片信息。
    await page.waitForTimeout(800);
    const body = await page.locator("body").innerText();
    return { ...item, location: locationFrom(`${item.cardText}\n${body}`) };
  } catch {
    return { ...item, location: locationFrom(item.cardText) };
  } finally {
    await page.close();
  }
}

async function fetchSaikr(browser, limit) {
  const page = await createPage(browser);
  try {
    await page.goto("https://www.saikr.com/contests", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForSelector(".detail-box.search a.tit", { timeout: 30000 });

    // 分类复选框的真实 input value 为 1006；点击文本比操作隐藏 input 稳定。
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

    const candidates = cards
      .map((item) => ({
        title: normalizeText(item.title).replace(/^TOP\s*\d+\s*/i, ""),
        url: item.url,
        dates: registrationDeadline(item.cardText),
        location: "",
        cardText: item.cardText,
      }))
      .filter((item) => item.title && item.url && AI_TITLE_RE.test(item.title))
      .slice(0, 12);

    // 小批量读取详情，避免一次性打开过多页面触发反爬。
    const enriched = [];
    for (let index = 0; index < candidates.length; index += 3) {
      const batch = candidates.slice(index, index + 3);
      enriched.push(...await Promise.all(batch.map((item) => readSaikrLocation(browser, item))));
    }

    return enriched
      .filter((item) => ONLINE_RE.test(item.location) || NEARBY_RE.test(item.location))
      .sort(compareByDeadline)
      .slice(0, limit)
      .map(({ title, url, dates, location }) => ({ title, url, dates, location }));
  } finally {
    await page.close();
  }
}

export async function fetchCnHackathons(limitPerSource = DEFAULT_LIMIT) {
  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    };
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }
    browser = await chromium.launch(launchOptions);

    // 赛氪已能提供足够的本土赛事；活动行、天池作为后续可选来源，不影响本脚本容错。
    const sources = [["赛氪", fetchSaikr]];
    const results = await Promise.all(sources.map(async ([name, fetcher]) => {
      try {
        const items = await fetcher(browser, limitPerSource);
        console.error(`[${name}] 抓取成功，保留 ${items.length} 条`);
        return items;
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

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const items = await fetchCnHackathons();
  console.log(JSON.stringify(items, null, 2));
}

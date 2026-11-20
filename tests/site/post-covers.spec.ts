import { expect, test } from "@playwright/test";

const postIds = [
	"2026-10-17-hello",
	"2026-10-18-animaeva-memory-eval",
	"2026-10-18-careeratlas",
	"2026-10-18-frontier-report",
	"2026-10-18-olympia",
	"2026-10-18-seeker-learning-region-market",
	"2026-10-19-dsh-dotclaude",
	"2026-10-25-shardseek",
	"2026-11-02-blog-as-graph",
	"2026-11-06-diting",
	"2026-11-07-diting-write",
	"2026-11-20-prompt-evolution-recap",
];

test("both list pages show distinct covers", async ({ page }) => {
	const sources: string[] = [];
	let includesDraftFixture = false;
	for (const route of ["/", "/2/"]) {
		await page.goto(route, { waitUntil: "domcontentloaded" });
		const cards = page.locator(".m3-blog-postcard");
		includesDraftFixture ||=
			(await page.locator('a[href="/posts/mdx-showcase/"]').count()) > 0;
		await expect(cards).toHaveCount(
			route === "/" ? 8 : postIds.length - 8 + (includesDraftFixture ? 1 : 0),
		);
		for (const card of await cards.all()) {
			const cover = card.locator("a.m3-blog-postcard__cover");
			await expect(cover).toHaveCount(1);
			expect((await cover.getAttribute("href"))?.startsWith("/")).toBe(true);
			const image = cover.locator("img");
			await image.scrollIntoViewIfNeeded();
			await expect
				.poll(() =>
					image.evaluate(
						(element) =>
							element instanceof HTMLImageElement &&
							element.complete &&
							element.naturalWidth > 0,
					),
				)
				.toBe(true);
			sources.push((await image.getAttribute("src")) || "");
		}
	}
	const expectedCount = postIds.length + (includesDraftFixture ? 1 : 0);
	expect(sources).toHaveLength(expectedCount);
	expect(new Set(sources).size).toBe(expectedCount);
	for (const source of sources) {
		const origin = new URL(source, "http://localhost:4321").origin;
		expect(["http://localhost:4321", "https://gcore.jsdelivr.net"]).toContain(
			origin,
		);
	}
});

test("every canonical detail page keeps its OG image without an inline cover", async ({
	page,
}) => {
	for (const postId of postIds) {
		await page.goto(`/posts/${postId}/`, { waitUntil: "domcontentloaded" });
		await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
		await expect(page.locator("#post-cover")).toHaveCount(0);
	}
});

test("every legacy blog route redirects to the canonical OG page", async ({
	page,
}) => {
	for (const postId of postIds) {
		await page.goto(`/blog/${postId}/`, { waitUntil: "domcontentloaded" });
		await expect(page).toHaveURL(new RegExp(`/posts/${postId}/$`));
		await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
		await expect(page.locator("#post-cover")).toHaveCount(0);
	}
});

test("reload and mobile theme changes preserve the same local cover", async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto("/", { waitUntil: "domcontentloaded" });
	const first = page.locator(".m3-blog-postcard__cover img").first();
	const original = await first.getAttribute("src");
	await page.reload({ waitUntil: "domcontentloaded" });
	await expect(first).toHaveAttribute("src", original || "");
	for (const theme of ["light", "dark"]) {
		await page.addInitScript(
			(value) => localStorage.setItem("theme", value),
			theme,
		);
		await page.reload({ waitUntil: "domcontentloaded" });
		await expect(first).toHaveAttribute("src", original || "");
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
	}
});

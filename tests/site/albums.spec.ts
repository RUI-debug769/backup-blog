import { expect, test } from "@playwright/test";

/**
 * 相册详情页锁定。
 * Shirone 演示相册（AcgExample / EncryptedExample）已随内容清理删除，
 * 当前 public/images/albums/ 下只有迁移占位相册 rebuilding
 * （标题“照片整理中”，仅 cover.webp，照片数 0），因此这里断言占位相册的
 * hero 元信息与空画廊状态；密码门组件暂无启用相册，待新增受保护相册后再补回归。
 */
test.describe("占位相册 rebuilding", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/albums/rebuilding/", { waitUntil: "networkidle" });
	});

	test("渲染 hero 封面、标题与日期/地点/照片数元信息", async ({ page }) => {
		const cover = page.locator(".album-detail__hero img").first();
		await expect(cover).toHaveAttribute(
			"src",
			/\/images\/albums\/rebuilding\/cover\.webp/,
		);
		await expect(cover).toHaveAttribute("alt", "照片整理中");
		await expect
			.poll(async () => cover.evaluate((img) => (img as HTMLImageElement).naturalWidth))
			.toBeGreaterThan(0);

		await expect(page.locator(".page-header__title")).toHaveText("照片整理中");
		const meta = page.locator(".album-detail__meta");
		await expect(meta).toContainText("2026-10-27");
		await expect(meta).toContainText("MUR DOS LOG");
		await expect(meta).toContainText("0 photos");

		await expect(page.locator(".album-detail__tags span")).toHaveText("#meta");
		await expect(page.locator(".album-detail__back")).toHaveAttribute(
			"href",
			"/albums/",
		);
	});

	test("照片尚未迁入时展示空画廊状态，且不被 OverlayScrollbars 接管", async ({
		page,
	}) => {
		await expect(page.locator(".album-gallery__item")).toHaveCount(0);
		const empty = page.locator(".album-gallery__empty");
		await expect(empty).toBeVisible();
		await expect(empty).toContainText("No data");

		await expect(page.locator("html")).not.toHaveAttribute(
			"data-overlayscrollbars",
		);
		await expect(page.locator("body")).not.toHaveAttribute(
			"data-overlayscrollbars",
		);
	});
});

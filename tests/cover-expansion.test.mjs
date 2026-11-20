import assert from "node:assert/strict";
import test from "node:test";
import {
	assertNoPendingCoverBatches,
	chooseUnusedCover,
	rankCandidateThemes,
} from "../src/utils/cover-expansion.ts";
import { hashPostId } from "../src/utils/post-covers.ts";

const cover = (id, themes = []) => ({
	id,
	file: `${id}.webp`,
	alt: `${id} illustration`,
	themes,
	sourceSite: "Example",
	sourceUrl: `https://example.com/${id}`,
	author: "Verified artist",
	authorization: "Permission status recorded from the source page",
});
const post = (id, title = "Untitled", tags = [], category = undefined) => ({
	id,
	title,
	tags,
	...(category === undefined ? {} : { category }),
});

test("chooseUnusedCover never reuses an assigned cover ID", () => {
	const library = [cover("used", ["人工智能"]), cover("free")];
	const selected = chooseUnusedCover(
		post("new-post", "AI 编程", ["模型"]),
		library,
		{ other: "used" },
	);
	assert.equal(selected.id, "free");
});

test("AI and hardware aliases outrank an unthemed candidate", () => {
	const aiCover = cover("ai", ["人工智能"]);
	const plainCover = cover("plain");
	const aiPost = post("ai-post", "本地 AI 模型与计算机硬件", ["编程"]);
	assert.ok(rankCandidateThemes(aiPost, aiCover) > 0);
	assert.equal(rankCandidateThemes(aiPost, plainCover), 0);
	assert.equal(chooseUnusedCover(aiPost, [plainCover, aiCover], {}).id, "ai");
});

test("writing, mathematics, and physics aliases rank their themes", () => {
	assert.ok(
		rankCandidateThemes(
			post("writing", "随笔与思考"),
			cover("writing", ["写作"]),
		) >= 2,
	);
	assert.ok(
		rankCandidateThemes(
			post("math", "公式推导", ["逻辑"]),
			cover("math", ["数学"]),
		) >= 2,
	);
	assert.ok(
		rankCandidateThemes(
			post("physics", "嵌入式电路", [], "硬件"),
			cover("physics", ["物理"]),
		) >= 3,
	);
});

test("equal scores use reproducible post-cover hash ordering", () => {
	const library = [cover("alpha"), cover("beta"), cover("gamma")];
	for (const postId of ["post-a", "post-b"]) {
		const expected = [...library].sort(
			(a, b) =>
				hashPostId(`${postId}:${a.id}`) - hashPostId(`${postId}:${b.id}`),
		)[0].id;
		assert.equal(chooseUnusedCover(post(postId), library, {}).id, expected);
		assert.equal(
			chooseUnusedCover(post(postId), [...library].reverse(), {}).id,
			expected,
		);
	}
});

test("hash collisions fall back to code-point ID order after library reversal", () => {
	const library = [cover("zeta"), cover("alpha"), cover("middle")];
	const constantHash = () => 0;
	assert.equal(
		chooseUnusedCover(post("collision"), library, {}, constantHash).id,
		"alpha",
	);
	assert.equal(
		chooseUnusedCover(
			post("collision"),
			[...library].reverse(),
			{},
			constantHash,
		).id,
		"alpha",
	);
});

test("an exhausted library asks the operator to expand covers", () => {
	assert.throws(
		() => chooseUnusedCover(post("new-post"), [cover("used")], { old: "used" }),
		/covers:expand/,
	);
	assert.throws(
		() => chooseUnusedCover(post("new-post"), [], {}),
		/covers:expand/,
	);
});

test("any pending batch blocks the build with batch and post IDs", () => {
	assert.doesNotThrow(() => assertNoPendingCoverBatches([]));
	const batches = [
		{
			id: "batch-42",
			postId: "draft-post",
			status: "pending",
			proposedCoverId: "alpha",
			candidates: [],
		},
	];
	assert.throws(
		() => assertNoPendingCoverBatches(batches),
		(error) => {
			assert.match(error.message, /batch-42/);
			assert.match(error.message, /draft-post/);
			return true;
		},
	);
});

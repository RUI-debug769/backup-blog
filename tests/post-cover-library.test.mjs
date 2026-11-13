import assert from "node:assert/strict";
import test from "node:test";
import {
	postCoverAssignments,
	postCoverLibrary,
} from "../src/data/post-covers.ts";
import {
	assertCompleteCoverAssignments,
	validatePostCoverLibrary,
} from "../src/utils/post-covers.ts";

const expectedFirstTen = [
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
];

test("curated library contains at least 16 traceable unique covers", () => {
	assert.equal(postCoverLibrary.length >= 16, true);
	assert.equal(
		new Set(postCoverLibrary.map((cover) => cover.id)).size,
		postCoverLibrary.length,
	);
	validatePostCoverLibrary(postCoverLibrary);
	for (const cover of postCoverLibrary)
		assert.equal(cover.file, cover.id + ".webp");
});

test("initial sixteen covers and first ten assignments survive migration", () => {
	assert.equal(postCoverLibrary.length >= 16, true);
	for (const postId of expectedFirstTen)
		assert.ok(postCoverAssignments[postId], postId);
	assert.equal(postCoverAssignments["2026-11-07-diting-write"], "neuro-sama");
	assert.equal(postCoverAssignments["mdx-showcase"], "hello-world");
	assert.equal(
		new Set(Object.values(postCoverAssignments)).size,
		Object.values(postCoverAssignments).length,
	);
	assertCompleteCoverAssignments(
		[...expectedFirstTen, "2026-11-07-diting-write", "mdx-showcase"],
		postCoverLibrary,
		postCoverAssignments,
	);
});

test("complete validation rejects unassigned and duplicate posts", () => {
	const library = [
		{
			id: "one",
			file: "one.webp",
			alt: "one",
			themes: [],
			sourceSite: "X",
			sourceUrl: "https://x.com/a/1",
			author: "a",
			authorization: "unconfirmed",
		},
	];
	assert.throws(
		() => assertCompleteCoverAssignments(["a", "b"], library, { a: "one" }),
		/assignment missing/,
	);
	assert.throws(
		() =>
			assertCompleteCoverAssignments(["a", "b"], library, {
				a: "one",
				b: "one",
			}),
		/duplicate assignment/,
	);
});

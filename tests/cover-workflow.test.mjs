import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { readPostSubject } from "../scripts/covers/assign.mjs";
import {
	createAssignmentBatch,
	expandCandidates,
	readBatch,
	readState,
} from "../scripts/covers/workflow.mjs";

const authorization =
	"原页面未见明确再发布许可；仅记录来源，不宣称已获授权，部署前需复核使用范围。";
const subject = {
	id: "new-post",
	title: "AI 与写作",
	category: "项目",
	tags: ["AI"],
};

async function fixture(color = "#336699", width = 1600, height = 900) {
	return sharp({ create: { width, height, channels: 3, background: color } })
		.png()
		.toBuffer();
}

async function makeRoot(t, libraryCount = 5, usedCount = 1) {
	const root = await mkdtemp(path.join(tmpdir(), "cover-workflow-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const images = path.join(root, "src/assets/images/post-covers");
	await mkdir(images, { recursive: true });
	const library = [];
	for (let index = 0; index < libraryCount; index += 1) {
		const id = `cover-${index}`;
		await writeFile(
			path.join(images, `${id}.webp`),
			await fixture(`#12345${index}`),
		);
		library.push({
			id,
			file: `${id}.webp`,
			alt: `actual tags ${index}`,
			themes: index === 0 ? ["人工智能"] : [],
			sourceSite: "X",
			sourceUrl: `https://x.com/library/status/${index}`,
			author: "library",
			authorization,
		});
	}
	const assignments = Object.fromEntries(
		library
			.slice(0, usedCount)
			.map((cover, index) => [`old-${index}`, cover.id]),
	);
	await mkdir(path.join(root, "src/data"), { recursive: true });
	await writeFile(
		path.join(root, "src/data/post-covers.json"),
		JSON.stringify({ library, assignments }, null, 2),
	);
	return { root, library, assignments };
}

function response(body, ok = true) {
	return {
		ok,
		status: ok ? 200 : 500,
		async json() {
			return body;
		},
		async arrayBuffer() {
			return body.buffer.slice(
				body.byteOffset,
				body.byteOffset + body.byteLength,
			);
		},
	};
}

function apiPost(index, overrides = {}) {
	return {
		id: 5000 + index,
		rating: "general",
		width: 1600,
		height: 900,
		source: `https://x.com/artist${index}/status/${9000 + index}`,
		file_url: `https://safebooru.org/images/${9000 + index}.png`,
		tags: `actual_tag_${index} 1girl`,
		...overrides,
	};
}

function mockNetwork(posts, images) {
	const queries = [];
	const downloads = [];
	return {
		queries,
		downloads,
		fetch: async (url) => {
			const value = String(url);
			if (value.includes("page=dapi")) {
				queries.push(new URL(value).searchParams.get("tags"));
				return response(posts);
			}
			downloads.push(value);
			const id = Number(value.match(/(\d+)\.png$/)?.[1]);
			return response(images.get(id));
		},
	};
}

async function expansionFixture(root, count = 8) {
	const candidates = [];
	for (let index = 0; index < count; index += 1) {
		const directory = path.join(root, `expansion-input-${index}`);
		await mkdir(directory);
		const input = path.join(directory, "source.png");
		const bytes = await fixture(`#abcde${index.toString(16)}`);
		await writeFile(input, bytes);
		candidates.push({
			id: `x-${8000 + index}`,
			file: `x-${8000 + index}.png`,
			alt: `actual_tag_${index} 1girl`,
			themes: [`actual_tag_${index}`, "1girl"],
			sourceSite: "X",
			sourceUrl: `https://x.com/artist/status/${8000 + index}`,
			author: `artist${index}`,
			authorization,
			sourcePostId: `x-${8000 + index}`,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			width: 1600,
			height: 900,
			fit: "cover",
			position: "attention",
			input,
			downloadUrl: `https://safebooru.org/images/${8000 + index}.png`,
		});
	}
	return {
		id: "expand-test",
		postId: "library-expansion",
		status: "pending",
		proposedCoverId: candidates[0].id,
		candidates,
	};
}

test("frontmatter supplies the subject and assignment leaves its image untouched", async (t) => {
	const { root } = await makeRoot(t, 5, 1);
	const posts = path.join(root, "src/content/posts");
	await mkdir(posts, { recursive: true });
	const file = path.join(posts, "new-post.md");
	const markdown = `---\ntitle: "硬件写作"\ncategory: "项目"\ntags: ["AI", "写作"]\nimage: "/images/keep.png"\n---\n\n正文不变。\n`;
	await writeFile(file, markdown);
	const post = await readPostSubject(root, "new-post");
	assert.deepEqual(post, {
		id: "new-post",
		title: "硬件写作",
		category: "项目",
		tags: ["AI", "写作"],
	});
	await createAssignmentBatch(root, post);
	assert.equal(await readFile(file, "utf8"), markdown);
});

test("assignment uses exactly four available library covers without expansion or formal mutation", async (t) => {
	const { root } = await makeRoot(t, 5, 1);
	const statePath = path.join(root, "src/data/post-covers.json");
	const before = await readFile(statePath, "utf8");
	const batch = await createAssignmentBatch(root, subject, {
		expand: async () => {
			throw new Error("must not expand at four");
		},
	});
	assert.equal(batch.id, "batch-new-post");
	assert.equal(batch.status, "pending");
	assert.equal(batch.candidates.length, 4);
	assert.ok(
		batch.candidates.every((candidate) =>
			candidate.sourcePostId.startsWith("library-"),
		),
	);
	assert.ok(
		batch.candidates.every((candidate) => candidate.sha256.length === 64),
	);
	assert.equal(await readFile(statePath, "utf8"), before);
	assert.equal((await readBatch(root, batch.id)).postId, "new-post");
	await sharp(
		path.join(
			root,
			".shirones/cover-expansion/batch-new-post/contact-sheet.jpg",
		),
	).metadata();
	assert.equal((await readState(root)).assignments["old-0"], "cover-0");
});

test("assignment expands eight before writing when fewer than four unused covers remain", async (t) => {
	const { root } = await makeRoot(t, 4, 1);
	const expanded = await expansionFixture(root);
	let requested = 0;
	const batch = await createAssignmentBatch(root, subject, {
		expand: async (_root, options) => {
			requested = options.count;
			return expanded;
		},
	});
	assert.equal(requested, 8);
	assert.equal(batch.candidates.length, 4);
	assert.ok(
		batch.candidates.some((candidate) =>
			candidate.sourcePostId.startsWith("x-"),
		),
	);
	assert.equal(
		batch.candidates.filter((candidate) =>
			candidate.sourcePostId.startsWith("library-"),
		).length,
		3,
	);
});

test("expansion accepts eight compliant works and records X authorship, downloads and review artifacts", async (t) => {
	const { root } = await makeRoot(t, 0, 0);
	const images = new Map();
	const posts = [];
	for (let index = 0; index < 8; index += 1) {
		posts.push(apiPost(index));
		images.set(9000 + index, await fixture(`#11111${index}`));
	}
	posts.push(
		apiPost(8, { rating: "questionable" }),
		apiPost(9, { source: "https://example.com/not-x" }),
	);
	const network = mockNetwork(posts, images);
	const batch = await expandCandidates(root, { fetchImpl: network.fetch });
	assert.equal(batch.candidates.length, 8);
	assert.deepEqual(network.queries, ["neuro-sama"]);
	assert.equal(network.downloads.length, 8);
	assert.equal(batch.candidates[0].sourcePostId, "x-9000");
	assert.equal(batch.candidates[0].author, "artist0");
	assert.equal(
		batch.candidates[0].sourceUrl,
		"https://x.com/artist0/status/9000",
	);
	assert.equal(
		batch.candidates[0].downloadUrl,
		"https://safebooru.org/images/9000.png",
	);
	assert.equal(batch.candidates[0].fit, "cover");
	assert.equal(batch.candidates[0].position, "attention");
	assert.equal(batch.candidates[0].alt, "actual_tag_0 1girl");
	assert.equal(batch.candidates[0].authorization, authorization);
	const directory = path.join(
		root,
		".shirones/cover-expansion-candidates",
		batch.id,
	);
	const contact = await sharp(
		path.join(directory, "contact-sheet.jpg"),
	).metadata();
	assert.deepEqual([contact.width, contact.height], [1600, 500]);
	assert.match(
		await readFile(path.join(directory, "sources.md"), "utf8"),
		/artist0/,
	);
	assert.equal(
		(await readFile(path.join(directory, "batch.json"), "utf8")).includes(
			"questionable",
		),
		false,
	);
});

test("twitter status URLs use the original account and narrow images use blur", async (t) => {
	const posts = [
		apiPost(0, {
			source: "https://twitter.com/original_account/status/12345",
			width: 1600,
			height: 1200,
		}),
	];
	const secondRoot = (await makeRoot(t, 0, 0)).root;
	const second = await expandCandidates(secondRoot, {
		count: 1,
		fetchImpl: mockNetwork(
			posts,
			new Map([[9000, await fixture("#aa3356", 1600, 1200)]]),
		).fetch,
	});
	assert.equal(second.candidates[0].author, "original_account");
	assert.equal(second.candidates[0].sourcePostId, "x-12345");
	assert.equal(second.candidates[0].fit, "blur");
});

test("formal-library and same-batch SHA-256 duplicates are rejected without lowering the count", async (t) => {
	const { root, library } = await makeRoot(t, 1, 0);
	const duplicate = await fixture("#123450");
	await writeFile(
		path.join(root, "src/assets/images/post-covers", library[0].file),
		duplicate,
	);
	const images = new Map();
	const posts = [];
	for (let index = 0; index < 10; index += 1) {
		posts.push(apiPost(index));
		images.set(
			9000 + index,
			index < 2 ? duplicate : await fixture(`#22222${index}`),
		);
	}
	const batch = await expandCandidates(root, {
		fetchImpl: mockNetwork(posts, images).fetch,
	});
	assert.equal(batch.candidates.length, 8);
	assert.equal(
		batch.candidates.some((candidate) => candidate.sourcePostId === "x-9000"),
		false,
	);
	assert.equal(
		batch.candidates.some((candidate) => candidate.sourcePostId === "x-9001"),
		false,
	);
	assert.equal(
		new Set(batch.candidates.map((candidate) => candidate.sha256)).size,
		8,
	);
});

test("fewer than eight compliant candidates fails cleanly and writes no partial batch", async (t) => {
	const { root } = await makeRoot(t, 0, 0);
	const images = new Map();
	const posts = [];
	for (let index = 0; index < 7; index += 1) {
		posts.push(apiPost(index));
		images.set(9000 + index, await fixture(`#33333${index}`));
	}
	await assert.rejects(
		expandCandidates(root, { fetchImpl: mockNetwork(posts, images).fetch }),
		/7.*8|缺口 1/,
	);
	const expansion = path.join(root, ".shirones/cover-expansion-candidates");
	await assert.rejects(readdir(expansion), /ENOENT/);
});

test("external download hosts are rejected before fetch", async (t) => {
	const { root } = await makeRoot(t, 0, 0);
	const posts = [apiPost(0, { file_url: "https://evil.example/image.png" })];
	const network = mockNetwork(posts, new Map());
	await assert.rejects(
		expandCandidates(root, { count: 1, fetchImpl: network.fetch }),
		/0\/1|缺口 1/,
	);
	assert.deepEqual(network.downloads, []);
});

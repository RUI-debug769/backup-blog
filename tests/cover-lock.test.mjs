import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import sharp from "sharp";
import { lockBatch } from "../scripts/covers/lock.mjs";
import { assertNoPendingCoverBatches } from "../src/utils/cover-expansion.ts";

const authorization = "Permission review recorded";
const SCRIPT = fileURLToPath(
	new URL("../scripts/new-post.js", import.meta.url),
);
const LOCK_SCRIPT = fileURLToPath(
	new URL("../scripts/covers/lock.mjs", import.meta.url),
);

async function raster(color = "#336699", width = 1600, height = 900) {
	return sharp({ create: { width, height, channels: 3, background: color } })
		.png()
		.toBuffer();
}

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

function formalCover(id, status) {
	return {
		id,
		file: `${id}.webp`,
		alt: `${id} alternative text`,
		themes: ["AI"],
		sourceSite: "X",
		sourceUrl: `https://x.com/${id}/status/${status}`,
		author: id,
		authorization,
	};
}

async function writeBatch(
	root,
	candidates,
	{ batchId = "batch-new-post", postId = "new-post" } = {},
) {
	const directory = path.join(root, ".shirones/cover-expansion", batchId);
	await mkdir(directory, { recursive: true });
	await writeFile(
		path.join(directory, "batch.json"),
		JSON.stringify({
			id: batchId,
			postId,
			status: "pending",
			proposedCoverId: candidates[0].id,
			candidates,
		}),
	);
}

async function assertNoTransactionArtifacts(root) {
	assert.equal(
		await stat(path.join(root, ".shirones/cover-lock.lock")).then(
			() => true,
			() => false,
		),
		false,
	);
	const transactions = path.join(root, ".shirones/cover-transactions");
	assert.equal(
		await readdir(transactions).then(
			(entries) => entries.length,
			() => 0,
		),
		0,
	);
}

async function makeRoot(t, { withImage = true } = {}) {
	const root = await mkdtemp(path.join(tmpdir(), "cover-lock-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const images = path.join(root, "src/assets/images/post-covers");
	const posts = path.join(root, "src/content/posts");
	const data = path.join(root, "src/data");
	await mkdir(images, { recursive: true });
	await mkdir(posts, { recursive: true });
	await mkdir(data, { recursive: true });
	const library = [formalCover("taken", 100), formalCover("reuse", 200)];
	for (const cover of library) {
		await writeFile(
			path.join(images, cover.file),
			await raster(cover.id === "taken" ? "#111111" : "#222222"),
		);
	}
	const state = { library, assignments: { old: "taken" } };
	const statePath = path.join(data, "post-covers.json");
	await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
	const postPath = path.join(posts, "new-post.md");
	const markdown = `---\ntitle: Test\ndescription: "literal $& value"\n${withImage ? "image: '/images/old.png'\n" : ""}tags: []\nlang: ''\n---\n\nBody image: must-not-change\n保持正文。\n`;
	await writeFile(postPath, markdown);
	const input = path.join(root, "candidate/source.png");
	await mkdir(path.dirname(input), { recursive: true });
	const bytes = await raster();
	await writeFile(input, bytes);
	const candidate = {
		id: "x-900",
		file: "x-900.png",
		alt: "actual candidate tags",
		themes: ["actual", "candidate"],
		sourceSite: "X",
		sourceUrl: "https://x.com/artist/status/900",
		author: "artist",
		authorization,
		sourcePostId: "x-900",
		sha256: sha256(bytes),
		width: 1600,
		height: 900,
		fit: "cover",
		position: "attention",
		input,
	};
	await writeBatch(root, [candidate]);
	return { root, statePath, postPath, markdown, candidate, images };
}

test("lock materializes WebP, replaces only image, archives pending, and repeats idempotently", async (t) => {
	const fixture = await makeRoot(t);
	const expectedImage = "../../assets/images/post-covers/x-900.webp";
	const first = await lockBatch(fixture.root, "batch-new-post");
	assert.deepEqual(first, {
		postId: "new-post",
		coverId: "x-900",
		image: expectedImage,
	});
	const output = path.join(fixture.images, "x-900.webp");
	const metadata = await sharp(output).metadata();
	assert.deepEqual(
		[metadata.format, metadata.width, metadata.height],
		["webp", 1600, 900],
	);
	const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
	assert.equal(state.library.length, 3);
	assert.equal(state.assignments["new-post"], "x-900");
	assert.equal(state.library[2].file, "x-900.webp");
	assert.equal("sha256" in state.library[2], false);
	const markdown = await readFile(fixture.postPath, "utf8");
	assert.match(
		markdown,
		/^image: "..\/..\/assets\/images\/post-covers\/x-900.webp"$/m,
	);
	assert.equal(markdown.includes("/images/old.png"), false);
	assert.match(markdown, /^description: "literal \$& value"$/m);
	assert.ok(markdown.endsWith("\nBody image: must-not-change\n保持正文。\n"));
	assert.equal(
		(await readdir(path.join(fixture.root, ".shirones/cover-expansion")))
			.length,
		0,
	);
	const locked = path.join(
		fixture.root,
		".shirones/cover-expansion-locked/batch-new-post/batch.json",
	);
	assert.equal(JSON.parse(await readFile(locked, "utf8")).postId, "new-post");
	const before = await Promise.all(
		[fixture.statePath, fixture.postPath, output].map(
			async (file) => (await stat(file)).mtimeMs,
		),
	);
	const second = await lockBatch(fixture.root, "batch-new-post");
	assert.deepEqual(second, first);
	const after = await Promise.all(
		[fixture.statePath, fixture.postPath, output].map(
			async (file) => (await stat(file)).mtimeMs,
		),
	);
	assert.deepEqual(after, before);
	assert.equal(
		JSON.parse(await readFile(fixture.statePath, "utf8")).library.length,
		3,
	);
});

test("lock inserts image before lang and reuses a formal candidate without appending or rewriting", async (t) => {
	const fixture = await makeRoot(t, { withImage: false });
	const input = path.join(fixture.images, "reuse.webp");
	const bytes = await readFile(input);
	const candidate = {
		...formalCover("reuse", 200),
		sourcePostId: "library-reuse",
		sha256: sha256(bytes),
		width: 1600,
		height: 900,
		fit: "cover",
		position: "attention",
		input,
	};
	await writeBatch(fixture.root, [candidate]);
	const originalImage = await readFile(input);
	const result = await lockBatch(fixture.root, "batch-new-post");
	assert.equal(result.coverId, "reuse");
	const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
	assert.equal(state.library.length, 2);
	assert.equal(state.assignments["new-post"], "reuse");
	assert.deepEqual(await readFile(input), originalImage);
	const markdown = await readFile(fixture.postPath, "utf8");
	assert.ok(markdown.indexOf("image:") < markdown.indexOf("lang:"));
	assert.ok(markdown.endsWith("\nBody image: must-not-change\n保持正文。\n"));
});

test("lock applies the blur fit to narrow candidates", async (t) => {
	const fixture = await makeRoot(t);
	const bytes = await raster("#883366", 1600, 1200);
	await writeFile(fixture.candidate.input, bytes);
	await writeBatch(fixture.root, [
		{
			...fixture.candidate,
			height: 1200,
			fit: "blur",
			sha256: sha256(bytes),
		},
	]);
	await lockBatch(fixture.root, "batch-new-post");
	const metadata = await sharp(
		path.join(fixture.images, "x-900.webp"),
	).metadata();
	assert.deepEqual([metadata.width, metadata.height], [1600, 900]);
});

test("lock rejects conflicting IDs, source IDs, and hashes without formal mutation", async (t) => {
	for (const kind of ["source", "hash", "source-id", "duplicate-hash"]) {
		await t.test(kind, async (t) => {
			const fixture = await makeRoot(t);
			const before = await readFile(fixture.statePath, "utf8");
			let candidate = { ...fixture.candidate };
			if (kind === "source")
				candidate = {
					...formalCover("reuse", 999),
					...candidate,
					id: "reuse",
					sourceUrl: "https://x.com/reuse/status/999",
				};
			if (kind === "hash")
				candidate = {
					...candidate,
					id: "reuse",
					sourceUrl: "https://x.com/reuse/status/200",
					sourcePostId: "library-reuse",
					sha256: "0".repeat(64),
				};
			if (kind === "source-id") candidate.sourcePostId = "x-100";
			if (kind === "duplicate-hash")
				candidate.sha256 = sha256(
					await readFile(path.join(fixture.images, "reuse.webp")),
				);
			await writeBatch(fixture.root, [candidate]);
			await assert.rejects(
				lockBatch(fixture.root, "batch-new-post"),
				/conflict|occupied|mismatch|duplicate/i,
			);
			assert.equal(await readFile(fixture.statePath, "utf8"), before);
			assert.equal(await readFile(fixture.postPath, "utf8"), fixture.markdown);
		});
	}
});

test("every injected commit-step failure restores all files and the pending batch", async (t) => {
	for (const step of ["asset", "state", "frontmatter", "archive"]) {
		await t.test(step, async (t) => {
			const fixture = await makeRoot(t);
			const beforeState = await readFile(fixture.statePath, "utf8");
			await assert.rejects(
				lockBatch(fixture.root, "batch-new-post", {
					afterRename: async ({ step: current }) => {
						if (current === step) throw new Error(`Injected ${step} failure`);
					},
				}),
				new RegExp(`Injected ${step} failure`),
			);
			assert.equal(await readFile(fixture.statePath, "utf8"), beforeState);
			assert.equal(await readFile(fixture.postPath, "utf8"), fixture.markdown);
			await assert.rejects(
				stat(path.join(fixture.images, "x-900.webp")),
				/ENOENT/,
			);
			assert.ok(
				JSON.parse(
					await readFile(
						path.join(
							fixture.root,
							".shirones/cover-expansion/batch-new-post/batch.json",
						),
						"utf8",
					),
				),
			);
			assert.equal(
				await stat(
					path.join(
						fixture.root,
						".shirones/cover-expansion-locked/batch-new-post",
					),
				).then(
					() => true,
					() => false,
				),
				false,
			);
			await assertNoTransactionArtifacts(fixture.root);
		});
	}
});

test("pending raw batches block the build before manual image resolution", async () => {
	const file = fileURLToPath(
		new URL("../src/utils/post-cover-assets.ts", import.meta.url),
	);
	const typescript = await readFile(file, "utf8").then((source) =>
		source.replaceAll("import.meta.glob(", "globalThis.__coverGlob("),
	);
	const { code } = await transform(typescript, {
		loader: "ts",
		format: "esm",
	});
	const batch = {
		id: "batch-review",
		postId: "manual-post",
		status: "pending",
		proposedCoverId: "one",
		candidates: [],
	};
	globalThis.__coverGlob = (pattern) =>
		pattern.startsWith("/.shirones/cover-expansion/")
			? {
					"/.shirones/cover-expansion/batch-review/batch.json":
						JSON.stringify(batch),
				}
			: {};
	const module = await import(
		`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
	);
	assert.deepEqual(module.readPendingCoverBatches(), [batch]);
	assert.throws(
		() => assertNoPendingCoverBatches(module.readPendingCoverBatches()),
		/batch-review/,
	);
	delete globalThis.__coverGlob;
	const content = await readFile(
		fileURLToPath(new URL("../src/utils/content-utils.ts", import.meta.url)),
		"utf8",
	);
	const complete = content.indexOf("assertCompleteCoverAssignments(");
	const pending = content.indexOf(
		"assertNoPendingCoverBatches(readPendingCoverBatches())",
	);
	const resolve = content.indexOf("resolvePostCover(");
	assert.ok(complete >= 0 && pending > complete && resolve > pending);
});

test("new-post triggers assignment and keeps the article with actionable output on failure", async (t) => {
	const root = await mkdtemp(path.join(tmpdir(), "new-post-cover-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(path.join(root, "scripts/covers"), { recursive: true });
	await writeFile(
		path.join(root, "scripts/covers/assign.mjs"),
		`import { writeFileSync } from "node:fs";\nwriteFileSync("assign-args.json", JSON.stringify(process.argv.slice(2)));\n`,
	);
	execFileSync(process.execPath, [SCRIPT, "assigned"], {
		cwd: root,
		stdio: "pipe",
	});
	assert.deepEqual(
		JSON.parse(await readFile(path.join(root, "assign-args.json"), "utf8")),
		["--post", "assigned"],
	);
	await writeFile(
		path.join(root, "scripts/covers/assign.mjs"),
		`throw new Error("review storage unavailable");\n`,
	);
	const result = spawnSync(process.execPath, [SCRIPT, "retained"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.match(result.stderr, /cover assignment failed/i);
	assert.match(result.stderr, /covers:assign --post retained/);
	assert.ok(
		await readFile(path.join(root, "src/content/posts/retained.md"), "utf8"),
	);
	const manifest = JSON.parse(
		await readFile(
			fileURLToPath(new URL("../package.json", import.meta.url)),
			"utf8",
		),
	);
	assert.equal(
		manifest.scripts["covers:assign"],
		"node scripts/covers/assign.mjs",
	);
	assert.equal(
		manifest.scripts["covers:expand"],
		"node scripts/covers/expand.mjs",
	);
	assert.equal(manifest.scripts["covers:lock"], "node scripts/covers/lock.mjs");
});

test("lock rejects undersized cover and blur sources without enlargement", async (t) => {
	for (const fit of ["cover", "blur"]) {
		await t.test(fit, async (t) => {
			const fixture = await makeRoot(t);
			const bytes = await raster("#445566", 800, 600);
			await writeFile(fixture.candidate.input, bytes);
			await writeBatch(fixture.root, [
				{
					...fixture.candidate,
					width: 800,
					height: 600,
					fit,
					sha256: sha256(bytes),
				},
			]);
			const before = await readFile(fixture.statePath, "utf8");
			await assert.rejects(
				lockBatch(fixture.root, "batch-new-post"),
				/too small.*1600x900/i,
			);
			assert.equal(await readFile(fixture.statePath, "utf8"), before);
			await assert.rejects(
				stat(path.join(fixture.images, "x-900.webp")),
				/ENOENT/,
			);
		});
	}
});

test("a killed child leaves a journal and the next call recovers before locking", async (t) => {
	const fixture = await makeRoot(t);
	const child = path.join(fixture.root, "crash-child.mjs");
	await writeFile(
		child,
		`import { lockBatch } from ${JSON.stringify(LOCK_SCRIPT)};\nawait lockBatch(process.argv[2], "batch-new-post", { afterRename: async ({ step }) => { if (step === "state") process.kill(process.pid, "SIGKILL"); } });\n`,
	);
	const result = spawnSync(process.execPath, [child, fixture.root], {
		encoding: "utf8",
	});
	assert.equal(result.signal, "SIGKILL", result.stderr);
	assert.equal(
		(await readdir(path.join(fixture.root, ".shirones/cover-transactions")))
			.length,
		1,
	);
	const locked = await lockBatch(fixture.root, "batch-new-post");
	assert.equal(locked.coverId, "x-900");
	const state = JSON.parse(await readFile(fixture.statePath, "utf8"));
	assert.equal(state.library.length, 3);
	assert.equal(state.assignments["new-post"], "x-900");
	assert.equal(
		(await readdir(path.join(fixture.root, ".shirones/cover-expansion")))
			.length,
		0,
	);
	assert.ok(
		await readFile(
			path.join(
				fixture.root,
				".shirones/cover-expansion-locked/batch-new-post/batch.json",
			),
			"utf8",
		),
	);
	await assertNoTransactionArtifacts(fixture.root);
});

test("concurrent batches are serialized and the later stale assignment is rejected", async (t) => {
	const fixture = await makeRoot(t);
	await writeBatch(fixture.root, [fixture.candidate], { batchId: "batch-a" });
	await writeBatch(fixture.root, [fixture.candidate], { batchId: "batch-b" });
	let enteredResolve;
	let releaseResolve;
	const entered = new Promise((resolve) => {
		enteredResolve = resolve;
	});
	const gate = new Promise((resolve) => {
		releaseResolve = resolve;
	});
	let secondAcquired = false;
	const first = lockBatch(fixture.root, "batch-a", {
		afterLock: async () => {
			enteredResolve();
			await gate;
		},
	});
	await Promise.race([
		entered,
		delay(1000).then(() => {
			throw new Error("first lock was not acquired");
		}),
	]);
	const second = lockBatch(fixture.root, "batch-b", {
		afterLock: async () => {
			secondAcquired = true;
		},
	});
	try {
		await delay(50);
		assert.equal(secondAcquired, false);
	} finally {
		releaseResolve();
	}
	const [firstResult, secondResult] = await Promise.allSettled([first, second]);
	assert.equal(firstResult.status, "fulfilled");
	assert.equal(secondResult.status, "rejected");
	assert.match(secondResult.reason.message, /already has a cover assignment/);
	assert.equal(secondAcquired, true);
	assert.ok(
		await readFile(
			path.join(fixture.root, ".shirones/cover-expansion/batch-b/batch.json"),
			"utf8",
		),
	);
	await assertNoTransactionArtifacts(fixture.root);
});

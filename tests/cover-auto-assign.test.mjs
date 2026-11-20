import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const AUTHORIZATION = "Permission review recorded";

async function raster(color, format = "png") {
	const image = sharp({
		create: { width: 1600, height: 900, channels: 3, background: color },
	});
	return format === "webp" ? image.webp().toBuffer() : image.png().toBuffer();
}

function color(index) {
	return `#${(0x100000 + index * 0x10203).toString(16).padStart(6, "0")}`;
}

function formalCover(id, index, themes = []) {
	return {
		id,
		file: `${id}.webp`,
		alt: `${id} alternative text`,
		themes,
		sourceSite: "X",
		sourceUrl: `https://x.com/library/status/${1000 + index}`,
		author: "library",
		authorization: AUTHORIZATION,
	};
}

async function installMockNetwork(root, fixture = { posts: [], images: [] }) {
	await writeFile(
		path.join(root, "mock-network-data.json"),
		JSON.stringify(fixture),
	);
	await writeFile(
		path.join(root, "mock-network.mjs"),
		`import { appendFileSync, readFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(new URL("./mock-network-data.json", import.meta.url), "utf8"));
const images = new Map(fixture.images);
globalThis.fetch = async (input) => {
	const url = new URL(String(input));
	if (process.env.COVER_NETWORK_LOG) appendFileSync(process.env.COVER_NETWORK_LOG, url.href + "\\n");
	if (url.hostname === "safebooru.org" && url.searchParams.get("page") === "dapi") {
		return new Response(JSON.stringify({ post: fixture.posts }), { status: 200 });
	}
	const match = url.pathname.match(/\\/(\\d+)\\.png$/);
	if (url.hostname === "safebooru.org" && match && images.has(match[1])) {
		return new Response(Buffer.from(images.get(match[1]), "base64"), { status: 200 });
	}
	return new Response("offline fixture has no such URL", { status: 503 });
};
`,
	);
}

async function makeRoot(t, { libraryCount = 5, usedCount = 1 } = {}) {
	const root = await mkdtemp(path.join(tmpdir(), "cover-auto-assign-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(path.join(root, "scripts/covers"), { recursive: true });
	await mkdir(path.join(root, "src/utils"), { recursive: true });
	for (const file of ["assign.mjs", "lock.mjs", "workflow.mjs"]) {
		await copyFile(
			path.join(PROJECT_ROOT, "scripts/covers", file),
			path.join(root, "scripts/covers", file),
		);
	}
	for (const file of ["cover-expansion.ts", "post-covers.ts"]) {
		await copyFile(
			path.join(PROJECT_ROOT, "src/utils", file),
			path.join(root, "src/utils", file),
		);
	}
	await symlink(
		path.join(PROJECT_ROOT, "node_modules"),
		path.join(root, "node_modules"),
		"dir",
	);
	const images = path.join(root, "src/assets/images/post-covers");
	await mkdir(images, { recursive: true });
	await mkdir(path.join(root, "src/content/posts"), { recursive: true });
	await mkdir(path.join(root, "src/data"), { recursive: true });
	const library = [];
	for (let index = 0; index < libraryCount; index += 1) {
		const id =
			libraryCount === 5 && index === 1 ? "neuro-sama" : `cover-${index}`;
		const themes = id === "neuro-sama" ? ["人工智能"] : [];
		const cover = formalCover(id, index, themes);
		library.push(cover);
		await writeFile(
			path.join(images, cover.file),
			await raster(color(index), "webp"),
		);
	}
	const assignments = Object.fromEntries(
		library
			.slice(0, usedCount)
			.map((cover, index) => [`old-${index}`, cover.id]),
	);
	await writeFile(
		path.join(root, "src/data/post-covers.json"),
		`${JSON.stringify({ library, assignments }, null, 2)}\n`,
	);
	await installMockNetwork(root);
	return root;
}

async function writePost(root, postId, { withLang = true } = {}) {
	const file = path.join(root, "src/content/posts", `${postId}.md`);
	await writeFile(
		file,
		`---\ntitle: "AI 与 Neuro-sama"\ndescription: "integration fixture"\ntags: ["AI"]\n${withLang ? "lang: ''\n" : ""}---\n\nBody must stay unchanged.\n`,
	);
	return file;
}

async function expansionFixture(root, count) {
	const posts = [];
	const images = [];
	for (let index = 0; index < count; index += 1) {
		const status = 9000 + index;
		posts.push({
			id: 5000 + index,
			rating: "general",
			width: 1600,
			height: 900,
			source: `https://x.com/artist${index}/status/${status}`,
			file_url: `https://safebooru.org/images/${status}.png`,
			tags: "人工智能 1girl",
		});
		images.push([
			String(status),
			(await raster(color(20 + index))).toString("base64"),
		]);
	}
	await installMockNetwork(root, { posts, images });
}

function runAssignResult(root, postId) {
	const result = spawnSync(
		process.execPath,
		[
			"--import",
			path.join(root, "mock-network.mjs"),
			path.join(root, "scripts/covers/assign.mjs"),
			"--post",
			postId,
		],
		{
			cwd: root,
			encoding: "utf8",
			env: {
				...process.env,
				COVER_NETWORK_LOG: path.join(root, "network-calls.log"),
			},
			timeout: 120_000,
		},
	);
	assert.equal(result.error, undefined);
	return result;
}

function runAssignAsync(root, postId) {
	const child = spawn(
		process.execPath,
		[
			"--import",
			path.join(root, "mock-network.mjs"),
			path.join(root, "scripts/covers/assign.mjs"),
			"--post",
			postId,
		],
		{
			cwd: root,
			env: {
				...process.env,
				COVER_NETWORK_LOG: path.join(root, "network-calls.log"),
			},
			timeout: 120_000,
		},
	);
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	return new Promise((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (status, signal) => {
			resolve({ status, signal, stdout, stderr });
		});
	});
}

async function runAssign(root, postId) {
	const execution = runAssignResult(root, postId);
	assert.equal(execution.status, 0, execution.stderr);
	try {
		return JSON.parse(execution.stdout.trim());
	} catch {
		assert.fail(`Expected a JSON locked result, got: ${execution.stdout}`);
	}
}

async function exists(file) {
	return stat(file).then(
		() => true,
		(error) => {
			if (error.code === "ENOENT") return false;
			throw error;
		},
	);
}

function stateFile(root) {
	return path.join(root, "src/data/post-covers.json");
}

function pendingBatch(root, postId) {
	return path.join(root, ".shirones/cover-expansion", `batch-${postId}`);
}

function lockedBatch(root, postId) {
	return path.join(
		root,
		".shirones/cover-expansion-locked",
		`batch-${postId}`,
		"batch.json",
	);
}

async function readJson(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function networkCalls(root) {
	return readFile(path.join(root, "network-calls.log"), "utf8")
		.then((source) => source.trim().split("\n").filter(Boolean))
		.catch((error) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
}

test("assign automatically locks an unused cover without pending residue", async (t) => {
	const root = await makeRoot(t);
	const postId = "2026-11-13-auto-post";
	const postFile = await writePost(root, postId);
	const result = await runAssign(root, postId);
	assert.deepEqual(result, {
		postId,
		coverId: "neuro-sama",
		image: "../../assets/images/post-covers/neuro-sama.webp",
	});
	const state = await readJson(stateFile(root));
	assert.equal(state.assignments[postId], "neuro-sama");
	assert.equal(await exists(pendingBatch(root, postId)), false);
	assert.equal(await exists(lockedBatch(root, postId)), true);
	assert.match(await readFile(postFile, "utf8"), /neuro-sama\.webp/);
	assert.equal((await networkCalls(root)).length, 0);
});

test("assign resumes a pending batch left by an interrupted run", async (t) => {
	const root = await makeRoot(t);
	const postId = "2026-11-13-resume-post";
	await writePost(root, postId);
	const { createAssignmentBatch } = await import(
		pathToFileURL(path.join(root, "scripts/covers/workflow.mjs")).href
	);
	const batch = await createAssignmentBatch(root, {
		id: postId,
		title: "AI 与 Neuro-sama",
		tags: ["AI"],
	});
	assert.equal(await exists(pendingBatch(root, postId)), true);
	const result = await runAssign(root, postId);
	assert.equal(result.coverId, batch.proposedCoverId);
	assert.equal(await exists(pendingBatch(root, postId)), false);
	assert.equal(await exists(lockedBatch(root, postId)), true);
	const state = await readJson(stateFile(root));
	assert.equal(state.assignments[postId], batch.proposedCoverId);
});

test("new-post automatically assigns and locks without a review instruction", async (t) => {
	const root = await makeRoot(t);
	await copyFile(
		path.join(PROJECT_ROOT, "scripts/new-post.js"),
		path.join(root, "scripts/new-post.js"),
	);
	const postId = "2026-11-13-new-post";
	const result = spawnSync(
		process.execPath,
		[
			"--import",
			path.join(root, "mock-network.mjs"),
			path.join(root, "scripts/new-post.js"),
			postId,
		],
		{ cwd: root, encoding: "utf8", timeout: 120_000 },
	);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /assigned and locked/i);
	assert.doesNotMatch(result.stdout, /pending review|covers:lock/i);
	const state = await readJson(stateFile(root));
	assert.equal(state.assignments[postId], "neuro-sama");
	assert.match(
		await readFile(
			path.join(root, "src/content/posts", `${postId}.md`),
			"utf8",
		),
		/neuro-sama\.webp/,
	);
	assert.equal(await exists(pendingBatch(root, postId)), false);
	assert.equal(await exists(lockedBatch(root, postId)), true);
});

test("assign recovers interrupted commits before accepting an existing assignment", async (t) => {
	for (const step of ["state", "frontmatter", "archive"]) {
		await t.test(step, async (t) => {
			const root = await makeRoot(t);
			const postId = `2026-11-13-crash-${step}`;
			const postFile = await writePost(root, postId);
			const { createAssignmentBatch } = await import(
				pathToFileURL(path.join(root, "scripts/covers/workflow.mjs")).href
			);
			await createAssignmentBatch(root, {
				id: postId,
				title: "AI 与 Neuro-sama",
				tags: ["AI"],
			});
			const child = path.join(root, "crash-child.mjs");
			const lockUrl = pathToFileURL(
				path.join(root, "scripts/covers/lock.mjs"),
			).href;
			await writeFile(
				child,
				`import { lockBatch } from ${JSON.stringify(lockUrl)};\nawait lockBatch(process.argv[2], ${JSON.stringify(`batch-${postId}`)}, { afterRename: async ({ step: current }) => { if (current === ${JSON.stringify(step)}) process.kill(process.pid, "SIGKILL"); } });\n`,
			);
			const crashed = spawnSync(process.execPath, [child, root], {
				encoding: "utf8",
			});
			assert.equal(crashed.signal, "SIGKILL", crashed.stderr);
			const result = await runAssign(root, postId);
			const state = await readJson(stateFile(root));
			assert.equal(state.assignments[postId], result.coverId);
			assert.match(
				await readFile(postFile, "utf8"),
				new RegExp(`${result.coverId}.webp`),
			);
			assert.equal(await exists(pendingBatch(root, postId)), false);
			assert.equal(await exists(lockedBatch(root, postId)), true);
			const transactions = await readdir(
				path.join(root, ".shirones/cover-transactions"),
			).catch((error) => {
				if (error.code === "ENOENT") return [];
				throw error;
			});
			assert.deepEqual(transactions, []);
		});
	}
});

test("concurrent posts retry with different unused covers", async (t) => {
	const root = await makeRoot(t, { libraryCount: 6 });
	const initial = await readJson(stateFile(root));
	initial.library[1].themes = ["人工智能"];
	await writeFile(stateFile(root), JSON.stringify(initial, null, 2));
	const postIds = ["2026-11-13-concurrent-a", "2026-11-13-concurrent-b"];
	for (const postId of postIds) await writePost(root, postId);
	const results = await Promise.all(
		postIds.map((postId) => runAssignAsync(root, postId)),
	);
	for (const result of results) assert.equal(result.status, 0, result.stderr);
	const assigned = results.map((result) => JSON.parse(result.stdout).coverId);
	assert.equal(new Set(assigned).size, 2);
	const state = await readJson(stateFile(root));
	assert.deepEqual(
		postIds.map((postId) => state.assignments[postId]).sort(),
		assigned.sort(),
	);
	for (const postId of postIds) {
		assert.equal(await exists(pendingBatch(root, postId)), false);
		assert.equal(await exists(lockedBatch(root, postId)), true);
	}
});

test("low inventory expands and locks without manual lock or duplicate rerun", async (t) => {
	const root = await makeRoot(t, { libraryCount: 4, usedCount: 1 });
	const postId = "2026-11-13-expand-post";
	const postFile = await writePost(root, postId);
	await expansionFixture(root, 8);
	const result = await runAssign(root, postId);
	assert.equal(result.coverId.startsWith("x-"), true);
	assert.equal(
		result.image,
		`../../assets/images/post-covers/${result.coverId}.webp`,
	);
	assert.equal(await exists(pendingBatch(root, postId)), false);
	assert.equal(await exists(lockedBatch(root, postId)), true);
	const firstState = await readFile(stateFile(root), "utf8");
	const firstPost = await readFile(postFile, "utf8");
	const output = path.join(
		root,
		"src/assets/images/post-covers",
		`${result.coverId}.webp`,
	);
	const before = await Promise.all(
		[stateFile(root), postFile, output].map(
			async (file) => (await stat(file)).mtimeMs,
		),
	);
	const calls = await networkCalls(root);
	assert.equal(calls.length, 9);
	const second = await runAssign(root, postId);
	assert.deepEqual(second, result);
	assert.equal(await readFile(stateFile(root), "utf8"), firstState);
	assert.equal(await readFile(postFile, "utf8"), firstPost);
	const after = await Promise.all(
		[stateFile(root), postFile, output].map(
			async (file) => (await stat(file)).mtimeMs,
		),
	);
	assert.deepEqual(after, before);
	assert.deepEqual(await networkCalls(root), calls);
	const state = await readJson(stateFile(root));
	assert.equal(
		state.library.filter((cover) => cover.id === result.coverId).length,
		1,
	);
	assert.equal(await exists(pendingBatch(root, postId)), false);
});

test("insufficient compliant expansion exits nonzero without pending or formal mutation", async (t) => {
	const root = await makeRoot(t, { libraryCount: 4, usedCount: 1 });
	const postId = "2026-11-13-expand-failure";
	const postFile = await writePost(root, postId);
	await expansionFixture(root, 7);
	const beforeState = await readFile(stateFile(root), "utf8");
	const beforePost = await readFile(postFile, "utf8");
	const result = runAssignResult(root, postId);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /7.*8|缺口 1/);
	assert.equal(result.stdout.includes('"coverId"'), false);
	assert.equal(await exists(pendingBatch(root, postId)), false);
	assert.equal(await readFile(stateFile(root), "utf8"), beforeState);
	assert.equal(await readFile(postFile, "utf8"), beforePost);
});

test("lock validation failure exits nonzero without reporting success", async (t) => {
	const root = await makeRoot(t);
	const postId = "2026-11-13-lock-failure";
	const postFile = await writePost(root, postId, { withLang: false });
	const beforeState = await readFile(stateFile(root), "utf8");
	const beforePost = await readFile(postFile, "utf8");
	const result = runAssignResult(root, postId);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /no lang field/);
	assert.equal(result.stdout.includes('"coverId"'), false);
	assert.equal(await readFile(stateFile(root), "utf8"), beforeState);
	assert.equal(await readFile(postFile, "utf8"), beforePost);
	assert.equal(await exists(lockedBatch(root, postId)), false);
	assert.equal(await exists(pendingBatch(root, postId)), false);
	await writeFile(
		postFile,
		beforePost.replace('tags: ["AI"]', "image: ''\nlang: ''\ntags: [\"AI\"]"),
	);
	const retry = await runAssign(root, postId);
	assert.equal(retry.coverId, "neuro-sama");
	assert.equal(await exists(pendingBatch(root, postId)), false);
});

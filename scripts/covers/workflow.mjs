import { createHash, randomUUID } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { chooseUnusedCover } from "../../src/utils/cover-expansion.ts";

export const COVER_AUTHORIZATION =
	"原页面未见明确再发布许可；仅记录来源，不宣称已获授权，部署前需复核使用范围。";

const QUERIES = [
	"neuro-sama",
	"hatsune_miku computer",
	"library 1girl",
	"math 1girl",
	"physics 1girl",
];
const SAFE_BATCH_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const FORMAT_EXTENSIONS = new Map([
	["jpeg", "jpg"],
	["png", "png"],
	["webp", "webp"],
	["avif", "avif"],
	["gif", "gif"],
	["tiff", "tiff"],
]);

function batchDirectory(root, batchId) {
	if (!SAFE_BATCH_ID.test(batchId)) {
		throw new Error(`Unsafe cover batch ID: ${batchId}`);
	}
	return path.join(root, ".shirones", "cover-expansion", batchId);
}

async function sha256File(file) {
	return createHash("sha256")
		.update(await readFile(file))
		.digest("hex");
}

async function imageFacts(input) {
	const metadata = await sharp(input, { failOn: "error" }).metadata();
	const swapsAxes = (metadata.orientation ?? 1) >= 5;
	const width = swapsAxes ? metadata.height : metadata.width;
	const height = swapsAxes ? metadata.width : metadata.height;
	if (!metadata.format || !width || !height) {
		throw new Error(`Unreadable raster image: ${input}`);
	}
	return {
		width,
		height,
		format: metadata.format,
		fit: width / height < 1.45 ? "blur" : "cover",
	};
}

function assertMinimumSize(post) {
	if (Number(post.width) < 1600 || Number(post.height) < 900) return false;
	return true;
}

export function parseSourcePost(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (
		url.protocol !== "https:" ||
		(url.hostname !== "x.com" && url.hostname !== "twitter.com") ||
		url.search ||
		url.hash
	) {
		return null;
	}
	const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)\/?$/);
	if (!match) return null;
	let author;
	try {
		author = decodeURIComponent(match[1]);
	} catch {
		return null;
	}
	if (!author || author === "i") return null;
	return {
		author,
		sourcePostId: `x-${match[2]}`,
		sourceUrl: `https://${url.hostname}/${match[1]}/status/${match[2]}`,
	};
}

async function libraryCandidate(root, cover) {
	const input = path.join(
		root,
		"src",
		"assets",
		"images",
		"post-covers",
		cover.file,
	);
	const facts = await imageFacts(input);
	return {
		...cover,
		sourcePostId: `library-${cover.id}`,
		sha256: await sha256File(input),
		width: facts.width,
		height: facts.height,
		fit: facts.fit,
		position: "attention",
		input,
	};
}

export async function readState(root) {
	const state = JSON.parse(
		await readFile(path.join(root, "src", "data", "post-covers.json"), "utf8"),
	);
	if (!Array.isArray(state.library) || typeof state.assignments !== "object") {
		throw new Error("Invalid post-covers.json state");
	}
	return state;
}

export async function readBatch(root, batchId) {
	return JSON.parse(
		await readFile(
			path.join(batchDirectory(root, batchId), "batch.json"),
			"utf8",
		),
	);
}

function xmlEscape(value) {
	return String(value).replace(
		/[&<>"']/g,
		(character) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				'"': "&quot;",
				"'": "&apos;",
			})[character],
	);
}

async function writeContactSheet(directory, candidates) {
	const composites = [];
	for (const [index, candidate] of candidates.entries()) {
		const x = (index % 4) * 400;
		const y = Math.floor(index / 4) * 250;
		const thumbnail = await sharp(candidate.input, { failOn: "error" })
			.rotate()
			.resize(400, 225, { fit: "cover", position: "attention" })
			.jpeg({ quality: 82 })
			.toBuffer();
		const label = Buffer.from(
			`<svg width="400" height="25"><rect width="400" height="25" fill="#151522"/><text x="10" y="18" fill="#ffffff" font-family="sans-serif" font-size="14">${xmlEscape(candidate.id)}</text></svg>`,
		);
		composites.push(
			{ input: thumbnail, left: x, top: y },
			{ input: label, left: x, top: y + 225 },
		);
	}
	await sharp({
		create: { width: 1600, height: 500, channels: 3, background: "#151522" },
	})
		.composite(composites)
		.jpeg({ quality: 88 })
		.toFile(path.join(directory, "contact-sheet.jpg"));
}

function sourceManifest(batch) {
	const lines = [
		`# ${batch.id} 来源清单`,
		"",
		`状态：${batch.status}。授权复核前不得部署。`,
		"",
	];
	for (const candidate of batch.candidates) {
		lines.push(
			`## ${candidate.id}`,
			"",
			`- 作者：${candidate.author}`,
			`- 原作页：${candidate.sourceUrl}`,
			`- 下载 URL：${candidate.downloadUrl ?? "复用正式图库文件，未下载"}`,
			`- 来源 ID：${candidate.sourcePostId}`,
			`- SHA-256：${candidate.sha256}`,
			`- 实际尺寸：${candidate.width}×${candidate.height}`,
			`- 裁切：${candidate.fit} / ${candidate.position}`,
			`- 替代文本（实际标签）：${candidate.alt}`,
			`- 授权：${candidate.authorization}`,
			"",
		);
	}
	return lines.join("\n");
}

export async function writeBatch(
	root,
	batch,
	directory = batchDirectory(root, batch.id),
) {
	try {
		await readFile(path.join(directory, "batch.json"), "utf8");
		throw new Error(`Cover batch already exists: ${batch.id}`);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	await mkdir(directory, { recursive: true });
	try {
		await writeContactSheet(directory, batch.candidates);
		await writeFile(
			path.join(directory, "sources.md"),
			sourceManifest(batch),
			"utf8",
		);
		await writeFile(
			path.join(directory, "batch.json"),
			`${JSON.stringify(batch, null, "\t")}\n`,
			"utf8",
		);
		return batch;
	} catch (error) {
		await rm(directory, { recursive: true, force: true });
		throw error;
	}
}

export async function createAssignmentBatch(root, post, options = {}) {
	const expand = options.expand ?? expandCandidates;
	const state = await readState(root);
	const used = new Set(Object.values(state.assignments));
	const unused = state.library.filter((cover) => !used.has(cover.id));
	let expanded = [];
	if (unused.length < 4) {
		const expansion = await expand(root, { count: 8 });
		expanded = expansion.candidates;
	}
	const reusable = await Promise.all(
		unused.map((cover) => libraryCandidate(root, cover)),
	);
	const pool = [...reusable, ...expanded];
	const proposed = chooseUnusedCover(post, pool, state.assignments);
	const candidates = [
		proposed,
		...pool.filter((candidate) => candidate.id !== proposed.id),
	].slice(0, 4);
	if (candidates.length < 4) {
		throw new Error(
			`Cover assignment requires 4 candidates; got ${candidates.length}`,
		);
	}
	const batch = {
		id: `batch-${post.id}`,
		postId: post.id,
		status: "pending",
		proposedCoverId: proposed.id,
		candidates,
	};
	await writeBatch(root, batch);
	return batch;
}

async function fetchJson(fetchImpl, url) {
	try {
		const response = await fetchImpl(url);
		if (!response.ok) return [];
		const data = await response.json();
		if (Array.isArray(data)) return data;
		return Array.isArray(data.post) ? data.post : [];
	} catch {
		return [];
	}
}

function parseSafebooruDownload(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	const trustedHost =
		url.hostname === "safebooru.org" || url.hostname.endsWith(".safebooru.org");
	const imagePath = /^\/+images\/.+\.(?:jpe?g|png|webp|avif|gif|tiff)$/i;
	if (
		url.protocol !== "https:" ||
		!trustedHost ||
		url.username ||
		url.password ||
		url.port ||
		url.hash ||
		!imagePath.test(url.pathname)
	) {
		return null;
	}
	return url;
}

async function downloadCandidate({
	staging,
	post,
	fetchImpl,
	existingHashes,
	existingSources,
	existingIds,
}) {
	if (
		!post ||
		!["general", "safe"].includes(String(post.rating).toLowerCase())
	) {
		return null;
	}
	if (!assertMinimumSize(post)) return null;
	const source = parseSourcePost(post.source);
	if (!source || existingSources.has(source.sourceUrl)) return null;
	if (existingIds.has(source.sourcePostId)) return null;
	const download = parseSafebooruDownload(post.file_url);
	if (!download) return null;
	const directory = path.join(staging, source.sourcePostId);
	try {
		await mkdir(directory, { recursive: false });
		const response = await fetchImpl(download.href);
		if (!response.ok) throw new Error(`Download failed: ${response.status}`);
		const bytes = Buffer.from(await response.arrayBuffer());
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		if (existingHashes.has(sha256)) {
			await rm(directory, { recursive: true, force: true });
			return null;
		}
		const input = path.join(directory, "download");
		await writeFile(input, bytes, { flag: "wx" });
		const facts = await imageFacts(input);
		if (facts.width < 1600 || facts.height < 900) {
			throw new Error(
				`Actual image is too small: ${facts.width}x${facts.height}`,
			);
		}
		const extension = FORMAT_EXTENSIONS.get(facts.format);
		if (!extension)
			throw new Error(`Unsupported raster format: ${facts.format}`);
		const tags = typeof post.tags === "string" ? post.tags.trim() : "";
		if (!tags) throw new Error("Actual tags are required for alternative text");
		const finalInput = path.join(directory, `source.${extension}`);
		await rename(input, finalInput);
		existingHashes.add(sha256);
		existingSources.add(source.sourceUrl);
		existingIds.add(source.sourcePostId);
		return {
			id: source.sourcePostId,
			file: `${source.sourcePostId}.${extension}`,
			alt: tags,
			themes: tags.split(/\s+/),
			sourceSite: "X",
			sourceUrl: source.sourceUrl,
			author: source.author,
			authorization: COVER_AUTHORIZATION,
			sourcePostId: source.sourcePostId,
			sha256,
			width: facts.width,
			height: facts.height,
			fit: facts.fit,
			position: "attention",
			input: finalInput,
			downloadUrl: download.href,
		};
	} catch {
		await rm(directory, { recursive: true, force: true });
		return null;
	}
}

export async function expandCandidates(
	root,
	{ count = 8, fetchImpl = fetch } = {},
) {
	if (!Number.isInteger(count) || count < 1 || count > 8) {
		throw new Error("Expansion count must be an integer from 1 to 8");
	}
	const state = await readState(root);
	const existingHashes = new Set();
	const existingSources = new Set();
	const existingIds = new Set();
	for (const cover of state.library) {
		existingHashes.add(
			await sha256File(
				path.join(root, "src", "assets", "images", "post-covers", cover.file),
			),
		);
		existingSources.add(cover.sourceUrl);
		existingIds.add(cover.id);
		const source = parseSourcePost(cover.sourceUrl);
		if (source) existingIds.add(source.sourcePostId);
	}
	const temporaryParent = path.join(root, ".shirones");
	await mkdir(temporaryParent, { recursive: true });
	const staging = await mkdtemp(path.join(temporaryParent, ".expand-staging-"));
	const batchId = `expand-${randomUUID()}`;
	const finalDirectory = path.join(
		root,
		".shirones",
		"cover-expansion-candidates",
		batchId,
	);
	const candidates = [];
	try {
		for (const query of QUERIES) {
			if (candidates.length >= count) break;
			const url = new URL("https://safebooru.org/index.php");
			url.search = new URLSearchParams({
				page: "dapi",
				s: "post",
				q: "index",
				json: "1",
				tags: query,
				limit: "100",
			}).toString();
			const posts = await fetchJson(fetchImpl, url.href);
			for (const post of posts) {
				if (candidates.length >= count) break;
				const candidate = await downloadCandidate({
					staging,
					post,
					fetchImpl,
					existingHashes,
					existingSources,
					existingIds,
				});
				if (candidate) candidates.push(candidate);
			}
		}
		if (candidates.length < count) {
			throw new Error(
				`Compliant cover candidates ${candidates.length}/${count}; 缺口 ${count - candidates.length}，未写入扩充批次`,
			);
		}
		await mkdir(path.dirname(finalDirectory), { recursive: true });
		await rename(staging, finalDirectory);
		for (const candidate of candidates) {
			candidate.input = path.join(
				finalDirectory,
				path.relative(staging, candidate.input),
			);
		}
		const batch = {
			id: batchId,
			postId: "library-expansion",
			status: "pending",
			proposedCoverId: candidates[0].id,
			candidates,
		};
		await writeBatch(root, batch, finalDirectory);
		return batch;
	} catch (error) {
		await rm(staging, { recursive: true, force: true });
		await rm(finalDirectory, { recursive: true, force: true });
		throw error;
	}
}

import { createHash, randomUUID } from "node:crypto";
import {
	copyFile,
	mkdir,
	mkdtemp,
	open,
	readdir,
	readFile,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { parse } from "yaml";
import { validatePostCoverLibrary } from "../../src/utils/post-covers.ts";
import { parseSourcePost, readBatch, readState } from "./workflow.mjs";

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const SAFE_COVER_ID = /^[a-z0-9][a-z0-9-]*$/;
const LOCK_WAIT_MS = 30_000;
const LOCK_RETRY_MS = 25;
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

function paths(root, batchId) {
	if (!SAFE_ID.test(batchId))
		throw new Error(`Unsafe cover batch ID: ${batchId}`);
	return {
		pending: path.join(root, ".shirones", "cover-expansion", batchId),
		locked: path.join(root, ".shirones", "cover-expansion-locked", batchId),
	};
}

async function hasTransactionArtifacts(root) {
	try {
		return (await readdir(transactionsPath(root))).length > 0;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}

function lockPath(root) {
	return path.join(root, ".shirones", "cover-lock.lock");
}

function transactionsPath(root) {
	return path.join(root, ".shirones", "cover-transactions");
}

async function exists(file) {
	try {
		await stat(file);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}

async function readJson(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function durableWrite(file, source, flag = "w") {
	const handle = await open(file, flag);
	try {
		await handle.writeFile(source, "utf8");
		await handle.sync();
	} finally {
		await handle.close();
	}
}

async function durableCopy(source, target) {
	await copyFile(source, target);
	const handle = await open(target, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

async function persistJournal(journal) {
	const temporary = path.join(journal.directory, `journal-${randomUUID()}.tmp`);
	await durableWrite(
		temporary,
		`${JSON.stringify({ ...journal, directory: undefined }, null, "\t")}\n`,
		"wx",
	);
	await rename(temporary, path.join(journal.directory, "journal.json"));
}

async function restoreTransaction(journal) {
	const lockedExists = await exists(journal.lockedDirectory);
	const pendingExists = await exists(journal.pendingDirectory);
	if (lockedExists && pendingExists) {
		throw new Error(
			`Cannot recover cover transaction; both batch paths exist: ${journal.batchId}`,
		);
	}
	if (lockedExists) {
		await mkdir(path.dirname(journal.pendingDirectory), { recursive: true });
		await rename(journal.lockedDirectory, journal.pendingDirectory);
	}
	for (const [index, target] of journal.targets.toReversed().entries()) {
		if (!target.existed) {
			await rm(target.target, { force: true });
			continue;
		}
		if (!(await exists(target.backup))) {
			throw new Error(`Cover transaction backup is missing: ${target.backup}`);
		}
		const restored = path.join(journal.directory, `restore-${index}`);
		await durableCopy(target.backup, restored);
		await mkdir(path.dirname(target.target), { recursive: true });
		await rename(restored, target.target);
	}
}

async function recoverTransactions(root) {
	const directory = transactionsPath(root);
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const transactionDirectory = path.join(directory, entry.name);
		const journalPath = path.join(transactionDirectory, "journal.json");
		if (!(await exists(journalPath))) {
			await rm(transactionDirectory, { recursive: true, force: true });
			continue;
		}
		const journal = await readJson(journalPath);
		journal.directory = transactionDirectory;
		if (journal.status !== "committed") await restoreTransaction(journal);
		await rm(transactionDirectory, { recursive: true, force: true });
	}
}

async function lockOwner(root) {
	const file = lockPath(root);
	try {
		const [info, source] = await Promise.all([
			stat(file),
			readFile(file, "utf8"),
		]);
		try {
			return { ...JSON.parse(source), mtimeMs: info.mtimeMs };
		} catch {
			return { pid: null, token: null, mtimeMs: info.mtimeMs };
		}
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}

function processAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code !== "ESRCH";
	}
}

function staleOwner(owner) {
	if (!owner) return false;
	if (processAlive(owner.pid)) return false;
	return owner.pid !== null || Date.now() - owner.mtimeMs > 1000;
}

async function recoverIfOrphaned(root) {
	const owner = await lockOwner(root);
	if (owner && !staleOwner(owner)) return;
	await recoverTransactions(root);
}

async function reclaimStaleLock(root, expected) {
	await recoverTransactions(root);
	const file = lockPath(root);
	if (!(await exists(file))) return;
	const quarantine = `${file}.${randomUUID()}.stale`;
	try {
		await rename(file, quarantine);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
	const moved = await readFile(quarantine, "utf8").catch(() => "");
	if (moved !== expected.raw) {
		if (!(await exists(file))) await rename(quarantine, file);
		else await rm(quarantine, { force: true });
		return;
	}
	await rm(quarantine, { force: true });
}

async function acquireLock(root) {
	await mkdir(path.dirname(lockPath(root)), { recursive: true });
	await recoverIfOrphaned(root);
	const token = randomUUID();
	const file = lockPath(root);
	const deadline = Date.now() + LOCK_WAIT_MS;
	for (;;) {
		try {
			await durableWrite(
				file,
				JSON.stringify({ pid: process.pid, token, createdAt: Date.now() }),
				"wx",
			);
			try {
				await recoverTransactions(root);
			} catch (error) {
				await rm(file, { force: true });
				throw error;
			}
			return async () => {
				const owner = await lockOwner(root);
				if (owner?.token === token) await rm(file, { force: true });
			};
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		const owner = await lockOwner(root);
		if (!owner) continue;
		if (staleOwner(owner)) {
			const raw = await readFile(file, "utf8").catch(() => "");
			await reclaimStaleLock(root, { ...owner, raw });
			continue;
		}
		if (Date.now() >= deadline) {
			throw new Error(
				`Timed out waiting for cover lock held by PID ${owner.pid}`,
			);
		}
		await delay(LOCK_RETRY_MS);
	}
}

async function sha256File(file) {
	return createHash("sha256")
		.update(await readFile(file))
		.digest("hex");
}

function coverImage(file) {
	return `../../assets/images/post-covers/${file}`;
}

function postPath(root, postId) {
	if (!SAFE_ID.test(postId)) throw new Error(`Unsafe post ID: ${postId}`);
	return path.join(root, "src", "content", "posts", `${postId}.md`);
}

function formalEntry(candidate) {
	return {
		id: candidate.id,
		file: `${candidate.id}.webp`,
		alt: candidate.alt,
		themes: candidate.themes,
		sourceSite: candidate.sourceSite,
		sourceUrl: candidate.sourceUrl,
		author: candidate.author,
		authorization: candidate.authorization,
	};
}

function sourceIds(cover) {
	const ids = new Set([cover.id, `library-${cover.id}`]);
	const source = parseSourcePost(cover.sourceUrl);
	if (source) ids.add(source.sourcePostId);
	return ids;
}

async function formalRecords(root, library) {
	return Promise.all(
		library.map(async (cover) => ({
			cover,
			sha256: await sha256File(
				path.join(root, "src", "assets", "images", "post-covers", cover.file),
			),
			sourceIds: sourceIds(cover),
		})),
	);
}

function assertCandidateUnused(candidate, records) {
	const assigned = records.find(({ cover }) => cover.id === candidate.id);
	for (const record of records) {
		const sameId = record.cover.id === candidate.id;
		if (sameId) {
			if (
				record.cover.sourceUrl !== candidate.sourceUrl ||
				record.sha256 !== candidate.sha256 ||
				!record.sourceIds.has(candidate.sourcePostId)
			) {
				throw new Error(`Cover ID metadata mismatch: ${candidate.id}`);
			}
			continue;
		}
		if (
			record.cover.sourceUrl === candidate.sourceUrl ||
			record.sourceIds.has(candidate.sourcePostId) ||
			record.sha256 === candidate.sha256
		) {
			throw new Error(
				`Cover source or SHA-256 already occupied: ${candidate.id}`,
			);
		}
	}
	return assigned?.cover ?? null;
}

function replaceFrontmatterImage(source, postId, image) {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) throw new Error(`Post has no frontmatter: ${postId}`);
	const newline = source.includes("\r\n") ? "\r\n" : "\n";
	const lines = match[1].split(/\r?\n/);
	const imageIndexes = lines
		.map((line, index) => (/^image\s*:/.test(line) ? index : -1))
		.filter((index) => index >= 0);
	if (imageIndexes.length > 1) {
		throw new Error(`Post has duplicate image fields: ${postId}`);
	}
	const imageLine = `image: ${JSON.stringify(image)}`;
	if (imageIndexes.length === 1) {
		lines[imageIndexes[0]] = imageLine;
	} else {
		const langIndex = lines.findIndex((line) => /^lang\s*:/.test(line));
		if (langIndex < 0) throw new Error(`Post has no lang field: ${postId}`);
		lines.splice(langIndex, 0, imageLine);
	}
	const replacement = match[0].replace(match[1], () => lines.join(newline));
	return (
		source.slice(0, match.index) +
		replacement +
		source.slice(match.index + match[0].length)
	);
}

function frontmatterParts(source, postId) {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) throw new Error(`Post has no frontmatter: ${postId}`);
	return {
		frontmatter: parse(match[1]),
		body: source.slice(match.index + match[0].length),
	};
}

async function renderCover(input, output, candidate) {
	const metadata = await sharp(input, { failOn: "error" }).metadata();
	const swapsAxes = (metadata.orientation ?? 1) >= 5;
	const width = swapsAxes ? metadata.height : metadata.width;
	const height = swapsAxes ? metadata.width : metadata.height;
	if (!width || !height || width < 1600 || height < 900) {
		throw new Error(
			`Candidate source is too small for ${candidate.fit}: ${width ?? 0}x${height ?? 0}; minimum 1600x900 without enlargement`,
		);
	}
	if (candidate.fit === "cover") {
		await sharp(input, { failOn: "error" })
			.rotate()
			.resize(1600, 900, {
				fit: "cover",
				position: candidate.position,
				withoutEnlargement: true,
			})
			.webp({ quality: 86 })
			.toFile(output);
		return;
	}
	if (candidate.fit !== "blur")
		throw new Error(`Unknown cover fit: ${candidate.fit}`);
	const background = await sharp(input, { failOn: "error" })
		.rotate()
		.resize(1600, 900, {
			fit: "cover",
			position: candidate.position,
			withoutEnlargement: true,
		})
		.blur(32)
		.modulate({ brightness: 0.55, saturation: 0.8 })
		.png()
		.toBuffer();
	const foreground = await sharp(input, { failOn: "error" })
		.rotate()
		.resize(1600, 900, { fit: "inside", withoutEnlargement: true })
		.png()
		.toBuffer();
	await sharp(background)
		.composite([{ input: foreground, gravity: "center" }])
		.webp({ quality: 86 })
		.toFile(output);
}

async function lockedResult(root, directory) {
	const batch = await readJson(path.join(directory, "batch.json"));
	const state = await readState(root);
	if (state.assignments[batch.postId] !== batch.proposedCoverId) {
		throw new Error(`Locked cover assignment mismatch: ${batch.id}`);
	}
	const cover = state.library.find(
		(entry) => entry.id === batch.proposedCoverId,
	);
	if (!cover)
		throw new Error(`Locked cover is missing from library: ${batch.id}`);
	return {
		postId: batch.postId,
		coverId: cover.id,
		image: coverImage(cover.file),
	};
}

async function lockBatchInternal(root, batchId, hooks = {}, lockHeld = false) {
	const directories = paths(root, batchId);
	const release = lockHeld ? null : await acquireLock(root);
	try {
		if (hooks.afterLock) await hooks.afterLock({ batchId });
		if (!(await exists(path.join(directories.pending, "batch.json")))) {
			if (await exists(path.join(directories.locked, "batch.json"))) {
				return await lockedResult(root, directories.locked);
			}
			throw new Error(`Cover batch not found: ${batchId}`);
		}

		const [batch, state] = await Promise.all([
			readBatch(root, batchId),
			readState(root),
		]);
		if (batch.id !== batchId || batch.status !== "pending") {
			throw new Error(`Invalid pending cover batch: ${batchId}`);
		}
		if (Object.hasOwn(state.assignments, batch.postId)) {
			throw new Error(`Post already has a cover assignment: ${batch.postId}`);
		}
		const candidate = batch.candidates.find(
			(entry) => entry.id === batch.proposedCoverId,
		);
		if (!candidate || !SAFE_COVER_ID.test(candidate.id)) {
			throw new Error(`Invalid proposed cover: ${batch.proposedCoverId}`);
		}
		if (Object.values(state.assignments).includes(candidate.id)) {
			throw new Error(`Cover is already assigned: ${candidate.id}`);
		}
		const records = await formalRecords(root, state.library);
		const existing = assertCandidateUnused(candidate, records);
		const file = existing?.file ?? `${candidate.id}.webp`;
		const result = {
			postId: batch.postId,
			coverId: candidate.id,
			image: coverImage(file),
		};
		const nextState = structuredClone(state);
		nextState.assignments[batch.postId] = candidate.id;
		if (!existing) nextState.library.push(formalEntry(candidate));
		validatePostCoverLibrary(nextState.library);
		if (
			new Set(Object.values(nextState.assignments)).size !==
			Object.keys(nextState.assignments).length
		) {
			throw new Error(`Duplicate cover assignment for post: ${batch.postId}`);
		}

		const markdownPath = postPath(root, batch.postId);
		const markdown = await readFile(markdownPath, "utf8");
		const nextMarkdown = replaceFrontmatterImage(
			markdown,
			batch.postId,
			result.image,
		);
		const input = path.resolve(root, candidate.input);
		const rootPrefix = path.resolve(root) + path.sep;
		if (!input.startsWith(rootPrefix))
			throw new Error(`Cover input escapes project root: ${candidate.id}`);
		const output = path.join(
			root,
			"src",
			"assets",
			"images",
			"post-covers",
			file,
		);
		if (!existing && (await exists(output)))
			throw new Error(`Cover asset already exists: ${file}`);

		await mkdir(transactionsPath(root), { recursive: true });
		const transactionDirectory = await mkdtemp(
			path.join(transactionsPath(root), "transaction-"),
		);
		const staging = path.join(transactionDirectory, "staging");
		const backups = path.join(transactionDirectory, "backups");
		await mkdir(staging);
		await mkdir(backups);
		const stagedState = path.join(staging, "post-covers.json");
		const stagedPost = path.join(staging, "post.md");
		const stagedImage = path.join(staging, "cover.webp");
		let journal = null;
		let cleaned = false;
		try {
			await writeFile(
				stagedState,
				`${JSON.stringify(nextState, null, "\t")}\n`,
				"utf8",
			);
			await writeFile(stagedPost, nextMarkdown, "utf8");
			if (!existing) await renderCover(input, stagedImage, candidate);

			const validatedState = await readJson(stagedState);
			if (!isDeepStrictEqual(validatedState, nextState))
				throw new Error("Staged cover state validation failed");
			validatePostCoverLibrary(validatedState.library);
			const validatedMarkdown = await readFile(stagedPost, "utf8");
			const beforeParts = frontmatterParts(markdown, batch.postId);
			const afterParts = frontmatterParts(validatedMarkdown, batch.postId);
			if (
				afterParts.frontmatter.image !== result.image ||
				afterParts.body !== beforeParts.body
			) {
				throw new Error("Staged frontmatter validation failed");
			}
			if (!existing) {
				const metadata = await sharp(stagedImage, {
					failOn: "error",
				}).metadata();
				if (
					metadata.format !== "webp" ||
					metadata.width !== 1600 ||
					metadata.height !== 900
				) {
					throw new Error(
						`Staged cover must be 1600x900 WebP: ${candidate.id}`,
					);
				}
				if ((await sha256File(input)) !== candidate.sha256) {
					throw new Error(`Candidate input SHA-256 mismatch: ${candidate.id}`);
				}
			}

			const statePath = path.join(root, "src", "data", "post-covers.json");
			const targets = [
				...(!existing
					? [{ step: "asset", staged: stagedImage, target: output }]
					: []),
				{ step: "state", staged: stagedState, target: statePath },
				{ step: "frontmatter", staged: stagedPost, target: markdownPath },
			];
			for (const [index, target] of targets.entries()) {
				target.existed = await exists(target.target);
				target.backup = target.existed
					? path.join(backups, `backup-${index}`)
					: null;
				if (target.existed) await durableCopy(target.target, target.backup);
			}
			journal = {
				version: 1,
				status: "committing",
				batchId,
				directory: transactionDirectory,
				pendingDirectory: directories.pending,
				lockedDirectory: directories.locked,
				targets,
				newFiles: targets
					.filter((target) => !target.existed)
					.map((target) => target.target),
				completedRenames: [],
			};
			await persistJournal(journal);
			try {
				for (const target of targets) {
					await rename(target.staged, target.target);
					journal.completedRenames.push({
						step: target.step,
						target: target.target,
					});
					await persistJournal(journal);
					if (hooks.afterRename) {
						await hooks.afterRename({
							step: target.step,
							target: target.target,
							journal,
						});
					}
				}
				await mkdir(path.dirname(directories.locked), { recursive: true });
				await rename(directories.pending, directories.locked);
				journal.completedRenames.push({
					step: "archive",
					target: directories.locked,
				});
				await persistJournal(journal);
				if (hooks.afterRename) {
					await hooks.afterRename({
						step: "archive",
						target: directories.locked,
						journal,
					});
				}
				journal.status = "committed";
				await persistJournal(journal);
			} catch (error) {
				try {
					await restoreTransaction(journal);
					await rm(transactionDirectory, { recursive: true, force: true });
					cleaned = true;
				} catch (rollbackError) {
					throw new AggregateError(
						[error, rollbackError],
						"Cover lock rollback failed; recovery journal retained",
					);
				}
				throw error;
			}
			await rm(transactionDirectory, { recursive: true, force: true });
			cleaned = true;
			return result;
		} finally {
			if (!journal && !cleaned) {
				await rm(transactionDirectory, { recursive: true, force: true });
			}
		}
	} catch (error) {
		if (
			hooks.discardPendingOnFailure &&
			!(await hasTransactionArtifacts(root))
		) {
			await rm(directories.pending, { recursive: true, force: true });
		}
		throw error;
	} finally {
		if (release) await release();
	}
}

export async function lockBatch(root, batchId, hooks = {}) {
	return lockBatchInternal(root, batchId, hooks);
}

export async function resolvePostAssignment(root, postId) {
	if (!SAFE_ID.test(postId)) throw new Error(`Unsafe post ID: ${postId}`);
	const release = await acquireLock(root);
	try {
		const batchId = `batch-${postId}`;
		const directories = paths(root, batchId);
		if (
			(await exists(path.join(directories.pending, "batch.json"))) ||
			(await exists(path.join(directories.locked, "batch.json")))
		) {
			return await lockBatchInternal(root, batchId, {}, true);
		}
		const state = await readState(root);
		if (!Object.hasOwn(state.assignments, postId)) {
			throw new Error(`Post has no cover assignment: ${postId}`);
		}
		const coverId = state.assignments[postId];
		const cover = state.library.find((entry) => entry.id === coverId);
		if (!cover) {
			throw new Error(`Assigned cover is missing from library: ${coverId}`);
		}
		validatePostCoverLibrary(state.library);
		if (
			new Set(Object.values(state.assignments)).size !==
			Object.keys(state.assignments).length
		) {
			throw new Error(`Duplicate cover assignment for post: ${postId}`);
		}
		if (
			!(await exists(
				path.join(root, "src", "assets", "images", "post-covers", cover.file),
			))
		) {
			throw new Error(`Assigned cover asset is missing: ${cover.file}`);
		}
		return { postId, coverId, image: coverImage(cover.file) };
	} finally {
		await release();
	}
}

export function parseBatchId(argv) {
	if (argv[0] === "--batch" || argv[0] === "--") return argv[1];
	return argv[0];
}

export async function main(argv = process.argv.slice(2)) {
	const batchId = parseBatchId(argv);
	if (!batchId)
		throw new Error("Usage: node scripts/covers/lock.mjs <batch-id>");
	const result = await lockBatch(projectRoot, batchId);
	console.log(
		`Locked ${batchId}: ${result.postId} -> ${result.coverId} (${result.image})`,
	);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}

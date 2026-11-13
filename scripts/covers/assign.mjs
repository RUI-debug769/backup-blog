import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { lockBatch, resolvePostAssignment } from "./lock.mjs";
import { createAssignmentBatch, readBatch, readState } from "./workflow.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function readPostSubject(projectRoot, postId) {
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(postId)) {
		throw new Error(`Unsafe post ID: ${postId}`);
	}
	const file = path.join(
		projectRoot,
		"src",
		"content",
		"posts",
		`${postId}.md`,
	);
	const source = await readFile(file, "utf8");
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) throw new Error(`Post has no frontmatter: ${postId}`);
	const frontmatter = parse(match[1]);
	if (typeof frontmatter?.title !== "string" || !frontmatter.title.trim()) {
		throw new Error(`Post title is required: ${postId}`);
	}
	const tags = Array.isArray(frontmatter.tags)
		? frontmatter.tags.filter((tag) => typeof tag === "string")
		: [];
	return {
		id: postId,
		title: frontmatter.title,
		...(typeof frontmatter.category === "string"
			? { category: frontmatter.category }
			: {}),
		tags,
	};
}

function postArgument(argv) {
	const index = argv.indexOf("--post");
	if (index >= 0) return argv[index + 1];
	return argv.find((argument) => !argument.startsWith("--"));
}

async function createOrResumeAssignmentBatch(projectRoot, post) {
	try {
		return await createAssignmentBatch(projectRoot, post);
	} catch (error) {
		let existing;
		try {
			existing = await readBatch(projectRoot, `batch-${post.id}`);
		} catch {
			throw error;
		}
		if (
			existing.id !== `batch-${post.id}` ||
			existing.postId !== post.id ||
			existing.status !== "pending"
		) {
			throw error;
		}
		return existing;
	}
}

function printResult(result) {
	console.log(JSON.stringify(result));
	return result;
}

export async function main(argv = process.argv.slice(2)) {
	const postId = postArgument(argv);
	if (!postId)
		throw new Error("Usage: node scripts/covers/assign.mjs --post <id>");
	const post = await readPostSubject(root, postId);
	const state = await readState(root);
	if (Object.hasOwn(state.assignments, postId)) {
		return printResult(await resolvePostAssignment(root, postId));
	}
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		const batch = await createOrResumeAssignmentBatch(root, post);
		try {
			const result = await lockBatch(root, batch.id, {
				discardPendingOnFailure: true,
			});
			return printResult(result);
		} catch (error) {
			const retryable =
				error instanceof Error &&
				(/^Cover is already assigned:/.test(error.message) ||
					/^Cover source or SHA-256 already occupied:/.test(error.message) ||
					/^Cover batch not found:/.test(error.message));
			if (!retryable || attempt === 4) throw error;
		}
	}
	throw new Error(`Cover assignment retry exhausted: ${postId}`);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}

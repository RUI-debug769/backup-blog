import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { createAssignmentBatch } from "./workflow.mjs";

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

export async function main(argv = process.argv.slice(2)) {
	const postId = postArgument(argv);
	if (!postId)
		throw new Error("Usage: node scripts/covers/assign.mjs --post <id>");
	const post = await readPostSubject(root, postId);
	const batch = await createAssignmentBatch(root, post);
	console.log(
		`Pending ${batch.id}: ${batch.proposedCoverId}; ${batch.candidates.length} candidates. Formal state and frontmatter unchanged.`,
	);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}

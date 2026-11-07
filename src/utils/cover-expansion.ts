import type { CoverBatch, PostCoverSubject } from "@/types/postCoverExpansion";
import type { PostCover, PostCoverAssignments } from "@/types/postCovers";
import { hashPostId } from "./post-covers.ts";

const TOPIC_WORDS: Record<string, string[]> = {
	人工智能: ["ai", "硬件", "计算机", "编程", "代码", "模型"],
	写作: ["写作", "记录", "随笔", "思考"],
	数学: ["数学", "逻辑", "公式"],
	物理: ["物理", "电路", "硬件", "嵌入式"],
};

export function rankCandidateThemes(
	post: PostCoverSubject,
	cover: PostCover,
): number {
	const text =
		`${post.title} ${post.category ?? ""} ${post.tags.join(" ")}`.toLowerCase();
	return cover.themes.reduce((score, theme) => {
		const direct = text.includes(theme.toLowerCase()) ? 1 : 0;
		const aliases = TOPIC_WORDS[theme] ?? [];
		return (
			score + direct + aliases.filter((word) => text.includes(word)).length
		);
	}, 0);
}

export function chooseUnusedCover(
	post: PostCoverSubject,
	library: PostCover[],
	assignments: PostCoverAssignments,
	hash: (value: string) => number = hashPostId,
): PostCover {
	const used = new Set(Object.values(assignments));
	const available = library.filter((cover) => !used.has(cover.id));
	if (available.length === 0) {
		throw new Error(
			`No unused cover is available for post ${post.id}; run pnpm covers:expand`,
		);
	}
	return [...available].sort((a, b) => {
		const scoreDifference =
			rankCandidateThemes(post, b) - rankCandidateThemes(post, a);
		if (scoreDifference !== 0) return scoreDifference;
		const hashDifference =
			hash(`${post.id}:${a.id}`) - hash(`${post.id}:${b.id}`);
		if (hashDifference !== 0) return hashDifference;
		if (a.id < b.id) return -1;
		if (a.id > b.id) return 1;
		return 0;
	})[0];
}

export function assertNoPendingCoverBatches(batches: CoverBatch[]): void {
	if (batches.length === 0) return;
	const pending = batches
		.map((batch) => `batch ${batch.id} (post ${batch.postId})`)
		.join(", ");
	throw new Error(`Pending cover batches block the build: ${pending}`);
}

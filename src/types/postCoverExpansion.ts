import type { PostCover } from "./postCovers";

export interface PostCoverSubject {
	id: string;
	title: string;
	category?: string;
	tags: string[];
}

export interface CoverCandidate extends PostCover {
	sourcePostId: string;
	sha256: string;
	width: number;
	height: number;
	fit: "cover" | "blur";
	position: "attention" | "center";
	input: string;
}

export interface CoverBatch {
	id: string;
	postId: string;
	status: "pending";
	proposedCoverId: string;
	candidates: CoverCandidate[];
}

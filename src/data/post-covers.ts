import type { PostCover, PostCoverAssignments } from "@/types/postCovers";
import state from "./post-covers.json" with { type: "json" };

export const postCoverLibrary: PostCover[] = state.library as PostCover[];
export const postCoverAssignments: PostCoverAssignments = state.assignments as PostCoverAssignments;

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { postCoverAssignments, postCoverLibrary } = await import(
	"../../src/data/post-covers.ts"
);
const state = { library: postCoverLibrary, assignments: postCoverAssignments };
await writeFile(
	root + "src/data/post-covers.json",
	JSON.stringify(state, null, "\t") + "\n",
	"utf8",
);

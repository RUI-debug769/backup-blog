import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandCandidates } from "./workflow.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function main(argv = process.argv.slice(2)) {
	const index = argv.indexOf("--count");
	const count = index >= 0 ? Number(argv[index + 1]) : 8;
	const batch = await expandCandidates(root, { count });
	console.log(
		`Pending ${batch.id}: ${batch.candidates.length} compliant candidates.`,
	);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}

// Bilingual build: Chinese site at "/", English site mirrored under "/en/".
// Runs two Astro builds (zh -> dist, en -> dist-en) then merges dist-en into dist/en.
import { execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const run = (env = {}) =>
	execSync("pnpm build", {
		cwd: root,
		stdio: "inherit",
		env: { ...process.env, ...env },
	});

console.log("\n=== [1/3] Building Chinese site (base /) ===");
run(); // default zh_CN -> dist

console.log("\n=== [2/3] Building English site (base /en/) ===");
run({ SITE_LANG: "en" }); // en -> dist-en

console.log("\n=== [3/3] Merging English site into dist/en ===");
rmSync(path.join(root, "dist", "en"), { recursive: true, force: true });
cpSync(path.join(root, "dist-en"), path.join(root, "dist", "en"), {
	recursive: true,
});
console.log("Done: zh at /, en at /en/");

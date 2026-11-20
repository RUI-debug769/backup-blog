import { defineConfig } from "astro/config";
import shirones from "./src/integration/index.ts";

// The integration drives every mode, this repository included: integrations,
// fonts, markdown, vite aliases/plugins, trailingSlash and the image endpoint
// all come from `src/integration/` and `src/config/integrationsConfig.ts`.
// Do not re-add per-mode config here — update `src/config/` so both modes
// stay in lockstep (see `src/config/README.md`).

// Bilingual build: default (zh) builds the Chinese site into ./dist at base "/";
// SITE_LANG=en builds the English site into ./dist-en at base "/en".
// A merge step then copies dist-en into dist/en so both are served together.
const isEn = process.env.SITE_LANG === "en";

export default defineConfig({
	base: isEn ? "/en/" : "/",
	outDir: isEn ? "./dist-en" : "./dist",
	integrations: [shirones()],
	// 旧博客（自建主题）文章路由是 /blog/<post.id>/，post.id 即文件名；
	// Shirone 默认路由是 /posts/<文件名>/。文件名迁移时保持不变，故一条
	// 动态重定向即可覆盖全部旧文链接。
	redirects: {
		"/blog/[...slug]": "/posts/[...slug]",
	},
});

import { siteConfig } from "@/config/siteConfig";

// 分类名显示映射：仅影响显示（英文构建时），category 原值仍用于过滤与 URL。
const MAP: Record<string, string> = {
	项目: "Projects",
	笔记: "Notes",
	随笔: "Journal",
	产品思考: "Product Thinking",
	工具链: "Toolchain",
	未分类: "Uncategorized",
};

export function displayCategory(cat: string | null | undefined): string {
	if (!cat) return "";
	if ((siteConfig.lang || "").toLowerCase() !== "en") return cat;
	return cat
		.split("/")
		.map((part) => {
			const t = part.trim();
			return MAP[t] ?? t;
		})
		.join(" / ");
}

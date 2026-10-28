/**
 * 项目页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/projectsConfig.ts 控制。
 */
import type { ProjectItem } from "@/types/projectsConfig";

export const projectsData: ProjectItem[] = [
	// ---- 个人仓库（Task 5：从旧站 src/data/github.json 迁移；
	//      Shirone 作者自带的三个演示项目已于 Fix Round 1 删除） ----
	{
		key: "frontier-report",
		title: "frontier-report",
		summary: "AI 前沿日报/周报自动生成与投递：headless Claude 深研 → 严格 JSON 契约 → 暖陶暗色 HTML → SMTP 邮件。纯标准库，零依赖。",
		category: "lab",
		phase: "shipped",
		technologies: ["Python"],
		icon: "material-symbols:mail-outline-rounded",
		repository: "https://github.com/RUI-debug769/frontier-report",
		year: "2026",
	},
	{
		key: "cria-research-lab",
		title: "cria-research-lab",
		summary: "CRIA — Claude Research Intelligence Architecture：AI 增强的科研工作流实验室，科研论五步法的工程化落地。",
		category: "lab",
		phase: "building",
		technologies: ["PowerShell"],
		icon: "material-symbols:science-outline-rounded",
		repository: "https://github.com/RUI-debug769/cria-research-lab",
		year: "2026",
	},
	{
		key: "dsh-dotclaude",
		title: "dsh-dotclaude",
		summary: "在 DeepSeek Harness 里运行 Claude Code 项目的 .claude 资产：项目级斜杠命令（含参数展开）与 permissions.deny 权限执行。",
		category: "lab",
		phase: "shipped",
		technologies: ["TypeScript"],
		icon: "material-symbols:terminal-rounded",
		repository: "https://github.com/RUI-debug769/dsh-dotclaude",
		year: "2026",
	},
	{
		key: "careeratlas-app",
		title: "careeratlas-app",
		summary: "CareerAtlas Web 应用：结构化自我测评 + 职业规划向导，79 题溯源校验题库驱动的 Next.js 测评流程。",
		category: "lab",
		phase: "building",
		technologies: ["TypeScript"],
		icon: "material-symbols:explore-outline-rounded",
		repository: "https://github.com/RUI-debug769/careeratlas-app",
		year: "2026",
	},
	{
		key: "Zotero-MCP-Neo",
		title: "Zotero-MCP-Neo",
		summary: "Zotero 插件：在 Zotero 内嵌入 MCP 服务器，让 AI 助手通过 6 个统一工具完整读写你的文献库。",
		category: "lab",
		phase: "shipped",
		technologies: ["TypeScript"],
		icon: "material-symbols:school-outline-rounded",
		repository: "https://github.com/RUI-debug769/Zotero-MCP-Neo",
		year: "2026",
	},
	{
		key: "backup-ai-brain-tools-v2",
		title: "backup-ai-brain-tools-v2",
		summary: "AI × 脑科学 × 数学：五个学术研究工具——文献周报 Agent、知识挖掘 Pipeline、蛋白设计、动力学识别、模拟加速基准。",
		category: "lab",
		phase: "shipped",
		technologies: ["Python"],
		icon: "material-symbols:psychology-outline-rounded",
		repository: "https://github.com/RUI-debug769/backup-ai-brain-tools-v2",
		year: "2026",
	},

];

/** 获取所有项目数据列表 */
export function getProjectsList(): ProjectItem[] {
	return projectsData;
}

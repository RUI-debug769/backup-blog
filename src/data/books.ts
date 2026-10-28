/**
 * 书单数据（本地手动维护）。
 * 用于书单页：src/pages/books.astro。
 *
 * 添加条目：在 booksData 中追加一项即可，状态筛选 chips 自动生成。
 * - cover 省略时显示渐变占位；
 * - link 省略时封面不可点；rating 为 0-10 个人评分（0 = 未评分）；
 * - status: reading 在读 / planned 想读 / completed 读过 / onHold 搁置。
 */

export type BookStatus = "reading" | "planned" | "completed" | "onHold";

export interface BookItem {
	title: string;
	author?: string;
	/** 封面图地址（相对 /public 或绝对 URL）；省略 = 渐变占位 */
	cover?: string;
	/** 条目外链（豆瓣/出版社页等）；省略则封面不可点 */
	link?: string;
	status: BookStatus;
	/** 个人评分 0-10（0 = 未评分） */
	rating: number;
	/** 一句话感想 */
	description?: string;
	/** 阅读年份 */
	year?: string;
	/** 题材标签 */
	genres: string[];
}

export const BOOK_STATUS_META: Record<
	BookStatus,
	{ label: string; labelZh: string }
> = {
	reading: { label: "Reading", labelZh: "在读" },
	completed: { label: "Completed", labelZh: "读过" },
	planned: { label: "Planned", labelZh: "想读" },
	onHold: { label: "On Hold", labelZh: "搁置" },
};

export const booksData: BookItem[] = [
	// 占位条目（待用户替换为真实书单）
	{
		title: "Gödel, Escher, Bach: An Eternal Golden Braid",
		author: "Douglas Hofstadter",
		status: "reading",
		rating: 0,
		description: "自指与意识的怪圈。",
		year: "1979",
		genres: ["Math", "Cognition"],
	},
	{
		title: "Consciousness Explained",
		author: "Daniel C. Dennett",
		status: "planned",
		rating: 0,
		year: "1991",
		genres: ["Philosophy of Mind"],
	},
	{
		title: "The Feeling of What Happens",
		author: "Antonio Damasio",
		status: "planned",
		rating: 0,
		year: "1999",
		genres: ["Neuroscience"],
	},
];

export function getBooksList(): BookItem[] {
	return booksData;
}

import type { ProfileConfig } from "@/types/config";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 博主资料：头像 / 名称 / 简介 / 社交链接（侧栏 Profile 卡片、页脚、RSS 作者等消费）。
 * 类型见 src/types/config.ts。
 */
export const profileConfig: ProfileConfig = withUserConfig("profile", {
	avatar: "/assets/chars/murdo.webp", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
	name: "Murdo Klein",
	bio: "to Murdo's blog",
	links: [
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/RUI-debug769",
		},
		{
			name: "Bilibili",
			icon: "simple-icons:bilibili",
			url: "https://space.bilibili.com/1963054557?spm_id_from=333.1007.0.0",
		},
		{
			name: "NetEase Cloud Music",
			icon: "simple-icons:neteasecloudmusic",
			url: "https://music.163.com/#/user/home?id=7956953488",
		},
		{
			name: "X",
			icon: "fa7-brands:x-twitter",
			url: "https://x.com/Murdo_KX",
		},
	],
});

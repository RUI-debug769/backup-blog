// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: 备案通过、域名确定后改成正式域名（RSS 链接与 sitemap 依赖此项）
export default defineConfig({
  site: 'https://example.com',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      // 双主题：输出 CSS 变量，明暗切换由 global.css 按 html[data-theme] 接管
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },
});

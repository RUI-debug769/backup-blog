// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://murdok.me',
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

// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: 备案通过、域名确定后改成正式域名（RSS 链接与 sitemap 依赖此项）
export default defineConfig({
  site: 'https://example.com',
  integrations: [sitemap()],
});

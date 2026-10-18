import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('用法: npm run new "文章标题"');
  process.exit(1);
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

let slug = title
  .toLowerCase()
  .trim()
  .replace(/[\s_]+/g, '-')
  .replace(/[^a-z0-9-]/g, '')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');
if (!slug) slug = `post-${pad(now.getHours())}${pad(now.getMinutes())}`;

const blogDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content', 'blog');
mkdirSync(blogDir, { recursive: true });
const file = join(blogDir, `${date}-${slug}.md`);

if (existsSync(file)) {
  console.error(`已存在: ${file}`);
  process.exit(1);
}

writeFileSync(
  file,
  `---
title: "${title}"
pubDate: ${date}
tags: []
description: ""
---

`
);

console.log(`已创建: src/content/blog/${date}-${slug}.md`);
console.log('npm run dev 后在浏览器里实时预览，写完 git push 即发布。');

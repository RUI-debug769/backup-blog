# blog

个人博客，Astro 7 静态站点，push 即自动部署到 ECS。

- 线上（备案前）：http://112.124.111.67
- 仓库：[RUI-debug769/backup-blog](https://github.com/RUI-debug769/backup-blog)（私有）
- 目标 ECS：`/var/www/blog/`，Nginx 80 托管，产物属主 `www-data`

## 写文章

```bash
# 新建文章（frontmatter: title / description / pubDate / tags / draft）
vim src/content/blog/$(date +%F)-my-post.md
git add -A && git commit -m "post: my post" && git push
```

push 后约 30 秒 GitHub Actions 自动构建并 rsync 到 ECS，无需登录服务器。

## 本地开发

```bash
# WSL 非交互 shell 需要显式加载 nvm 的 node（否则 npm 会误用 Windows 侧）
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run dev -- --host 0.0.0.0
```

注意：dev server 运行期间不要并发 `npm run build`（`.astro` 缓存会竞争）。

## 部署架构

```
WSL ~/blog ──push──▶ backup-blog ──Actions──▶ astro build ──rsync(--delete --chown)──▶ ECS /var/www/blog
```

- Workflow：`.github/workflows/deploy.yml`（构建前 `ssh-keyscan` 固定主机指纹）
- Secrets：`ECS_HOST` / `ECS_USER` / `ECS_SSH_KEY`（部署密钥在 WSL `~/.ssh/blog_deploy`）

## 备案后待办

1. `astro.config.mjs` 的 `site` 改为正式域名（RSS/sitemap 依赖）
2. DNS A 记录 → 112.124.111.67
3. ECS Nginx 改 `server_name`、移除 `default_server`，reload
4. `certbot --nginx -d 域名 -d www.域名` 上 HTTPS

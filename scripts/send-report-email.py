#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把当天日报以暖陶暗色 HTML 邮件发出（QQ 邮箱 SMTP）。

环境变量（GitHub Secrets 注入）：
  QQ_SMTP_USER  发件邮箱（如 xxx@qq.com）
  QQ_SMTP_PASS  QQ 邮箱授权码（非密码）
  QQ_SMTP_TO    收件邮箱（可多个，逗号分隔）
用法：python scripts/send-report-email.py daily|weekly
"""
import os
import re
import smtplib
import ssl
from email.header import Header
from email.mime.text import MIMEText
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS = ROOT / "src" / "content" / "reports"
TODAY = __import__("datetime").date.today().isoformat()

# 暖陶色板（与 warm_theme 一致）
BG = "#211E1B"
PANEL = "#26221F"
CARD = "#322D29"
ACCENT = "#CC785C"
GOLD = "#D9B98A"
BODY = "#C6BFB3"
LEAD = "#BEB7AC"
TITLE = "#F2EDE5"
RIGHT = "#87807A"
FOOT = "#7D766C"


def md_to_email_html(title: str, md: str) -> str:
    """把 markdown 正文粗略转成暖陶邮件 HTML（标题/小节/列表卡片化）。"""
    out = []
    for line in md.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("## "):
            out.append(
                f'<div style="margin-top:22px;font-size:11px;letter-spacing:3px;color:{ACCENT};">{s[3:]}</div>'
            )
        elif s.startswith("### "):
            out.append(f'<div style="margin-top:14px;font-size:13px;color:{GOLD};font-weight:600;">{s[4:]}</div>')
        elif re.match(r"^[-*]\s+", s):
            item = re.sub(r"^[-*]\s+", "", s)
            out.append(
                f'<div style="background:{CARD};border-radius:10px;padding:10px 14px;margin:7px 0;'
                f'font-size:13px;line-height:1.75;color:{BODY};">{item}</div>'
            )
        elif re.match(r"^\d+[.、]", s):
            out.append(
                f'<div style="background:{CARD};border-radius:10px;padding:10px 14px;margin:7px 0;'
                f'font-size:13px;line-height:1.75;color:{BODY};">{s}</div>'
            )
        else:
            out.append(f'<p style="margin:8px 0;font-size:13px;line-height:1.85;color:{BODY};">{s}</p>')

    inner = "\n".join(out)
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:{BG};">
<div style="max-width:640px;margin:0 auto;padding:24px 20px;background:{PANEL};">
  <div style="font-family:Georgia,serif;font-size:18px;color:{TITLE};letter-spacing:.5px;">{title}</div>
  <div style="margin-top:6px;font-size:11px;letter-spacing:2.5px;color:{RIGHT};">MUR DOS LOG · {TODAY}</div>
  <div style="height:1px;background:rgba(255,255,255,.08);margin:18px 0;"></div>
  {inner}
  <div style="height:1px;background:rgba(255,255,255,.08);margin:22px 0;"></div>
  <div style="font-size:11px;line-height:1.7;color:{FOOT};">
    由 GitHub Actions 自动生成 · <a href="https://murdok.me/reports/" style="color:{GOLD};">在线阅读与归档</a>
  </div>
</div></body></html>"""


def main():
    kind = os.sys.argv[1] if len(os.sys.argv) > 1 else "daily"
    f = REPORTS / f"{kind}-{TODAY}.md"
    if not f.exists():
        print(f"无 {kind} 文件，跳过发信")
        return
    raw = f.read_text(encoding="utf-8")
    title_m = re.search(r'^title:\s*"([^"]+)"', raw, re.M)
    title = title_m.group(1) if title_m else f"AI Frontier {kind.title()} · {TODAY}"
    body_md = raw.split("---", 2)[-1]

    user = os.environ.get("QQ_SMTP_USER")
    pwd = os.environ.get("QQ_SMTP_PASS")
    to = os.environ.get("QQ_SMTP_TO", user)
    if not user or not pwd:
        print("缺少 QQ_SMTP_USER / QQ_SMTP_PASS，跳过发信")
        return

    msg = MIMEText(md_to_email_html(title, body_md), "html", "utf-8")
    msg["Subject"] = Header(title, "utf-8")
    msg["From"] = user  # QQ 邮箱要求 From 为纯地址，显示名带空格会触发 550
    msg["To"] = to

    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.qq.com", 465, context=ctx, timeout=30) as server:
        server.login(user, pwd)
        server.sendmail(user, [t.strip() for t in to.split(",")], msg.as_string())
    print("邮件已发送 →", to)


if __name__ == "__main__":
    main()

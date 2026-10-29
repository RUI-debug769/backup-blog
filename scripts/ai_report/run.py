#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 前沿日报 / 技术与思路周报 —— 云端编排入口。

流程与原邮箱版一致：prompt（联网检索）→ 严格 JSON → schema 校验 →
纯文本 + 暖陶 HTML → QQ 邮箱直推；额外把两份产物写进博客仓库：
  src/content/reports/<kind>-<date>.md   列表页用的 frontmatter + 纯文本正文
  src/data/reports/<kind>-<date>.html    详情页直接嵌入的面板 HTML

用法：
  python3 scripts/ai_report/run.py daily [--date YYYY-MM-DD] [--no-email]
  python3 scripts/ai_report/run.py weekly [--no-email]
环境变量：DEEPSEEK_API_KEY，SMTP_USER/SMTP_PASS/REPORT_TO_EMAIL（或 QQ_SMTP_*）。
"""
import datetime
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import common as rc  # noqa: E402
import daily as dl  # noqa: E402
import llm  # noqa: E402
import weekly as wk  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REPORTS_DIR = os.path.join(ROOT, "src", "content", "reports")
HTML_DIR = os.path.join(ROOT, "src", "data", "reports")
PROMPTS = os.path.join(HERE, "prompts")

log = rc.make_logger(os.environ.get(
    "REPORT_LOG", os.path.join(tempfile.gettempdir(), "ai_report.log")))

BJT = datetime.timezone(datetime.timedelta(hours=8))


def now_bj():
    return datetime.datetime.now(BJT)


def _read_prompt(name):
    with open(os.path.join(PROMPTS, name), encoding="utf-8") as f:
        return f.read()


def _yaml_str(s):
    return json.dumps(str(s), ensure_ascii=False)


def _write_outputs(kind, date_str, title, description, text, inner_html):
    """写博客内容（.md）与面板 HTML；返回 (md_path, html_path)。"""
    os.makedirs(REPORTS_DIR, exist_ok=True)
    os.makedirs(HTML_DIR, exist_ok=True)
    slug = "%s-%s" % (kind, date_str)
    published = now_bj().strftime("%Y-%m-%dT%H:%M:%S+08:00")
    tags = ["Daily", "AI"] if kind == "daily" else ["Weekly", "AI"]
    md = (
        "---\n"
        "title: %s\n"
        "published: %s\n"
        "description: %s\n"
        "tags: %s\n"
        "category: %s\n"
        "lang: zh-CN\n"
        "---\n\n%s\n"
        % (_yaml_str(title), published, _yaml_str(description),
           json.dumps(tags, ensure_ascii=False), _yaml_str(kind.capitalize()),
           text)
    )
    md_path = os.path.join(REPORTS_DIR, slug + ".md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    html_path = os.path.join(HTML_DIR, slug + ".html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(inner_html)
    log("saved: %s / %s" % (md_path, html_path))
    return md_path, html_path


def _send_email(subject, text, html):
    host = rc.get_env("SMTP_HOST", "smtp.qq.com")
    user = rc.get_env("SMTP_USER") or rc.get_env("QQ_SMTP_USER")
    pw = rc.get_env("SMTP_PASS") or rc.get_env("QQ_SMTP_PASS")
    to = rc.get_env("REPORT_TO_EMAIL") or rc.get_env("QQ_SMTP_TO")
    port = rc.get_env("SMTP_PORT", "465")
    if not (user and pw and to):
        log("ERROR: SMTP 凭据缺失（SMTP_USER/SMTP_PASS/REPORT_TO_EMAIL）")
        return False
    try:
        rc.send_html_mail(host, int(port), user, pw, to, subject, text, html,
                          logger=log)
        return True
    except rc.ReportError as e:
        log("ERROR: 发信失败: %s" % e)
        return False


def run_daily(date_str=None, send_mail=True):
    log("=== daily report task start ===")
    ds = date_str or now_bj().strftime("%Y-%m-%d")
    prompt = _read_prompt("daily.md").replace("{{TODAY}}", ds)
    log("prompt length: %d chars, date=%s" % (len(prompt), ds))

    raw = llm.call(prompt, log=log)
    with open(os.path.join(tempfile.gettempdir(), "daily-raw-%s.txt" % ds),
              "w", encoding="utf-8") as f:
        f.write(raw)

    try:
        data = dl.parse_daily_json(raw, log=log)
    except dl.DailyReportError as e:
        log("ERROR: JSON 校验失败（%s）；原始输出见临时目录" % e)
        return 1

    text = dl.render_daily_text(data, ds)
    html = dl.render_daily_html(data, ds)
    inner = dl.render_daily_inner(data, ds)
    _write_outputs("daily", ds, "AI 前沿日报 · %s" % ds,
                   data["briefs"][0][:120], text, inner)

    if send_mail and not os.environ.get("REPORT_DRY_RUN"):
        ok = _send_email("AI前沿日报 - %s" % ds, text, html)
        if not ok:
            log("=== daily report task end (email failed) ===")
            return 2
    log("=== daily report task end ===")
    return 0


def run_weekly(send_mail=True):
    log("=== weekly report task start ===")
    ds = now_bj().strftime("%Y-%m-%d")
    digests, missing = wk.collect_daily_reports(REPORTS_DIR, today=now_bj().date())
    if missing:
        log("WARN 缺失/损坏日报: %s" % ", ".join(missing))
    if not digests:
        log("WARN 本周无任何可用日报，完全依赖增量深研")

    prompt = wk.build_weekly_prompt(_read_prompt("weekly.md"), digests)
    log("prompt length: %d chars, digests: %d" % (len(prompt), len(digests)))

    raw = llm.call(prompt, log=log)
    with open(os.path.join(tempfile.gettempdir(), "weekly-raw-%s.txt" % ds),
              "w", encoding="utf-8") as f:
        f.write(raw)

    try:
        data = wk.parse_weekly_json(raw)
    except wk.WeeklyReportError as e:
        log("ERROR: JSON 校验失败（%s）；原始输出见临时目录" % e)
        return 1

    issue = wk.issue_number(REPORTS_DIR, ds)
    text = wk.render_weekly_text(data, issue, ds)
    html = wk.render_weekly_html(data, issue, ds)
    inner = wk.render_weekly_inner(data, issue, ds)
    _write_outputs("weekly", ds, "AI 技术与思路周报 No.%02d · %s" % (issue, ds),
                   data["headline"]["summary"][:120], text, inner)

    if send_mail and not os.environ.get("REPORT_DRY_RUN"):
        ok = _send_email("AI 技术与思路周报 - %s" % ds, text, html)
        if not ok:
            log("=== weekly report task end (email failed) ===")
            return 2
    log("=== weekly report task end (No.%02d) ===" % issue)
    return 0


def cli(argv):
    kind = "daily"
    date_str = None
    send_mail = True
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("daily", "weekly"):
            kind = a
        elif a == "--date":
            i += 1
            date_str = argv[i] if i < len(argv) else None
            try:
                datetime.datetime.strptime(date_str or "", "%Y-%m-%d")
            except ValueError:
                print("ERROR: --date 必须是 YYYY-MM-DD")
                return 2
        elif a == "--no-email":
            send_mail = False
        i += 1
    if kind == "weekly":
        return run_weekly(send_mail=send_mail)
    return run_daily(date_str=date_str, send_mail=send_mail)


if __name__ == "__main__":
    sys.exit(cli(sys.argv[1:]))

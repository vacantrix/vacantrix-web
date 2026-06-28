#!/usr/bin/env python3
"""
setup_partner_cron.py — расписание авто-одобрения партнёрских комиссий.

Заводит pg_cron job, который раз в час вызывает SQL-функцию
public.approve_due_commissions() — переводит начисления pending → approved по
истечении холда (partner_settings.hold_days). HTTP не нужен (вызов чистой SQL).

⚠️ Запускать ПОСЛЕ migrate_partner_program.py (функция должна существовать).

Запуск:
  $env:PYTHONIOENCODING="utf-8"
  python migrations/setup_partner_cron.py
"""

import json
import os
import sys
import urllib.request
import urllib.error

if hasattr(sys.stdout, "reconfigure") and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PAT         = os.environ.get("SUPABASE_PAT") or input("Supabase PAT (sbp_...): ").strip()
PROJECT_REF = os.environ.get("VX_PROJECT_REF", "fgcffgfyehequucnxegb")
API_URL     = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"


def run_sql(description: str, sql: str) -> None:
    req = urllib.request.Request(
        API_URL, data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {PAT}",
            "Content-Type": "application/json",
            "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        }, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        print(f"  ✅  {description}")
    except urllib.error.HTTPError as e:
        print(f"  ❌  {description}\n      {e.read().decode()}")
        raise SystemExit(1)


if __name__ == "__main__":
    print("\n🚀  Расписание авто-одобрения партнёрских комиссий\n" + "═" * 50)

    run_sql("Расширение pg_cron", "CREATE EXTENSION IF NOT EXISTS pg_cron;")

    run_sql("Снимаем старый job (если был)",
            "SELECT cron.unschedule('partner-approve-commissions') "
            "WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='partner-approve-commissions');")

    run_sql("Заводим job (каждый час)",
            "SELECT cron.schedule('partner-approve-commissions', '0 * * * *', "
            "$cron$ SELECT public.approve_due_commissions(); $cron$);")

    print("═" * 50)
    print("✅  Готово! Комиссии будут одобряться по истечении холда автоматически.")
    print()

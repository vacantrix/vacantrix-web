#!/usr/bin/env python3
"""
migrate_partner_program.py — Партнёрская (реферальная) программа Vacantrix.

Создаёт таблицы, RLS, серверный триггер атрибуции и RPC под партнёрку:
  • partner_settings  — singleton-настройки (ставка/скидка/порог/холд/версия оферты)
  • partners          — партнёры (web_user_id, ref_code, telegram, статус самозанятого)
  • referrals         — атрибуция «партнёр → приглашённый» (first-touch, 1 партнёр на юзера)
  • partner_commissions — комиссии lifetime (идемпотентность по yk_payment_id)
  • partner_payouts   — запросы выплат (ручная обработка админом)
  • триггер bind_referral на auth.users (читает ref_code из user_metadata)
  • RPC: partner_join / partner_make_tg_token / partner_request_payout /
         partner_dashboard / credit_commission (service) / approve_due_commissions (service)

Запуск:
  $env:PYTHONIOENCODING="utf-8"
  python migrations/migrate_partner_program.py

Требуется SUPABASE_PAT (Management API PAT) в окружении (или ввод вручную).
"""

import json
import os
import sys
import urllib.request
import urllib.error

if hasattr(sys.stdout, "reconfigure") and sys.stdout.encoding != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PAT         = os.environ.get("SUPABASE_PAT") or input("Supabase PAT (sbp_...): ").strip()
PROJECT_REF = "fgcffgfyehequucnxegb"
API_URL     = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"


def run_sql(description: str, sql: str) -> None:
    body = json.dumps({"query": sql}).encode()
    req  = urllib.request.Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {PAT}",
            "Content-Type": "application/json",
            "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",  # без него Cloudflare 403
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
        print(f"  ✅  {description}")
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        print(f"  ❌  {description}")
        print(f"      {msg}")
        raise SystemExit(1)


MIGRATIONS: list[tuple[str, str]] = [

    # ── 1. Настройки программы (singleton) ────────────────────────────────────
    (
        "1/12  Таблица partner_settings (+ дефолты)",
        """
        CREATE TABLE IF NOT EXISTS public.partner_settings (
            id              smallint      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            rate            numeric(5,4)  NOT NULL DEFAULT 0.25,   -- 25% lifetime
            discount_pct    numeric(5,4)  NOT NULL DEFAULT 0.20,   -- 20% скидка другу
            min_payout_rub  numeric(12,2) NOT NULL DEFAULT 1000,
            hold_days       integer       NOT NULL DEFAULT 14,
            offer_version   text          NOT NULL DEFAULT '2026-06-28',
            updated_at      timestamptz   DEFAULT now()
        );
        INSERT INTO public.partner_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

        ALTER TABLE public.partner_settings ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS partner_settings_read ON public.partner_settings;
        CREATE POLICY partner_settings_read ON public.partner_settings
            FOR SELECT USING (true);
        DROP POLICY IF EXISTS partner_settings_admin ON public.partner_settings;
        CREATE POLICY partner_settings_admin ON public.partner_settings
            FOR ALL USING (EXISTS (SELECT 1 FROM public.web_user_roles
                                   WHERE user_id = auth.uid() AND role = 'admin'));
        """,
    ),

    # ── 2. Партнёры ───────────────────────────────────────────────────────────
    (
        "2/12  Таблица partners",
        """
        CREATE TABLE IF NOT EXISTS public.partners (
            id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            web_user_id              uuid        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            ref_code                 text        UNIQUE NOT NULL,
            telegram_id              bigint      UNIQUE,
            tg_link_token            text,
            tg_link_token_exp        timestamptz,
            self_employed_confirmed  boolean     NOT NULL DEFAULT false,
            status                   text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
            accepted_offer_at        timestamptz,
            offer_version            text,
            last_notified_at         timestamptz DEFAULT now(),   -- курсор уведомлений бота-компаньона
            created_at               timestamptz DEFAULT now()
        );

        ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.partners FROM anon;          -- партнёрские данные не для анонимов
        DROP POLICY IF EXISTS partners_select_own ON public.partners;
        CREATE POLICY partners_select_own ON public.partners
            FOR SELECT USING (web_user_id = auth.uid());
        DROP POLICY IF EXISTS partners_admin_all ON public.partners;
        CREATE POLICY partners_admin_all ON public.partners
            FOR ALL USING (EXISTS (SELECT 1 FROM public.web_user_roles
                                   WHERE user_id = auth.uid() AND role = 'admin'));
        -- INSERT/UPDATE — только через SECURITY DEFINER RPC (partner_join и др.).
        """,
    ),

    # ── 3. Атрибуция: referrals ───────────────────────────────────────────────
    (
        "3/12  Таблица referrals",
        """
        CREATE TABLE IF NOT EXISTS public.referrals (
            id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            partner_id        uuid        NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
            referred_user_id  uuid        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            created_at        timestamptz DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_referrals_partner ON public.referrals(partner_id);

        ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.referrals FROM anon;
        DROP POLICY IF EXISTS referrals_partner_read ON public.referrals;
        CREATE POLICY referrals_partner_read ON public.referrals
            FOR SELECT USING (partner_id IN (
                SELECT id FROM public.partners WHERE web_user_id = auth.uid()));
        DROP POLICY IF EXISTS referrals_admin_all ON public.referrals;
        CREATE POLICY referrals_admin_all ON public.referrals
            FOR ALL USING (EXISTS (SELECT 1 FROM public.web_user_roles
                                   WHERE user_id = auth.uid() AND role = 'admin'));
        -- INSERT — только триггером bind_referral (SECURITY DEFINER).
        """,
    ),

    # ── 4. Комиссии ───────────────────────────────────────────────────────────
    (
        "4/12  Таблица partner_commissions",
        """
        CREATE TABLE IF NOT EXISTS public.partner_commissions (
            id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
            partner_id        uuid          NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
            referred_user_id  uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            yk_payment_id     text          UNIQUE NOT NULL,   -- идемпотентность по платежу YooKassa
            paid_amount       numeric(12,2) NOT NULL,
            commission_rub    numeric(12,2) NOT NULL,
            rate              numeric(5,4)  NOT NULL,
            status            text          NOT NULL DEFAULT 'pending'
                                            CHECK (status IN ('pending','approved','paid','reversed')),
            created_at        timestamptz   DEFAULT now(),
            approved_at       timestamptz
        );
        CREATE INDEX IF NOT EXISTS idx_commissions_partner ON public.partner_commissions(partner_id);

        ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.partner_commissions FROM anon;
        DROP POLICY IF EXISTS commissions_partner_read ON public.partner_commissions;
        CREATE POLICY commissions_partner_read ON public.partner_commissions
            FOR SELECT USING (partner_id IN (
                SELECT id FROM public.partners WHERE web_user_id = auth.uid()));
        DROP POLICY IF EXISTS commissions_admin_all ON public.partner_commissions;
        CREATE POLICY commissions_admin_all ON public.partner_commissions
            FOR ALL USING (EXISTS (SELECT 1 FROM public.web_user_roles
                                   WHERE user_id = auth.uid() AND role = 'admin'));
        -- INSERT/UPDATE — только server-side (credit_commission / монитор / админ).
        """,
    ),

    # ── 5. Выплаты ────────────────────────────────────────────────────────────
    (
        "5/12  Таблица partner_payouts",
        """
        CREATE TABLE IF NOT EXISTS public.partner_payouts (
            id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
            partner_id    uuid          NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
            amount_rub    numeric(12,2) NOT NULL CHECK (amount_rub > 0),
            status        text          NOT NULL DEFAULT 'requested'
                                        CHECK (status IN ('requested','approved','paid','rejected')),
            receipt_url   text,
            payout_details text,        -- реквизиты на момент запроса (минимизация ПДн)
            requested_at  timestamptz   DEFAULT now(),
            paid_at       timestamptz,
            admin_note    text
        );
        CREATE INDEX IF NOT EXISTS idx_payouts_partner ON public.partner_payouts(partner_id);

        ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON public.partner_payouts FROM anon;
        DROP POLICY IF EXISTS payouts_partner_read ON public.partner_payouts;
        CREATE POLICY payouts_partner_read ON public.partner_payouts
            FOR SELECT USING (partner_id IN (
                SELECT id FROM public.partners WHERE web_user_id = auth.uid()));
        DROP POLICY IF EXISTS payouts_admin_all ON public.partner_payouts;
        CREATE POLICY payouts_admin_all ON public.partner_payouts
            FOR ALL USING (EXISTS (SELECT 1 FROM public.web_user_roles
                                   WHERE user_id = auth.uid() AND role = 'admin'));
        -- INSERT — только через RPC partner_request_payout (проверка баланса/порога).
        """,
    ),

    # ── 6. Триггер атрибуции на auth.users ────────────────────────────────────
    (
        "6/12  Функция + триггер bind_referral (auth.users)",
        """
        CREATE OR REPLACE FUNCTION public.bind_referral()
        RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE
            v_code       text;
            v_partner_id uuid;
        BEGIN
            v_code := NEW.raw_user_meta_data->>'ref_code';
            IF v_code IS NULL OR v_code = '' THEN RETURN NEW; END IF;

            SELECT id INTO v_partner_id
            FROM public.partners
            WHERE ref_code = upper(v_code) AND status = 'active';
            IF v_partner_id IS NULL THEN RETURN NEW; END IF;

            -- запрет самореферала
            IF EXISTS (SELECT 1 FROM public.partners
                       WHERE id = v_partner_id AND web_user_id = NEW.id) THEN
                RETURN NEW;
            END IF;

            INSERT INTO public.referrals (partner_id, referred_user_id)
            VALUES (v_partner_id, NEW.id)
            ON CONFLICT (referred_user_id) DO NOTHING;   -- first-touch
            RETURN NEW;
        END; $$;

        DROP TRIGGER IF EXISTS on_auth_user_referral ON auth.users;
        CREATE TRIGGER on_auth_user_referral
            AFTER INSERT ON auth.users
            FOR EACH ROW EXECUTE FUNCTION public.bind_referral();
        """,
    ),

    # ── 7. RPC: стать партнёром ───────────────────────────────────────────────
    (
        "7/12  RPC partner_join(self_employed)",
        """
        CREATE OR REPLACE FUNCTION public.partner_join(p_self_employed boolean DEFAULT false)
        RETURNS public.partners LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE
            v_uid  uuid := auth.uid();
            v_row  public.partners;
            v_code text;
            v_ver  text;
        BEGIN
            IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

            SELECT * INTO v_row FROM public.partners WHERE web_user_id = v_uid;
            IF FOUND THEN
                UPDATE public.partners SET
                    self_employed_confirmed = (p_self_employed OR self_employed_confirmed),
                    accepted_offer_at = COALESCE(accepted_offer_at, now()),
                    offer_version = COALESCE(offer_version,
                                             (SELECT offer_version FROM public.partner_settings WHERE id = 1))
                WHERE web_user_id = v_uid
                RETURNING * INTO v_row;
                RETURN v_row;
            END IF;

            LOOP   -- уникальный 8-символьный код (без зависимости от pgcrypto)
                v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
                EXIT WHEN NOT EXISTS (SELECT 1 FROM public.partners WHERE ref_code = v_code);
            END LOOP;

            SELECT offer_version INTO v_ver FROM public.partner_settings WHERE id = 1;
            INSERT INTO public.partners
                (web_user_id, ref_code, self_employed_confirmed, accepted_offer_at, offer_version)
            VALUES (v_uid, v_code, p_self_employed, now(), v_ver)
            RETURNING * INTO v_row;
            RETURN v_row;
        END; $$;
        REVOKE ALL ON FUNCTION public.partner_join(boolean) FROM public, anon;
        GRANT EXECUTE ON FUNCTION public.partner_join(boolean) TO authenticated;
        """,
    ),

    # ── 8. RPC: токен привязки Telegram (для бота-компаньона) ──────────────────
    (
        "8/12  RPC partner_make_tg_token()",
        """
        CREATE OR REPLACE FUNCTION public.partner_make_tg_token()
        RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE
            v_uid uuid := auth.uid();
            v_tok text;
        BEGIN
            IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
            IF NOT EXISTS (SELECT 1 FROM public.partners WHERE web_user_id = v_uid) THEN
                RAISE EXCEPTION 'not a partner';
            END IF;
            v_tok := replace(gen_random_uuid()::text, '-', '');
            UPDATE public.partners
            SET tg_link_token = v_tok, tg_link_token_exp = now() + interval '15 minutes'
            WHERE web_user_id = v_uid;
            RETURN v_tok;
        END; $$;
        REVOKE ALL ON FUNCTION public.partner_make_tg_token() FROM public, anon;
        GRANT EXECUTE ON FUNCTION public.partner_make_tg_token() TO authenticated;
        """,
    ),

    # ── 9. RPC: запрос выплаты ─────────────────────────────────────────────────
    (
        "9/12  RPC partner_request_payout(amount, details)",
        """
        CREATE OR REPLACE FUNCTION public.partner_request_payout(
            p_amount numeric, p_details text DEFAULT NULL)
        RETURNS public.partner_payouts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE
            v_uid       uuid := auth.uid();
            v_pid       uuid;
            v_se        boolean;
            v_min       numeric;
            v_available numeric;
            v_row       public.partner_payouts;
        BEGIN
            IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
            SELECT id, self_employed_confirmed INTO v_pid, v_se
            FROM public.partners WHERE web_user_id = v_uid;
            IF v_pid IS NULL THEN RAISE EXCEPTION 'not a partner'; END IF;
            IF NOT v_se THEN RAISE EXCEPTION 'self-employed status required'; END IF;

            SELECT min_payout_rub INTO v_min FROM public.partner_settings WHERE id = 1;

            v_available := GREATEST(0,
                COALESCE((SELECT sum(commission_rub) FROM public.partner_commissions
                          WHERE partner_id = v_pid AND status = 'approved'), 0)
              - COALESCE((SELECT sum(amount_rub) FROM public.partner_payouts
                          WHERE partner_id = v_pid AND status IN ('requested','approved','paid')), 0));

            IF p_amount IS NULL OR p_amount < v_min THEN
                RAISE EXCEPTION 'amount below minimum %', v_min;
            END IF;
            IF p_amount > v_available THEN
                RAISE EXCEPTION 'amount exceeds available % rub', v_available;
            END IF;

            INSERT INTO public.partner_payouts (partner_id, amount_rub, payout_details)
            VALUES (v_pid, p_amount, p_details)
            RETURNING * INTO v_row;
            RETURN v_row;
        END; $$;
        REVOKE ALL ON FUNCTION public.partner_request_payout(numeric, text) FROM public, anon;
        GRANT EXECUTE ON FUNCTION public.partner_request_payout(numeric, text) TO authenticated;
        """,
    ),

    # ── 10. RPC: сводка кабинета ───────────────────────────────────────────────
    (
        "10/12  RPC partner_dashboard()",
        """
        CREATE OR REPLACE FUNCTION public.partner_dashboard()
        RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE
            v_uid uuid := auth.uid();
            v_pid uuid;
            v_code text;
            v_set public.partner_settings;
        BEGIN
            IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
            SELECT * INTO v_set FROM public.partner_settings WHERE id = 1;
            SELECT id, ref_code INTO v_pid, v_code FROM public.partners WHERE web_user_id = v_uid;

            IF v_pid IS NULL THEN
                RETURN jsonb_build_object(
                    'is_partner', false,
                    'rate', v_set.rate, 'discount_pct', v_set.discount_pct,
                    'min_payout_rub', v_set.min_payout_rub);
            END IF;

            RETURN jsonb_build_object(
                'is_partner', true,
                'ref_code', v_code,
                'rate', v_set.rate,
                'discount_pct', v_set.discount_pct,
                'min_payout_rub', v_set.min_payout_rub,
                'self_employed_confirmed', (SELECT self_employed_confirmed FROM public.partners WHERE id = v_pid),
                'telegram_linked', (SELECT telegram_id IS NOT NULL FROM public.partners WHERE id = v_pid),
                'referrals_total', (SELECT count(*) FROM public.referrals WHERE partner_id = v_pid),
                'referrals_paying', (SELECT count(DISTINCT referred_user_id)
                                     FROM public.partner_commissions WHERE partner_id = v_pid),
                'earned_total', COALESCE((SELECT sum(commission_rub) FROM public.partner_commissions
                                          WHERE partner_id = v_pid AND status IN ('approved','paid')), 0),
                'earned_pending', COALESCE((SELECT sum(commission_rub) FROM public.partner_commissions
                                            WHERE partner_id = v_pid AND status = 'pending'), 0),
                'paid_out', COALESCE((SELECT sum(amount_rub) FROM public.partner_payouts
                                      WHERE partner_id = v_pid AND status = 'paid'), 0),
                'available', GREATEST(0,
                    COALESCE((SELECT sum(commission_rub) FROM public.partner_commissions
                              WHERE partner_id = v_pid AND status = 'approved'), 0)
                  - COALESCE((SELECT sum(amount_rub) FROM public.partner_payouts
                              WHERE partner_id = v_pid AND status IN ('requested','approved','paid')), 0)));
        END; $$;
        REVOKE ALL ON FUNCTION public.partner_dashboard() FROM public, anon;
        GRANT EXECUTE ON FUNCTION public.partner_dashboard() TO authenticated;
        """,
    ),

    # ── 11. RPC (service): начисление комиссии из вебхука ──────────────────────
    (
        "11/12  RPC credit_commission() — только service_role",
        """
        CREATE OR REPLACE FUNCTION public.credit_commission(
            p_user_id uuid, p_yk_payment_id text, p_paid_amount numeric)
        RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE
            v_partner_id uuid;
            v_rate       numeric;
        BEGIN
            SELECT partner_id INTO v_partner_id FROM public.referrals WHERE referred_user_id = p_user_id;
            IF v_partner_id IS NULL THEN RETURN; END IF;
            SELECT rate INTO v_rate FROM public.partner_settings WHERE id = 1;

            INSERT INTO public.partner_commissions
                (partner_id, referred_user_id, yk_payment_id, paid_amount, commission_rub, rate, status)
            VALUES (v_partner_id, p_user_id, p_yk_payment_id, p_paid_amount,
                    round(p_paid_amount * v_rate, 2), v_rate, 'pending')
            ON CONFLICT (yk_payment_id) DO NOTHING;   -- идемпотентность
        END; $$;
        REVOKE ALL ON FUNCTION public.credit_commission(uuid, text, numeric) FROM public, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.credit_commission(uuid, text, numeric) TO service_role;
        """,
    ),

    # ── 12. RPC (service): монитор pending→approved по холду ───────────────────
    (
        "12/12  RPC approve_due_commissions() — только service_role",
        """
        CREATE OR REPLACE FUNCTION public.approve_due_commissions()
        RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE
            v_days  integer;
            v_count integer;
        BEGIN
            SELECT hold_days INTO v_days FROM public.partner_settings WHERE id = 1;
            UPDATE public.partner_commissions
            SET status = 'approved', approved_at = now()
            WHERE status = 'pending'
              AND created_at < now() - make_interval(days => v_days);
            GET DIAGNOSTICS v_count = ROW_COUNT;
            RETURN v_count;
        END; $$;
        REVOKE ALL ON FUNCTION public.approve_due_commissions() FROM public, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.approve_due_commissions() TO service_role;
        """,
    ),
]


if __name__ == "__main__":
    print()
    print("🚀  Миграция: Партнёрская программа Vacantrix")
    print("═" * 52)
    for desc, sql in MIGRATIONS:
        run_sql(desc, sql)
    print("═" * 52)
    print("✅  Готово. Дальше: Ф1 (сайт), Ф2 (Edge Functions), Ф3 (бот), Ф4 (админ).")
    print()

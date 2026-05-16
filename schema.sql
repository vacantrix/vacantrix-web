-- =====================================================================
-- Vacantrix Web — схема базы данных Supabase
-- Запустить в SQL Editor вашего Supabase-проекта
-- =====================================================================

-- ── Площадки ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_platforms (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL,
  description text        DEFAULT '',
  url         text        DEFAULT '',
  icon        text        DEFAULT '🔗',
  category    text        DEFAULT 'Основное',
  active      boolean     DEFAULT true,
  sort_order  integer     DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ── Приложения ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_apps (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name            text        NOT NULL,
  slug            text        UNIQUE NOT NULL,
  tagline         text        DEFAULT '',
  description     text        DEFAULT '',
  icon_url        text        DEFAULT '',
  screenshots     jsonb       DEFAULT '[]'::jsonb,
  features        jsonb       DEFAULT '[]'::jsonb,
  appstore_url    text        DEFAULT '',
  playstore_url   text        DEFAULT '',
  website_url     text        DEFAULT '',
  download_url    text        DEFAULT '',
  promo_video_url text        DEFAULT '',
  active          boolean     DEFAULT true,
  sort_order      integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ── Роли пользователей ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_user_roles (
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role       text        DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz DEFAULT now()
);

-- ── OTP для двухэтапного входа ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS web_login_otp (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text        NOT NULL,
  code       text        NOT NULL,
  expires_at timestamptz NOT NULL,
  used       boolean     DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE web_platforms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_apps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_user_roles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_login_otp    ENABLE ROW LEVEL SECURITY;

-- Площадки: все видят активные, только админ пишет
CREATE POLICY "platforms_public_read" ON web_platforms
  FOR SELECT USING (active = true);
CREATE POLICY "platforms_admin_all" ON web_platforms
  FOR ALL USING (
    EXISTS (SELECT 1 FROM web_user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Приложения: все видят активные, только админ пишет
CREATE POLICY "apps_public_read" ON web_apps
  FOR SELECT USING (active = true);
CREATE POLICY "apps_admin_all" ON web_apps
  FOR ALL USING (
    EXISTS (SELECT 1 FROM web_user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Роли: пользователь видит свою, админ видит все
CREATE POLICY "roles_own" ON web_user_roles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "roles_admin_all" ON web_user_roles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM web_user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- OTP: пользователь может читать/вставлять свои записи
CREATE POLICY "otp_own" ON web_login_otp
  FOR ALL USING (true); -- контролируется на уровне кода

-- ── Функция: авто-обновление updated_at ──────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_platforms_updated BEFORE UPDATE ON web_platforms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_apps_updated BEFORE UPDATE ON web_apps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Начальные данные ──────────────────────────────────────────────────
INSERT INTO web_apps (name, slug, tagline, description, features, download_url, sort_order)
VALUES (
  'Vacantrix',
  'vacantrix',
  'Умный бот для автоотклика на вакансии hh.ru',
  'Vacantrix автоматически откликается на вакансии по вашим параметрам — пока вы занимаетесь другим. Настройте один раз и получайте приглашения на интервью без ручного поиска.',
  '["Автоматический отклик на сотни вакансий за сессию","Умные паузы и защита от блокировок hh.ru","Персональное сопроводительное письмо для каждой вакансии","Поддержка прокси для конфиденциальности","Детальная статистика: сколько откликов, когда, результат","Работает в фоне — не требует внимания"]'::jsonb,
  '',
  0
) ON CONFLICT (slug) DO NOTHING;

-- ── Назначить первого админа (замените EMAIL на свой) ─────────────────
-- После регистрации через сайт выполните:
-- INSERT INTO web_user_roles (user_id, role)
-- SELECT id, 'admin' FROM auth.users WHERE email = 'ВАШ_EMAIL'
-- ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

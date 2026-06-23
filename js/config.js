// =====================================================================
// Конфигурация Supabase — заполните своими значениями из Supabase Dashboard
// Project Settings → API
// ⚠️ ТОЧКА ПЕРЕПОИНТА при миграции на self-host (Timeweb): сменить URL+ANON
//    здесь (единственное место для сайта). См. MIGRATION_TIMEWEB.md.
// =====================================================================
const SUPABASE_URL  = 'https://fgcffgfyehequucnxegb.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnY2ZmZ2Z5ZWhlcXV1Y254ZWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0ODYyMzAsImV4cCI6MjA5NDA2MjIzMH0.GrhRo_rrmpct1-gCPjznsbj4OE2Y3aWu8Q8n5rmo8Ec';

// Инициализация клиента
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,          // хранить сессию в localStorage
    autoRefreshToken: true,
    detectSessionInUrl: true,      // для email-confirmation redirect
  },
});

// Публичный клиент БЕЗ пользовательской сессии — для чтения открытых данных
// (каталог приложений и т.п.). Главный клиент `db` при наличии сессии цепляет
// токен пользователя; если он протух и не обновился, публичные запросы падают
// 401 и каталог «пропадает». dbPublic всегда ходит с anon-ключом → каталог
// грузится независимо от состояния авторизации.
const dbPublic = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// Время жизни OTP (минуты) — должно совпадать с настройкой в Supabase Auth
const OTP_TTL_MIN = 5;

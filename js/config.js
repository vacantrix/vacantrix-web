// =====================================================================
// Конфигурация Supabase — заполните своими значениями из Supabase Dashboard
// Project Settings → API
// =====================================================================
const SUPABASE_URL  = 'https://fgcffgfyehequucnxegb.supabase.co';
const SUPABASE_ANON = 'sb_publishable_s61sf0w-ONv_O3txalNygg_gONR4CTq';

// Инициализация клиента
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,          // хранить сессию в localStorage
    autoRefreshToken: true,
    detectSessionInUrl: true,      // для email-confirmation redirect
  },
});

// Время жизни OTP (минуты) — должно совпадать с настройкой в Supabase Auth
const OTP_TTL_MIN = 5;

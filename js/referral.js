// =====================================================================
// referral.js — захват реферального кода из URL (?ref=CODE).
//
// Партнёр делится ссылкой вида …/vacantrix-web/?ref=ABC12345. Этот модуль
// ловит код ПРИ ЗАГРУЗКЕ (синхронно, до роутера main.js), сохраняет в
// localStorage + cookie (окно 90 дней) и чистит ?ref из адресной строки,
// сохраняя остальные параметры и хэш. Код отдаётся в register() (auth.js),
// откуда уходит в user_metadata → серверный триггер bind_referral создаёт
// связку. Код нормализуем в верхний регистр (как ждёт триггер: upper()).
// =====================================================================
const Referral = (() => {
  const KEY    = 'vx_ref';
  const MAXAGE = 90 * 24 * 3600;   // 90 дней, секунды

  function _store(code) {
    try { localStorage.setItem(KEY, code); } catch (e) {}
    try {
      document.cookie = 'vx_ref=' + encodeURIComponent(code) +
        ';max-age=' + MAXAGE + ';path=/;samesite=lax';
    } catch (e) {}
  }

  // Текущий сохранённый код (localStorage → cookie-фолбэк) или null.
  function code() {
    try { const v = localStorage.getItem(KEY); if (v) return v; } catch (e) {}
    const m = document.cookie.match(/(?:^|;\s*)vx_ref=([^;]+)/);
    try { return m ? decodeURIComponent(m[1]) : null; } catch (e) { return m ? m[1] : null; }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    try { document.cookie = 'vx_ref=;max-age=0;path=/'; } catch (e) {}
  }

  // Захват ?ref → сохранение → чистка URL (остальные параметры/хэш сохраняем).
  function _capture() {
    try {
      const u = new URL(location.href);
      const ref = u.searchParams.get('ref');
      if (ref && ref.trim()) {
        _store(ref.trim().toUpperCase());
        u.searchParams.delete('ref');
        const clean = u.pathname + (u.search ? u.search : '') + (u.hash || '');
        history.replaceState(null, '', clean);
      }
    } catch (e) {}
  }

  _capture();   // выполняется сразу при загрузке скрипта (до DOMContentLoaded)
  return { code, clear };
})();

window.Referral = Referral;

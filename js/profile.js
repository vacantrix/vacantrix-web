// =====================================================================
// Profile — интеграция с vx_profiles (единый профиль платформы)
// =====================================================================

const Profile = (() => {
  let _data = null;  // текущий профиль { display_name, hh_username, avito_username, ... }

  // ── Загрузить профиль по web_user_id ─────────────────────────────────
  async function load(webUserId) {
    if (!webUserId) { _data = null; return null; }
    try {
      const { data, error } = await db
        .from('vx_profiles')
        .select('id, display_name, hh_username, avito_username, hh_applicant_id, avito_user_id, subscription_expire, avatar_url')
        .eq('web_user_id', webUserId)
        .maybeSingle();
      if (error) throw error;
      _data = data;
      return data;
    } catch (e) {
      console.warn('Profile.load:', e.message);
      _data = null;
      return null;
    }
  }

  // ── Привязать HH-аккаунт (по applicant_id из приложения) ────────────
  async function linkHH(hhApplicantId, webUserId) {
    const { data, error } = await db
      .from('vx_profiles')
      .update({ web_user_id: webUserId })
      .eq('hh_applicant_id', hhApplicantId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('HH-аккаунт с таким ID не найден. Запустите HH-приложение хотя бы один раз.');
    _data = data;
    return data;
  }

  // ── Привязать Avito-аккаунт (по user_id из приложения) ──────────────
  async function linkAvito(avitoUserId, webUserId) {
    const { data, error } = await db
      .from('vx_profiles')
      .update({ web_user_id: webUserId })
      .eq('avito_user_id', avitoUserId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Авито-аккаунт с таким ID не найден. Запустите Avito-приложение хотя бы один раз.');
    _data = data;
    return data;
  }

  // ── Сохранить display_name ────────────────────────────────────────────
  async function setDisplayName(newName) {
    if (!_data?.id) throw new Error('Профиль не привязан.');
    const { error } = await db
      .from('vx_profiles')
      .update({ display_name: newName })
      .eq('id', _data.id);
    if (error) throw error;
    _data.display_name = newName;
  }

  // ── Отвязать веб-аккаунт от профиля ─────────────────────────────────
  async function unlink() {
    if (!_data?.id) return;
    const { error } = await db
      .from('vx_profiles')
      .update({ web_user_id: null })
      .eq('id', _data.id);
    if (error) throw error;
    _data = null;
  }

  // ── Геттеры ────────────────────────────────────────────────────────────
  function current()     { return _data; }
  function displayName() { return _data?.display_name || _data?.hh_username || _data?.avito_username || ''; }

  // ── Аватар ────────────────────────────────────────────────────────────
  // avatar_url пишет платформа: полный публичный URL bucket 'avatars' с уже
  // вшитым кэш-бастером (?v=...). Пустая строка трактуется как «нет аватара».
  function avatarUrl() {
    const u = _data?.avatar_url;
    return (u && u.trim()) ? u : null;
  }

  // ── Форматирование даты подписки ──────────────────────────────────────
  function subscriptionText() {
    if (!_data?.subscription_expire) return null;
    const exp = new Date(_data.subscription_expire);
    const now = new Date();
    if (exp <= now) return { active: false, text: 'Истекла' };
    const days = Math.ceil((exp - now) / 86400000);
    const dateStr = exp.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    return { active: true, text: `Активна до ${dateStr}`, days };
  }

  return { load, linkHH, linkAvito, setDisplayName, unlink, current, displayName, avatarUrl, subscriptionText };
})();

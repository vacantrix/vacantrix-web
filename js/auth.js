// =====================================================================
// Модуль аутентификации
// Поток: email + пароль → OTP на почту (если без "Запомнить меня")
// =====================================================================

const Auth = (() => {
  const REMEMBER_KEY = 'vx_remember';
  const PENDING_KEY  = 'vx_pending_email';

  // ── Состояние ───────────────────────────────────────────────────────
  let _currentUser = null;
  let _isAdmin     = false;
  const _listeners = [];

  function _notify() {
    _listeners.forEach(fn => fn(_currentUser, _isAdmin));
  }

  function onChange(fn) {
    _listeners.push(fn);
  }

  // ── Инициализация ───────────────────────────────────────────────────
  async function init() {
    const { data: { session } } = await db.auth.getSession();

    // Если нет "Запомнить меня" и сессия не текущая — выходим
    const remembered = localStorage.getItem(REMEMBER_KEY);
    if (session && !remembered && !sessionStorage.getItem(REMEMBER_KEY)) {
      await db.auth.signOut();
      _currentUser = null;
    } else if (session) {
      _currentUser = session.user;
      _isAdmin = await _checkAdmin(_currentUser.id);
    }
    _notify();

    db.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        _currentUser = session.user;
        _isAdmin = await _checkAdmin(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        _currentUser = null;
        _isAdmin = false;
      }
      _notify();
    });
  }

  // ── Регистрация ─────────────────────────────────────────────────────
  async function register(email, password) {
    const { data, error } = await db.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }

  // ── Вход шаг 1: проверка пароля ─────────────────────────────────────
  async function loginPassword(email, password, rememberMe) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (rememberMe) {
      // Доверенное устройство — пропускаем OTP
      localStorage.setItem(REMEMBER_KEY, '1');
      sessionStorage.setItem(REMEMBER_KEY, '1');
      _currentUser = data.user;
      _isAdmin = await _checkAdmin(data.user.id);
      _notify();
      return { needsOtp: false };
    } else {
      // Выходим из password-сессии и просим OTP
      localStorage.removeItem(REMEMBER_KEY);
      sessionStorage.setItem(REMEMBER_KEY, '1');   // только на время вкладки
      await db.auth.signOut();
      // Отправляем OTP
      const { error: otpErr } = await db.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (otpErr) throw otpErr;
      localStorage.setItem(PENDING_KEY, email);
      return { needsOtp: true };
    }
  }

  // ── Вход шаг 2: проверка OTP ────────────────────────────────────────
  async function verifyOtp(email, token) {
    const { data, error } = await db.auth.verifyOtp({
      email, token, type: 'email',
    });
    if (error) throw error;
    localStorage.removeItem(PENDING_KEY);
    _currentUser = data.user;
    _isAdmin = await _checkAdmin(data.user.id);
    _notify();
    return data;
  }

  // ── Выход ───────────────────────────────────────────────────────────
  async function signOut() {
    await db.auth.signOut();
    localStorage.removeItem(REMEMBER_KEY);
    localStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(REMEMBER_KEY);
    _currentUser = null;
    _isAdmin = false;
    _notify();
  }

  // ── Проверка роли ───────────────────────────────────────────────────
  async function _checkAdmin(userId) {
    if (!userId) return false;
    const { data } = await db
      .from('web_user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    return data?.role === 'admin';
  }

  // ── Смена пароля ────────────────────────────────────────────────────
  async function updatePassword(newPassword) {
    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  // ── Геттеры ─────────────────────────────────────────────────────────
  function currentUser() { return _currentUser; }
  function isAdmin()     { return _isAdmin; }
  function isLoggedIn()  { return !!_currentUser; }
  function pendingEmail(){ return localStorage.getItem(PENDING_KEY); }

  return { init, register, loginPassword, verifyOtp, signOut,
           updatePassword, currentUser, isAdmin, isLoggedIn,
           pendingEmail, onChange };
})();

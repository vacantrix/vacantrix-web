// =====================================================================
// Оркестратор главной страницы
// =====================================================================

document.addEventListener('DOMContentLoaded', async () => {

  // ── Инициализация ───────────────────────────────────────────────────
  await Auth.init();
  await Platforms.loadAndRender();
  await Apps.loadAndRender();

  // ── Вкладки ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.add('active');
    });
  });

  // ── Реакция на авторизацию ──────────────────────────────────────────
  Auth.onChange((user, isAdmin) => {
    _updateNavbar(user, isAdmin);
  });
  _updateNavbar(Auth.currentUser(), Auth.isAdmin());

  // ── Модальное окно авторизации ──────────────────────────────────────
  const modal    = document.getElementById('auth-modal');
  const otpModal = document.getElementById('otp-modal');
  const authErr  = document.getElementById('auth-error');
  const otpErr   = document.getElementById('otp-error');
  let _pendingEmail = '';

  document.getElementById('btn-login')?.addEventListener('click', () => {
    modal.classList.remove('hidden');
    authErr.textContent = '';
    document.getElementById('auth-form').reset();
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await Auth.signOut();
  });

  document.getElementById('modal-close')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  document.getElementById('otp-close')?.addEventListener('click', () => {
    otpModal.classList.add('hidden');
  });

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  otpModal.addEventListener('click', e => {
    if (e.target === otpModal) otpModal.classList.add('hidden');
  });

  // ── Переключение режима (регистрация / вход) ─────────────────────────
  document.getElementById('switch-mode')?.addEventListener('click', () => {
    const title = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit');
    const isLogin = submitBtn.dataset.mode === 'login';
    submitBtn.dataset.mode = isLogin ? 'register' : 'login';
    title.textContent = isLogin ? 'Регистрация' : 'Вход';
    submitBtn.textContent = isLogin ? 'Зарегистрироваться' : 'Войти';
    document.getElementById('switch-mode').textContent =
      isLogin ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться';
    document.getElementById('remember-row').style.display = isLogin ? 'none' : 'flex';
    authErr.textContent = '';
  });

  // ── Отправка формы auth ─────────────────────────────────────────────
  document.getElementById('auth-submit')?.addEventListener('click', async () => {
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const remember = document.getElementById('auth-remember')?.checked ?? false;
    const mode     = document.getElementById('auth-submit').dataset.mode;
    authErr.textContent = '';

    if (!email || !password) {
      authErr.textContent = 'Введите email и пароль.';
      return;
    }

    try {
      if (mode === 'register') {
        const { needsConfirmation } = await Auth.register(email, password);
        modal.classList.add('hidden');
        if (needsConfirmation) {
          _showInfo('Письмо с подтверждением отправлено на ' + email + '. Перейдите по ссылке для активации аккаунта.');
        }
      } else {
        const { needsOtp } = await Auth.loginPassword(email, password, remember);
        if (needsOtp) {
          _pendingEmail = email;
          modal.classList.add('hidden');
          otpErr.textContent = '';
          document.getElementById('otp-hint').textContent =
            `Код отправлен на ${email}`;
          document.getElementById('otp-input').value = '';
          otpModal.classList.remove('hidden');
        } else {
          modal.classList.add('hidden');
        }
      }
    } catch (e) {
      authErr.textContent = _mapError(e.message);
    }
  });

  // ── Подтверждение OTP ───────────────────────────────────────────────
  document.getElementById('otp-submit')?.addEventListener('click', async () => {
    const token = document.getElementById('otp-input').value.trim();
    otpErr.textContent = '';
    if (!token) { otpErr.textContent = 'Введите код.'; return; }
    try {
      await Auth.verifyOtp(_pendingEmail, token);
      otpModal.classList.add('hidden');
    } catch (e) {
      otpErr.textContent = _mapError(e.message);
    }
  });

  // ── Лайтбокс (скриншоты) ────────────────────────────────────────────
  document.getElementById('lb-close')?.addEventListener('click', Apps.lbClose);
  document.getElementById('lb-prev')?.addEventListener('click', Apps.lbPrev);
  document.getElementById('lb-next')?.addEventListener('click', Apps.lbNext);
  document.getElementById('lightbox')?.addEventListener('click', e => {
    if (e.target.id === 'lightbox') Apps.lbClose();
  });

  // ── Навигация ────────────────────────────────────────────────────────
  function _updateNavbar(user, isAdmin) {
    const btnLogin  = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');
    const btnAdmin  = document.getElementById('btn-admin');
    const userInfo  = document.getElementById('user-info');

    if (user) {
      btnLogin?.classList.add('hidden');
      btnLogout?.classList.remove('hidden');
      if (userInfo) userInfo.textContent = user.email;
      userInfo?.classList.remove('hidden');
      if (isAdmin) btnAdmin?.classList.remove('hidden');
      else btnAdmin?.classList.add('hidden');
    } else {
      btnLogin?.classList.remove('hidden');
      btnLogout?.classList.add('hidden');
      btnAdmin?.classList.add('hidden');
      userInfo?.classList.add('hidden');
    }
  }

  function _showInfo(msg) {
    const el = document.getElementById('global-info');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 8000);
  }

  function _mapError(msg) {
    if (msg.includes('Invalid login')) return 'Неверный email или пароль.';
    if (msg.includes('Email not confirmed')) return 'Подтвердите email — проверьте почту.';
    if (msg.includes('already registered')) return 'Этот email уже зарегистрирован.';
    if (msg.includes('Token has expired')) return 'Код устарел. Войдите снова, чтобы получить новый.';
    if (msg.includes('otp_disabled')) return 'OTP отключён в настройках Supabase. Включите Email OTP.';
    return msg;
  }
});

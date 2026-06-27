// =====================================================================
// Оркестратор главной страницы
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {

  // ── Утилиты ─────────────────────────────────────────────────────────
  function _escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function _initReveal() {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
  }
  window._initReveal = _initReveal;

  const _PLATFORM_URL = 'https://github.com/vacantrix/vacantrix-platform-dist/releases/latest/download/VacantrixSetup.exe';

  // ── Аватар ──────────────────────────────────────────────────────────
  // Первая буква имени/почты для заглушки, когда нет картинки.
  function _initial(label) {
    const s = String(label || '').trim();
    return s ? s[0].toUpperCase() : '?';
  }

  // Рендерит круглый аватар в контейнер: <img> при наличии avatar_url
  // (object-fit:cover задаётся в CSS), иначе/при ошибке загрузки — инициал.
  // url уже содержит кэш-бастер ?v= (пишет платформа) — используем как есть.
  function _renderAvatar(imgEl, fallbackEl, url, label) {
    if (!imgEl || !fallbackEl) return;
    fallbackEl.textContent = _initial(label);
    if (url) {
      imgEl.onerror = () => {           // битая/недоступная картинка → заглушка
        imgEl.classList.add('hidden');
        fallbackEl.classList.remove('hidden');
      };
      imgEl.onload = () => {
        imgEl.classList.remove('hidden');
        fallbackEl.classList.add('hidden');
      };
      // hidden до onload, чтобы не мелькала «сломанная картинка»
      imgEl.classList.add('hidden');
      fallbackEl.classList.remove('hidden');
      imgEl.src = url;
    } else {
      imgEl.removeAttribute('src');
      imgEl.classList.add('hidden');
      fallbackEl.classList.remove('hidden');
    }
  }

  // ── Navbar ────────────────────────────────────────────────────────────
  function _updateNavbar(user, isAdmin) {
    document.getElementById('btn-login') ?.classList.toggle('hidden', !!user);
    document.getElementById('btn-logout')?.classList.toggle('hidden', !user);
    document.getElementById('btn-admin') ?.classList.toggle('hidden', !isAdmin);
    const ui   = document.getElementById('user-info');
    const chip = document.getElementById('user-chip');
    // Показываем display_name если есть, иначе email
    const label = user ? (Profile.displayName() || user.email) : '';
    if (ui) ui.textContent = label;
    if (chip) chip.classList.toggle('hidden', !user);
    _renderAvatar(
      document.getElementById('nav-avatar-img'),
      document.getElementById('nav-avatar-fallback'),
      user ? Profile.avatarUrl() : null,
      label,
    );
  }

  // ── Hero-кнопка скачивания ─────────────────────────────────────────
  function _updateHeroBtn(user) {
    const btn = document.getElementById('hero-platform-dl');
    if (!btn) return;
    const sub   = btn.querySelector('.dl-sub');
    const arrow = btn.querySelector('.dl-arrow');
    if (user) {
      btn.classList.remove('btn-download-lock');
      if (sub)   sub.textContent   = 'Бесплатно · Windows · Без установки';
      if (arrow) arrow.textContent = '↓';
      btn.onclick = () => {
        const t = document.getElementById('ig-title');
        if (t) t.textContent = 'Установка Vacantrix Platform';
        const modal = document.getElementById('install-guide');
        if (modal) {
          for (let i = 1; i <= 4; i++) {
            const s = document.getElementById(`igs-${i}`);
            if (s) s.className = 'ig-step';
          }
          const s1 = document.getElementById('igs-1');
          if (s1) s1.className = 'ig-step active';
          modal.classList.remove('hidden');
          setTimeout(() => {
            const el1 = document.getElementById('igs-1');
            const el2 = document.getElementById('igs-2');
            if (el1) el1.className = 'ig-step done';
            if (el2) el2.className = 'ig-step active';
          }, 2000);
        }
        window.location.href = _PLATFORM_URL;
      };
    } else {
      btn.classList.add('btn-download-lock');
      if (sub)   sub.textContent   = 'Войдите, чтобы скачать';
      if (arrow) arrow.textContent = '🔒';
      btn.onclick = () => document.getElementById('btn-login')?.click();
    }
  }

  // ── Настройки ────────────────────────────────────────────────────────
  function _renderSettings(user) {
    const container = document.getElementById('settings-content');
    if (!container) return;
    if (!user) {
      container.innerHTML = `
        <div class="settings-locked reveal">
          <div class="settings-lock-icon">🔒</div>
          <h3>Войдите в аккаунт</h3>
          <p>Для доступа к настройкам необходима авторизация.</p>
          <button class="btn-primary" style="margin-top:8px"
                  onclick="document.getElementById('btn-login').click()">Войти / Зарегистрироваться</button>
        </div>`;
    } else {
      const since    = new Date(user.created_at).toLocaleDateString('ru-RU',
        { year: 'numeric', month: 'long', day: 'numeric' });
      const profile  = Profile.current();
      const dispName = Profile.displayName();
      const sub      = Profile.subscriptionText();

      // ── Карточка «Профиль» ────────────────────────────────────────────
      const profileCard = `
        <div class="settings-card reveal">
          <div class="settings-card-header">
            <span id="settings-avatar" class="avatar avatar-lg">
              <img id="settings-avatar-img" alt="" class="hidden">
              <span id="settings-avatar-fallback" class="avatar-fallback"></span>
            </span>
            <h3>Профиль</h3>
          </div>
          ${dispName ? `
          <div class="settings-item">
            <span class="settings-label">Ник</span>
            <span class="settings-value" style="font-weight:600">${_escHtml(dispName)}</span>
          </div>` : ''}
          <div class="settings-item">
            <span class="settings-label">Email</span>
            <span class="settings-value">${_escHtml(user.email)}</span>
          </div>
          <div class="settings-item">
            <span class="settings-label">Аккаунт создан</span>
            <span class="settings-value">${since}</span>
          </div>
          ${sub ? `
          <div class="settings-item">
            <span class="settings-label">Подписка</span>
            <span class="settings-value" style="color:${sub.active ? '#50c878' : '#e05555'}">${_escHtml(sub.text)}</span>
          </div>` : ''}
        </div>`;

      // ── Карточка «Приложения» ─────────────────────────────────────────
      const hhLinked    = !!profile?.hh_applicant_id;
      const avitoLinked = !!profile?.avito_user_id;

      const appsCard = `
        <div class="settings-card reveal" style="transition-delay:.08s">
          <div class="settings-card-header"><span class="settings-icon">🔗</span><h3>Подключённые приложения</h3></div>
          <div class="settings-item">
            <span class="settings-label">HH.ru бот</span>
            <span class="settings-value" style="color:${hhLinked ? '#50c878' : '#7878a0'}">
              ${hhLinked ? '✓ ' + _escHtml(profile.hh_username || profile.hh_applicant_id) : 'Не подключён'}
            </span>
          </div>
          <div class="settings-item">
            <span class="settings-label">Авито бот</span>
            <span class="settings-value" style="color:${avitoLinked ? '#50c878' : '#7878a0'}">
              ${avitoLinked ? '✓ ' + _escHtml(profile.avito_username || profile.avito_user_id) : 'Не подключён'}
            </span>
          </div>
          ${!hhLinked && !avitoLinked ? `
          <div style="margin-top:10px">
            <div class="settings-sub" style="margin-bottom:8px">
              Введите ID из десктоп-приложения (кнопка «📋 Копировать ID») чтобы привязать аккаунт.
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input id="link-hh-id" class="input-sm" placeholder="HH applicant ID" style="flex:1;min-width:140px">
              <button class="btn-outline sm" id="btn-link-hh">Привязать HH</button>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
              <input id="link-avito-id" class="input-sm" placeholder="Avito user ID" style="flex:1;min-width:140px">
              <button class="btn-outline sm" id="btn-link-avito">Привязать Авито</button>
            </div>
            <div id="link-error" style="color:#e05555;font-size:12px;margin-top:6px"></div>
          </div>` : `
          <div style="margin-top:8px">
            <button class="btn-ghost sm" id="btn-unlink-apps" style="font-size:12px;color:#7878a0">Отвязать</button>
          </div>`}
        </div>`;

      // ── Безопасность + выход ──────────────────────────────────────────
      const secCard = `
        <div class="settings-card reveal" style="transition-delay:.16s">
          <div class="settings-card-header"><span class="settings-icon">🔐</span><h3>Безопасность</h3></div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-label">Пароль</span>
              <div class="settings-sub">Изменить пароль от аккаунта</div>
            </div>
            <button class="btn-outline sm" id="btn-change-pwd">Изменить</button>
          </div>
        </div>
        <div class="settings-card danger-card reveal" style="transition-delay:.24s">
          <div class="settings-card-header"><span class="settings-icon">🚪</span><h3>Выход</h3></div>
          <div class="settings-row">
            <div class="settings-row-info">
              <span class="settings-label">Завершить сессию</span>
              <div class="settings-sub">Выйти из аккаунта на этом устройстве</div>
            </div>
            <button class="btn-danger sm" id="btn-settings-logout">Выйти</button>
          </div>
        </div>`;

      container.innerHTML = `<div class="settings-grid">${profileCard}${appsCard}${secCard}</div>`;

      // Аватар в карточке профиля (рендерим после вставки разметки).
      _renderAvatar(
        document.getElementById('settings-avatar-img'),
        document.getElementById('settings-avatar-fallback'),
        Profile.avatarUrl(),
        dispName || user.email,
      );

      // ── Обработчики ───────────────────────────────────────────────────
      document.getElementById('btn-change-pwd')?.addEventListener('click', () => {
        document.getElementById('pwd-error').textContent = '';
        document.getElementById('pwd-new').value = '';
        document.getElementById('pwd-confirm').value = '';
        document.getElementById('pwd-modal')?.classList.remove('hidden');
      });
      document.getElementById('btn-settings-logout')?.addEventListener('click', async () => {
        await Auth.signOut();
      });

      // Привязка HH
      document.getElementById('btn-link-hh')?.addEventListener('click', async () => {
        const id  = document.getElementById('link-hh-id')?.value.trim();
        const err = document.getElementById('link-error');
        if (!id) { if (err) err.textContent = 'Введите HH applicant ID.'; return; }
        if (err) err.textContent = '';
        try {
          await Profile.linkHH(id, user.id);
          _renderSettings(user);  // перерисовываем с обновлёнными данными
          _updateNavbar(user, Auth.isAdmin());
        } catch (e) {
          if (err) err.textContent = e.message;
        }
      });

      // Привязка Авито
      document.getElementById('btn-link-avito')?.addEventListener('click', async () => {
        const id  = document.getElementById('link-avito-id')?.value.trim();
        const err = document.getElementById('link-error');
        if (!id) { if (err) err.textContent = 'Введите Avito user ID.'; return; }
        if (err) err.textContent = '';
        try {
          await Profile.linkAvito(id, user.id);
          _renderSettings(user);
          _updateNavbar(user, Auth.isAdmin());
        } catch (e) {
          if (err) err.textContent = e.message;
        }
      });

      // Отвязать
      document.getElementById('btn-unlink-apps')?.addEventListener('click', async () => {
        if (!confirm('Отвязать приложения от этого аккаунта?')) return;
        await Profile.unlink();
        _renderSettings(user);
        _updateNavbar(user, Auth.isAdmin());
      });
    }
    _initReveal();
  }

  function _showInfo(msg) {
    const el = document.getElementById('global-info');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 8000);
  }

  function _mapError(msg) {
    if (!msg) return 'Неизвестная ошибка.';
    if (msg.includes('Invalid login'))       return 'Неверный email или пароль.';
    if (msg.includes('Email not confirmed')) return 'Подтвердите email — проверьте почту.';
    if (msg.includes('already registered'))  return 'Этот email уже зарегистрирован.';
    if (msg.includes('Token has expired'))   return 'Код устарел. Войдите снова, чтобы получить новый.';
    if (msg.includes('otp_disabled'))        return 'Ошибка конфигурации OTP. Попробуйте войти с галочкой «Запомнить».';
    return msg;
  }

  // ════════════════════════════════════════════════════════════════════
  // ШАГИ:
  //  1. Немедленно регистрируем ВСЕ обработчики кнопок (синхронно)
  //  2. Инициализируем данные в фоне (без блокировки UI)
  // ════════════════════════════════════════════════════════════════════

  // ── 1. Вкладки (регистрация немедленно) ─────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.add('active');
      // Уход с app-роута (#app/<key>): чистим хэш и прячем #tab-app. Активную
      // вкладку мы уже выставили выше — clearRoute её НЕ трогает.
      if (window.AppDetail && AppDetail.clearRoute) AppDetail.clearRoute();
      requestAnimationFrame(_initReveal);
    });
  });

  // ── 1. Плитки «Инструменты экосистемы» (2D) кликабельны → раздел приложения ─
  // В 3D-режиме планеты обрабатывает intro3d.js (плитки .eco-stage скрыты), здесь
  // — только 2D. Делегат покрывает и сами плитки, и кнопку .eco-cta внутри них.
  document.getElementById('eco-stage')?.addEventListener('click', e => {
    if (document.body.classList.contains('mode-3d')) return;   // 3D — не наша зона
    const tile = e.target.closest('.eco-node, .eco-core');
    if (!tile) return;
    const key = tile.dataset.key;
    if (key && window.AppDetail && (window.APP_DATA || {})[key]) AppDetail.open(key);
  });

  // ── 1. Модальное окно авторизации ────────────────────────────────────
  const modal    = document.getElementById('auth-modal');
  const otpModal = document.getElementById('otp-modal');
  const authErr  = document.getElementById('auth-error');
  const otpErr   = document.getElementById('otp-error');
  let _pendingEmail = '';

  document.getElementById('btn-login')?.addEventListener('click', () => {
    modal.classList.remove('hidden');
    if (authErr) authErr.textContent = '';
    document.getElementById('auth-form')?.reset();
  });
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await Auth.signOut();
  });
  document.getElementById('modal-close')?.addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('otp-close')?.addEventListener('click', () => otpModal.classList.add('hidden'));
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  otpModal?.addEventListener('click', e => { if (e.target === otpModal) otpModal.classList.add('hidden'); });

  // ── 1. Переключение вход / регистрация ───────────────────────────────
  document.getElementById('switch-mode')?.addEventListener('click', () => {
    const submitBtn = document.getElementById('auth-submit');
    const isLogin   = submitBtn.dataset.mode === 'login';
    submitBtn.dataset.mode = isLogin ? 'register' : 'login';
    document.getElementById('auth-title').textContent    = isLogin ? 'Регистрация' : 'Вход';
    submitBtn.textContent                                 = isLogin ? 'Зарегистрироваться' : 'Войти';
    document.getElementById('switch-mode').textContent   = isLogin ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться';
    document.getElementById('remember-row').style.display = isLogin ? 'none' : 'flex';
    // Согласия показываем только в режиме регистрации (обратно remember-row)
    const consentRow   = document.getElementById('consent-row');
    const marketingRow = document.getElementById('marketing-row');
    if (consentRow)   consentRow.style.display   = isLogin ? 'flex' : 'none';
    if (marketingRow) marketingRow.style.display = isLogin ? 'flex' : 'none';
    if (authErr) authErr.textContent = '';
  });

  // ── 1. Отправка формы ────────────────────────────────────────────────
  document.getElementById('auth-submit')?.addEventListener('click', async () => {
    const email    = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const remember = document.getElementById('auth-remember')?.checked ?? false;
    const mode     = document.getElementById('auth-submit').dataset.mode;
    if (authErr) authErr.textContent = '';
    if (!email || !password) { if (authErr) authErr.textContent = 'Введите email и пароль.'; return; }
    try {
      if (mode === 'register') {
        const consent = document.getElementById('auth-consent')?.checked ?? false;
        if (!consent) {
          if (authErr) authErr.textContent = 'Чтобы зарегистрироваться, примите оферту и согласие на обработку данных.';
          return;
        }
        const marketing = document.getElementById('auth-marketing')?.checked ?? false;
        const { needsConfirmation } = await Auth.register(email, password, { marketing });
        modal.classList.add('hidden');
        if (needsConfirmation) _showInfo('Письмо с подтверждением отправлено на ' + email + '.');
      } else {
        const { needsOtp } = await Auth.loginPassword(email, password, remember);
        if (needsOtp) {
          _pendingEmail = email;
          modal.classList.add('hidden');
          if (otpErr) otpErr.textContent = '';
          const hint = document.getElementById('otp-hint');
          if (hint) hint.textContent = `Код отправлен на ${email}`;
          document.getElementById('otp-input').value = '';
          otpModal.classList.remove('hidden');
        } else {
          modal.classList.add('hidden');
        }
      }
    } catch (e) {
      if (authErr) authErr.textContent = _mapError(e.message);
    }
  });

  // ── 1. OTP ───────────────────────────────────────────────────────────
  document.getElementById('otp-submit')?.addEventListener('click', async () => {
    const token = document.getElementById('otp-input').value.trim();
    if (otpErr) otpErr.textContent = '';
    if (!token) { if (otpErr) otpErr.textContent = 'Введите код.'; return; }
    try {
      await Auth.verifyOtp(_pendingEmail, token);
      otpModal.classList.add('hidden');
    } catch (e) {
      if (otpErr) otpErr.textContent = _mapError(e.message);
    }
  });

  // ── 1. Смена пароля ──────────────────────────────────────────────────
  const pwdModal = document.getElementById('pwd-modal');
  document.getElementById('pwd-close')?.addEventListener('click', () => pwdModal?.classList.add('hidden'));
  pwdModal?.addEventListener('click', e => { if (e.target === pwdModal) pwdModal.classList.add('hidden'); });
  document.getElementById('pwd-submit')?.addEventListener('click', async () => {
    const newPwd  = document.getElementById('pwd-new').value;
    const confirm = document.getElementById('pwd-confirm').value;
    const err     = document.getElementById('pwd-error');
    if (err) err.textContent = '';
    if (!newPwd || newPwd.length < 6) { if (err) err.textContent = 'Минимум 6 символов.'; return; }
    if (newPwd !== confirm) { if (err) err.textContent = 'Пароли не совпадают.'; return; }
    try {
      await Auth.updatePassword(newPwd);
      pwdModal?.classList.add('hidden');
      _showInfo('Пароль успешно изменён.');
    } catch (e) { if (err) err.textContent = e.message; }
  });

  // ── 1. Лайтбокс ──────────────────────────────────────────────────────
  document.getElementById('lb-close')?.addEventListener('click', Apps.lbClose);
  document.getElementById('lb-prev')?.addEventListener('click', Apps.lbPrev);
  document.getElementById('lb-next')?.addEventListener('click', Apps.lbNext);
  document.getElementById('lightbox')?.addEventListener('click', e => {
    if (e.target.id === 'lightbox') Apps.lbClose();
  });

  // ── Подписка на изменения авторизации ────────────────────────────────
  Auth.onChange(async (user, isAdmin) => {
    if (user) {
      // Загружаем профиль из vx_profiles; ошибка не должна ломать остальной UI/каталог
      try { await Profile.load(user.id); }
      catch (e) { console.warn('Profile.load error:', e.message); }
    }
    _updateNavbar(user, isAdmin);
    Apps.rerender();
    _renderSettings(user);
    _updateHeroBtn(user);
  });

  // ── Начальное состояние UI (до загрузки данных) ───────────────────────
  _updateNavbar(null, false);
  _renderSettings(null);
  _updateHeroBtn(null);

  // ── 2. Асинхронная загрузка данных в фоне (не блокирует UI) ──────────
  (async () => {
    // Прогреваем кэш тарифов сразу — чтобы Pricing.forTool был готов
    // к моменту открытия карточки приложения (рельс цены).
    if (typeof Pricing !== 'undefined') Pricing.load().catch(e => console.warn('Pricing.load:', e?.message || e));

    // Auth с таймаутом 5 сек — если зависнет, продолжаем без него
    try {
      await Promise.race([
        Auth.init(),
        new Promise((_, r) => setTimeout(() => r(new Error('auth_timeout')), 5000)),
      ]);
    } catch (e) {
      if (e.message !== 'auth_timeout') console.warn('Auth.init error:', e.message);
    }

    // Загружаем профиль платформы и обновляем UI.
    // ВАЖНО: ошибка профиля (например, протухшая сессия в localStorage) НЕ должна
    // прерывать загрузку каталога — иначе приложения «пропадают» в обычном браузере,
    // но видны в инкогнито. Поэтому Profile.load обёрнут в try/catch.
    const curUser = Auth.currentUser();
    if (curUser) {
      try { await Profile.load(curUser.id); }
      catch (e) { console.warn('Profile.load error:', e.message); }
    }
    _updateNavbar(curUser, Auth.isAdmin());
    _renderSettings(curUser);
    _updateHeroBtn(curUser);

    // Площадки и каталог приложений — грузим ВСЕГДА, независимо от авторизации.
    try { Platforms.loadAndRender(); } catch (e) { console.warn('Platforms error:', e); }
    await Apps.loadAndRender().catch(e => console.warn('Apps error:', e));

    // Тарифы — динамически из Supabase (рендер устойчив к пустому/оффлайн ответу).
    if (typeof Pricing !== 'undefined') {
      Pricing.loadAndRender().catch(e => console.warn('Pricing error:', e?.message || e));
    }

    _initReveal();
  })();
});

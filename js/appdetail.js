// =====================================================================
// Модуль «Раздел приложения» — AppDetail.open(key) + хэш-роутер #app/<key>.
//
// РАНЬШЕ был фуллскрин-модалкой (#app-detail overlay). ТЕПЕРЬ — навигируемый
// РАЗДЕЛ-страница внутри сайта (настоящий переход по ссылке):
//   • AppDetail.open(key) НЕ строит оверлей, а НАВИГИРУЕТ: location.hash='#app/'+key.
//     Зовут apps.js (карточки), intro3d.js (3D-планеты) и main.js (2D-плитки) —
//     им менять ничего не нужно, вызов стал навигацией автоматически.
//   • Хэш-роутер (hashchange + первичная загрузка) рендерит контент в #tab-app,
//     скрывает остальные .tab-panel, активирует #tab-app, прокручивает вверх.
//   • Контент строит тот же _build(d) из window.APP_DATA[key]; рельс цены —
//     Pricing.forTool, скриншоты — лайтбокс Apps.openLightbox('appdetail', i).
//
// «← Назад к инструментам» (.ad-back): есть внутрисайтовая история → history.back();
// прямой заход по ссылке #app/hh → фолбек на каталог (без ухода с сайта в пустоту).
// Интеграция с вкладками: js/main.js зовёт AppDetail.clearRoute() при клике вкладки.
// Никакого fixed-оверлея, scroll-lock и закрытия по Esc больше нет.
// =====================================================================

const AppDetail = (() => {

  let _initialized = false;
  let _openKey      = null;   // ключ показываемого раздела (null = не на app-роуте)
  let _returnTab    = null;   // вкладка, с которой вошли в раздел (для возврата)
  let _cameFromSite = false;  // переход был ВНУТРИ сайта (есть куда history.back())

  function _esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // Короткий период для рельса (после слэша): «7 дней» / «месяц» / «год».
  function _period(days) {
    const d = Number(days) || 0;
    if (d === 7)   return '7 дней';
    if (d === 30)  return 'месяц';
    if (d === 365) return 'год';
    if (d && d % 30 === 0) return (d / 30) + ' мес.';
    return d ? d + ' дн.' : '';
  }

  // ── CTA ──────────────────────────────────────────────────────────────
  function _ctaHtml(d) {
    if (d.status === 'soon') {
      return `<a class="ad-cta" href="https://t.me/VacantrixB_O_T" target="_blank" rel="noopener">${_esc(d.ctaSoon || 'Узнать первым')}</a>`;
    }
    const label = _esc(d.ctaLive || 'Подробнее');
    // У инструмента есть собственный EXE в web_apps → кнопка скачивания
    // с логин-гейтом (как в apps.js). Иначе — действие платформы.
    let url = null;
    try { if (typeof Apps !== 'undefined' && Apps.appByKey) url = (Apps.appByKey(d.key) || {}).download_url || null; }
    catch (e) { /* кэш приложений ещё не готов — мягкий фолбек ниже */ }

    if (url) {
      const logged = (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn());
      const action = logged
        ? `Apps.startDownload('${_esc(url)}')`
        : `document.getElementById('btn-login').click()`;
      return `<button class="ad-cta" type="button" onclick="${action}">${label}</button>`;
    }
    // Нет своего EXE (биржа/платформа) → запускаем установку платформы
    // (#hero-platform-dl сам гейтит логин и показывает гид установки).
    return `<button class="ad-cta" type="button" onclick="document.getElementById('hero-platform-dl')?.click()">${label}</button>`;
  }

  // ── Рельс: цена ──────────────────────────────────────────────────────
  function _railPrice(d) {
    if (d.status === 'soon') {
      return `
        <div class="ad-rail-card ad-rail-soon">
          <span class="ad-soon-badge">Скоро</span>
          <p>${_esc(d.soonNote || 'Инструмент в разработке.')}</p>
          ${_ctaHtml(d)}
        </div>`;
    }

    const plans = (d.toolSlug && typeof Pricing !== 'undefined') ? Pricing.forTool(d.toolSlug) : [];
    let body;
    if (plans && plans.length) {
      body = `<div class="ad-plan-list">${plans.map(p => {
        const n = Number(p.price_rub) || 0;
        const txt = n === 0 ? 'Бесплатно' : n.toLocaleString('ru-RU') + ' ₽';
        const per = n === 0 ? '' : `<small> / ${_esc(_period(p.duration_days))}</small>`;
        return `<div class="ad-plan">
            <span class="ad-plan-name">${_esc(p.name || 'План')}</span>
            <span class="ad-plan-price">${_esc(txt)}${per}</span>
          </div>`;
      }).join('')}</div>`;
    } else {
      // Планов нет/кэш не готов — мягкий фолбек без выдуманных чисел.
      body = `
        <div class="ad-price-free">Бесплатный старт</div>
        <p class="ad-price-sub">Базовые возможности — без подписки и карты.</p>`;
    }

    return `
      <div class="ad-rail-card">
        <div class="ad-rail-label">Стоимость</div>
        ${body}
        ${_ctaHtml(d)}
      </div>`;
  }

  // ── Рельс: паспорт инструмента ───────────────────────────────────────
  function _passport(d) {
    const feats = Array.isArray(d.features) ? d.features : [];
    return `
      <div class="ad-rail-card ad-passport">
        <h4>Паспорт инструмента</h4>
        ${d.surfaces ? `
          <div class="ad-pass-row">
            <span class="k">Где работает</span>
            ${String(d.surfaces).split(/[,·]/).map(s => s.trim()).filter(Boolean)
              .map(s => `<span class="v">${_esc(s)}</span>`).join('')}
          </div>` : ''}
        ${feats.length ? `
          <div class="ad-pass-row"><span class="k">Возможности</span></div>
          <ul class="ad-features">${feats.map(f => `<li>${_esc(f)}</li>`).join('')}</ul>` : ''}
      </div>`;
  }

  // ── Сборка раздела ───────────────────────────────────────────────────
  // Контент идентичен прежней карточке-модалке; вместо ✕ вверху — «Назад».
  // Это уже НЕ диалог (нет role=dialog/aria-modal) — обычная страница-раздел.
  function _build(d) {
    const isLive = d.status === 'live';
    const how    = Array.isArray(d.how) ? d.how : [];
    const steps  = Array.isArray(d.steps) ? d.steps : [];
    const tips   = Array.isArray(d.tips) ? d.tips : [];
    const shots  = Array.isArray(d.screenshots) ? d.screenshots : [];

    // Иконка с emoji-фолбеком (как в .eco-stage): onerror кладёт emoji в бокс.
    const ico = d.icon
      ? `<span class="ad-hero-ico"><img src="${_esc(d.icon)}" alt="" onerror="this.parentNode.textContent='${d.emoji || ''}'"></span>`
      : `<span class="ad-hero-ico">${_esc(d.emoji || '•')}</span>`;

    return `
      <div class="app-detail-panel ad-section-page" aria-label="${_esc(d.name)}">
        <button class="ad-back" type="button" data-detail-back>← Назад к инструментам</button>
        <div class="app-detail-grid">

          <div class="ad-main">
            <div class="ad-hero">
              ${ico}
              <div>
                <span class="ad-status ${d.beta ? 'beta' : isLive ? 'live' : 'soon'}">${d.beta ? 'Бета' : isLive ? 'Работает' : 'Скоро'}</span>
                <h2 class="ad-name">${_esc(d.name)}</h2>
                <p class="ad-tagline">${_esc(d.tagline)}</p>
              </div>
            </div>

            ${d.beta && d.betaNote ? `
              <div class="ad-beta-note">${_esc(d.betaNote)}</div>` : ''}

            ${d.video ? `
              <div class="ad-video">
                <video src="${_esc(d.video)}"${d.poster ? ` poster="${_esc(d.poster)}"` : ''}
                       controls muted loop playsinline preload="metadata"></video>
              </div>` : ''}

            ${d.whatis ? `
              <section class="ad-section"><h3>Что это</h3><p>${_esc(d.whatis)}</p></section>` : ''}

            ${how.length ? `
              <section class="ad-section">
                <h3>Как работает</h3>
                <ul class="ad-list">${how.map(h => `<li>${_esc(h)}</li>`).join('')}</ul>
              </section>` : ''}

            ${isLive && steps.length ? `
              <section class="ad-section">
                <h3>Как начать</h3>
                <ol class="ad-steps">${steps.map(s => `<li>${_esc(s)}</li>`).join('')}</ol>
              </section>` : ''}

            ${tips.length ? `
              <section class="ad-section">
                <h3>Рекомендации по работе</h3>
                <ul class="ad-list ad-tips">${tips.map(t => `<li>${_esc(t)}</li>`).join('')}</ul>
              </section>` : ''}

            ${shots.length ? `
              <section class="ad-section">
                <h3>Скриншоты</h3>
                <div class="ad-shots" id="track-appdetail">
                  ${shots.map((s, i) => `
                    <div class="screenshot-item ad-shot" onclick="Apps.openLightbox('appdetail', ${i})">
                      <img src="${_esc(s)}" alt="Скриншот ${i + 1}" loading="lazy">
                    </div>`).join('')}
                </div>
              </section>` : ''}
          </div>

          <aside class="ad-rail">
            ${_railPrice(d)}
            ${_passport(d)}
          </aside>

        </div>
      </div>`;
  }

  // ── Имя активной вкладки (для запоминания точки возврата) ──────────────
  function _activeTabName() {
    const p = document.querySelector('.tab-panel.active');
    if (!p || !p.id) return null;
    const name = p.id.replace(/^tab-/, '');
    return name === 'app' ? null : name;   // сам раздел не считается точкой возврата
  }

  // ── Парсинг хэша → ключ приложения или null ───────────────────────────
  function _routeKey() {
    const m = (location.hash || '').match(/^#app\/(.+)$/);
    if (!m) return null;
    let k; try { k = decodeURIComponent(m[1]); } catch (e) { k = m[1]; }
    return k;
  }

  // ── Показать раздел приложения ────────────────────────────────────────
  function _showSection(key, panel) {
    panel.innerHTML = _build((window.APP_DATA || {})[key]);
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    panel.classList.add('active');
    document.body.classList.add('appdetail-open');   // 3D: панель справа, планета слева (CSS)
    _openKey = key;
    try { window.scrollTo(0, 0); } catch (e) {}
    if (window._initReveal) window._initReveal();
  }

  // ── Вернуть обычную вкладку (после выхода из раздела) ──────────────────
  // Фолбек _returnTab='apps' (каталог) для прямого захода по ссылке.
  function _restoreTab() {
    document.body.classList.remove('appdetail-open');
    const tab = _returnTab || 'apps';
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tab)?.classList.add('active');
    document.querySelectorAll('.tab-btn[data-tab="' + tab + '"]').forEach(b => b.classList.add('active'));
    if (window._initReveal) window._initReveal();
  }

  // ── Роутер: на hashchange и при первичной загрузке ────────────────────
  function _route() {
    const panel = document.getElementById('tab-app');
    if (!panel) return;
    const key = _routeKey();
    if (key && (window.APP_DATA || {})[key]) {
      _showSection(key, panel);
    } else {
      // Уходим с app-роута (или его и не было). Восстанавливаем вкладку ТОЛЬКО
      // если реально показывали раздел — чтобы не сбить дефолтную #tab-home при
      // обычной первичной загрузке без хэша.
      const wasApp = _openKey !== null || panel.classList.contains('active');
      panel.classList.remove('active');
      panel.innerHTML = '';
      _openKey = null;
      if (wasApp) _restoreTab();
    }
  }

  // ── «Назад к инструментам» ────────────────────────────────────────────
  function _back() {
    if (_cameFromSite && window.history.length > 1) {
      window.history.back();   // вернёт прежнее состояние → hashchange → _restoreTab
    } else {
      // Прямой заход по ссылке: чистим хэш без новой записи истории, показываем каталог.
      try { history.replaceState(null, '', location.pathname + location.search); }
      catch (e) { location.hash = ''; }
      _openKey = null;
      _restoreTab();
    }
  }

  // ── Init: один раз — делегат «Назад» + слушатель hashchange + первый роут ─
  function _ensureInit() {
    if (_initialized) return;
    const panel = document.getElementById('tab-app');
    if (!panel) return;
    _initialized = true;
    panel.addEventListener('click', e => {
      if (e.target.closest && e.target.closest('[data-detail-back]')) { e.preventDefault(); _back(); }
    });
    window.addEventListener('hashchange', _route);
    _route();   // первичный разбор — поддержка прямого захода по ссылке #app/<key>
  }

  // ── Публичное API ─────────────────────────────────────────────────────
  // open(key) — теперь НАВИГАЦИЯ, а не модалка. Зовут apps.js / intro3d.js / main.js.
  function open(key) {
    if (!(window.APP_DATA || {})[key]) { console.warn('AppDetail: нет данных для ключа', key); return; }
    _ensureInit();
    if (_openKey === null) _returnTab = _activeTabName() || 'apps';   // запоминаем точку возврата
    _cameFromSite = true;
    const target = '#app/' + encodeURIComponent(key);
    if (location.hash === target) _route();   // тот же хэш → hashchange не сработает, рендерим вручную
    else location.hash = target;
  }

  // Сброс app-роута без захода в раздел (зовёт main.js при клике обычной вкладки).
  // main.js сам уже активировал нужную вкладку → здесь НЕ трогаем active-состояние,
  // только убираем хэш и прячем #tab-app.
  function clearRoute() {
    if (_routeKey() === null && _openKey === null) return;   // не на app-роуте — нечего чистить
    document.body.classList.remove('appdetail-open');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    const panel = document.getElementById('tab-app');
    if (panel) { panel.classList.remove('active'); panel.innerHTML = ''; }
    _openKey = null;
  }

  // Совместимость: close() = уйти из раздела к каталогу (как «Назад»).
  function close() { _back(); }

  // Первичная инициализация роутера. Скрипты в конце <body>, но при парсинге
  // readyState ещё 'loading' → инициализируемся на DOMContentLoaded, иначе сразу.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _ensureInit);
  else _ensureInit();

  return { open, close, clearRoute };
})();

window.AppDetail = AppDetail;

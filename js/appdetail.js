// =====================================================================
// Модуль «Полная карточка приложения» — AppDetail.open(key) / close().
//
// Строит фуллскрин-оверлей #app-detail из window.APP_DATA[key]
// (единый источник rich-контента; читают и 2D-apps.js, и 3D-intro3d.js).
// Лейаут зеркалит десктоп tool_detail_screen.py:
//   СЛЕВА  — hero, «Что это», «Как работает», «Как начать» (live), видео, скрины;
//   СПРАВА — рельс: цена (Pricing.forTool) + CTA + «Паспорт инструмента».
//
// Закрытие: ✕, клик по подложке, Esc. Esc/overlay-листенеры вешаются ОДИН
// раз (_ensureInit) → повторные open/close НЕ плодят обработчики.
// Скриншоты переиспользуют существующий лайтбокс (Apps.openLightbox).
// =====================================================================

const AppDetail = (() => {

  let _initialized = false;
  let _openKey = null;

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

  // ── Сборка панели ────────────────────────────────────────────────────
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
      <div class="app-detail-panel" role="dialog" aria-modal="true" aria-label="${_esc(d.name)}">
        <button class="ad-close" type="button" data-detail-close aria-label="Закрыть">✕</button>
        <div class="app-detail-grid">

          <div class="ad-main">
            <div class="ad-hero">
              ${ico}
              <div>
                <span class="ad-status ${isLive ? 'live' : 'soon'}">${isLive ? 'Работает' : 'Скоро'}</span>
                <h2 class="ad-name">${_esc(d.name)}</h2>
                <p class="ad-tagline">${_esc(d.tagline)}</p>
              </div>
            </div>

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

  // ── Init: глобальные закрытия (один раз) ─────────────────────────────
  function _ensureInit() {
    if (_initialized) return;
    const overlay = document.getElementById('app-detail');
    if (!overlay) return;
    _initialized = true;

    // Клик по подложке (вне панели) ИЛИ по кнопке ✕ → закрыть.
    overlay.addEventListener('click', e => {
      if (e.target === overlay || (e.target.closest && e.target.closest('[data-detail-close]'))) close();
    });
    // Esc — единственный keydown-листенер, активен только при открытой карточке.
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _openKey) close();
    });
  }

  // ── Публичное API ────────────────────────────────────────────────────
  function open(key) {
    const data = (window.APP_DATA || {})[key];
    if (!data) { console.warn('AppDetail: нет данных для ключа', key); return; }
    const overlay = document.getElementById('app-detail');
    if (!overlay) return;

    _ensureInit();
    overlay.innerHTML = _build(data);
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.scrollTop = 0;
    document.body.classList.add('app-detail-open');   // блок скролла страницы
    _openKey = key;
  }

  function close() {
    const overlay = document.getElementById('app-detail');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '';                            // снимаем DOM-листенеры панели
    document.body.classList.remove('app-detail-open');
    _openKey = null;
  }

  return { open, close };
})();

window.AppDetail = AppDetail;

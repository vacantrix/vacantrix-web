// =====================================================================
// Модуль «Приложения»
// =====================================================================

const Apps = (() => {

  let _cachedApps = [];

  async function load() {
    const { data, error } = await db
      .from('web_apps')
      .select('*')
      .eq('active', true)
      .order('sort_order');
    if (error) { console.error(error); return []; }
    return data || [];
  }

  function render(apps) {
    const container = document.getElementById('apps-content');
    if (!container) return;

    if (!apps.length) {
      container.innerHTML = '<p class="empty-hint">Приложения пока не добавлены.</p>';
      return;
    }

    container.innerHTML = '';
    const isSingle = apps.length === 1;

    const wrapper = document.createElement('div');
    wrapper.className = isSingle ? 'apps-single' : 'apps-grid';

    apps.forEach(app => {
      wrapper.appendChild(isSingle ? _renderFull(app) : _renderCard(app));
    });

    container.appendChild(wrapper);
  }

  // ── Полная презентация (один продукт) ────────────────────────────────
  function _renderFull(app) {
    const features = Array.isArray(app.features) ? app.features : [];
    const screenshots = Array.isArray(app.screenshots) ? app.screenshots : [];

    const el = document.createElement('div');
    el.className = 'app-full reveal';
    el.innerHTML = `
      <div class="app-full-hero">
        <div class="app-full-left">
          ${app.icon_url
            ? `<img class="app-icon-large" src="${_esc(app.icon_url)}" alt="${_esc(app.name)}">`
            : `<div class="app-icon-placeholder">${_esc(app.name[0])}</div>`
          }
          <div>
            <h2 class="app-title">${_esc(app.name)}</h2>
            <p class="app-tagline">${_esc(app.tagline)}</p>
          </div>
        </div>
        <div class="app-cta-row">
          ${app.download_url
            ? Auth.isLoggedIn()
              ? `<a class="btn-primary" href="${_esc(app.download_url)}" target="_blank">⬇ Скачать</a>`
              : `<button class="btn-primary" onclick="document.getElementById('btn-login').click()">⬇ Скачать</button>`
            : ''}
          ${app.appstore_url
            ? `<a class="btn-store" href="${_esc(app.appstore_url)}" target="_blank">🍎 App Store</a>`
            : ''}
          ${app.playstore_url
            ? `<a class="btn-store" href="${_esc(app.playstore_url)}" target="_blank">▶ Google Play</a>`
            : ''}
          ${app.website_url
            ? `<a class="btn-outline" href="${_esc(app.website_url)}" target="_blank">Подробнее →</a>`
            : ''}
        </div>
      </div>

      ${app.description
        ? `<p class="app-description">${_esc(app.description)}</p>`
        : ''}

      ${features.length ? `
        <ul class="app-features">
          ${features.map(f => `<li><span class="feat-check">✓</span>${_esc(f)}</li>`).join('')}
        </ul>` : ''}

      ${app.promo_video_url ? `
        <div class="app-video-wrap">
          <video src="${_esc(app.promo_video_url)}" controls muted loop
                 class="app-video" poster=""></video>
        </div>` : ''}

      ${screenshots.length ? `
        <div class="app-screenshots">
          <div class="screenshots-track" id="track-${app.id}">
            ${screenshots.map((s, i) => `
              <div class="screenshot-item ${i === 0 ? 'active' : ''}"
                   onclick="Apps.openLightbox('${_esc(app.id)}', ${i})">
                <img src="${_esc(s)}" alt="Скриншот ${i + 1}" loading="lazy">
              </div>`).join('')}
          </div>
          ${screenshots.length > 1 ? `
            <div class="screenshots-nav">
              ${screenshots.map((_, i) =>
                `<button class="dot ${i === 0 ? 'active' : ''}"
                         onclick="Apps.scrollTo('${app.id}', ${i})"
                         aria-label="Скриншот ${i + 1}"></button>`
              ).join('')}
            </div>` : ''}
        </div>` : ''}
    `;
    return el;
  }

  // ── Карточка в сетке (несколько продуктов) ───────────────────────────
  function _renderCard(app) {
    const el = document.createElement('div');
    el.className = 'app-card';
    el.innerHTML = `
      ${app.icon_url
        ? `<img class="app-card-icon" src="${_esc(app.icon_url)}" alt="${_esc(app.name)}">`
        : `<div class="app-card-icon-ph">${_esc(app.name[0])}</div>`}
      <h3 class="app-card-name">${_esc(app.name)}</h3>
      <p class="app-card-tagline">${_esc(app.tagline)}</p>
      <div class="app-card-btns">
        ${app.download_url
          ? Auth.isLoggedIn()
            ? `<a class="btn-primary sm" href="${_esc(app.download_url)}" target="_blank">⬇ Скачать</a>`
            : `<button class="btn-primary sm" onclick="document.getElementById('btn-login').click()">⬇ Скачать</button>`
          : ''}
        ${app.website_url
          ? `<a class="btn-outline sm" href="${_esc(app.website_url)}" target="_blank">Подробнее</a>`
          : ''}
      </div>
    `;
    return el;
  }

  // ── Лайтбокс ────────────────────────────────────────────────────────
  let _lightboxApp = null;
  let _lightboxIdx = 0;
  let _lightboxScreenshots = [];

  function openLightbox(appId, idx) {
    _lightboxApp = appId;
    _lightboxIdx = idx;
    const track = document.getElementById(`track-${appId}`);
    if (!track) return;
    _lightboxScreenshots = Array.from(track.querySelectorAll('img')).map(i => i.src);
    const lb = document.getElementById('lightbox');
    if (!lb) return;
    _updateLightbox();
    lb.classList.remove('hidden');
  }

  function _updateLightbox() {
    const img = document.getElementById('lb-img');
    const counter = document.getElementById('lb-counter');
    if (img) img.src = _lightboxScreenshots[_lightboxIdx];
    if (counter) counter.textContent =
      `${_lightboxIdx + 1} / ${_lightboxScreenshots.length}`;
  }

  function lbPrev() {
    _lightboxIdx = (_lightboxIdx - 1 + _lightboxScreenshots.length) % _lightboxScreenshots.length;
    _updateLightbox();
  }
  function lbNext() {
    _lightboxIdx = (_lightboxIdx + 1) % _lightboxScreenshots.length;
    _updateLightbox();
  }
  function lbClose() {
    const lb = document.getElementById('lightbox');
    if (lb) lb.classList.add('hidden');
  }

  // ── Прокрутка скриншотов ─────────────────────────────────────────────
  function scrollTo(appId, idx) {
    const track = document.getElementById(`track-${appId}`);
    if (!track) return;
    const items = track.querySelectorAll('.screenshot-item');
    items.forEach((el, i) => el.classList.toggle('active', i === idx));
    const dots = track.closest('.app-screenshots')?.querySelectorAll('.dot');
    if (dots) dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  function _esc(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
  }

  async function loadAndRender() {
    const container = document.getElementById('apps-content');
    if (container) container.innerHTML = '<div class="spinner"></div>';
    _cachedApps = await load();
    render(_cachedApps);
  }

  function rerender() {
    render(_cachedApps);
    if (window._initReveal) window._initReveal();
  }

  return { loadAndRender, rerender, openLightbox, lbPrev, lbNext, lbClose, scrollTo };
})();

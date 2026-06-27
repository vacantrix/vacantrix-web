// =====================================================================
// Модуль «Тарифы» — динамический рендер планов из Supabase `plans`.
// Зеркало стиля js/apps.js: load() / loadAndRender() / forTool() + кэш.
//   • dbPublic (anon) — прайс публичен, один источник правды с лаунчером
//     (vacantrix-platform читает те же `plans` анон-ключом).
//   • Любой ответ может быть пустым/недоступным (headless без сети) →
//     рендер устойчив: мягкий фолбек, страница не падает.
// =====================================================================

const Pricing = (() => {

  // null = ещё не грузили; [] = загрузили, но пусто/ошибка
  let _cachedPlans = null;

  async function load() {
    if (Array.isArray(_cachedPlans)) return _cachedPlans;
    try {
      const { data, error } = await dbPublic
        .from('plans')
        .select('*, tools(slug,name)')
        .eq('active', true)
        .order('sort_order');
      if (error) { console.warn('Pricing.load error:', error.message); _cachedPlans = []; }
      else       { _cachedPlans = data || []; }
    } catch (e) {
      console.warn('Pricing.load exception:', e?.message || e);
      _cachedPlans = [];
    }
    return _cachedPlans;
  }

  // Планы конкретного инструмента (по tools.slug) — для рельса в карточке.
  // Если кэш ещё не загружен — [] (карточка покажет мягкий фолбек).
  function forTool(slug) {
    if (!slug || !Array.isArray(_cachedPlans)) return [];
    return _cachedPlans.filter(p => !p.is_combo && p.tools && p.tools.slug === slug);
  }

  function _esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function _price(rub) {
    const n = Number(rub) || 0;
    return n === 0 ? null : n.toLocaleString('ru-RU');
  }

  // Полный период для карточки прайса.
  function _periodLabel(days) {
    const d = Number(days) || 0;
    if (d === 7)   return 'на 7 дней';
    if (d === 30)  return 'в месяц';
    if (d === 365) return 'на год';
    if (d && d % 30 === 0) return 'на ' + (d / 30) + ' мес.';
    return d ? 'на ' + d + ' дн.' : '';
  }

  function _planCard(p) {
    const price = _price(p.price_rub);
    const priceHtml = price
      ? `<div class="pricing-price">${price}<span>₽</span></div>`
      : `<div class="pricing-price pricing-free">Бесплатно</div>`;
    const cta = price
      ? `<a class="btn-primary pricing-btn" href="https://t.me/VacantrixB_O_T" target="_blank" rel="noopener">Оформить</a>`
      : `<a class="btn-outline pricing-btn" href="https://t.me/VacantrixB_O_T" target="_blank" rel="noopener">Начать бесплатно</a>`;
    return `
      <div class="pricing-card reveal">
        <div class="pricing-badge">${_esc(p.name || 'План')}</div>
        ${priceHtml}
        <div class="pricing-period">${_esc(_periodLabel(p.duration_days))}</div>
        ${cta}
      </div>`;
  }

  // Есть ли в выборке план данного инструмента (по tools.slug).
  function _hasProduct(list, slug) {
    return list.some(p => !p.is_combo && p.tools && p.tools.slug === slug);
  }

  // Статический информблок «Биржа задач»: оплата напрямую исполнителю,
  // без подписки платформы. НЕ заявляем удержание денег.
  function _tasksBlock() {
    return `
      <div class="pricing-info reveal">
        <h3>Биржа задач — без подписки платформы</h3>
        <p>Размещать задачи и откликаться можно бесплатно. Оплата за работу проходит
        напрямую исполнителю — отдельная подписка на саму биржу не нужна.</p>
      </div>`;
  }

  // Фолбек-прайс Publisher (Free / Pro) — только если его нет в выборке `plans`.
  function _publisherBlock() {
    return `
      <div class="pricing-group reveal">
        <h3 class="pricing-group-title">Vacantrix Publisher</h3>
        <div class="pricing-grid">
          <div class="pricing-card reveal">
            <div class="pricing-badge">Free</div>
            <div class="pricing-price pricing-free">Бесплатно</div>
            <div class="pricing-period">базовый кросс-постинг</div>
            <a class="btn-outline pricing-btn" href="https://t.me/VacantrixB_O_T" target="_blank" rel="noopener">Начать бесплатно</a>
          </div>
          <div class="pricing-card featured reveal">
            <div class="pricing-badge popular">★ Pro</div>
            <div class="pricing-price">399<span>₽</span></div>
            <div class="pricing-period">в месяц</div>
            <a class="btn-primary pricing-btn" href="https://t.me/VacantrixB_O_T" target="_blank" rel="noopener">Оформить</a>
          </div>
        </div>
      </div>`;
  }

  function render(plans) {
    const container = document.getElementById('pricing-content');
    if (!container) return;

    const list = Array.isArray(plans) ? plans : [];

    // Группировка: продукты по tools.slug + отдельная группа «Комбо».
    const groups = [];
    const byKey = {};
    function bucket(key, title) {
      if (!byKey[key]) { byKey[key] = { key, title, plans: [] }; groups.push(byKey[key]); }
      return byKey[key];
    }
    list.forEach(p => {
      if (p.is_combo) { bucket('__combo', 'Комбо').plans.push(p); return; }
      const slug  = (p.tools && p.tools.slug) || 'other';
      // Заголовок группы — курируемое имя из APP_DATA (как на карточках),
      // фолбек на tools.name из БД. Цифры/планы всегда из БД (источник правды).
      const wkey  = window.APP_KEY_BY_SLUG ? window.APP_KEY_BY_SLUG[slug] : null;
      const title = (wkey && window.APP_DATA && window.APP_DATA[wkey] && window.APP_DATA[wkey].name)
        || (p.tools && p.tools.name)
        || 'Подписка';
      bucket(slug, title).plans.push(p);
    });

    let html = '';

    if (!groups.length) {
      // Мягкий фолбек — без выдуманных чисел (offline/headless/пустой ответ).
      html += `
        <div class="pricing-fallback reveal">
          <p>Актуальные тарифы подтянутся из каталога. Если цены не загрузились —
          оформить и управлять подпиской можно в
          <a href="https://t.me/VacantrixB_O_T" target="_blank" rel="noopener">Telegram-боте</a>.</p>
        </div>`;
    } else {
      groups.forEach(g => {
        html += `
          <div class="pricing-group reveal">
            <h3 class="pricing-group-title">${_esc(g.title)}</h3>
            <div class="pricing-grid">${g.plans.map(_planCard).join('')}</div>
          </div>`;
      });
    }

    // Publisher Free/Pro — статикой только если его нет в `plans` (без дубля).
    if (!_hasProduct(list, 'publisher')) html += _publisherBlock();

    // Биржа задач — всегда статический информблок (нет тарифов в `plans`).
    html += _tasksBlock();

    html += `
      <p class="pricing-note">Оплата и управление подпиской — через
        <a href="https://t.me/VacantrixB_O_T" target="_blank" rel="noopener">Telegram-бот</a></p>`;

    container.innerHTML = html;
    if (window._initReveal) window._initReveal();
  }

  async function loadAndRender() {
    const container = document.getElementById('pricing-content');
    if (container) container.innerHTML = '<div class="spinner"></div>';
    const plans = await load();
    render(plans);
  }

  return { load, loadAndRender, forTool };
})();

window.Pricing = Pricing;

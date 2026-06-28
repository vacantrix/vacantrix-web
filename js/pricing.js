// =====================================================================
// Модуль «Тарифы» — динамический рендер планов из Supabase `plans`.
// Зеркало стиля js/apps.js: load() / loadAndRender() / forTool() + кэш.
//   • dbPublic (anon) — прайс публичен, один источник правды с лаунчером
//     (vacantrix-platform читает те же `plans` анон-ключом).
//   • Любой ответ может быть пустым/недоступным (headless без сети) →
//     рендер устойчив: мягкий фолбек, страница не падает.
//
// Раздел HH/Avito/Комбо — ТАБЛИЦА (строки=инструменты, столбцы=длительности),
// собранная динамически из выборки `plans` (числа не хардкодим). Publisher и
// Биржа задач — отдельные блоки ниже таблицы. Кнопок «Оформить»/CTA нет:
// оплата и управление подпиской — в приложении Vacantrix Platform.
// forTool(slug) сохранён 1:1 — на нём держится рельс цены в карточке приложения.
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

  // «1 день» / «2 дня» / «5 дней» — корректное склонение.
  function _daysWord(d) {
    const n = Math.abs(Number(d) || 0) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return 'дней';
    if (n1 === 1) return 'день';
    if (n1 >= 2 && n1 <= 4) return 'дня';
    return 'дней';
  }

  function _priceText(rub) {
    const n = Number(rub);
    if (!isFinite(n)) return '—';
    return n === 0 ? 'Бесплатно' : n.toLocaleString('ru-RU') + ' ₽';
  }

  // ── Модель таблицы из выборки `plans` ────────────────────────────────
  // Строки: HH (tools.slug='vacantrix'), Avito (slug='avito'), Комбо (is_combo).
  // Столбцы: объединение длительностей по этим строкам, по возрастанию.
  // Подпись столбца = дни + мелкое имя плана (приоритет — не-комбо имена).
  function _tableModel(list) {
    const rowDefs = [
      { key: 'vacantrix', label: 'HH',    sub: '',          combo: false, match: p => !p.is_combo && p.tools && p.tools.slug === 'vacantrix' },
      { key: 'avito',     label: 'Avito', sub: '',          combo: false, match: p => !p.is_combo && p.tools && p.tools.slug === 'avito' },
      { key: 'combo',     label: 'Комбо', sub: 'HH + Avito', combo: true,  match: p => !!p.is_combo },
    ];
    const durSet    = new Set();
    const nameByDur = {};
    const rows = rowDefs.map(def => {
      const priceByDur = {};
      list.filter(def.match).forEach(p => {
        const d = Number(p.duration_days) || 0;
        if (!d) return;
        durSet.add(d);
        priceByDur[d] = p.price_rub;
        if (p.name && !nameByDur[d]) nameByDur[d] = p.name;  // не-комбо имена идут первыми
      });
      return { ...def, priceByDur };
    }).filter(r => Object.keys(r.priceByDur).length);  // только строки с реальными ценами

    const durations = Array.from(durSet).sort((a, b) => a - b);
    return { durations, nameByDur, rows };
  }

  function _tableHtml(model) {
    const { durations, nameByDur, rows } = model;

    const head = durations.map(d => `
      <th class="pt-col" scope="col">
        <span class="pt-days">${d} ${_daysWord(d)}</span>
        ${nameByDur[d] ? `<small class="pt-plan">${_esc(nameByDur[d])}</small>` : ''}
      </th>`).join('');

    const body = rows.map(r => {
      const cells = durations.map(d => {
        const has = Object.prototype.hasOwnProperty.call(r.priceByDur, d);
        return `<td class="pt-cell">${has ? _esc(_priceText(r.priceByDur[d])) : '—'}</td>`;
      }).join('');
      return `
        <tr class="pt-row${r.combo ? ' pt-combo' : ''}">
          <th class="pt-tool" scope="row">
            <span class="pt-tool-name">${_esc(r.label)}</span>
            ${r.sub ? `<small class="pt-tool-sub">${_esc(r.sub)}</small>` : ''}
          </th>
          ${cells}
        </tr>`;
    }).join('');

    // overflow-x:auto — механика горизонтальной прокрутки ВНУТРИ обёртки
    // (узкий экран не распирает документ). Визуал доводит web-design-ux.
    // Обёртка-«скоуп» не скроллится → подсказка прокрутки стоит на месте (на мобиле
    // таблица шире экрана и прячется в горизонтальный скролл без явного аффорданса).
    return `
      <div class="pricing-table-scope reveal">
        <span class="pt-scroll-hint" aria-hidden="true">Листайте таблицу вбок →</span>
        <div class="pricing-table-wrap" role="region"
             aria-label="Тарифы HH, Avito и Комбо" tabindex="0"
             style="overflow-x:auto;-webkit-overflow-scrolling:touch">
          <table class="pricing-table">
            <thead>
              <tr><th class="pt-corner" scope="col">Инструмент</th>${head}</tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Publisher: Pro из выборки (фолбек 399) + упоминание Free, без CTA ──
  function _publisherBlock(list) {
    const pro = list.find(p => !p.is_combo && p.tools && p.tools.slug === 'publisher'
                               && Number(p.price_rub) > 0);
    const proPrice = pro ? Number(pro.price_rub).toLocaleString('ru-RU') : '399';
    return `
      <div class="pricing-info pricing-publisher reveal">
        <h3>Vacantrix Publisher</h3>
        <p>Кросс-постинг в соцсети и доски объявлений.</p>
        <div class="pub-plans">
          <div class="pub-plan">
            <span class="pub-plan-name">Free</span>
            <span class="pub-plan-price">Бесплатно</span>
            <span class="pub-plan-note">базовый кросс-постинг с лимитами</span>
          </div>
          <div class="pub-plan pub-plan-pro">
            <span class="pub-plan-name">Pro</span>
            <span class="pub-plan-price">${_esc(proPrice)} ₽<small> / мес</small></span>
            <span class="pub-plan-note">без лимитов, расписание и ИИ-тексты</span>
          </div>
        </div>
      </div>`;
  }

  // ── Биржа задач: условно бесплатно (Free 1 заказ + 3 отклика/мес, Pro 299 ₽/мес).
  //     Числа — из реальной модели Tasks, не выдуманы. Блок в стиле Publisher, без CTA. ──
  function _tasksBlock() {
    return `
      <div class="pricing-info pricing-tasks reveal">
        <h3>Биржа задач <span class="pricing-beta-tag">Бета</span></h3>
        <p>Заказчики и исполнители — в одном окне. Начать можно бесплатно.</p>
        <p class="pricing-beta-note">Биржа работает в бета-режиме: режим заморозки денег (безопасная сделка) сейчас в разработке.</p>
        <div class="pub-plans">
          <div class="pub-plan">
            <span class="pub-plan-name">Free</span>
            <span class="pub-plan-price">Бесплатно</span>
            <span class="pub-plan-note">1 заказ и 3 отклика в месяц</span>
          </div>
          <div class="pub-plan pub-plan-pro">
            <span class="pub-plan-name">Pro</span>
            <span class="pub-plan-price">299 ₽<small> / мес</small></span>
            <span class="pub-plan-note">расширенные лимиты на заказы и отклики</span>
          </div>
        </div>
      </div>`;
  }

  function render(plans) {
    const container = document.getElementById('pricing-content');
    if (!container) return;

    const list = Array.isArray(plans) ? plans : [];
    const model = _tableModel(list);

    let html = '';

    if (!model.rows.length) {
      // Мягкий фолбек — без выдуманных чисел (offline/headless/пустой ответ).
      html += `
        <div class="pricing-fallback reveal">
          <p>Актуальные тарифы подтянутся из каталога. Если цены не загрузились —
          оформить и управлять подпиской можно в приложении Vacantrix Platform.</p>
        </div>`;
    } else {
      html += _tableHtml(model);
    }

    // Publisher и Биржа задач — отдельные блоки НИЖЕ таблицы.
    html += _publisherBlock(list);
    html += _tasksBlock();

    // Одна общая мелкая строка-примечание — без навязчивой кнопки.
    html += `
      <p class="pricing-note">Оплата и управление подпиской — в приложении Vacantrix Platform.</p>`;

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

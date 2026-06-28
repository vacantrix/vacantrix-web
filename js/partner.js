// =====================================================================
// partner.js — Партнёрская программа: кабинет на сайте.
//
// Источник данных — Supabase RPC (SECURITY DEFINER, scoped к auth.uid()):
//   • partner_settings (публичное чтение через dbPublic) — ставка/скидка/порог;
//   • partner_dashboard() — сводка партнёра (рефералы/заработано/доступно…);
//   • partner_join(self_employed) — стать партнёром (выдаёт ref_code);
//   • partner_request_payout(amount, details) — запрос выплаты;
//   • partner_make_tg_token() — токен привязки Telegram (для бота-компаньона).
//
// Рендерит три состояния в #partner-content: гость · вошёл, но не партнёр ·
// партнёр. Самоинициализируется: подписка на Auth.onChange + рендер на загрузке.
// =====================================================================
const Partner = (() => {

  // Бот-компаньон (создаётся в Ф3). Обновить username после регистрации в @BotFather.
  const BOT_USERNAME = 'VacantrixPartnerBot';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  const _pct = v => Math.round((Number(v) || 0) * 100) + '%';
  const _rub = v => (Number(v) || 0).toLocaleString('ru-RU') + ' ₽';

  function _container() { return document.getElementById('partner-content'); }

  // ── API ───────────────────────────────────────────────────────────────
  async function settings() {
    try {
      const { data } = await dbPublic.from('partner_settings')
        .select('rate,discount_pct,min_payout_rub').eq('id', 1).maybeSingle();
      if (data) return data;
    } catch (e) { /* фолбэк ниже */ }
    return { rate: 0.25, discount_pct: 0.20, min_payout_rub: 1000 };
  }
  async function dashboard() {
    const { data, error } = await db.rpc('partner_dashboard');
    if (error) throw error;
    return data;
  }
  async function join(selfEmployed) {
    const { data, error } = await db.rpc('partner_join', { p_self_employed: !!selfEmployed });
    if (error) throw error;
    return data;
  }
  async function requestPayout(amount, details) {
    const { error } = await db.rpc('partner_request_payout',
      { p_amount: amount, p_details: details || null });
    if (error) throw error;
  }
  async function makeTgToken() {
    const { data, error } = await db.rpc('partner_make_tg_token');
    if (error) throw error;
    return data;
  }
  function refUrl(code) {
    return location.origin + location.pathname + '?ref=' + encodeURIComponent(code);
  }

  // ── Общий блок «как это работает» ──────────────────────────────────────
  function _howHtml(s) {
    return `
      <div class="info-grid">
        <div class="info-card">
          <span class="ic-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 8-8M20 12a8 8 0 0 1-8 8"/><path d="m15 4 5 0 0 5M9 20l-5 0 0-5"/></svg></span>
          <h3>1. Делитесь ссылкой</h3>
          <p>Получаете персональную реферальную ссылку и приглашаете по ней пользователей.</p>
        </div>
        <div class="info-card">
          <span class="ic-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6z"/><path d="m9 12 2 2 4-4"/></svg></span>
          <h3>2. Друг получает скидку</h3>
          <p>Приглашённый платит на <b>${_pct(s.discount_pct)}</b> меньше за первую подписку — выгодно обоим.</p>
        </div>
        <div class="info-card">
          <span class="ic-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
          <h3>3. Получаете ${_pct(s.rate)} — бессрочно</h3>
          <p><b>${_pct(s.rate)}</b> с каждой их оплаты, без ограничения по сроку. Вывод от ${_rub(s.min_payout_rub)}.</p>
        </div>
      </div>`;
  }

  function _headHtml(s) {
    return `
      <div class="sec-head">
        <h2>Партнёрская программа</h2>
        <p>Приводите пользователей по своей ссылке и получайте <b>${_pct(s.rate)}</b> с их оплат —
        бессрочно. Приглашённым — скидка <b>${_pct(s.discount_pct)}</b> на первую подписку.</p>
      </div>`;
  }

  // ── Состояние 1: гость ─────────────────────────────────────────────────
  function _renderGuest(s) {
    const c = _container(); if (!c) return;
    c.innerHTML = `
      ${_headHtml(s)}
      ${_howHtml(s)}
      <div style="text-align:center;margin-top:26px">
        <button class="btn-primary" id="pp-login" style="padding:12px 26px">Войти и стать партнёром</button>
        <div style="margin-top:12px;font-size:13px;color:var(--text3)">
          Условия — в <a href="partner-offer.html" target="_blank" rel="noopener" style="color:var(--accent-b)">оферте партнёрской программы</a>.
        </div>
      </div>`;
    c.querySelector('#pp-login')?.addEventListener('click',
      () => document.getElementById('btn-login')?.click());
  }

  // ── Состояние 2: вошёл, но не партнёр ──────────────────────────────────
  function _renderJoin(s) {
    const c = _container(); if (!c) return;
    c.innerHTML = `
      ${_headHtml(s)}
      ${_howHtml(s)}
      <div class="settings-card" style="max-width:560px;margin:24px auto 0">
        <div class="settings-card-header"><span class="settings-icon">🤝</span><h3>Стать партнёром</h3></div>
        <div class="settings-sub" style="margin-bottom:14px">
          Выплаты партнёрам — для самозанятых: вы формируете чек в «Мой налог» на каждую выплату.
        </div>
        <label class="pp-check"><input type="checkbox" id="pp-se">
          <span>Я являюсь самозанятым (плательщик НПД) и готов выдавать чек за вознаграждение.</span></label>
        <label class="pp-check"><input type="checkbox" id="pp-offer">
          <span>Принимаю условия
            <a href="partner-offer.html" target="_blank" rel="noopener">оферты партнёрской программы</a>.</span></label>
        <div id="pp-msg" class="pp-msg"></div>
        <button class="btn-primary" id="pp-join" style="width:100%;justify-content:center;padding:11px;margin-top:6px" disabled>
          Стать партнёром</button>
      </div>`;

    const cbSe    = c.querySelector('#pp-se');
    const cbOffer = c.querySelector('#pp-offer');
    const btn     = c.querySelector('#pp-join');
    const msg     = c.querySelector('#pp-msg');
    const sync = () => { btn.disabled = !(cbSe.checked && cbOffer.checked); };
    cbSe.addEventListener('change', sync);
    cbOffer.addEventListener('change', sync);
    btn.addEventListener('click', async () => {
      btn.disabled = true; msg.textContent = '';
      try {
        await join(true);
        render();   // перерисуем как кабинет партнёра
      } catch (e) {
        msg.textContent = e.message || 'Не удалось зарегистрироваться.';
        msg.classList.add('err'); btn.disabled = false;
      }
    });
  }

  // ── Состояние 3: кабинет партнёра ──────────────────────────────────────
  function _renderDashboard(d) {
    const c = _container(); if (!c) return;
    const url     = refUrl(d.ref_code);
    const canPay  = d.self_employed_confirmed && Number(d.available) >= Number(d.min_payout_rub);

    c.innerHTML = `
      <div class="sec-head"><h2>Кабинет партнёра</h2>
        <p>Ваша ставка — <b>${_pct(d.rate)}</b> с оплат приглашённых, бессрочно.</p></div>

      <div class="settings-card" style="max-width:720px;margin:0 auto">
        <div class="settings-card-header"><span class="settings-icon">🔗</span><h3>Ваша реферальная ссылка</h3></div>
        <div class="pp-linkrow">
          <input class="input-sm" id="pp-link" readonly value="${_esc(url)}" style="flex:1;min-width:0">
          <button class="btn-outline sm" id="pp-copy">Копировать</button>
        </div>
        <div class="settings-sub" style="margin-top:8px">Код: <b>${_esc(d.ref_code)}</b> · отправляйте ссылку друзьям и в соцсети.</div>
      </div>

      <div class="pp-stats">
        <div class="pp-stat"><div class="v">${d.referrals_total}</div><div class="k">Приглашено</div></div>
        <div class="pp-stat"><div class="v">${d.referrals_paying}</div><div class="k">Оплатили</div></div>
        <div class="pp-stat"><div class="v">${_rub(d.earned_total)}</div><div class="k">Заработано</div></div>
        <div class="pp-stat accent"><div class="v">${_rub(d.available)}</div><div class="k">Доступно к выплате</div></div>
        <div class="pp-stat"><div class="v">${_rub(d.earned_pending)}</div><div class="k">В ожидании</div></div>
        <div class="pp-stat"><div class="v">${_rub(d.paid_out)}</div><div class="k">Выплачено</div></div>
      </div>

      <div class="pp-cards2">
        <div class="settings-card">
          <div class="settings-card-header"><span class="settings-icon">💸</span><h3>Запросить выплату</h3></div>
          ${d.self_employed_confirmed ? '' : `<div class="settings-sub" style="color:#e0a055;margin-bottom:10px">
            Для выплат подтвердите статус самозанятого (нажмите «Стать партнёром» повторно с галочкой).</div>`}
          <div class="settings-sub" style="margin-bottom:10px">Минимум — ${_rub(d.min_payout_rub)}. Доступно: <b>${_rub(d.available)}</b>.
            Перед выплатой сформируйте чек в «Мой налог».</div>
          <input class="input-sm" id="pp-amount" type="number" placeholder="Сумма, ₽" style="width:100%;margin-bottom:8px" ${canPay ? '' : 'disabled'}>
          <input class="input-sm" id="pp-details" placeholder="Реквизиты (карта/СБП) для перевода" style="width:100%;margin-bottom:8px" ${canPay ? '' : 'disabled'}>
          <div id="pp-msg" class="pp-msg"></div>
          <button class="btn-primary sm" id="pp-payout" style="width:100%;justify-content:center" ${canPay ? '' : 'disabled'}>Запросить выплату</button>
        </div>

        <div class="settings-card">
          <div class="settings-card-header"><span class="settings-icon">🤖</span><h3>Бот-компаньон</h3></div>
          <div class="settings-sub" style="margin-bottom:10px">
            ${d.telegram_linked
              ? '✅ Telegram привязан — уведомления о рефералах и комиссиях приходят в бота.'
              : 'Привяжите Telegram, чтобы получать уведомления о новых рефералах, начислениях и статусе выплат.'}
          </div>
          ${d.telegram_linked ? '' :
            `<button class="btn-outline sm" id="pp-tg" style="width:100%;justify-content:center">Привязать Telegram</button>`}
          <div class="settings-sub" style="margin-top:10px">
            Условия — <a href="partner-offer.html" target="_blank" rel="noopener" style="color:var(--accent-b)">оферта программы</a>.
          </div>
        </div>
      </div>`;

    // Копирование ссылки
    c.querySelector('#pp-copy')?.addEventListener('click', async () => {
      const btn = c.querySelector('#pp-copy');
      try { await navigator.clipboard.writeText(url); }
      catch (e) { const i = c.querySelector('#pp-link'); i.select(); document.execCommand('copy'); }
      btn.textContent = 'Скопировано ✓';
      setTimeout(() => { btn.textContent = 'Копировать'; }, 1800);
    });

    // Запрос выплаты
    c.querySelector('#pp-payout')?.addEventListener('click', async () => {
      const amount = parseFloat(c.querySelector('#pp-amount')?.value);
      const details = c.querySelector('#pp-details')?.value.trim();
      const msg = c.querySelector('#pp-msg');
      msg.classList.remove('err'); msg.textContent = '';
      if (!amount || amount <= 0) { msg.textContent = 'Укажите сумму.'; msg.classList.add('err'); return; }
      try {
        await requestPayout(amount, details);
        render();
      } catch (e) { msg.textContent = e.message || 'Не удалось создать запрос.'; msg.classList.add('err'); }
    });

    // Привязка Telegram (deep-link с одноразовым токеном)
    c.querySelector('#pp-tg')?.addEventListener('click', async () => {
      const btn = c.querySelector('#pp-tg');
      btn.disabled = true;
      try {
        const token = await makeTgToken();
        window.open('https://t.me/' + BOT_USERNAME + '?start=' + encodeURIComponent(token), '_blank', 'noopener');
      } catch (e) { btn.disabled = false; }
    });
  }

  // ── Рендер по состоянию авторизации ────────────────────────────────────
  let _busy = false;
  async function render() {
    const c = _container(); if (!c || _busy) return;
    _busy = true;
    try {
      const user = (typeof Auth !== 'undefined' && Auth.currentUser) ? Auth.currentUser() : null;
      if (!user) {
        _renderGuest(await settings());
      } else {
        let d;
        try { d = await dashboard(); }
        catch (e) { _renderGuest(await settings()); return; }  // деградация: покажем питч
        if (d && d.is_partner) _renderDashboard(d);
        else _renderJoin(d || await settings());
      }
    } finally { _busy = false; }
  }

  // ── Самоинициализация ──────────────────────────────────────────────────
  function _init() {
    if (!_container()) return;
    render();
    if (typeof Auth !== 'undefined' && Auth.onChange) Auth.onChange(() => render());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
  else _init();

  return { settings, dashboard, join, requestPayout, makeTgToken, refUrl, render };
})();

window.Partner = Partner;

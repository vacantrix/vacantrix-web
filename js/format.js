// =====================================================================
// format.js — контроллер формата сайта: 2D-лендинг ⇄ 3D-планеты.
//
// Классический скрипт (НЕ ES-module), но 3D-сцену тянет ЛЕНИВО через
// динамический import() — Three.js не качается, пока 3D не включат.
//
// Дефолт = 2D: класс body.mode-3d ОТСУТСТВУЕТ, страница уже отрисована
// дефолтным CSS (без чёрной вуали). 3D — опционально по кнопке/сохранённому
// выбору, при условии WebGL и без prefers-reduced-motion.
//
// Контракт intro3d.js (НЕ меняем): export start()/pause()/resume()/dispose();
// start() → true (сцена поднята, выставлен body.planets-on) | false (3D
// невозможен — вуали при этом нет, settleStatic() уже вызван внутри).
// =====================================================================
const VXFormat = (() => {
  'use strict';

  const LS_KEY = 'vx_format';        // localStorage: '2d' | '3d'
  const LOAD_TIMEOUT = 8000;         // потолок ожидания загрузки/старта 3D

  let mod = null;                    // загруженный модуль intro3d (кэш — не импортируем дважды)
  let loading = false;               // идёт загрузка/старт 3D
  let started3d = false;             // 3D хоть раз успешно стартовал → resume() вместо start()

  // ── Проба возможностей ──────────────────────────────────────────────
  function prefersReduce() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
      const ok = !!gl;
      // освобождаем временный контекст сразу
      try { const ext = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {}
      return ok;
    } catch (e) { return false; }
  }
  // 3D доступно для этой сессии? reduce / нет WebGL → нет (форс 2D на сессию).
  const _can3d = !prefersReduce() && hasWebGL();
  function canUse3d() { return _can3d; }

  // ── Хранилище выбора (не перезаписываем при форс-2D из-за reduce/нет WebGL) ──
  function saved() {
    try {
      const v = localStorage.getItem(LS_KEY);
      return v === '3d' ? '3d' : v === '2d' ? '2d' : null;
    } catch (e) { return null; }
  }
  function store(v) { try { localStorage.setItem(LS_KEY, v); } catch (e) {} }

  // ── Тоггл #format-toggle ────────────────────────────────────────────
  function toggleEl() { return document.getElementById('format-toggle'); }
  function btn(fmt) { const t = toggleEl(); return t ? t.querySelector('[data-format="' + fmt + '"]') : null; }

  function syncToggle(fmt) {
    const t = toggleEl(); if (!t) return;
    t.querySelectorAll('[data-format]').forEach(b => {
      const on = b.getAttribute('data-format') === fmt;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function setLoading(on) {
    const t = toggleEl(); if (!t) return;
    t.classList.toggle('fmt-loading', !!on);
    const b3 = btn('3d'); if (b3) b3.classList.toggle('is-loading', !!on);
  }
  function lockToggle(on) {
    const t = toggleEl(); if (!t) return;
    t.querySelectorAll('[data-format]').forEach(b => { b.disabled = !!on; });
  }
  function gate3dButton() {
    const b3 = btn('3d'); if (!b3) return;
    if (!_can3d) {
      b3.disabled = true;
      b3.title = '3D недоступно на этом устройстве';
      b3.classList.add('fmt-disabled');
    }
  }

  // ── Лёгкое уведомление (переиспользуем баннер #global-info) ──────────
  function notify(msg) {
    try {
      const el = document.getElementById('global-info');
      if (!el) return;
      el.textContent = msg;
      el.classList.remove('hidden');
      clearTimeout(notify._t);
      notify._t = setTimeout(() => el.classList.add('hidden'), 5000);
    } catch (e) {}
  }

  // ── Ленивый импорт intro3d (стабильный ?v= ⇒ Three.js тянется один раз) ──
  // ВАЖНО: динамический import() из КЛАССИЧЕСКОГО скрипта резолвит специфер
  // относительно URL самого скрипта (/js/format.js), а не документа. Поэтому
  // строим абсолютный URL от document.baseURI → /js/intro3d.js (а не /js/js/...).
  // Import map в <head> при этом всё равно резолвит внутренний `import 'three'`.
  function loadIntro() {
    if (mod) return Promise.resolve(mod);
    const v = window.__ASSET_V || '';
    const url = new URL('js/intro3d.js' + (v ? ('?v=' + v) : ''), document.baseURI).href;
    return import(url).then(m => { mod = m; return m; });
  }

  // ── Применение 2D ───────────────────────────────────────────────────
  // persist=true — это выбор пользователя (сохраняем). false — авто/откат.
  function apply2d(persist) {
    document.body.classList.remove('mode-3d');
    if (mod && typeof mod.pause === 'function') { try { mod.pause(); } catch (e) {} }
    setLoading(false);
    lockToggle(false);
    syncToggle('2d');
    if (persist) store('2d');
  }

  // ── Применение 3D (ленивая загрузка + таймаут + откат) ──────────────
  function apply3d(persist) {
    if (!_can3d) { apply2d(persist); return; }   // 3D недоступно → остаёмся в 2D
    if (loading) return;
    loading = true;
    document.body.classList.add('mode-3d');       // намерение ставим СРАЗУ (вуаль = обложка загрузки)
    syncToggle('3d');
    setLoading(true);
    lockToggle(true);

    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), LOAD_TIMEOUT));
    const run = loadIntro().then(m => Promise.resolve(started3d ? m.resume() : m.start()));

    Promise.race([run, timeout]).then(ok => {
      if (ok === false) throw new Error('start_returned_false');   // 3D невозможен → откат
      started3d = true;
      loading = false;
      setLoading(false);
      lockToggle(false);
      syncToggle('3d');
      if (persist) store('3d');
    }).catch(err => {
      loading = false;
      apply2d(false);                              // откат в 2D, 3D НЕ сохраняем
      notify('Не удалось включить 3D-режим — показываем классический вид.');
      try { console.warn('[VXFormat] 3D unavailable:', err && err.message); } catch (e) {}
    });
  }

  function apply(fmt, persist) {
    if (fmt === '3d') apply3d(persist);
    else apply2d(persist);
  }

  // ── Привязка кликов тоггла ──────────────────────────────────────────
  function bind() {
    const t = toggleEl(); if (!t) return;
    t.addEventListener('click', e => {
      const b = e.target.closest('[data-format]');
      if (!b || b.disabled) return;
      const fmt = b.getAttribute('data-format');
      if (fmt === '3d' && !_can3d) return;
      apply(fmt, true);                            // выбор пользователя → сохраняем
    });
  }

  // ── Инициализация (после main.js — он раньше в порядке скриптов) ─────
  function init() {
    gate3dButton();
    bind();
    const want = saved() || '2d';
    if (want === '3d' && _can3d) {
      apply3d(false);                              // выбор уже сохранён — не перезаписываем
    } else {
      syncToggle('2d');                            // 2D уже отрисован дефолтным CSS
    }
    window.addEventListener('pagehide', () => {
      if (mod && typeof mod.dispose === 'function') { try { mod.dispose(); } catch (e) {} }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    apply,
    canUse3d,
    current: () => (document.body.classList.contains('mode-3d') ? '3d' : '2d'),
  };
})();

window.VXFormat = VXFormat;

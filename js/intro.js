/* =====================================================================
   intro.js — кинематографичное интро «экосистема» (vanilla + <canvas>).

   Сцена из 4 фаз:
     Фаза 1 (Сбор)      — два потока красных частиц из верхних углов к центру.
     Фаза 2 (Ядро)      — в точке схождения «зажигается» ядро Vacantrix Platform.
     Фаза 3 (Экосистема)— от ядра радиально расходятся потоки к иконкам продуктов.
     Фаза 4 (Раскрытие) — по «добеганию» потока к продукту проявляется его карточка.
   Затем сцена осаждается в стабильное состояние (ядро + карточки видны, панель работает).

   Принципы (см. Промт 1):
   - Частицы рисуются на canvas из ПУЛА (без аллокаций в кадре), учитывается DPR, resize.
   - prefers-reduced-motion → сразу финальное статичное состояние (без анимации).
   - Кнопка «Пропустить» и клик по верхней панели мгновенно осаждают сцену.
   - Нет JS/canvas → панель и карточки всё равно видны (graceful fallback, всё в DOM).
   ===================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('intro-canvas');
  var veil   = document.getElementById('intro-veil');     // чёрная вуаль под канвасом
  var skip   = document.getElementById('intro-skip');
  var stage  = document.getElementById('eco-stage');

  // Нет сцены/canvas — просто показать контент (fallback)
  if (!canvas || !stage || !canvas.getContext) { settle(); return; }

  var ctx    = canvas.getContext('2d');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var core   = stage.querySelector('.eco-core');

  // ── Геометрия сцены ───────────────────────────────────────────────
  var W = 0, H = 0, DPR = 1, cx = 0, cy = 0;   // cx/cy — центр ядра (координаты вьюпорта)
  var nodes = [];                              // {el, x, y, revealAt}
  var NAV = 60;                                // высота верхней панели (потоки стартуют ниже неё)

  // ── Пул частиц (фиксированный, переиспользуется) ──────────────────
  var MAX = 560, parts = new Array(MAX), cur = 0;
  for (var i = 0; i < MAX; i++) parts[i] = { a: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, w: 1 };

  function spawn(x, y, vx, vy, life, w) {
    var p = parts[cur]; cur = (cur + 1) % MAX;     // кольцевой буфер — O(1), без аллокаций
    p.a = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = 0; p.max = life; p.w = w;
  }

  // ── Тайминги (мс) ─────────────────────────────────────────────────
  var P1 = 1100;        // фаза «Сбор» до
  var P2 = 1750;        // фаза «Ядро» до (= старт фазы 3)
  var SPAWN_END = 3200; // прекращаем спавн
  var END = 4200;       // полное завершение
  var ACCENT = [230, 57, 70];   // #e63946

  var start = 0, lastT = 0, raf = 0, done = false;

  function measure() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    var cr = core ? core.getBoundingClientRect() : null;
    cx = cr ? cr.left + cr.width / 2 : W / 2;
    cy = cr ? cr.top + cr.height / 2 : H / 2;

    nodes = [];
    var els = stage.querySelectorAll('.eco-node');
    for (var k = 0; k < els.length; k++) {
      var r = els[k].getBoundingClientRect();
      nodes.push({ el: els[k], x: r.left + r.width / 2, y: r.top + r.height / 2, revealAt: 0 });
    }
    // время раскрытия каждого узла — по расстоянию от ядра (ближние раскрываются раньше)
    nodes.slice().sort(function (a, b) { return d2(a) - d2(b); })
      .forEach(function (n, idx) { n.revealAt = P2 + 260 + idx * 150; });
    function d2(n) { var dx = n.x - cx, dy = n.y - cy; return dx * dx + dy * dy; }
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // поток частиц из точки (sx,sy) к цели (tx,ty)
  function streamTo(sx, sy, tx, ty, speedK) {
    var dx = tx - sx, dy = ty - sy, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var sp = (380 + Math.random() * 260) * (speedK || 1);
    var ux = dx / d, uy = dy / d;             // направление
    var nx = -uy, ny = ux, j = rnd(-26, 26);  // перпендикуляр — «ширина» потока
    spawn(sx + nx * j, sy + ny * j, ux * sp, uy * sp, Math.max(0.4, d / sp), rnd(0.8, 1.8));
  }

  // свечение ядра (k: 0..1 — интенсивность)
  function coreGlow(k) {
    var R = 40 + k * 72;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0,   'rgba(' + ACCENT[0] + ',' + ACCENT[1] + ',' + ACCENT[2] + ',' + (0.55 * k).toFixed(3) + ')');
    g.addColorStop(0.5, 'rgba(255,90,103,' + (0.20 * k).toFixed(3) + ')');
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  }

  function frame(now) {
    if (!start) { start = now; lastT = now; }
    var t  = now - start;
    var dt = Math.min(48, now - lastT) / 1000; lastT = now;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    // ── Спавн по фазам ──
    if (t < P1) {
      // Фаза 1 — два потока из верхних углов
      for (var s = 0; s < 6; s++) {
        streamTo(rnd(-10, 50),      NAV + rnd(-10, 46), cx, cy);
        streamTo(W - rnd(-10, 50),  NAV + rnd(-10, 46), cx, cy);
      }
    } else if (t < P2) {
      // Фаза 2 — зажигание ядра
      coreGlow((t - P1) / (P2 - P1));
      if (core) core.classList.add('shown');
    } else if (t < SPAWN_END) {
      // Фаза 3 — радиальное расхождение к продуктам
      if (veil) veil.classList.add('lift');            // открыть страницу под канвасом
      if (core) core.classList.add('shown');
      coreGlow(1);
      for (var n = 0; n < nodes.length; n++) {
        streamTo(cx + rnd(-6, 6), cy + rnd(-6, 6), nodes[n].x, nodes[n].y, 1.05);
      }
    } else if (veil) {
      veil.classList.add('lift');
    }

    // Фаза 4 — раскрытие карточек по времени
    for (var r = 0; r < nodes.length; r++) {
      if (t >= nodes[r].revealAt && !nodes[r].el.classList.contains('shown')) {
        nodes[r].el.classList.add('shown');
      }
    }

    // ── Обновление и отрисовка частиц (штрихи по направлению скорости) ──
    for (var i2 = 0; i2 < MAX; i2++) {
      var p = parts[i2]; if (!p.a) continue;
      p.life += dt; if (p.life >= p.max) { p.a = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      var a = Math.sin(Math.min(1, p.life / p.max * 1.7) * Math.PI) * 0.85;  // мягкий вход/выход
      if (a <= 0.02) continue;
      ctx.strokeStyle = 'rgba(' + ACCENT[0] + ',' + ACCENT[1] + ',' + ACCENT[2] + ',' + a.toFixed(3) + ')';
      ctx.lineWidth = p.w;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (t >= END) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }

  function finish() { if (done) return; done = true; cancelAnimationFrame(raf); settle(); }

  // Осадить сцену: показать ядро и все карточки, убрать оверлей, разблокировать скролл
  function onKey(e) { if (e.key === 'Escape') skipIntro(); }

  function settle() {
    if (core) core.classList.add('shown');
    var els = stage ? stage.querySelectorAll('.eco-node') : [];   // null-guard (fallback-путь)
    for (var i3 = 0; i3 < els.length; i3++) els[i3].classList.add('shown');
    if (veil) veil.classList.add('lift');
    if (canvas) canvas.classList.add('done');
    document.body.classList.remove('intro-lock');
    document.body.classList.add('intro-done');
    // снять все слушатели интро (без утечек)
    window.removeEventListener('resize', measure);
    document.removeEventListener('keydown', onKey);
    if (skip) skip.removeEventListener('click', skipIntro);
    var bar = document.querySelector('.topbar');
    if (bar) bar.removeEventListener('click', skipIntro, true);
  }

  function skipIntro() { if (done) return; done = true; cancelAnimationFrame(raf); settle(); }

  function init() {
    document.body.classList.add('intro-lock');           // не скроллим во время интро
    if (reduce) { skipIntro(); return; }                 // reduced-motion → сразу финал

    measure();
    window.addEventListener('resize', measure);
    if (skip) skip.addEventListener('click', skipIntro);
    // клик по верхней панели (логотип/навигация/вход) тоже прерывает интро — контент должен открыться
    var bar = document.querySelector('.topbar');
    if (bar) bar.addEventListener('click', skipIntro, true);
    document.addEventListener('keydown', onKey);

    raf = requestAnimationFrame(frame);
    // страховка: если что-то пошло не так — осесть гарантированно
    setTimeout(function () { if (!done) finish(); }, END + 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { requestAnimationFrame(init); });
  } else {
    requestAnimationFrame(init);
  }
})();

// =====================================================================
// Механика нижней скролл-анимации (ТОЛЬКО прогресс, без визуала).
//
// Выставляет на :root CSS-переменную --scroll-progress (0..1) по мере
// прокрутки страницы — её использует визуальный шелл #scroll-anim,
// оформление которого делает web-design-ux.
//
//   • throttle через requestAnimationFrame (один пересчёт на кадр);
//   • passive-слушатели scroll + resize;
//   • prefers-reduced-motion → переменную всё равно ставим (безопасно),
//     но держим на 0 — без анимированного движения.
// IIFE-модуль в стиле остальных (Auth/Profile/Apps/Pricing), без import.
// =====================================================================

const ScrollFX = (() => {
  const root = document.documentElement;
  let _ticking = false;
  const _reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function _compute() {
    _ticking = false;
    const max = root.scrollHeight - window.innerHeight;
    let p = max > 0 ? (window.scrollY || window.pageYOffset || 0) / max : 0;
    if (!isFinite(p) || p < 0) p = 0;
    else if (p > 1) p = 1;
    // reduce: переменную ставим всегда (безопасно), но без движения → 0.
    root.style.setProperty('--scroll-progress', _reduce ? '0' : p.toFixed(4));
  }

  function _onScroll() {
    if (_ticking) return;
    _ticking = true;
    requestAnimationFrame(_compute);
  }

  function init() {
    _compute();
    window.addEventListener('scroll', _onScroll, { passive: true });
    window.addEventListener('resize', _onScroll, { passive: true });
  }

  return { init, refresh: _compute };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ScrollFX.init);
} else {
  ScrollFX.init();
}

window.ScrollFX = ScrollFX;

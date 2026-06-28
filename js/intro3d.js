/* =====================================================================
   intro3d.js — 3D-сцена Vacantrix на Three.js: «Материнская плата / хаб».

   Концепт B (мейнфрейм-хаб):
     • НАКЛОНЁННАЯ материнская плата (тёмный гетинакс + красные трейсы) парит в
       тёмной техно-пустоте — это «Платформа»-хаб (буквально board).
     • CPU-ЯДРО (Vacantrix Platform) в ЦЕНТРЕ — приподнятый ступенчатый чип,
       КРУПНЫЙ и ЯРКИЙ (красный emissive + bloom). Самый высокий элемент = хаб.
     • 7 инструментов = ЧИПЫ в слотах вокруг CPU: приподнятые боксы с иконкой на
       верхней грани и свечением рамки в брендовом цвете.
     • Дорожки-трейсы от каждого чипа К CPU с бегущим красным ТОКОМ — всё сходится
       к центру: «всё подключено к платформе».

   Жизненный цикл (без изменений — функциональный контракт):
     1) ИНТРО: CPU зажигается → ток бежит по дорожкам наружу → чипы проявляются
        (revealKey/revealCore поднимают реальные HTML-плитки .eco-node.shown).
     2) ОСАЖДЕНИЕ: вуаль поднимается, канвас уходит в фон (z-index 0) и живёт
        как параллакс-фон. Сцена остаётся фоном страницы.

   Бережно:
     • prefers-reduced-motion → сразу финал, фон выключен;
     • нет WebGL / нет канваса → graceful fallback (контент виден, канвас скрыт);
     • вкладка скрыта → рендер на паузе;
     • скип по кнопке / Escape / клику по верхней панели прерывает интро.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ─────────────────────────────────────────────────────────────────────
// Управляемый ES-модуль. Никакого самозапуска: контроллер формата
// (js/format.js) ленивым импортом дёргает start()/pause()/resume()/dispose().
// Сцена аллоцируется ТОЛЬКО в start(); чистые константы/хелперы и чтение DOM-
// данных карточек — в module-scope (нужны и на fallback-пути).
// ─────────────────────────────────────────────────────────────────────

// Порядок раскрытия карточек = порядок прихода тока к чипам.
const KEYS = ['hh', 'avito', 'tasks', 'publisher', 'leads', 'monitor', 'analytics'];
// Брендовые цвета чипов (свечение рамки/слота).
const NODE_COLORS = {
  hh: 0xff5a67, avito: 0x4fd0ff, tasks: 0x68e6a0, publisher: 0xff7a86,
  leads: 0xff9e57, monitor: 0x5ad1ff, analytics: 0xffd166,
};
const IMG_V = '?v=20260628a';                        // кэш-бастер иконок (обновляй при замене файла)
const ICON = {
  platform: 'img/platform_icon.png' + IMG_V, hh: 'img/hh_icon.png' + IMG_V, avito: 'img/avito_icon.png' + IMG_V,
  tasks: 'img/tasks_icon.png' + IMG_V, publisher: 'img/publisher_icon.png' + IMG_V, leads: 'img/leads_icon.png' + IMG_V,
  monitor: 'img/monitor_icon.png' + IMG_V, analytics: 'img/analytics_icon.png' + IMG_V,
};
const ACCENT = 0xe63946;                             // ЕДИНСТВЕННЫЙ источник красного хекса в JS
const _AR = (ACCENT >> 16) & 255, _AG = (ACCENT >> 8) & 255, _AB = ACCENT & 255;
const accRGBA = (a) => 'rgba(' + _AR + ',' + _AG + ',' + _AB + ',' + a + ')';

const lerp = (a, b, t) => a + (b - a) * t;
const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);

let reduce = false;
try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

// ── Раскрытие DOM-карточек (контракт со старым intro) ─────────────────
function revealCore() {
  const stage = document.getElementById('eco-stage');
  const coreEl = stage ? stage.querySelector('.eco-core') : null;
  if (coreEl) coreEl.classList.add('shown');
}
function revealKey(key) {
  const stage = document.getElementById('eco-stage');
  if (!stage) return;
  const el = stage.querySelector('.eco-node[data-key="' + key + '"]');
  if (el) el.classList.add('shown');
}
function revealAllCards() {
  revealCore();
  const stage = document.getElementById('eco-stage');
  const els = stage ? stage.querySelectorAll('.eco-node') : [];
  for (let i = 0; i < els.length; i++) els[i].classList.add('shown');
}

// Полный статичный финал без 3D (reduced-motion / нет WebGL / нет канваса).
function settleStatic() {
  revealAllCards();
  const veil = document.getElementById('intro-veil');
  const canvas = document.getElementById('intro-canvas');
  if (veil) veil.classList.add('lift');
  if (canvas) canvas.classList.add('done');           // скрыть канвас
  document.body.classList.remove('intro-lock');
  document.body.classList.add('intro-done');
}

// ── Данные карточки из (скрытых) DOM-плиток — единый источник + SEO ────
const CARD_CACHE = {};
function cardData(key) {
  if (CARD_CACHE[key]) return CARD_CACHE[key];
  const stage = document.getElementById('eco-stage');
  const el = key === 'platform'
    ? (stage && stage.querySelector('.eco-core'))
    : (stage && stage.querySelector('.eco-node[data-key="' + key + '"]'));
  let d;
  if (!el) {
    d = { name: key, sub: '', desc: '', live: true, badge: '', cta: '', icon: ICON[key] };
  } else {
    const nmEl = el.querySelector('.nm');
    const small = nmEl ? nmEl.querySelector('small') : null;
    const name = nmEl ? ((nmEl.childNodes[0] && nmEl.childNodes[0].textContent) || nmEl.textContent).trim() : key;
    const badgeEl = el.querySelector('.eco-badge');
    const descEl = el.querySelector('.desc');
    const ctaEl = el.querySelector('.eco-cta');
    const img = el.querySelector('.ico img, .disc img');
    d = {
      name,
      sub: small ? small.textContent.trim() : '',
      desc: (descEl ? descEl.textContent : (small ? small.textContent : '')).trim(),
      detail: (el.getAttribute('data-detail') || '').trim(),
      slogan: (el.getAttribute('data-slogan') || '').trim(),
      live: badgeEl ? badgeEl.classList.contains('live') : true,
      beta: badgeEl ? badgeEl.classList.contains('beta') : false,
      badge: badgeEl ? badgeEl.textContent.trim() : (key === 'platform' ? 'Ядро' : ''),
      cta: ctaEl ? ctaEl.textContent.trim() : (key === 'platform' ? 'Скачать' : ''),
      icon: img ? img.getAttribute('src') : ICON[key],
    };
  }
  CARD_CACHE[key] = d; return d;
}

// ── Жизненный цикл (управляется js/format.js) ─────────────────────────
let started = false;     // сцена построена?
let _api = null;         // { pause, resume, dispose } — замыкания живой сцены

export function pause()   { if (_api) _api.pause(); }
export function resume()  { if (!started) return start(); return _api ? _api.resume() : false; }
export function dispose() { if (_api) _api.dispose(); }

// start(opts) → true (сцена запущена) | false (провал → контроллер откатывается в 2D).
export function start(opts) {
  if (started) return resume();                              // идемпотентность: повторный start = resume

  const canvas = document.getElementById('intro-canvas');
  const veil   = document.getElementById('intro-veil');
  const skip   = document.getElementById('intro-skip');
  const stage  = document.getElementById('eco-stage');

  if (!canvas || !stage) { settleStatic(); return false; }   // нет канваса/сцены → 2D
  document.body.classList.add('intro-lock');
  if (reduce) { settleStatic(); return false; }              // уважаем reduced-motion → 2D

  // ── Рендерер / сцена / камера ─────────────────────────────────────────
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) { settleStatic(); return false; }              // WebGL недоступен → 2D
  renderer.setClearColor(0x04060a, 1);                 // тёмная техно-пустота
  let appView = false;                                 // открыт раздел #app/<key> → фокус-зум на чип
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  // perf-тир: мобильные/маленькие/слабые → меньше текстуры, без normal-map, DPR-кап 1.5
  const LOWQ = (function () {
    try {
      const mob = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
      const small = Math.min(window.innerWidth, window.innerHeight) < 560;
      return mob || small || (navigator.hardwareConcurrency || 8) <= 4;
    } catch (e) { return false; }
  })();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOWQ ? 1.5 : 2));
  document.body.classList.add('planets-on');           // 3D активна → плитки eco-stage скрыты

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const world = new THREE.Group();
  scene.add(world);

  // отражения окружения — тёмный техно-env (металл чипов/CPU отражает «студию»)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const _techEnv = (function () {
    const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (const [col, rad] of [['#10131f', 80], ['#0c1a22', 60], [accRGBA(0.18), 46]]) {
      for (let k = 0; k < 4; k++) {
        const x = Math.random() * W, y = Math.random() * H, r = rad * (0.6 + Math.random());
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(0, 0, W, H);
      }
    }
    g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  scene.environment = pmrem.fromEquirectangular(_techEnv).texture;
  _techEnv.dispose();

  scene.add(new THREE.AmbientLight(0x3a4055, 0.5));
  const corePoint = new THREE.PointLight(ACCENT, 3.0, 90);
  scene.add(corePoint);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
  keyLight.position.set(3, 7, 6);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x5a6a9a, 0.34);   // холодный приглушённый rim (не красит плату красным)
  rimLight.position.set(-5, 2, -4);
  scene.add(rimLight);

  // bloom-постобработка (CPU-ядро + ток по дорожкам светятся)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.5, 0.62);   // высокий порог → цветёт только яркий красный (ток/CPU), не золото
  composer.addPass(bloomPass);

  // ── Радиальный glow-спрайт (общая текстура) ───────────────────────────
  const glowTex = (function () {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0.0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function glowSprite(color, scale, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, opacity: opacity == null ? 0.9 : opacity,
    }));
    s.scale.setScalar(scale);
    return s;
  }


  // ── Иконка инструмента → текстура (прозрачный фон, на верхнюю грань чипа) ──
  function iconTexture(url) {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAX_ANISO;
    const img = new Image();
    img.onload = () => {
      const g = cv.getContext('2d'); g.clearRect(0, 0, S, S);
      const pad = S * 0.12, iw = S - pad * 2;
      g.drawImage(img, pad, pad, iw, iw);
      tex.needsUpdate = true;
    };
    img.onerror = () => {};
    img.src = url;
    return tex;
  }

  // ── Реалистичная печатная плата: один процедурный layout → много каналов ──
  // Разводка/пады/via/шелкография/полигоны генерируются ОДИН раз (detерм. seed),
  // затем рендерятся в albedo / height→normal / roughness / metalness — пиксели
  // совпадают идеально. В БАЗЕ красного НЕТ: тёмная маска + медь + золото (ENIG).
  // Красный приходит позже — только бегущим током (шейдер) поверх трасс.
  function rngF(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // Октилинейный (Manhattan + 45°) маршрут — «настоящая» PCB-разводка.
  function routePCB(x0, y0, x1, y1, R) {
    const pts = [[x0, y0]]; let x = x0, y = y0, guard = 0;
    while ((Math.abs(x - x1) > 0.006 || Math.abs(y - y1) > 0.006) && guard++ < 26) {
      const dx = x1 - x, dy = y1 - y, adx = Math.abs(dx), ady = Math.abs(dy), diag = Math.min(adx, ady);
      if (diag > 0.018 && R() < 0.78) { x += Math.sign(dx) * diag; y += Math.sign(dy) * diag; }     // 45°-срез
      else if (adx > ady) { x += dx * (0.5 + R() * 0.5); }
      else { y += dy * (0.5 + R() * 0.5); }
      pts.push([x, y]);
    }
    pts.push([x1, y1]); return pts;
  }

  // Нормализованный layout (координаты 0..1). centerKeep — зона CPU в центре.
  function generatePCBLayout() {
    const R = rngF(0x5ac3f1);
    const cx = 0.5, cy = 0.5, centerKeep = 0.155;
    const inKeep = (x, y) => Math.hypot(x - cx, y - cy) < centerKeep;
    const traces = [], pads = [], vias = [], silk = [], pours = [], comps = [];
    // 1) медные полигоны-заливки (фон-«земля» под маской)
    for (let i = 0; i < 8; i++) {
      const w = 0.16 + R() * 0.22, h = 0.14 + R() * 0.22;
      pours.push({ x: R() * (1 - w), y: R() * (1 - h), w, h });
    }
    // 2) главные шины из центра наружу (имитируют разводку к чипам)
    const busN = 20;
    for (let i = 0; i < busN; i++) {
      const ang = (i / busN) * Math.PI * 2 + R() * 0.18;
      const r0 = centerKeep + 0.015, r1 = 0.30 + R() * 0.18;
      const x0 = cx + Math.cos(ang) * r0, y0 = cy + Math.sin(ang) * r0;
      const x1 = clampv(cx + Math.cos(ang) * r1, 0.05, 0.95), y1 = clampv(cy + Math.sin(ang) * r1, 0.05, 0.95);
      traces.push({ pts: routePCB(x0, y0, x1, y1, R), w: 0.0030 + R() * 0.0020, main: true });
      pads.push({ x: x1, y: y1, r: 0.0055 + R() * 0.004, gold: true });
      vias.push({ x: x1, y: y1, r: 0.0034 });
    }
    // 3) вторичные/декоративные трассы
    for (let i = 0; i < 130; i++) {
      const x0 = 0.05 + R() * 0.9, y0 = 0.05 + R() * 0.9;
      const x1 = clampv(x0 + (R() * 2 - 1) * 0.26, 0.05, 0.95), y1 = clampv(y0 + (R() * 2 - 1) * 0.26, 0.05, 0.95);
      if (inKeep(x0, y0) || inKeep(x1, y1)) continue;
      traces.push({ pts: routePCB(x0, y0, x1, y1, R), w: 0.0015 + R() * 0.0014, main: false });
      if (R() < 0.45) vias.push({ x: x0, y: y0, r: 0.0028 });
      if (R() < 0.45) vias.push({ x: x1, y: y1, r: 0.0028 });
    }
    // 4) пады + via-поля
    for (let i = 0; i < 150; i++) {
      const x = 0.04 + R() * 0.92, y = 0.04 + R() * 0.92;
      if (inKeep(x, y)) continue;
      pads.push({ x, y, r: 0.0032 + R() * 0.0038, gold: R() < 0.62 });
      if (R() < 0.3) vias.push({ x, y, r: 0.0024 });
    }
    // 5) SMD-футпринты (резисторы/конденсаторы) — пара золотых падов + рефдезигнатор
    let rc = 0;
    for (let i = 0; i < 70; i++) {
      const x = 0.07 + R() * 0.86, y = 0.07 + R() * 0.86;
      if (inKeep(x, y)) continue;
      const horiz = R() < 0.5, len = 0.013 + R() * 0.012, w = 0.006 + R() * 0.004;
      const hx = horiz ? len * 0.5 : 0, hy = horiz ? 0 : len * 0.5;
      pads.push({ x: x - hx, y: y - hy, gold: true, rect: true, rw: w * 1.4, rh: w * 1.4 });
      pads.push({ x: x + hx, y: y + hy, gold: true, rect: true, rw: w * 1.4, rh: w * 1.4 });
      comps.push({ type: 'smd', x, y, len, w, horiz });
      silk.push({ type: 'ref', x, y: y - (horiz ? w : len * 0.5) - 0.011, text: 'R' + (++rc), size: 0.0085 });
    }
    // 6) QFP/BGA-микросхемы — рамка падов + контур + рефдезигнатор
    let uc = 0;
    for (let i = 0; i < 9; i++) {
      const s = 0.045 + R() * 0.05, x = 0.12 + R() * 0.76, y = 0.12 + R() * 0.76;
      if (inKeep(x, y) || Math.hypot(x - cx, y - cy) < centerKeep + s) continue;
      comps.push({ type: 'qfp', x, y, s });
      silk.push({ type: 'rect', x, y, s: s * 1.16 });
      silk.push({ type: 'ref', x, y: y - s * 0.74, text: 'U' + (++uc), size: 0.011 });
    }
    // 7) шелкография: рамка платы + бренд-лейбл
    silk.push({ type: 'border' });
    silk.push({ type: 'label', x: 0.5, y: 0.945, text: 'VACANTRIX  ·  MAINBOARD  v1', size: 0.015 });
    silk.push({ type: 'label', x: 0.5, y: 0.030, text: 'ECOSYSTEM BUS', size: 0.012 });
    return { traces, pads, vias, silk, pours, comps, centerKeep };
  }

  // Колеровка PCB (тёмный бренд + честная медь/золото).
  const PCB = {
    mask:   '#0d100f', maskHi: '#141917', maskLo: '#080b0a',
    copper: '#3a2a1c', copperHi: '#7a5630', copperEdge: '#241910',
    gold:   '#b78f3c', goldHi: '#e9cd72', goldRim: '#5e4715',
    silk:   '#c9c4b4', viaHole: '#05070a',
  };
  function strokePts(g, pts, S, lwPx, style, cap) {
    g.lineWidth = lwPx; g.strokeStyle = style; g.lineCap = cap || 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0][0] * S, pts[0][1] * S);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * S, pts[i][1] * S);
    g.stroke();
  }
  function drawAlbedo(S, L) {
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = PCB.mask; g.fillRect(0, 0, S, S);
    // микро-ткань стеклотекстолита
    g.globalAlpha = 0.05;
    for (let i = 0; i < S; i += 6) { g.fillStyle = (i / 6 | 0) % 2 ? PCB.maskHi : PCB.maskLo; g.fillRect(i, 0, 3, S); g.fillRect(0, i, S, 3); }
    g.globalAlpha = 1;
    // медные полигоны-заливки с хетч-штриховкой
    for (const p of L.pours) {
      g.save(); g.beginPath(); g.rect(p.x * S, p.y * S, p.w * S, p.h * S); g.clip();
      g.fillStyle = 'rgba(58,42,28,0.30)'; g.fillRect(p.x * S, p.y * S, p.w * S, p.h * S);
      g.strokeStyle = 'rgba(122,86,48,0.16)'; g.lineWidth = 1.4;
      for (let d = -S; d < S; d += 7) { g.beginPath(); g.moveTo(p.x * S + d, p.y * S); g.lineTo(p.x * S + d + p.h * S, (p.y + p.h) * S); g.stroke(); }
      g.restore();
    }
    // трассы: тёмная медь под маской + медный блик по центру
    for (const t of L.traces) {
      strokePts(g, t.pts, S, t.w * S * 2.0, PCB.copperEdge);
      strokePts(g, t.pts, S, t.w * S * 1.35, PCB.copper);
      strokePts(g, t.pts, S, t.w * S * 0.55, 'rgba(122,86,48,' + (t.main ? 0.6 : 0.4) + ')');
    }
    // via-отверстия: золотое кольцо + тёмный центр
    for (const v of L.vias) {
      const x = v.x * S, y = v.y * S, r = v.r * S;
      g.fillStyle = PCB.gold; g.beginPath(); g.arc(x, y, r * 1.7, 0, 7); g.fill();
      g.fillStyle = PCB.viaHole; g.beginPath(); g.arc(x, y, r * 0.85, 0, 7); g.fill();
    }
    // пады ENIG-золото с бликом
    for (const p of L.pads) {
      const x = p.x * S, y = p.y * S;
      if (p.rect) {
        const w = p.rw * S, h = p.rh * S;
        g.fillStyle = PCB.goldRim; g.fillRect(x - w * 0.62, y - h * 0.62, w * 1.24, h * 1.24);
        const gr = g.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
        gr.addColorStop(0, PCB.goldHi); gr.addColorStop(1, PCB.gold);
        g.fillStyle = gr; g.fillRect(x - w / 2, y - h / 2, w, h);
      } else {
        const r = (p.r || 0.004) * S;
        const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        gr.addColorStop(0, p.gold ? PCB.goldHi : '#8a6f3a'); gr.addColorStop(1, p.gold ? PCB.gold : '#6e5630');
        g.fillStyle = p.gold ? PCB.goldRim : '#4a3a1e'; g.beginPath(); g.arc(x, y, r * 1.18, 0, 7); g.fill();
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    }
    // SMD-корпуса (тёмные с металл-торцами) — плоская тень на albedo (3D придёт позже)
    for (const cm of L.comps) {
      if (cm.type === 'smd') {
        const x = cm.x * S, y = cm.y * S, len = cm.len * S, w = cm.w * S;
        g.fillStyle = '#1a1c20'; g.save(); g.translate(x, y); if (!cm.horiz) g.rotate(Math.PI / 2);
        g.fillRect(-len * 0.4, -w * 0.7, len * 0.8, w * 1.4);
        g.fillStyle = '#9a9da6'; g.fillRect(-len * 0.46, -w * 0.7, len * 0.08, w * 1.4); g.fillRect(len * 0.38, -w * 0.7, len * 0.08, w * 1.4);
        g.restore();
      }
    }
    // шелкография
    g.fillStyle = PCB.silk; g.strokeStyle = PCB.silk; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of L.silk) {
      g.globalAlpha = 0.5;
      if (s.type === 'border') { g.globalAlpha = 0.35; g.lineWidth = 3; g.strokeRect(S * 0.018, S * 0.018, S * 0.964, S * 0.964); }
      else if (s.type === 'rect') { g.globalAlpha = 0.4; g.lineWidth = 2; g.strokeRect((s.x - s.s / 2) * S, (s.y - s.s / 2) * S, s.s * S, s.s * S); }
      else if (s.type === 'ref') { g.globalAlpha = 0.55; g.font = (s.size * S) + 'px monospace'; g.fillText(s.text, s.x * S, s.y * S); }
      else if (s.type === 'label') { g.globalAlpha = 0.5; g.font = '600 ' + (s.size * S) + 'px monospace'; g.fillText(s.text, s.x * S, s.y * S); }
    }
    g.globalAlpha = 1;
    return c;
  }
  // height-канва: маска=средне, медь/пады/шелк выше, via ниже → потом в normal.
  function drawHeight(S, L) {
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = '#777'; g.fillRect(0, 0, S, S);
    for (const t of L.traces) { strokePts(g, t.pts, S, t.w * S * 1.35, '#9a9a9a'); strokePts(g, t.pts, S, t.w * S * 0.55, '#b6b6b6'); }
    for (const p of L.pads) { const x = p.x * S, y = p.y * S; g.fillStyle = '#c8c8c8'; if (p.rect) { g.fillRect(x - p.rw * S / 2, y - p.rh * S / 2, p.rw * S, p.rh * S); } else { g.beginPath(); g.arc(x, y, (p.r || 0.004) * S, 0, 7); g.fill(); } }
    for (const v of L.vias) { g.fillStyle = '#bbb'; g.beginPath(); g.arc(v.x * S, v.y * S, v.r * S * 1.7, 0, 7); g.fill(); g.fillStyle = '#3a3a3a'; g.beginPath(); g.arc(v.x * S, v.y * S, v.r * S * 0.85, 0, 7); g.fill(); }
    g.fillStyle = '#e6e6e6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of L.silk) { if (s.type === 'ref' || s.type === 'label') { g.font = (s.size * S) + 'px monospace'; g.fillText(s.text, s.x * S, s.y * S); } }
    return c;
  }
  function heightToNormal(hc, strength) {
    const w = hc.width, h = hc.height; const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
    const out = document.createElement('canvas'); out.width = w; out.height = h; const og = out.getContext('2d');
    const img = og.createImageData(w, h), d = img.data;
    const at = (x, y) => src[((y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)) * 4];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let nx = (at(x - 1, y) - at(x + 1, y)) / 255 * strength, ny = (at(x, y + 1) - at(x, y - 1)) / 255 * strength, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz); nx *= inv; ny *= inv; nz *= inv;
      const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    og.putImageData(img, 0, 0); return out;
  }
  // roughness: маска матовая, медь/золото глянцевее. metalness: медь/золото = металл.
  function drawMaterial(S, L, kind) {
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = kind === 'rough' ? '#cccccc' : '#000000'; g.fillRect(0, 0, S, S);   // rough: матовая маска ; metal: диэлектрик
    const copper = kind === 'rough' ? '#666666' : '#e6e6e6';                // медь: глянцевее + металл
    const gold = kind === 'rough' ? '#444444' : '#ffffff';                  // золото: ещё глянцевее + металл
    for (const t of L.traces) strokePts(g, t.pts, S, t.w * S * 1.5, copper);
    for (const v of L.vias) { g.fillStyle = gold; g.beginPath(); g.arc(v.x * S, v.y * S, v.r * S * 1.7, 0, 7); g.fill(); }
    for (const p of L.pads) { const x = p.x * S, y = p.y * S; g.fillStyle = gold; if (p.rect) g.fillRect(x - p.rw * S / 2, y - p.rh * S / 2, p.rw * S, p.rh * S); else { g.beginPath(); g.arc(x, y, (p.r || 0.004) * S, 0, 7); g.fill(); } }
    return c;
  }
  function makeBoardTextures(L) {
    const AS = LOWQ ? 1024 : 2048, NS = LOWQ ? 512 : 1024;
    const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = MAX_ANISO; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
    const emisC = document.createElement('canvas'); emisC.width = emisC.height = 8; emisC.getContext('2d').fillStyle = '#000'; emisC.getContext('2d').fillRect(0, 0, 8, 8);
    return {
      map:    mk(drawAlbedo(AS, L), true),
      normal: LOWQ ? null : mk(heightToNormal(drawHeight(NS, L), 2.4), false),   // normal-map дорого → off на слабых
      rough:  mk(drawMaterial(NS, L, 'rough'), false),
      metal:  mk(drawMaterial(NS, L, 'metal'), false),
      emis:   mk(emisC, true),
    };
  }

  // ── Геометрия платы — почти TOP-DOWN (вид сверху, макро), лёгкий наклон ──
  const BOARD_TILT = 1.30;                             // ~74° — плата «смотрит» в камеру; остаточный угол = параллакс
  const boardQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(BOARD_TILT, 0, 0));
  const _bw = new THREE.Vector3();                     // временный (layout): board-local → world-local
  const _bn = new THREE.Vector3();                     // нормаль платы (world)
  // board-плоскость (u=гориз, v=глубина, h=высота над платой) → world-локаль (наклон вшит).
  function boardToWorld(u, v, h, out) { (out || _bw).set(u, h, v).applyQuaternion(boardQuat); return out || _bw; }

  const boardLayout = generatePCBLayout();
  const boardTex = makeBoardTextures(boardLayout);
  const boardMat = new THREE.MeshStandardMaterial({
    map: boardTex.map, normalMap: boardTex.normal, roughnessMap: boardTex.rough, metalnessMap: boardTex.metal,
    roughness: 1.0, metalness: 1.0,                    // финальные значения модулируются картами
    emissiveMap: boardTex.emis, emissive: 0xffffff, emissiveIntensity: 0.0,   // красного в базе НЕТ (ток придёт шейдером)
    envMapIntensity: 0.85,
  });
  boardMat.normalScale = new THREE.Vector2(0.7, 0.7);

  // ── Ток ПО САМИМ медным дорожкам платы (emissive-инъекция в boardMat) ──
  // Маска трасс (канал G) → красные пакеты бегут радиально от CPU наружу,
  // идеально совпадая с медью (та же uv). Сюда же вшит клик-разряд (волна).
  function makeFlowMask(S, L) {
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    for (const t of L.traces) strokePts(g, t.pts, S, t.w * S * 1.7, t.main ? '#00ff00' : '#009100');
    // пады в маску НЕ кладём — ток не должен светить золото (bloom-пересвет)
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = MAX_ANISO;
    return tex;
  }
  const flowMask = makeFlowMask(LOWQ ? 512 : 1024, boardLayout);
  const boardFlow = {
    uTime:  { value: 0 },
    uMask:  { value: flowMask },
    uColor: { value: new THREE.Color(ACCENT) },
    uHot:   { value: new THREE.Color(0xff3b46) },              // глубокий красный (не розовый)
    uDisc:  { value: new THREE.Vector4(0.5, 0.5, -100, 0) },   // x,y = uv-источник; z = t0; w = сила
  };
  boardMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, boardFlow);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBoardUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBoardUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBoardUv;\nuniform float uTime;\nuniform sampler2D uMask;\nuniform vec3 uColor,uHot;\nuniform vec4 uDisc;')
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        '{',
        '  float mask = texture2D(uMask, vBoardUv).g;',
        '  float d = distance(vBoardUv, vec2(0.5));',
        '  float ph = fract(d*9.0 - uTime*0.5);',                           // пакеты радиально от центра (CPU)
        '  float pulse = smoothstep(0.05,0.0,ph) + smoothstep(0.19,0.05,ph)*0.26;', // острый фронт + короткий хвост, длинный тёмный зазор
        '  vec3 flow = mix(uColor,uHot,pulse)*pulse*mask*0.95;',
        '  float age = uTime - uDisc.z;',                                    // клик-разряд: фронт волны по дорожкам
        '  if (age > 0.0 && age < 2.4) {',
        '    float dd = distance(vBoardUv, uDisc.xy);',
        '    float front = age*0.85;',
        '    float band = exp(-pow((dd-front)/0.055, 2.0));',
        '    float fade = exp(-age*1.3);',
        '    flow += uHot * band * fade * (0.5 + mask*1.9) * uDisc.w;',
        '  }',
        '  totalEmissiveRadiance += flow;',
        '}',
      ].join('\n'));
    boardMat.userData.sh = sh;
  };
  boardMat.needsUpdate = true;
  const BOARD_BASE = 12;                               // базовый размер плиты (масштабируется на layout)
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD_BASE, 0.22, BOARD_BASE), boardMat);
  board.quaternion.copy(boardQuat);
  world.add(board);

  // ── Детали корпусов: золотые выводы-ножки (QFP) + матовая подложка ────────
  const leadMat = new THREE.MeshStandardMaterial({ color: 0xc9a95c, metalness: 0.95, roughness: 0.32, envMapIntensity: 1.1 });
  const leadGeo = new THREE.BoxGeometry(0.07, 0.035, 0.18);     // ножка: длина вдоль Z, выходит из корпуса
  const _qx90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const _qI = new THREE.Quaternion(), _sI = new THREE.Vector3(1, 1, 1), _mI = new THREE.Matrix4(), _pI = new THREE.Vector3();
  function addLeads(parent, hw, hd, y, perSide) {
    const im = new THREE.InstancedMesh(leadGeo, leadMat, perSide * 4);
    im.frustumCulled = false; let idx = 0;
    for (let i = 0; i < perSide; i++) {
      const t = (i + 0.5) / perSide * 2 - 1;
      _pI.set(t * hw * 0.84, y, hd + 0.085);  _mI.compose(_pI, _qI, _sI);   im.setMatrixAt(idx++, _mI);  // низ
      _pI.set(t * hw * 0.84, y, -hd - 0.085); _mI.compose(_pI, _qI, _sI);   im.setMatrixAt(idx++, _mI);  // верх
      _pI.set(hw + 0.085, y, t * hd * 0.84);  _mI.compose(_pI, _qx90, _sI); im.setMatrixAt(idx++, _mI);  // право
      _pI.set(-hw - 0.085, y, t * hd * 0.84); _mI.compose(_pI, _qx90, _sI); im.setMatrixAt(idx++, _mI);  // лево
    }
    im.instanceMatrix.needsUpdate = true; parent.add(im); return im;
  }
  const underTex = (function () {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.74)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function makeUnderlay(size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: underTex, color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; return m;
  }
  const SHADOW_OFF = { x: -0.2, z: -0.16 };             // направление псевдо-тени (противоположно keyLight)

  // ── CPU-ЯДРО (Vacantrix Platform, coreEntry) — ступенчатый чип в центре ──
  const CPU_W = 2.3, CPU_R = 1.25;                     // ширина CPU / радиус выхода дорожек
  const coreGroup = new THREE.Group();
  coreGroup.quaternion.copy(boardQuat);
  world.add(coreGroup);
  const cpuSocket = new THREE.Mesh(new THREE.BoxGeometry(CPU_W * 1.18, 0.16, CPU_W * 1.18),
    new THREE.MeshStandardMaterial({ color: 0x0c0e14, metalness: 0.7, roughness: 0.45 }));
  cpuSocket.position.y = 0.08; coreGroup.add(cpuSocket);
  const cpuBody = new THREE.Mesh(new THREE.BoxGeometry(CPU_W, 0.5, CPU_W),
    new THREE.MeshStandardMaterial({ color: 0x14161e, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.2 }));
  cpuBody.position.y = 0.41; coreGroup.add(cpuBody);
  const cpuCap = new THREE.Mesh(new THREE.BoxGeometry(CPU_W * 0.7, 0.3, CPU_W * 0.7),
    new THREE.MeshStandardMaterial({ color: 0x2a0d12, metalness: 0.6, roughness: 0.25,
      emissive: ACCENT, emissiveIntensity: 0.4 }));
  cpuCap.position.y = 0.81; coreGroup.add(cpuCap);
  const coreInner = cpuCap;                            // ярко-эмиссивный «горячий» хедспредер (анимируется ig)
  const cpuIcon = new THREE.Mesh(new THREE.PlaneGeometry(CPU_W * 0.5, CPU_W * 0.5),
    new THREE.MeshBasicMaterial({ map: iconTexture(ICON.platform), transparent: true }));
  cpuIcon.rotation.x = -Math.PI / 2; cpuIcon.position.y = 0.97; coreGroup.add(cpuIcon);
  // подсветка-рамка ядра (пульсирует при фокусе/выборе Platform) — рёбра кепки
  const coreSeams = new THREE.LineSegments(new THREE.EdgesGeometry(cpuCap.geometry),
    new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  cpuCap.add(coreSeams); coreSeams.visible = false;
  const coreHalo = glowSprite(ACCENT, 3.4, 0);
  coreHalo.position.y = 1.0; coreGroup.add(coreHalo);
  const cpuUnder = makeUnderlay(CPU_W * 1.9); cpuUnder.position.set(SHADOW_OFF.x * 1.4, 0.018, SHADOW_OFF.z * 1.4); coreGroup.add(cpuUnder);   // заземление + псевдо-тень
  addLeads(coreGroup, CPU_W * 0.5, CPU_W * 0.5, 0.07, 10);                                            // золотые ножки QFP

  // ── Чипы-инструменты (nodes) ──────────────────────────────────────────
  // Раскладка [nx, ny] — позиция чипа на ПЛОСКОСТИ платы (−1..1), как угол вокруг
  // CPU. Реальные board-координаты считаются в layoutHomes() из вьюпорта.
  const LAYOUT = {
    hh:        [ 0.34,  0.92],
    avito:     [ 0.96,  0.30],
    tasks:     [-0.72,  0.62],
    publisher: [-0.95, -0.34],
    leads:     [-0.22, -0.86],
    monitor:   [ 0.66, -0.78],
    analytics: [ 0.70, -0.12],
  };
  const SPREAD = 0.74;
  const BOARD_FIT = 0.72;                              // плотность чипов вокруг CPU (доля рамки сцены)
  const STAGE_MIN = 0.72, STAGE_MAX = 1.85;
  const CHIP_W = 1.5, CHIP_D = 1.2, CHIP_H = 0.42, CHIP_R = 0.8;   // габариты чипа / радиус входа дорожки
  const TRACE_H = 0.085, TRACE_W = 0.16, TRACE_PITCH = 0.85;      // дорожка над платой / ширина / шаг тока

  // ── Шейдер бегущего тока: красные направленные импульсы (кометный хвост) ──
  // База почти невидима (медь платы видна), за bloom-порог выходят только пакеты.
  function makeFlowMat() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uOpacity: { value: 0 }, uSpeed: { value: 0.62 },
        uColor: { value: new THREE.Color(ACCENT) }, uHot: { value: new THREE.Color(0xff3b46) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'precision highp float;',
        'uniform float uTime,uOpacity,uSpeed; uniform vec3 uColor,uHot; varying vec2 vUv;',
        'void main(){',
        '  float across=abs(vUv.x-0.5)*2.0;',
        '  float prof=smoothstep(1.0,0.12,across);',          // яркий центр ленты, мягкие края
        '  float s=vUv.y-uTime*uSpeed;',                       // пакеты бегут наружу (CPU→чип)
        '  float f=fract(s);',
        '  float lead=smoothstep(0.12,0.0,f);',                // резкий передний фронт
        '  float tail=smoothstep(0.0,0.4,f)*(1.0-f);',         // короткий кометный хвост
        '  float packet=clamp(lead+tail*0.4,0.0,1.0);',
        '  float rail=0.04;',                                  // едва тлеющий рельс (медь видна)
        '  vec3 col=mix(uColor,uHot,packet)*(rail+packet*2.0)*prof;',
        '  float a=(rail*0.6+packet)*prof*uOpacity;',
        '  gl_FragColor=vec4(col,a);',
        '}',
      ].join('\n'),
    });
  }

  const tmp = new THREE.Vector3();
  const nodes = KEYS.map((key, i) => {
    const color = NODE_COLORS[key];
    const nx = LAYOUT[key][0], ny = LAYOUT[key][1];

    const grp = new THREE.Group();
    grp.quaternion.copy(boardQuat);                    // чип стоит вдоль нормали наклонённой платы
    const body = new THREE.Mesh(new THREE.BoxGeometry(CHIP_W, CHIP_H, CHIP_D),
      new THREE.MeshStandardMaterial({ color: 0x0d0e11, metalness: 0.22, roughness: 0.7,
        envMapIntensity: 0.85, emissive: color, emissiveIntensity: 0.06 }));   // матовый эпокси-корпус, бренд лишь намёком
    grp.add(body);
    const mesh = body;                                 // пикабельный меш
    // светящаяся бренд-фаска по рёбрам корпуса — чип читается как реальный, но брендирован
    const seam = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    body.add(seam);
    const iconTex = iconTexture(ICON[key]);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(CHIP_W * 0.78, CHIP_D * 0.78),
      new THREE.MeshBasicMaterial({ map: iconTex, transparent: true }));
    top.rotation.x = -Math.PI / 2; top.position.y = CHIP_H / 2 + 0.012; grp.add(top);
    grp.scale.setScalar(0.001);                        // спрятан до раскрытия
    world.add(grp);

    // мягкое свечение слота в цвете бренда (рамка)
    const halo = glowSprite(color, 1.95, 0);
    halo.position.y = CHIP_H * 0.2; grp.add(halo);
    // реалистичные детали: матовая подложка + золотые выводы-ножки
    const under = makeUnderlay(Math.max(CHIP_W, CHIP_D) * 1.7); under.position.set(SHADOW_OFF.x, -CHIP_H * 0.5 + 0.012, SHADOW_OFF.z); grp.add(under);
    addLeads(grp, CHIP_W * 0.5, CHIP_D * 0.5, -CHIP_H * 0.5 + 0.05, 7);

    // дорожка-трейс к CPU (бегущий ток, шейдер) — геометрия строится в updateTraces()
    const traceMesh = new THREE.Mesh(new THREE.BufferGeometry(), makeFlowMat());
    traceMesh.visible = false; world.add(traceMesh);

    // интро-импульс «искра из CPU к чипу»
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    world.add(line);
    const pulse = glowSprite(color, 1.0, 0);
    world.add(pulse);

    return {
      key, color, grp, mesh, halo, line, pulse, traceMesh, iconTex,
      pickR: Math.hypot(CHIP_W, CHIP_D) * 0.5 + 0.18,
      nx, ny, planeU: 0, planeV: 0,
      home: new THREE.Vector3(), target: new THREE.Vector3(), revealed: false,
    };
  });

  // ── Цели наведения (чипы + CPU) ───────────────────────────────────────
  const coreEntry = { key: 'platform', grp: coreGroup, mesh: cpuBody, home: new THREE.Vector3(), pickR: CPU_W * 0.72 };
  const hoverables = [coreEntry].concat(nodes);

  // ── Фоновое боке (глубина техно-пустоты) ──────────────────────────────
  [[0x16203a, 30, 0.05, -8, 3, -12], [0x0d2030, 26, 0.045, 9, -4, -11], [ACCENT, 18, 0.03, 0, -2, -10]]
    .forEach(([c, s, o, x, y, z]) => { const sp = glowSprite(c, s, o); sp.position.set(x, y, z); world.add(sp); });

  // ── Раскладка чипов на плате ──────────────────────────────────────────
  function layoutFactors(a) {
    const t = clampv((a - 0.55) / (2.0 - 0.55), 0, 1);
    return { xs: lerp(0.58, 1.10, t), ys: lerp(1.20, 0.84, t) };
  }
  let laidOut = false;
  function layoutHomes() {
    const vFov = camera.fov * Math.PI / 180;
    const halfH = baseDist * Math.tan(vFov / 2);
    const halfW = halfH * camera.aspect;
    const a = camera.aspect;
    const stageHalfW = halfH * Math.min(a, STAGE_MAX);
    const stageHalfH = a < STAGE_MIN ? halfW / STAGE_MIN : halfH;
    const f = layoutFactors(clampv(a, STAGE_MIN, STAGE_MAX));
    let mU = 0, mV = 0;
    for (const n of nodes) {
      const u = clampv(n.nx * f.xs, -0.97, 0.97) * stageHalfW * SPREAD * BOARD_FIT;
      const v = clampv(n.ny * f.ys, -0.97, 0.97) * stageHalfH * SPREAD * BOARD_FIT;
      n.planeU = u; n.planeV = v;
      boardToWorld(u, v, CHIP_H * 0.5, n.target);
      if (!laidOut) n.home.copy(n.target);
      mU = Math.max(mU, Math.abs(u)); mV = Math.max(mV, Math.abs(v));
    }
    // CPU и точечный свет — в центре платы
    boardToWorld(0, 0, 0.5, coreEntry.home);
    corePoint.position.copy(coreEntry.home);
    // плата масштабируется, чтобы покрыть чипы + поля
    board.scale.set((mU + 2.4) / (BOARD_BASE / 2), 1, (mV + 2.4) / (BOARD_BASE / 2));
    laidOut = true;
  }

  // ── Дорожки-трейсы: BufferGeometry-ленты на плате (пересборка на layout/resize) ──
  function rebuildTrace(n) {
    const len = Math.hypot(n.planeU, n.planeV) || 1e-3;
    const dx = n.planeU / len, dz = n.planeV / len;    // направление CPU→чип в плоскости
    const px = -dz, pz = dx;                           // перпендикуляр (ширина ленты)
    const a0 = CPU_R, a1 = Math.max(a0 + 0.15, len - CHIP_R);
    const w = TRACE_W, vlen = (a1 - a0) / TRACE_PITCH;
    const pos = new Float32Array(12), uv = new Float32Array(8), nrm = new Float32Array(12);
    const set = (idx, a, sgn, vc) => {
      boardToWorld(dx * a + px * sgn * w, dz * a + pz * sgn * w, TRACE_H, _bw);
      pos[idx * 3] = _bw.x; pos[idx * 3 + 1] = _bw.y; pos[idx * 3 + 2] = _bw.z;
      uv[idx * 2] = sgn > 0 ? 1 : 0; uv[idx * 2 + 1] = vc;
    };
    set(0, a0, -1, 0); set(1, a0, 1, 0); set(2, a1, -1, vlen); set(3, a1, 1, vlen);
    _bn.set(0, 1, 0).applyQuaternion(boardQuat);
    for (let k = 0; k < 4; k++) { nrm[k * 3] = _bn.x; nrm[k * 3 + 1] = _bn.y; nrm[k * 3 + 2] = _bn.z; }
    const old = n.traceMesh.geometry;
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    ng.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    ng.setIndex([0, 1, 2, 1, 3, 2]);
    n.traceMesh.geometry = ng;
    if (old && old.dispose) old.dispose();
  }
  function updateTraces() { for (const n of nodes) rebuildTrace(n); }

  // ── 3D-выделение: ярко-красное неоновое кольцо вокруг наведённого чипа ──
  const selGlow = new THREE.Mesh(
    new THREE.RingGeometry(0.89, 1.07, 96),
    new THREE.MeshBasicMaterial({ color: 0xff0022, transparent: true, opacity: 0,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  const selRing = new THREE.Mesh(
    new THREE.RingGeometry(0.955, 1.0, 96),
    new THREE.MeshBasicMaterial({ color: 0xff2233, transparent: true, opacity: 0,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  selRing.add(selGlow);
  selRing.renderOrder = 999; selGlow.renderOrder = 998;
  selRing.visible = false;
  scene.add(selRing);

  // ── Клик по пустоте → РАЗРЯД: волна красного тока + ударные кольца ─────
  // Волна по дорожкам делает boardMat (uDisc). Здесь — кольца на плоскости
  // платы + краткий буст bloom. fxGroup повторяет наклон платы (плоскость XZ).
  const BLOOM_BASE = 0.8;
  const fxGroup = new THREE.Group(); fxGroup.quaternion.copy(boardQuat); world.add(fxGroup);
  const _ndc = new THREE.Vector2(), _ray = new THREE.Raycaster(), _wl = new THREE.Vector3();
  const ringTex = (function () {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 30, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.74, accRGBA(0)); grd.addColorStop(0.86, accRGBA(1));
    grd.addColorStop(0.94, 'rgba(255,180,188,1)'); grd.addColorStop(1, accRGBA(0));
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 990; fxGroup.add(m);
    rings.push({ m, age: 1e3, life: 0.85, max: 1 });
  }
  let ringIdx = 0, dischargeFlash = 0, nowSec = 0;
  function spawnRing(worldPt, scaleMax) {
    const r = rings[ringIdx]; ringIdx = (ringIdx + 1) % rings.length;
    fxGroup.worldToLocal(_wl.copy(worldPt));
    r.m.position.set(_wl.x, Math.max(_wl.y, 0.05) + 0.04, _wl.z);
    r.age = 0; r.max = scaleMax || 7; r.m.visible = true; r.m.material.opacity = 0;
  }
  function triggerDischarge(px, py) {
    _ndc.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const hit = _ray.intersectObject(board, false)[0];
    if (!hit || !hit.uv) return;
    boardFlow.uDisc.value.set(hit.uv.x, hit.uv.y, nowSec, 1.0);   // волна тока от точки клика
    dischargeFlash = 1.0;
    spawnRing(hit.point, 8.5);
    spawnRing(hit.point, 5.0);
  }
  function updateDischarge(dt) {
    for (const r of rings) {
      if (!r.m.visible) continue;
      r.age += dt;
      const k = clamp01(r.age / r.life);
      const s = 0.4 + r.max * ease(k);
      r.m.scale.set(s, s, s);
      r.m.material.opacity = (1 - k) * 0.9;
      if (k >= 1) { r.m.visible = false; }
    }
    dischargeFlash *= Math.pow(0.5, dt / 0.45);
    bloomPass.strength = BLOOM_BASE + dischargeFlash * 0.55;
  }

  // ── Кадрирование камеры ───────────────────────────────────────────────
  let baseDist = 14;
  function fitDistance() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const vFov = camera.fov * Math.PI / 180;
    const t = clampv((aspect - 0.55) / (2.0 - 0.55), 0, 1);
    const R = lerp(5.6, 7.3, t);                          // top-down: плата шире в кадре → отъезжаем дальше
    const dV = R / (Math.tan(vFov / 2) * 0.9);
    const dH = R / (Math.tan(vFov / 2) * aspect * 0.9);
    const d = Math.max(dV, dH);
    return aspect < 0.8 ? d * 0.8 : d;                    // портрет: ближе, плата заполняет кадр
  }
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOWQ ? 1.5 : 2));
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(Math.max(2, w * 0.5), Math.max(2, h * 0.5));   // half-res bloom: ÷4 fill-стоимости, мягкий блюр незаметен
    camera.aspect = w / h; camera.updateProjectionMatrix();
    baseDist = fitDistance();
    layoutHomes();
    updateTraces();                                       // дорожки пересобираются под вьюпорт (на layout, не в кадре)
  }
  onResize();

  // ── Параллакс + вращение платы мышью (ЛКМ) + зум колесом ──────────────
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let dragging = false, dragMoved = 0, wasDrag = false, lastDX = 0, lastDY = 0;
  const userRot = { x: 0, y: 0 }, userRotTo = { x: 0, y: 0 };
  let userZoom = 1, userZoomTo = 1;
  function onMouse(e) {
    tmx = (e.clientX / window.innerWidth) * 2 - 1;
    tmy = (e.clientY / window.innerHeight) * 2 - 1;
    if (dragging) {                                     // ЛКМ-перетаскивание → крутим всю плату
      const dx = e.clientX - lastDX, dy = e.clientY - lastDY;
      lastDX = e.clientX; lastDY = e.clientY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      userRotTo.y += dx * 0.006;
      userRotTo.x = Math.max(-1.2, Math.min(1.2, userRotTo.x + dy * 0.006));
      setHover(null);
      return;
    }
    pickHover(e);
  }
  function onDown(e) {
    if (e.button !== 0 || phase !== 'idle' || focusEntry) return;
    if (!(e.target && e.target.closest && e.target.closest('.planet-hero'))) return;
    dragging = true; dragMoved = 0; wasDrag = false; lastDX = e.clientX; lastDY = e.clientY;
    document.body.style.cursor = 'grabbing';
  }
  function onUp() {
    if (!dragging) return;
    dragging = false; wasDrag = dragMoved > 6; document.body.style.cursor = '';
  }
  function onWheel(e) {
    if (phase !== 'idle' || focusEntry) return;
    if (!(e.target && e.target.closest && e.target.closest('.planet-hero'))) return;
    e.preventDefault();
    userZoomTo = Math.max(0.7, Math.min(1.5, userZoomTo + (e.deltaY > 0 ? 0.08 : -0.08)));
  }

  // ── Тач: палец крутит плату (как ЛКМ), щипок — зум; вертикаль → скролл ──
  let touchMode = null;
  let tStartX = 0, tStartY = 0, tLastX = 0, tLastY = 0, pinchDist = 0;
  const _tdist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const _inHero = t => t && t.target && t.target.closest && t.target.closest('.planet-hero');

  function onTouchStart(e) {
    if (phase !== 'idle' || focusEntry) { touchMode = null; return; }
    if (e.touches.length >= 2) {
      if (!_inHero(e)) { touchMode = null; return; }
      touchMode = 'pinch';
      pinchDist = _tdist(e.touches[0], e.touches[1]);
      dragging = false; wasDrag = true;
      return;
    }
    const t = e.touches[0];
    if (!(t && t.target && t.target.closest && t.target.closest('.planet-hero'))) { touchMode = null; return; }
    touchMode = 'decide';
    tStartX = tLastX = t.clientX; tStartY = tLastY = t.clientY;
    dragging = false; dragMoved = 0; wasDrag = false;
  }
  function onTouchMove(e) {
    if (phase !== 'idle' || focusEntry || !touchMode) return;
    if (touchMode === 'pinch' && e.touches.length >= 2) {
      const d = _tdist(e.touches[0], e.touches[1]);
      if (pinchDist > 0) { const ratio = d / pinchDist; userZoomTo = Math.max(0.7, Math.min(1.5, userZoomTo / ratio)); }
      pinchDist = d; e.preventDefault();
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const totX = t.clientX - tStartX, totY = t.clientY - tStartY;
    if (touchMode === 'decide') {
      if (Math.abs(totX) < 7 && Math.abs(totY) < 7) { return; }
      if (Math.abs(totX) > Math.abs(totY)) { touchMode = 'rotate'; dragging = true; }
      else { touchMode = 'scroll'; return; }
    }
    if (touchMode === 'rotate') {
      const dx = t.clientX - tLastX, dy = t.clientY - tLastY;
      tLastX = t.clientX; tLastY = t.clientY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      userRotTo.y += dx * 0.006;
      userRotTo.x = Math.max(-1.2, Math.min(1.2, userRotTo.x + dy * 0.006));
      setHover(null);
      e.preventDefault();
    }
  }
  function onTouchEnd(e) {
    if (touchMode === 'rotate') wasDrag = dragMoved > 6;
    if (e.touches.length === 0) { touchMode = null; dragging = false; }
    else if (touchMode === 'pinch' && e.touches.length < 2) { touchMode = null; dragging = false; }
  }

  // ── Состояние / тайминги ──────────────────────────────────────────────
  let phase = 'intro';
  let raf = 0, startT = 0, last = 0, endAt = 0, paused = false;
  let running = false;
  let _attached = false;
  let _safety = 0;
  const _listeners = [];
  let focus = 0, focusTarget = null, focusEntry = null, focusRef = null;
  let coreSel = false, coreDim = 0;
  let focusGoal = 0, focusFrom = 0, focusElapsed = 0;
  const fCam = { x: 0, y: 0, z: 0 }, fLook = { x: 0, y: 0, z: 0 };

  const IGNITE = 1000, FIRST = 850, STAGGER = 230, PULSE_DUR = 720;
  const END = FIRST + KEYS.length * STAGGER + PULSE_DUR + 520;
  const ease = t => 1 - Math.pow(1 - t, 3);
  const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;

  function enterIdle() {
    if (phase === 'idle') return;
    phase = 'idle';
    revealAllCards();
    if (veil) veil.classList.add('lift');
    if (canvas) canvas.classList.add('bg');
    document.body.classList.remove('intro-lock');
    document.body.classList.add('intro-done');
    if (skip) skip.removeEventListener('click', skipIntro);
    document.removeEventListener('keydown', onKey);
    const bar = document.querySelector('.topbar');
    if (bar) bar.removeEventListener('click', skipIntro, true);
  }
  function skipIntro() { if (phase === 'intro') enterIdle(); }
  function onKey(e) { if (e.key !== 'Escape') return; skipIntro(); }

  // Клик по чипу/CPU → полная карточка-страница приложения (общий модуль AppDetail).
  function onClick(e) {
    if (phase !== 'idle') return;
    if (wasDrag) { wasDrag = false; return; }
    if (!(e.target && e.target.closest && e.target.closest('.planet-hero'))) return;
    const picked = pickAt(e.clientX, e.clientY);
    if (picked) {
      appView = true;
      if (picked === coreEntry) { coreSel = true; }    // CPU: без зума, продукты гаснут + рамка ядра пульсирует
      else { focusTarget = picked; coreSel = false; }  // чип: зум + подсветка
      if (window.AppDetail && window.AppDetail.open) window.AppDetail.open(picked.key);
    } else {
      triggerDischarge(e.clientX, e.clientY);           // пустой участок → разряд (без открытия раздела)
    }
  }

  // ── Наведение: инфо-карточка + красная обводка ────────────────────────
  const _v3 = new THREE.Vector3();
  const cardEl = document.getElementById('planet-card');
  const pc = cardEl ? {
    img: document.getElementById('pc-img'), nm: document.getElementById('pc-nm'),
    sub: document.getElementById('pc-sub'), desc: document.getElementById('pc-desc'),
    badge: document.getElementById('pc-badge'), cta: document.getElementById('pc-cta'),
  } : null;
  let hovered = null;

  function fillCard(key) {
    if (!pc) return;
    const d = cardData(key);
    if (pc.img) pc.img.src = d.icon || ICON[key] || '';
    pc.nm.textContent = d.name;
    pc.sub.textContent = d.sub; pc.sub.style.display = d.sub ? '' : 'none';
    pc.desc.textContent = d.desc; pc.desc.style.display = d.desc ? '' : 'none';
    pc.badge.textContent = d.badge; pc.badge.className = 'pc-badge ' + (d.beta ? 'beta' : d.live ? 'live' : 'soon');
    pc.badge.style.display = d.badge ? '' : 'none';
    if (pc.cta) pc.cta.style.display = 'none';
  }
  function setHover(entry) {
    if (hovered === entry) return;
    hovered = entry;
    if (entry) {
      fillCard(entry.key);
      if (cardEl) cardEl.classList.add('show');
      document.body.style.cursor = 'pointer';
    } else {
      if (cardEl) cardEl.classList.remove('show');
      document.body.style.cursor = '';
    }
  }

  // Экранная проекция чипа/CPU: центр (cx,cy) и pick-радиус в пикселях (pr).
  // Pick-радиус ОБОБЩЁН на пер-entry bounding sphere (entry.pickR) — у боксов нет
  // geometry.parameters.radius, поэтому ховер/клик работают и для CPU, и для чипов.
  const _vc = new THREE.Vector3(), _ve = new THREE.Vector3(), _vr = new THREE.Vector3();
  function projectEntry(entry) {
    entry.grp.getWorldPosition(_vc);
    const r = (entry.pickR || 0.6) * entry.grp.scale.x;
    _vr.setFromMatrixColumn(camera.matrixWorld, 0);
    _ve.copy(_vc).addScaledVector(_vr, r);
    const behind = _vc.z > camera.position.z;
    _vc.project(camera); _ve.project(camera);
    const cx = (_vc.x * 0.5 + 0.5) * window.innerWidth;
    const cy = (-_vc.y * 0.5 + 0.5) * window.innerHeight;
    const ex = (_ve.x * 0.5 + 0.5) * window.innerWidth;
    const ey = (-_ve.y * 0.5 + 0.5) * window.innerHeight;
    return { cx, cy, pr: Math.hypot(ex - cx, ey - cy), behind };
  }
  function pickAt(px, py) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < hoverables.length; i++) {
      const s = projectEntry(hoverables[i]);
      if (s.behind) continue;
      const d = Math.hypot(px - s.cx, py - s.cy);
      if (d <= s.pr * 1.55 && d < bestD) { bestD = d; best = hoverables[i]; }
    }
    return best;
  }
  function pickHover(e) {
    if (phase !== 'idle' || focusEntry) { setHover(null); return; }
    if (!(e.target && e.target.closest && e.target.closest('.planet-hero'))) { setHover(null); return; }
    setHover(pickAt(e.clientX, e.clientY));
  }
  function positionCard(entry) {
    if (!cardEl) return;
    entry.grp.getWorldPosition(_v3); _v3.project(camera);
    const sx = (_v3.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-_v3.y * 0.5 + 0.5) * window.innerHeight;
    const cw = 232, ch = cardEl.offsetHeight || 150;
    let cx = sx + 30, cy = sy - 24;
    if (cx + cw > window.innerWidth - 12) cx = sx - cw - 30;
    if (cx < 12) cx = 12;
    cy = Math.max(70, Math.min(cy, window.innerHeight - ch - 12));
    cardEl.style.left = cx + 'px'; cardEl.style.top = cy + 'px';
  }

  function frame(now) {
    if (!startT) { startT = now; last = now; }
    const t = now - startT;
    const dt = Math.min(50, now - last) / 1000; last = now;
    const tsec = t / 1000;

    // Камера: долли только на интро, дальше — стабильно.
    const uk = Math.min(1, dt * 12);
    userRot.x += (userRotTo.x - userRot.x) * uk;
    userRot.y += (userRotTo.y - userRot.y) * uk;
    userZoom += (userZoomTo - userZoom) * Math.min(1, dt * 8);
    const di = ease(clamp01(t / (IGNITE + 600)));
    const dist = phase === 'intro' ? baseDist * (1.9 - 0.9 * di) : baseDist * userZoom;
    mx += (tmx - mx) * Math.min(1, dt * 3.0);
    my += (tmy - my) * Math.min(1, dt * 3.0);

    // Фокус на чипе (клик): затухание вращения/параллакса + наезд камеры.
    const fGoal = focusTarget ? 1 : 0;
    if (fGoal !== focusGoal) { focusFrom = focus; focusElapsed = 0; focusGoal = fGoal; }
    focusElapsed += dt;
    const fk  = clampv(focusElapsed / (fGoal ? 0.6 : 0.78), 0, 1);
    const fke = fk < 0.5 ? 4 * fk * fk * fk : 1 - Math.pow(-2 * fk + 2, 3) / 2;
    focus = lerp(focusFrom, fGoal, fke);
    if (focusTarget) { focusEntry = focusTarget; focusRef = focusTarget; }
    else {
      if (focus < 0.01)    focusEntry = null;
      if (focus < 0.0001)  focusRef   = null;
    }
    const fp = ease(clampv(focus, 0, 1));
    const par = 1 - fp;
    const prx = dragging ? 0 : 1;
    world.rotation.y = (userRot.y + mx * 0.16 * prx) * par;
    world.rotation.x = (userRot.x + my * 0.10 * prx) * par;

    if (focusRef) {
      const H = focusRef.home;
      const r = (focusRef.pickR || 0.6) * focusRef.grp.scale.x;
      const gap = Math.max(3.0, r * 5.5);
      let offX = 0, offY = 0;
      if (appView) {
        const halfH = gap * Math.tan((camera.fov * Math.PI / 180) / 2);
        if (window.innerWidth > 760) offX = 0.42 * halfH * camera.aspect;
        else offY = -0.5 * halfH;
      }
      fCam.x = H.x + offX; fCam.y = H.y + offY; fCam.z = H.z + gap;
      fLook.x = H.x + offX; fLook.y = H.y + offY; fLook.z = H.z;
    }
    camera.position.set(lerp(0, fCam.x, fp), lerp(0, fCam.y, fp), lerp(dist, fCam.z, fp));
    camera.lookAt(lerp(0, fLook.x, fp), lerp(0, fLook.y, fp), lerp(0, fLook.z, fp));

    // CPU-ядро: зажигание на интро (ig) + реакции на фокус/выбор Platform.
    const ig = phase === 'intro' ? ease(clamp01((t - 150) / IGNITE)) : 1;
    const coreFocusK = (focusRef && focusRef !== coreEntry) ? Math.max(0, 1 - fp) : 1;
    coreGroup.scale.setScalar((0.55 + 0.45 * ig) * coreFocusK * (1 + coreDim * 0.1));
    coreInner.material.emissiveIntensity = ig * 1.35;   // горячий хедспредер CPU (ярко → bloom)
    coreHalo.material.opacity = ig * 0.7;
    coreHalo.scale.setScalar(3.4 * (0.6 + 0.4 * ig));
    corePoint.intensity = ig * 2.8;
    coreDim += ((coreSel ? 1 : 0) - coreDim) * Math.min(1, dt * 5);
    { const m = coreSeams.material;
      const tgt = (focusEntry === coreEntry || coreSel) ? (0.5 + 0.5 * Math.sin(tsec * 4.5)) : 0;
      m.opacity += (tgt - m.opacity) * Math.min(1, dt * 7); coreSeams.visible = m.opacity > 0.01; }

    if (phase === 'intro' && t > 950 && veil) veil.classList.add('lift');

    // Чипы: раскрытие на интро + ток по дорожкам; статичны (без дрейфа).
    const cpu = coreEntry.home;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.home.lerp(n.target, Math.min(1, dt * 2.6));
      const p = tmp.copy(n.home);
      n.grp.position.copy(p);                            // позиция; ориентация=boardQuat (задана на build)
      n.traceMesh.material.uniforms.uTime.value = tsec;  // бег тока в шейдере (направленные пакеты)

      if (phase === 'intro') {
        const tStart = FIRST + i * STAGGER;
        const k = clamp01((t - tStart) / PULSE_DUR);
        n.line.material.opacity = (k > 0 ? 0.3 : 0) * (0.6 + 0.4 * Math.sin(tsec * 3 + i));
        const lp = n.line.geometry.attributes.position.array;
        lp[0] = cpu.x; lp[1] = cpu.y; lp[2] = cpu.z; lp[3] = p.x; lp[4] = p.y; lp[5] = p.z;
        n.line.geometry.attributes.position.needsUpdate = true;

        if (k > 0 && k < 1) {                            // искра из CPU к чипу
          const e = ease(k);
          n.pulse.position.set(lerp(cpu.x, p.x, e), lerp(cpu.y, p.y, e), lerp(cpu.z, p.z, e));
          n.pulse.material.opacity = Math.sin(k * Math.PI) * 0.95;
          n.pulse.scale.setScalar(1.0 + Math.sin(k * Math.PI) * 0.8);
        } else { n.pulse.material.opacity = 0; }

        if (k >= 1 && !n.revealed) { n.revealed = true; revealKey(n.key); if (i === 0) revealCore(); }
        const grow = clamp01((t - (tStart + PULSE_DUR - 120)) / 360);
        const g = ease(grow);
        n.grp.scale.setScalar(g);
        n.traceMesh.visible = g > 0.004; if (n.traceMesh.visible) n.traceMesh.material.uniforms.uOpacity.value = g;
        n.halo.material.opacity = g * 0.45;
      } else {
        const vis = (focusRef && n !== focusRef ? Math.max(0, 1 - fp) : 1) * (1 - coreDim);
        n.grp.scale.setScalar(vis);
        const tv = vis * (1 - fp);
        n.traceMesh.visible = tv > 0.004; if (n.traceMesh.visible) n.traceMesh.material.uniforms.uOpacity.value = tv;
        n.halo.material.opacity = 0.42 * vis;
        n.line.material.opacity = 0;
      }
    }

    // Ток по самим дорожкам платы + клик-разряд (волна + кольца + bloom).
    nowSec = tsec;
    boardFlow.uTime.value = tsec;
    updateDischarge(dt);

    // 3D-кольцо выделения: в центр наведённого чипа, лицом к камере (pick-радиус).
    if (hovered && phase === 'idle') {
      hovered.grp.getWorldPosition(_vc);
      selRing.position.copy(_vc);
      selRing.lookAt(camera.position);
      selRing.scale.setScalar(((hovered.pickR || 0.6) * hovered.grp.scale.x) * 1.12);
      selRing.visible = true;
      selRing.material.opacity = Math.min(1, selRing.material.opacity + dt * 8);
      selGlow.material.opacity = selRing.material.opacity * 0.55;
    } else if (selRing.visible) {
      selRing.material.opacity = Math.max(0, selRing.material.opacity - dt * 10);
      selGlow.material.opacity = selRing.material.opacity * 0.55;
      if (selRing.material.opacity <= 0.02) selRing.visible = false;
    }

    composer.render();

    if (hovered && phase === 'idle') positionCard(hovered);

    if (phase === 'intro') {
      if (t >= END && !endAt) endAt = now;
      if (endAt && now - endAt > 250) { enterIdle(); }
    }
    if (running) raf = requestAnimationFrame(frame);
  }

  // ── Пауза при скрытой вкладке ─────────────────────────────────────────
  function onVisibility() {
    if (document.hidden) { paused = true; cancelAnimationFrame(raf); }
    else if (paused) { paused = false; last = 0; if (running) raf = requestAnimationFrame(frame); }
  }

  // Открыт раздел приложения (#app/<key>) → фокус-зум на чип / выбор CPU.
  function onHashView() {
    const m = (location.hash || '').match(/^#app\/(.+)$/);
    appView = !!m;
    if (!m) { focusTarget = null; coreSel = false; return; }
    let key; try { key = decodeURIComponent(m[1]); } catch (e) { key = m[1]; }
    if (key === 'platform') { coreSel = true; }
    else if (!focusTarget) { focusTarget = hoverables.find(h => h.key === key) || null; coreSel = false; }
  }

  // ── Подцепка/снятие ВСЕХ слушателей (pause/resume/dispose) ─────────────
  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    _listeners.push([target, type, fn, opts]);
  }
  function attach() {
    if (_attached) return;
    _attached = true;
    on(window, 'resize', onResize);
    on(window, 'mousemove', onMouse);
    on(window, 'mousedown', onDown);
    on(window, 'mouseup', onUp);
    on(window, 'wheel', onWheel, { passive: false });
    on(window, 'touchstart', onTouchStart, { passive: true });
    on(window, 'touchmove', onTouchMove, { passive: false });
    on(window, 'touchend', onTouchEnd, { passive: true });
    on(window, 'touchcancel', onTouchEnd, { passive: true });
    on(window, 'click', onClick);
    on(document, 'visibilitychange', onVisibility);
    on(window, 'hashchange', onHashView);
    if (skip) on(skip, 'click', skipIntro);
    const bar = document.querySelector('.topbar');
    if (bar) on(bar, 'click', skipIntro, true);
    on(document, 'keydown', onKey);
    onHashView();
  }
  function detach() {
    if (!_attached) return;
    _attached = false;
    for (let i = 0; i < _listeners.length; i++) {
      const L = _listeners[i];
      L[0].removeEventListener(L[1], L[2], L[3]);
    }
    _listeners.length = 0;
  }

  // ── Освобождение GPU: геометрии/материалы/текстуры → контекст ──────────
  function _teardownGPU() {
    const texSet = new Set();
    const addTex = (m) => {
      if (!m) return;
      for (const k in m) { const v = m[k]; if (v && v.isTexture) texSet.add(v); }
      if (m.uniforms) for (const u in m.uniforms) { const mu = m.uniforms[u]; const v = mu && mu.value; if (v && v.isTexture) texSet.add(v); }
    };
    try {
      scene.traverse((o) => {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        const mat = o.material;
        if (Array.isArray(mat)) mat.forEach((m) => { addTex(m); if (m && m.dispose) m.dispose(); });
        else if (mat) { addTex(mat); if (mat.dispose) mat.dispose(); }
      });
    } catch (e) {}
    if (scene.environment) texSet.add(scene.environment);
    [glowTex, boardTex.map, boardTex.emis, boardTex.normal, boardTex.rough, boardTex.metal,
     flowMask, ringTex, underTex].forEach((t) => { if (t) texSet.add(t); });  // общие CanvasTexture
    texSet.forEach((t) => { try { if (t.dispose) t.dispose(); } catch (e) {} });
    try { if (composer.dispose) composer.dispose(); } catch (e) {}
    try { pmrem.dispose(); } catch (e) {}
    try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {}
  }

  // ── pause / resume / dispose (замыкания живой сцены) ───────────────────
  function doPause() {
    cancelAnimationFrame(raf); raf = 0;
    running = false;
    if (_safety) { clearTimeout(_safety); _safety = 0; }
    detach();
    document.body.classList.remove('planets-on');
    if (canvas) canvas.classList.add('done');
  }
  function doResume() {
    if (running) return true;
    document.body.classList.add('planets-on');
    if (canvas) canvas.classList.remove('done');
    attach();
    onResize();
    running = true; paused = false; last = 0;
    raf = requestAnimationFrame(frame);
    return true;
  }
  function doDispose() {
    cancelAnimationFrame(raf); raf = 0;
    running = false;
    if (_safety) { clearTimeout(_safety); _safety = 0; }
    detach();
    _teardownGPU();
    document.body.classList.remove('planets-on');
    if (canvas) canvas.classList.add('done');
    started = false; _api = null;
  }

  // ── Запуск сцены ──────────────────────────────────────────────────────
  running = true;
  attach();
  raf = requestAnimationFrame(frame);
  _safety = setTimeout(() => { if (phase === 'intro') enterIdle(); }, END + 2500);

  _api = { pause: doPause, resume: doResume, dispose: doDispose };
  started = true;
  return true;
}

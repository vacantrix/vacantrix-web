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
  renderer.toneMappingExposure = 0.98;
  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
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
  const rimLight = new THREE.DirectionalLight(0xff4858, 0.7);
  rimLight.position.set(-5, 2, -4);
  scene.add(rimLight);

  // bloom-постобработка (CPU-ядро + ток по дорожкам светятся)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.62, 0.5, 0.18);
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

  // ── Поток энергии (бегущий красный ток в дорожках) ────────────────────
  // Почти чёрно-красная база + бегущие яркие импульсы (анимируем offset.y).
  const energyTex = (function () {
    const W = 8, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#120307'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) {
      const y = (i + 0.5) / 3 * H, r = H * 0.16;
      const grd = g.createLinearGradient(0, y - r, 0, y + r);
      grd.addColorStop(0, accRGBA(0)); grd.addColorStop(0.5, accRGBA(1)); grd.addColorStop(1, accRGBA(0));
      g.fillStyle = grd; g.fillRect(0, y - r, W, r * 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

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

  // ── Текстуры платы: гетинакс + красные PCB-трейсы (map + emissive-маска) ──
  // Трейсы — Manhattan-блуждания + контактные площадки. Красный — только из ACCENT.
  function makeBoardTextures() {
    const S = 1024;
    const mc = document.createElement('canvas'); mc.width = mc.height = S; const mg = mc.getContext('2d');
    const ec = document.createElement('canvas'); ec.width = ec.height = S; const eg = ec.getContext('2d');
    mg.fillStyle = '#0a0f0c'; mg.fillRect(0, 0, S, S);                 // тёмный гетинакс
    eg.fillStyle = '#000'; eg.fillRect(0, 0, S, S);                   // emissive: чёрная база
    mg.lineCap = 'round'; eg.lineCap = 'round';
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    function walk(x, y, steps, lw) {
      mg.lineWidth = lw; eg.lineWidth = lw;
      mg.strokeStyle = 'rgba(' + ((_AR * 0.5) | 0) + ',' + ((_AG * 0.35) | 0) + ',' + ((_AB * 0.38) | 0) + ',0.55)';
      eg.strokeStyle = accRGBA(0.85);
      mg.beginPath(); eg.beginPath(); mg.moveTo(x, y); eg.moveTo(x, y);
      let d = (Math.random() * 4) | 0;
      for (let s = 0; s < steps; s++) {
        if (Math.random() < 0.3) d = (Math.random() * 4) | 0;
        const len = 14 + Math.random() * 46;
        x = clampv(x + D[d][0] * len, 0, S); y = clampv(y + D[d][1] * len, 0, S);
        mg.lineTo(x, y); eg.lineTo(x, y);
      }
      mg.stroke(); eg.stroke();
    }
    for (let i = 0; i < 130; i++) walk(Math.random() * S, Math.random() * S, 3 + (Math.random() * 5 | 0), Math.random() < 0.2 ? 5 : 3);
    // контактные площадки (pads) — ярче на emissive
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = 3 + Math.random() * 5;
      mg.fillStyle = accRGBA(0.4); eg.fillStyle = accRGBA(0.95);
      mg.beginPath(); mg.arc(x, y, r, 0, 7); mg.fill();
      eg.beginPath(); eg.arc(x, y, r, 0, 7); eg.fill();
    }
    const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = MAX_ANISO; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
    return { map: mk(mc), emis: mk(ec) };
  }

  // ── Геометрия наклонённой платы ───────────────────────────────────────
  const BOARD_TILT = 0.6;                              // наклон платы (вид «на стол под углом»)
  const boardQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(BOARD_TILT, 0, 0));
  const _bw = new THREE.Vector3();                     // временный (layout): board-local → world-local
  const _bn = new THREE.Vector3();                     // нормаль платы (world)
  // board-плоскость (u=гориз, v=глубина, h=высота над платой) → world-локаль (наклон вшит).
  function boardToWorld(u, v, h, out) { (out || _bw).set(u, h, v).applyQuaternion(boardQuat); return out || _bw; }

  const boardTex = makeBoardTextures();
  const boardMat = new THREE.MeshStandardMaterial({
    map: boardTex.map, emissiveMap: boardTex.emis, emissive: 0xffffff, emissiveIntensity: 0.6,
    roughness: 0.62, metalness: 0.28,
  });
  const BOARD_BASE = 12;                               // базовый размер плиты (масштабируется на layout)
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOARD_BASE, 0.22, BOARD_BASE), boardMat);
  board.quaternion.copy(boardQuat);
  world.add(board);

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
  const TRACE_H = 0.07, TRACE_W = 0.13, TRACE_PITCH = 1.1;        // дорожка над платой / ширина / шаг тока

  const tmp = new THREE.Vector3();
  const nodes = KEYS.map((key, i) => {
    const color = NODE_COLORS[key];
    const nx = LAYOUT[key][0], ny = LAYOUT[key][1];

    const grp = new THREE.Group();
    grp.quaternion.copy(boardQuat);                    // чип стоит вдоль нормали наклонённой платы
    const body = new THREE.Mesh(new THREE.BoxGeometry(CHIP_W, CHIP_H, CHIP_D),
      new THREE.MeshStandardMaterial({ color: 0x15171d, metalness: 0.55, roughness: 0.48,
        envMapIntensity: 1.0, emissive: color, emissiveIntensity: 0.22 }));   // рамка светится цветом бренда
    grp.add(body);
    const mesh = body;                                 // пикабельный меш
    const iconTex = iconTexture(ICON[key]);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(CHIP_W * 0.78, CHIP_D * 0.78),
      new THREE.MeshBasicMaterial({ map: iconTex, transparent: true }));
    top.rotation.x = -Math.PI / 2; top.position.y = CHIP_H / 2 + 0.012; grp.add(top);
    grp.scale.setScalar(0.001);                        // спрятан до раскрытия
    world.add(grp);

    // мягкое свечение слота в цвете бренда (рамка)
    const halo = glowSprite(color, 2.4, 0);
    halo.position.y = CHIP_H * 0.2; grp.add(halo);

    // дорожка-трейс к CPU (бегущий ток) — геометрия строится в updateTraces()
    const traceMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      map: energyTex, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
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

  // ── Кадрирование камеры ───────────────────────────────────────────────
  let baseDist = 14;
  function fitDistance() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const vFov = camera.fov * Math.PI / 180;
    const t = clampv((aspect - 0.55) / (2.0 - 0.55), 0, 1);
    const R = lerp(4.4, 6.2, t);                          // портрет — ближе (крупнее), широкий — дальше
    const dV = R / (Math.tan(vFov / 2) * 0.9);
    const dH = R / (Math.tan(vFov / 2) * aspect * 0.9);
    return Math.max(dV, dH);
  }
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
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
        n.traceMesh.visible = g > 0.004; if (n.traceMesh.visible) n.traceMesh.material.opacity = g;
        n.halo.material.opacity = g * 0.6;
      } else {
        const vis = (focusRef && n !== focusRef ? Math.max(0, 1 - fp) : 1) * (1 - coreDim);
        n.grp.scale.setScalar(vis);
        const tv = vis * (1 - fp);
        n.traceMesh.visible = tv > 0.004; if (n.traceMesh.visible) n.traceMesh.material.opacity = tv;
        n.halo.material.opacity = 0.5 * vis;
        n.line.material.opacity = 0;
      }
    }

    energyTex.offset.y = (energyTex.offset.y - dt * 0.5) % 1;   // бег тока по дорожкам наружу

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
    [glowTex, energyTex, boardTex.map, boardTex.emis].forEach((t) => { if (t) texSet.add(t); });  // общие CanvasTexture
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

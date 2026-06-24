/* =====================================================================
   intro3d.js — 3D-экосистема Vacantrix на Three.js: кинематографичное
   интро + ПОСТОЯННЫЙ живой фон.

   Планеты-продукты «одеты» в наши иконки (скин: текстура иконки на глянцевой
   сфере + emissive-свечение красных линий + атмосфера), вращаются вокруг своей
   оси и летят по 3D-орбитам вокруг светящегося ядра (Vacantrix Platform).

   Жизненный цикл:
     1) ИНТРО поверх чёрной вуали: ядро зажигается, импульсы добегают до планет
        и проявляют реальные HTML-карточки (.eco-node.shown).
     2) ОСАЖДЕНИЕ: вуаль поднимается, контент показывается, а канвас НЕ гаснет —
        уходит на задний план (z-index 0) и продолжает жить: орбиты + самовращение
        + параллакс от курсора. Сцена остаётся фоном страницы навсегда.

   Бережно:
     • prefers-reduced-motion → сразу финал, фон выключен (уважаем настройку);
     • нет WebGL / нет канваса → graceful fallback (контент виден, канвас скрыт);
     • вкладка скрыта → рендер на паузе (экономим GPU);
     • скип по кнопке / Escape / клику по верхней панели прерывает интро.
   ===================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

(function () {
  'use strict';

  const canvas = document.getElementById('intro-canvas');
  const veil   = document.getElementById('intro-veil');
  const skip   = document.getElementById('intro-skip');
  const stage  = document.getElementById('eco-stage');
  const coreEl = stage ? stage.querySelector('.eco-core') : null;

  // Порядок раскрытия карточек = порядок прихода импульсов к планетам.
  const KEYS = ['hh', 'avito', 'tasks', 'publisher', 'leads', 'monitor', 'analytics'];
  // Брендовые цвета планет (свечение/атмосфера) — тёплые + холодные.
  const NODE_COLORS = {
    hh: 0xff5a67, avito: 0x4fd0ff, tasks: 0x68e6a0, publisher: 0xff7a86,
    leads: 0xff9e57, monitor: 0x5ad1ff, analytics: 0xffd166,
  };
  const ICON = {
    platform: 'img/platform_icon.png', hh: 'img/hh_icon.png', avito: 'img/avito_icon.png',
    tasks: 'img/tasks_icon.png', publisher: 'img/publisher_icon.png', leads: 'img/leads_icon.png',
    monitor: 'img/monitor_icon.png', analytics: 'img/analytics_icon.png',
  };
  const ACCENT = 0xe63946;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clampv = (v, a, b) => (v < a ? a : v > b ? b : v);

  let reduce = false;
  try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ── Раскрытие DOM-карточек (контракт со старым intro) ─────────────────
  function revealCore() { if (coreEl) coreEl.classList.add('shown'); }
  function revealKey(key) {
    if (!stage) return;
    const el = stage.querySelector('.eco-node[data-key="' + key + '"]');
    if (el) el.classList.add('shown');
  }
  function revealAllCards() {
    revealCore();
    const els = stage ? stage.querySelectorAll('.eco-node') : [];
    for (let i = 0; i < els.length; i++) els[i].classList.add('shown');
  }

  // Полный статичный финал без 3D (reduced-motion / нет WebGL).
  function settleStatic() {
    revealAllCards();
    if (veil) veil.classList.add('lift');
    if (canvas) canvas.classList.add('done');           // скрыть канвас
    document.body.classList.remove('intro-lock');
    document.body.classList.add('intro-done');
  }

  if (!canvas || !stage) { settleStatic(); return; }
  document.body.classList.add('intro-lock');
  if (reduce) { settleStatic(); return; }

  // ── Рендерер / сцена / камера ─────────────────────────────────────────
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch (e) { settleStatic(); return; }
  renderer.setClearColor(0x020105, 1);                 // тёмный космос (почти чёрный)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;                 // ещё немного темнее
  const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();
  document.body.classList.add('planets-on');           // 3D активна → плитки eco-stage скрыты

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const world = new THREE.Group();
  scene.add(world);

  // отражения окружения — ключ к «премиум»-материалам (стекло/металл/лак)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

  scene.add(new THREE.AmbientLight(0x404058, 0.42));
  const corePoint = new THREE.PointLight(ACCENT, 3.0, 90);
  scene.add(corePoint);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
  keyLight.position.set(4, 5, 7);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xff4858, 0.8);
  rimLight.position.set(-6, -1, -3);
  scene.add(rimLight);

  // bloom-постобработка (свечение ядер/неона)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 0.18);
  composer.addPass(bloomPass);

  // Радиальный glow-спрайт (общая текстура) ──────────────────────────────
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
  function glowSprite(color, scale, opacity, tex) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex || glowTex, color, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, opacity: opacity == null ? 0.9 : opacity,
    }));
    s.scale.setScalar(scale);
    return s;
  }

  // Процедурная «туманность»: много мягких клочков-сгустков (additive) + затухание
  // к краям → клочковатое, живое свечение вместо ровного круга.
  const nebulaTex = (function () {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    const cx = S / 2, cy = S / 2;
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * 6.2831853;
      const dist = Math.pow(Math.random(), 0.7) * S * 0.34;     // сгущение к центру
      const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist;
      const r = S * (0.05 + Math.random() * 0.17);
      const a = 0.05 + Math.random() * 0.13;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'destination-in';               // мягкое затухание к краям
    const mask = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.5);
    mask.addColorStop(0, 'rgba(0,0,0,1)'); mask.addColorStop(0.55, 'rgba(0,0,0,0.85)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = mask; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  // ── Скин планеты: МЕТАЛЛ + РЕЛЬЕФ, иконка на 6 ГРАНЯХ КУБА ──────────────
  // «Запекаем» куб→равноугольную развёртку: для каждого пикселя сферы берём
  // направление, определяем грань куба (+X,-X,+Y,-Y,+Z,-Z) и кладём иконку на эту
  // грань → 6 иконок покрывают всю поверхность (1 верх, 1 низ, 4 по экватору),
  // полюса корректные. Тонкий металлический шов между гранями. bumpMap+emissiveMap.
  function cubeIconTexture(url) {
    const W = 640, H = 320;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = MAX_ANISO;
    const img = new Image();
    img.onload = () => {
      const IS = 256, ic = document.createElement('canvas'); ic.width = ic.height = IS;
      const ig = ic.getContext('2d'); ig.drawImage(img, 0, 0, IS, IS);
      const id = ig.getImageData(0, 0, IS, IS).data;
      const out = g.getImageData(0, 0, W, H), od = out.data;
      const cphi = new Float32Array(W), sphi = new Float32Array(W);
      for (let px = 0; px < W; px++) { const phi = (px + 0.5) / W * 6.2831853; cphi[px] = Math.cos(phi); sphi[px] = Math.sin(phi); }
      const inset = 0.0, t0 = inset, t1 = 1 - inset, span = t1 - t0;  // 0 = фото стыкуются по краям
      for (let py = 0; py < H; py++) {
        const theta = (py + 0.5) / H * Math.PI, st = Math.sin(theta), dy = Math.cos(theta);
        for (let px = 0; px < W; px++) {
          const dx = st * sphi[px], dz = st * cphi[px];
          // Стандартная куб-конвенция (sc/tc/ma) + разворот u для вида СНАРУЖИ →
          // текст читается верно на всех 6 гранях и стыкуется по рёбрам.
          const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
          let sc, tc, ma;
          if (ax >= ay && ax >= az) { ma = ax; if (dx > 0) { sc = -dz; tc = -dy; } else { sc = dz; tc = -dy; } }
          else if (ay >= az) { ma = ay; if (dy > 0) { sc = dx; tc = dz; } else { sc = dx; tc = -dz; } }
          else { ma = az; if (dz > 0) { sc = dx; tc = -dy; } else { sc = -dx; tc = -dy; } }
          let u2 = 0.5 + (sc / ma) * 0.5, v2 = (tc / ma) * 0.5 + 0.5;
          if (u2 < t0 || u2 > t1 || v2 < t0 || v2 > t1) continue;          // металлический шов
          const sx = Math.min(IS - 1, ((u2 - t0) / span * IS) | 0);
          const sy = Math.min(IS - 1, ((v2 - t0) / span * IS) | 0);
          const si = (sy * IS + sx) * 4;
          if (id[si + 3] < 8) continue;                                    // прозрачный угол → металл
          const oi = (py * W + px) * 4;
          od[oi] = id[si]; od[oi + 1] = id[si + 1]; od[oi + 2] = id[si + 2]; od[oi + 3] = 255;
        }
      }
      g.putImageData(out, 0, 0);
      tex.needsUpdate = true;
    };
    img.onerror = () => {};
    img.src = url;
    return tex;
  }

  // Металлическая планета: полированный тёмный металл + вытравленная иконка с 2 сторон.
  function makeMetalPlanet(key, radius, color, emissive) {
    const tex = cubeIconTexture(ICON[key]);
    const metal = new THREE.Color(color).lerp(new THREE.Color(0x24242c), 0.8);  // тёмный брендовый металл
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 64, 48),
      new THREE.MeshStandardMaterial({
        color: metal, metalness: 0.95, roughness: 0.46, envMapIntensity: 0.95,
        bumpMap: tex, bumpScale: 0.06, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: emissive,
      })
    );
    return mesh;
  }

  // Светящиеся линии ПО ШВАМ куба (рёбра куба, спроецированные на сферу).
  // Кладётся ребёнком планеты → вращается вместе с гранями. Зажигается при фокусе.
  const seamMats = [];                                 // материалы швов (обновляем resolution на resize)
  function makeSeams(radius) {
    const corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx, sy, sz]);
    const N = 16, pos = [];
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
      let diff = 0; for (let k = 0; k < 3; k++) if (corners[a][k] !== corners[b][k]) diff++;
      if (diff !== 1) continue;                          // только рёбра (12 шт.)
      const A = corners[a], B = corners[b]; let prev = null;
      for (let s = 0; s <= N; s++) {
        const t = s / N;
        const x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t, z = A[2] + (B[2] - A[2]) * t;
        const inv = radius / Math.hypot(x, y, z);
        const P = [x * inv, y * inv, z * inv];
        if (prev) pos.push(prev[0], prev[1], prev[2], P[0], P[1], P[2]);
        prev = P;
      }
    }
    const geo = new LineSegmentsGeometry();
    geo.setPositions(pos);
    const mat = new LineMaterial({
      color: 0xff3344, linewidth: 4, transparent: true, opacity: 0,   // красный неон по швам
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    });
    mat.resolution.set(window.innerWidth, window.innerHeight);        // нужен для толщины в px
    seamMats.push(mat);
    const seams = new LineSegments2(geo, mat);
    seams.visible = false;
    return seams;
  }


  // ── «Электросхема»-скин: ветвящиеся линии, просыпаются при наведении ───
  // Рисуем ветвящееся дерево дорожек. В зелёный канал пишем «порядок роста»
  // (длина пути от корня), чтобы шейдер раскрывал линии корень→ветки→кончики.
  const circuitTex = (function () {
    const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
    const grid = 30, NORM = 700;           // NORM ≈ макс. длина ветки (норм. зелёного)
    let segs = 0; const MAX = 3200;        // общий потолок безопасности
    let treeSegs = 0; const TREE_MAX = 34; // лимит на ОДНО дерево → все семена успевают вырасти
    const dirs = [[grid, 0], [-grid, 0], [0, grid], [0, -grid]];
    const turn = d => (d[0] !== 0 ? [0, Math.random() < 0.5 ? grid : -grid]
                                  : [Math.random() < 0.5 ? grid : -grid, 0]);
    function seg(x0, y0, x1, y1, dist) {
      const gG = Math.max(0, Math.min(255, (dist / NORM) * 255 | 0));
      g.strokeStyle = 'rgb(255,' + gG + ',0)';        // R=линия, G=порядок роста
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    function grow(x, y, dir, gen, dist) {
      if (gen > 5 || treeSegs > TREE_MAX || segs > MAX) return;
      const run = 2 + (Math.random() * 5 | 0);
      for (let i = 0; i < run; i++) {
        if (treeSegs > TREE_MAX || segs > MAX) return;
        const nx = x + dir[0], ny = y + dir[1];
        if (nx < 0 || nx >= S || ny < 0 || ny >= S) break;   // дошли до края — ветка кончилась
        seg(x, y, nx, ny, dist);
        x = nx; y = ny; dist += grid; segs++; treeSegs++;
        if (Math.random() < 0.28) dir = turn(dir);
      }
      grow(x, y, turn(dir), gen + 1, dist);                  // ответвление
      if (Math.random() < 0.7) grow(x, y, turn(dir), gen + 1, dist);  // второе
      if (Math.random() < 0.55) grow(x, y, dir, gen + 1, dist);       // продолжение
    }
    // «Семена» равномерной сеткой с джиттером → дорожки покрывают ВСЮ поверхность.
    const step = 150;
    for (let gy = step / 2; gy < S; gy += step) {
      for (let gx = step / 2; gx < S; gx += step) {
        const jx = gx + (Math.random() * 2 - 1) * step * 0.35;
        const jy = gy + (Math.random() * 2 - 1) * step * 0.35;
        const x = (jx / grid | 0) * grid, y = (jy / grid | 0) * grid;
        treeSegs = 0;                       // свой бюджет на каждое семя → дорожки ВЕЗДЕ
        grow(x, y, dirs[Math.random() * 4 | 0], 0, 0);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearFilter;        // без мипмапов — тонкие линии не «съедаются»
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;       // сырые значения каналов (R=линия, G=рост)
    return tex;
  })();

  const circuitVert = `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const circuitFrag = `
    varying vec2 vUv;
    uniform sampler2D tMap; uniform float uProg; uniform float uTime; uniform vec3 uColor;
    void main(){
      vec4 tx = texture2D(tMap, vUv);
      float trace = tx.r;                       // присутствие линии
      if (trace < 0.12) discard;
      float growth = tx.g;                      // порядок роста (0 корень .. 1 кончик)
      float reveal = step(growth, uProg);       // показываем доросшее
      float tip = smoothstep(0.05, 0.0, abs(growth - uProg)); // яркий растущий кончик
      float grown = smoothstep(0.8, 1.0, uProg);             // степень «доросло»
      float flow = 0.55 + 0.45 * sin(uTime * 8.0 - growth * 42.0); // ток вдоль роста
      float pulse = 0.55 + 0.45 * sin(uTime * 4.0);          // общий пульс после остановки
      float bright = reveal * mix(flow, pulse, grown) + tip * 1.7;
      float a = trace * bright;
      if (a < 0.02) discard;
      gl_FragColor = vec4(uColor * a * 2.4, a);
    }`;

  function makeCircuit(radius) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tMap: { value: circuitTex }, uProg: { value: 0 }, uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xff1a2a) },
      },
      vertexShader: circuitVert, fragmentShader: circuitFrag,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), mat);
    mesh.visible = false;
    return { mesh, mat, prog: 0 };
  }

  // ── Ядро (планета Platform + кольца) ──────────────────────────────────
  const coreGroup = new THREE.Group();
  world.add(coreGroup);
  const coreMesh = makeMetalPlanet('platform', 1.6, ACCENT, 0.65);
  const coreInner = coreMesh;
  const coreTilt = new THREE.Group();
  coreTilt.rotation.set(0.24, 0, 0.15);                // осевой наклон ядра
  coreTilt.add(coreMesh); coreGroup.add(coreTilt);
  const coreSeams = makeSeams(1.6 * 1.015);
  coreMesh.add(coreSeams);
  const coreCircuit = makeCircuit(1.6 * 1.012);
  coreMesh.add(coreCircuit.mesh);
  const coreHalo = glowSprite(0xff5a67, 16, 0, nebulaTex);
  coreGroup.add(coreHalo);

  const rings = [];
  // орбиты под общим наклоном (плоскость, согласованная с наклоном ядра) → видны как эллипсы
  [[0x4fd0ff, 3.3, 0.05, 0.13], [0x9b6bff, 4.3, -0.04, 0.10], [0x57d1ff, 5.2, 0.08, 0.075]]
    .forEach(([col, r, vary, op]) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.012, 8, 200),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op })
      );
      ring.rotation.x = Math.PI / 2 - 0.42 + vary; ring.rotation.z = 0.2 + vary;
      world.add(ring); rings.push(ring);
    });

  // ── Планеты-продукты: фиксированная раскладка по всему экрану ──────────
  // Нормированные позиции (-1..1) по ширине/высоте — каждой планете свой угол
  // экрана с запасом места. Реальные координаты считаются в layoutHomes() под
  // текущий вьюпорт. Планеты не летают по орбитам — лишь слегка покачиваются.
  const LAYOUT = {
    hh:        [ 0.00,  0.82],
    avito:     [ 0.80,  0.42],
    tasks:     [-0.80,  0.42],
    publisher: [ 0.84, -0.34],
    leads:     [-0.84, -0.34],
    monitor:   [ 0.44, -0.84],
    analytics: [-0.44, -0.84],
  };
  const SPREAD = 0.80;                                 // доля полуэкрана (запас от краёв)
  const STAGE_MIN = 0.72, STAGE_MAX = 1.85;            // ограничение соотношения «сцены» (центрируем созвездие)

  const tmp = new THREE.Vector3();
  const nodes = KEYS.map((key, i) => {
    const color = NODE_COLORS[key];
    const pradius = 0.86 + (i % 3) * 0.10;             // размер планеты (чуть уменьшено)
    const spin    = 0.22 + (i % 4) * 0.08;             // самовращение
    const nx = LAYOUT[key][0], ny = LAYOUT[key][1];
    const nz = ((i % 3) - 1) * 1.3;                    // небольшая глубина (для параллакса)
    // лёгкий дрейф (небольшая амплитуда): покачивание вокруг своей точки
    const ax = 0.26 + (i % 3) * 0.05, ay = 0.22 + (i % 2) * 0.06, az = 0.45;
    const fx = 0.45 + (i % 3) * 0.07, fy = 0.38 + (i % 2) * 0.06, fz = 0.30 + (i % 4) * 0.04;
    const ph = i * 1.7, py = i * 2.3, pz = i * 1.1;

    const grp = new THREE.Group();
    const mesh = makeMetalPlanet(key, pradius, color, 0.6);
    const core = mesh;                                  // ядро вращения = сама планета
    // осевой наклон (как у реальных планет), у каждой свой угол → вращение вокруг наклонённой оси
    const tilt = new THREE.Group();
    tilt.rotation.set(0.18 + (i % 3) * 0.13, 0, (i % 2 ? 1 : -1) * (0.16 + (i % 4) * 0.1));
    tilt.add(mesh); grp.add(tilt);
    const seams = makeSeams(pradius * 1.015);
    mesh.add(seams);                                    // ребёнок планеты → крутится с гранями
    const circuit = makeCircuit(pradius * 1.012);
    mesh.add(circuit.mesh);                             // ребёнок планеты → наклон+вращение авто
    const halo = glowSprite(color, pradius * 4.8, 0, nebulaTex);
    halo.material.rotation = Math.random() * 6.2831853;   // своя фаза «облака»
    grp.add(halo);
    grp.scale.setScalar(0.001);                        // спрятан до раскрытия
    world.add(grp);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    world.add(line);

    const pulse = glowSprite(color, 1.0, 0);
    world.add(pulse);

    return {
      key, color, mesh, core, grp, halo, line, pulse, spin, circuit, seams,
      nx, ny, nz, home: new THREE.Vector3(), target: new THREE.Vector3(),
      ax, ay, az, fx, fy, fz, ph, py, pz, revealed: false,
    };
  });

  // ── Цели наведения (планеты + ядро) и raycast ─────────────────────────
  const coreEntry = { key: 'platform', grp: coreGroup, mesh: coreMesh, core: coreInner, circuit: coreCircuit, seams: coreSeams, home: new THREE.Vector3() };
  const hoverables = [coreEntry].concat(nodes);

  // Множители раскладки под форму экрана (непрерывно по соотношению сторон):
  // широкий → шире по X и ниже по Y; портрет → у́же по X и выше по Y.
  function layoutFactors(a) {
    const t = clampv((a - 0.55) / (2.0 - 0.55), 0, 1);   // 0 портрет .. 1 ультраширокий
    return { xs: lerp(0.58, 1.10, t), ys: lerp(1.20, 0.84, t) };
  }

  let laidOut = false;
  // Точка-цель планеты под текущий вьюпорт. Планета плавно едет к ней (лерп в frame);
  // первая раскладка ставится сразу (без анимации при загрузке).
  // «Сцена-рамка»: созвездие держим в центрированной области с ограничением
  // соотношения [STAGE_MIN..STAGE_MAX]. На сверхшироких/сверхузких экранах планеты
  // НЕ растягиваются к краям — лишний простор по краям заполняет пыль/свечение.
  function layoutHomes() {
    const vFov = camera.fov * Math.PI / 180;
    const halfH = baseDist * Math.tan(vFov / 2);
    const halfW = halfH * camera.aspect;
    const a = camera.aspect;
    const stageHalfW = halfH * Math.min(a, STAGE_MAX);
    const stageHalfH = a < STAGE_MIN ? halfW / STAGE_MIN : halfH;
    const f = layoutFactors(clampv(a, STAGE_MIN, STAGE_MAX));
    for (const n of nodes) {
      n.target.set(
        clampv(n.nx * f.xs, -0.97, 0.97) * stageHalfW * SPREAD,
        clampv(n.ny * f.ys, -0.97, 0.97) * stageHalfH * SPREAD,
        n.nz
      );
      if (!laidOut) n.home.copy(n.target);
    }
    laidOut = true;
  }

  // Текущая позиция = точка покоя + лёгкое покачивание (малая амплитуда).
  function floatPos(n, t) {
    return tmp.set(
      n.home.x + Math.sin(t * n.fx + n.ph) * n.ax,
      n.home.y + Math.sin(t * n.fy + n.py) * n.ay,
      n.home.z + Math.sin(t * n.fz + n.pz) * n.az
    );
  }

  // ── Глубинная пыль ────────────────────────────────────────────────────
  const DUST = 520;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const r = 10 + Math.random() * 34, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    dustPos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
    dustPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.6;
    dustPos[i * 3 + 2] = r * Math.cos(ph);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xb9a9d6, size: 0.07, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }));
  world.add(dust);

  // Мягкое центральное свечение: насыщает центр и плавно гаснет к краям —
  // заполняет простор на широких экранах, чтобы края «сцены» не были пустыми.
  const nebula = glowSprite(0x3a0c14, 24, 0.06);
  nebula.position.set(0, 0, -7);
  world.add(nebula);

  // ── 3D-выделение: ЯРКО-красная неоновая линия — тонкое яркое ядро + тугое
  //    свечение по самой линии (узкая «неон-трубка», без широкого ореола). ──
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
    const R = lerp(4.8, 6.8, t);                          // портрет — ближе (крупнее), широкий — дальше
    const dV = R / (Math.tan(vFov / 2) * 0.9);
    const dH = R / (Math.tan(vFov / 2) * aspect * 0.9);
    return Math.max(dV, dH);
  }
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // updateStyle=true (по умолчанию): Three сам ставит CSS-размер канваса = вьюпорт.
    // Иначе при zoom-out (devicePixelRatio<1) канвас схлопывается влево — сцена уезжает.
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    seamMats.forEach(m => m.resolution.set(w, h));
    camera.aspect = w / h; camera.updateProjectionMatrix();
    baseDist = fitDistance();
    layoutHomes();
  }
  onResize();

  // ── Параллакс + вращение системы мышью (ЛКМ) + зум колесом ────────────
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let dragging = false, dragMoved = 0, wasDrag = false, lastDX = 0, lastDY = 0;
  const userRot = { x: 0, y: 0 }, userRotTo = { x: 0, y: 0 };   // сглаженное / цель
  let userZoom = 1, userZoomTo = 1;                    // отдаление максимум 1.5 (150%)
  function onMouse(e) {
    tmx = (e.clientX / window.innerWidth) * 2 - 1;
    tmy = (e.clientY / window.innerHeight) * 2 - 1;
    if (dragging) {                                     // ЛКМ-перетаскивание → крутим всю систему
      const dx = e.clientX - lastDX, dy = e.clientY - lastDY;
      lastDX = e.clientX; lastDY = e.clientY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      userRotTo.y += dx * 0.006;
      userRotTo.x = Math.max(-1.2, Math.min(1.2, userRotTo.x + dy * 0.006));
      setHover(null);
      return;
    }
    pickHover(e);                                       // наведение на планету (только в idle)
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
  function onWheel(e) {                                 // зум; отдаление не больше 150%
    if (phase !== 'idle' || focusEntry) return;
    if (!(e.target && e.target.closest && e.target.closest('.planet-hero'))) return;
    e.preventDefault();
    userZoomTo = Math.max(0.7, Math.min(1.5, userZoomTo + (e.deltaY > 0 ? 0.08 : -0.08)));
  }

  // ── Тач: палец крутит систему (как ЛКМ на ПК), щипок — зум ─────────────
  // Важно: вертикальный свайп ОТДАЁМ браузеру (скролл страницы — иначе из героя
  // 86vh не добраться до контента). Ось определяем после небольшого порога:
  // горизонталь-доминанта → вращение (и наклон по вертикали внутри жеста),
  // вертикаль-доминанта → скролл. `.planet-hero { touch-action: pan-y }` помогает.
  let touchMode = null;          // null | 'decide' | 'rotate' | 'scroll' | 'pinch'
  let tStartX = 0, tStartY = 0, tLastX = 0, tLastY = 0, pinchDist = 0;
  const _tdist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const _inHero = t => t && t.target && t.target.closest && t.target.closest('.planet-hero');

  function onTouchStart(e) {
    if (phase !== 'idle' || focusEntry) { touchMode = null; return; }
    if (e.touches.length >= 2) {                        // щипок → зум
      if (!_inHero(e)) { touchMode = null; return; }
      touchMode = 'pinch';
      pinchDist = _tdist(e.touches[0], e.touches[1]);
      dragging = false; wasDrag = true;                 // двупалый жест — не тап
      return;
    }
    const t = e.touches[0];
    if (!(t && t.target && t.target.closest && t.target.closest('.planet-hero'))) { touchMode = null; return; }
    touchMode = 'decide';                               // ещё не знаем: вращение или скролл
    tStartX = tLastX = t.clientX; tStartY = tLastY = t.clientY;
    dragging = false; dragMoved = 0; wasDrag = false;
  }

  function onTouchMove(e) {
    if (phase !== 'idle' || focusEntry || !touchMode) return;
    if (touchMode === 'pinch' && e.touches.length >= 2) {
      const d = _tdist(e.touches[0], e.touches[1]);
      if (pinchDist > 0) {                              // сведение пальцев → приближение
        const ratio = d / pinchDist;
        userZoomTo = Math.max(0.7, Math.min(1.5, userZoomTo / ratio));
      }
      pinchDist = d; e.preventDefault();
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const totX = t.clientX - tStartX, totY = t.clientY - tStartY;
    if (touchMode === 'decide') {
      if (Math.abs(totX) < 7 && Math.abs(totY) < 7) { return; }   // ждём явного направления
      if (Math.abs(totX) > Math.abs(totY)) { touchMode = 'rotate'; dragging = true; }
      else { touchMode = 'scroll'; return; }            // вертикаль → браузерный скролл
    }
    if (touchMode === 'rotate') {
      const dx = t.clientX - tLastX, dy = t.clientY - tLastY;
      tLastX = t.clientX; tLastY = t.clientY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      userRotTo.y += dx * 0.006;
      userRotTo.x = Math.max(-1.2, Math.min(1.2, userRotTo.x + dy * 0.006));
      setHover(null);
      e.preventDefault();                               // не даём странице дёргаться по горизонтали
    }
  }

  function onTouchEnd(e) {
    if (touchMode === 'rotate') wasDrag = dragMoved > 6;   // был поворот → подавить тап-фокус
    if (e.touches.length === 0) { touchMode = null; dragging = false; }
    else if (touchMode === 'pinch' && e.touches.length < 2) { touchMode = null; dragging = false; }
  }

  // ── Состояние / тайминги ──────────────────────────────────────────────
  let phase = 'intro';            // 'intro' → 'idle'
  let raf = 0, start = 0, last = 0, endAt = 0, paused = false;
  let focus = 0, focusTarget = null, focusEntry = null;   // фокус-режим (клик по планете)

  const IGNITE = 1000, FIRST = 850, STAGGER = 230, PULSE_DUR = 720;
  const END = FIRST + KEYS.length * STAGGER + PULSE_DUR + 520;
  const ease = t => 1 - Math.pow(1 - t, 3);
  const clamp01 = t => t < 0 ? 0 : t > 1 ? 1 : t;

  function enterIdle() {
    if (phase === 'idle') return;
    phase = 'idle';
    revealAllCards();
    if (veil) veil.classList.add('lift');
    if (canvas) canvas.classList.add('bg');            // уходим в задний план (z-index 0)
    document.body.classList.remove('intro-lock');
    document.body.classList.add('intro-done');
    if (skip) skip.removeEventListener('click', skipIntro);
    document.removeEventListener('keydown', onKey);
    const bar = document.querySelector('.topbar');
    if (bar) bar.removeEventListener('click', skipIntro, true);
  }
  function skipIntro() { if (phase === 'intro') enterIdle(); }
  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (focusTarget) setFocus(null); else skipIntro();   // Escape: выйти из фокуса или пропустить интро
  }
  // Клик: по планете — фокус; мимо планеты при фокусе — закрыть.
  function onClick(e) {
    if (phase !== 'idle') return;
    if (wasDrag) { wasDrag = false; return; }          // это было вращение, а не клик
    if (e.target && e.target.closest && e.target.closest('#planet-detail')) return; // клики по рамке — мимо
    const inHero = e.target && e.target.closest && e.target.closest('.planet-hero');
    const picked = inHero ? pickAt(e.clientX, e.clientY) : null;
    if (picked) setFocus(picked);
    else if (focusTarget) setFocus(null);
  }

  // ── Наведение на планету: красная обводка + инфо-карточка ─────────────
  const _v3 = new THREE.Vector3();
  const cardEl = document.getElementById('planet-card');
  const pc = cardEl ? {
    img: document.getElementById('pc-img'), nm: document.getElementById('pc-nm'),
    sub: document.getElementById('pc-sub'), desc: document.getElementById('pc-desc'),
    badge: document.getElementById('pc-badge'), cta: document.getElementById('pc-cta'),
  } : null;
  let hovered = null;
  const CARD_CACHE = {};

  // Данные карточки берём из (скрытых) DOM-плиток — единый источник + SEO.
  function cardData(key) {
    if (CARD_CACHE[key]) return CARD_CACHE[key];
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
        detail: (el.getAttribute('data-detail') || '').trim(),     // длинное описание (карточка детали)
        slogan: (el.getAttribute('data-slogan') || '').trim(),     // слоган
        live: badgeEl ? badgeEl.classList.contains('live') : true,
        badge: badgeEl ? badgeEl.textContent.trim() : (key === 'platform' ? 'Ядро' : ''),
        cta: ctaEl ? ctaEl.textContent.trim() : (key === 'platform' ? 'Скачать' : ''),
        icon: img ? img.getAttribute('src') : ICON[key],
      };
    }
    CARD_CACHE[key] = d; return d;
  }

  function fillCard(key) {
    if (!pc) return;
    const d = cardData(key);
    if (pc.img) pc.img.src = d.icon || ICON[key] || '';
    pc.nm.textContent = d.name;
    pc.sub.textContent = d.sub; pc.sub.style.display = d.sub ? '' : 'none';
    pc.desc.textContent = d.desc; pc.desc.style.display = d.desc ? '' : 'none';
    pc.badge.textContent = d.badge; pc.badge.className = 'pc-badge ' + (d.live ? 'live' : 'soon');
    pc.badge.style.display = d.badge ? '' : 'none';
    if (pc.cta) pc.cta.style.display = 'none';     // запуск убран — всё через лаунчер
  }

  // ── Детальная рамка (focus-режим по клику) ────────────────────────────
  const detailEl = document.getElementById('planet-detail');
  const pd = detailEl ? {
    img: document.getElementById('pd-img'), nm: document.getElementById('pd-nm'),
    slogan: document.getElementById('pd-slogan'),
    badge: document.getElementById('pd-badge'), desc: document.getElementById('pd-desc'),
    cta: document.getElementById('pd-cta'),
  } : null;
  function fillDetail(key) {
    if (!pd) return;
    const d = cardData(key);
    if (pd.img) pd.img.src = d.icon || ICON[key] || '';
    pd.nm.textContent = d.name;
    if (pd.slogan) { pd.slogan.textContent = d.slogan; pd.slogan.style.display = d.slogan ? '' : 'none'; }
    pd.badge.textContent = d.badge || (d.live ? 'Работает' : 'Скоро');
    pd.badge.className = 'pd-badge ' + (d.live ? 'live' : 'soon');
    pd.desc.textContent = d.detail || d.desc || d.sub || '';     // длинное описание от агента
    pd.cta.textContent = d.live ? 'Скачать Vacantrix Platform' : 'Узнать первым';
  }
  function setFocus(entry) {
    focusTarget = entry || null;
    if (entry) {
      setHover(null);
      fillDetail(entry.key);
      if (detailEl) detailEl.classList.add('show');
    } else if (detailEl) {
      detailEl.classList.remove('show');
    }
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

  // Экранная проекция планеты: центр (cx,cy) и радиус в пикселях (pr).
  const _vc = new THREE.Vector3(), _ve = new THREE.Vector3(), _vr = new THREE.Vector3();
  function projectPlanet(entry) {
    entry.grp.getWorldPosition(_vc);
    const r = (entry.mesh.geometry.parameters.radius || 0.5) * entry.grp.scale.x;
    _vr.setFromMatrixColumn(camera.matrixWorld, 0);      // правый вектор камеры
    _ve.copy(_vc).addScaledVector(_vr, r);
    const behind = _vc.z > camera.position.z;            // планета за камерой → пропустить
    _vc.project(camera); _ve.project(camera);
    const cx = (_vc.x * 0.5 + 0.5) * window.innerWidth;
    const cy = (-_vc.y * 0.5 + 0.5) * window.innerHeight;
    const ex = (_ve.x * 0.5 + 0.5) * window.innerWidth;
    const ey = (-_ve.y * 0.5 + 0.5) * window.innerHeight;
    return { cx, cy, pr: Math.hypot(ex - cx, ey - cy), behind };
  }

  // Наведение: выбираем планету, к ЦЕНТРУ которой курсор ближе всего (в пределах радиуса).
  // Чистый 2D-выбор по экрану — кольцо всегда точно совпадает с планетой, без путаницы глубины.
  // Планета под точкой экрана (ближайшая к центру в пределах радиуса).
  function pickAt(px, py) {
    let best = null, bestD = Infinity;
    for (let i = 0; i < hoverables.length; i++) {
      const s = projectPlanet(hoverables[i]);
      if (s.behind) continue;
      const d = Math.hypot(px - s.cx, py - s.cy);
      if (d <= s.pr * 1.55 && d < bestD) { bestD = d; best = hoverables[i]; }
    }
    return best;
  }

  function pickHover(e) {
    if (phase !== 'idle' || focusEntry) { setHover(null); return; }   // в фокусе ховер выключен
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
    if (!start) { start = now; last = now; }
    const t = now - start;
    const dt = Math.min(50, now - last) / 1000; last = now;
    const tsec = t / 1000;

    // Камера: долли только на интро, дальше — стабильно.
    // демпфирование пользовательского вращения/зума → ровное движение без рывков
    const uk = Math.min(1, dt * 12);
    userRot.x += (userRotTo.x - userRot.x) * uk;
    userRot.y += (userRotTo.y - userRot.y) * uk;
    userZoom += (userZoomTo - userZoom) * Math.min(1, dt * 8);
    const di = ease(clamp01(t / (IGNITE + 600)));
    const dist = phase === 'intro' ? baseDist * (1.9 - 0.9 * di) : baseDist * userZoom;
    mx += (tmx - mx) * Math.min(1, dt * 3.0);
    my += (tmy - my) * Math.min(1, dt * 3.0);

    // Фокус на планете (клик): затухание вращения/параллакса + наезд камеры к планете.
    focus += ((focusTarget ? 1 : 0) - focus) * Math.min(1, dt * 3.5);
    if (focusTarget) focusEntry = focusTarget; else if (focus < 0.01) focusEntry = null;
    const fp = ease(clampv(focus, 0, 1));
    const par = 1 - fp;
    const prx = dragging ? 0 : 1;                       // во время ЛКМ-вращения параллакс выкл
    world.rotation.y = (userRot.y + mx * 0.16 * prx) * par;
    world.rotation.x = (userRot.x + my * 0.10 * prx) * par;

    let tcx = 0, tcy = 0, tcz = dist, tlx = 0, tly = 0, tlz = 0;
    if (focusEntry) {
      const H = focusEntry.home;
      const r = (focusEntry.mesh.geometry.parameters.radius || 0.5) * focusEntry.grp.scale.x;
      const gap = Math.max(3.0, r * 5.5);
      tcx = H.x; tcy = H.y; tcz = H.z + gap; tlx = H.x; tly = H.y; tlz = H.z;
    }
    camera.position.set(lerp(0, tcx, fp), lerp(0, tcy, fp), lerp(dist, tcz, fp));
    camera.lookAt(lerp(0, tlx, fp), lerp(0, tly, fp), lerp(0, tlz, fp));

    // Ядро: зажигание (на интро) + вечный пульс и самовращение.
    const ig = phase === 'intro' ? ease(clamp01((t - 150) / IGNITE)) : 1;
    const beat = Math.sin(tsec * 1.7);
    const coreFocusK = (focusEntry && focusEntry !== coreEntry) ? Math.max(0, 1 - fp) : 1;
    coreGroup.scale.setScalar((0.4 + 0.6 * ig) * (1 + beat * 0.05) * coreFocusK);
    coreInner.material.emissiveIntensity = ig * (0.75 + beat * 0.18);
    coreInner.rotation.y += dt * 0.25;
    coreHalo.material.opacity = ig * (0.6 + beat * 0.1);
    coreHalo.material.rotation += dt * 0.03;
    coreHalo.scale.setScalar(15 * (0.92 + 0.08 * beat) * (0.5 + 0.5 * ig));
    corePoint.intensity = ig * 2.6;
    rings.forEach((r, i) => { r.rotation.z += dt * (0.05 + i * 0.018); });
    { const m = coreSeams.material;                      // швы ядра — при фокусе на Vacantrix
      const tgt = (focusEntry === coreEntry) ? (0.5 + 0.5 * Math.sin(tsec * 4.5)) : 0;
      m.opacity += (tgt - m.opacity) * Math.min(1, dt * 7); coreSeams.visible = m.opacity > 0.01; }

    if (phase === 'intro' && t > 950 && veil) veil.classList.add('lift');

    // Планеты: орбита + самовращение; на интро — нити/импульсы/раскрытие.
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.home.lerp(n.target, Math.min(1, dt * 2.6));      // плавная подстройка под экран
      const p = floatPos(n, tsec);
      if (focusEntry) p.lerp(n.home, fp);                // при фокусе планета замирает в home
      n.grp.position.copy(p);
      n.core.rotation.y += dt * n.spin;                  // вращается светящееся ядро

      // Швы куба: зажигаются и пульсируют при фокусе (клике) на планете.
      // Швы куба: зажигаются и пульсируют только при приближении (фокус/клик).
      {
        const m = n.seams.material;
        const tgt = (focusEntry === n) ? (0.5 + 0.5 * Math.sin(tsec * 4.5)) : 0;
        m.opacity += (tgt - m.opacity) * Math.min(1, dt * 7);
        n.seams.visible = m.opacity > 0.01;
      }

      if (phase === 'intro') {
        const tStart = FIRST + i * STAGGER;
        const k = clamp01((t - tStart) / PULSE_DUR);
        n.line.material.opacity = (k > 0 ? 0.26 : 0) * (0.6 + 0.4 * Math.sin(tsec * 3 + i));
        const lp = n.line.geometry.attributes.position.array;
        lp[0] = 0; lp[1] = 0; lp[2] = 0; lp[3] = p.x; lp[4] = p.y; lp[5] = p.z;
        n.line.geometry.attributes.position.needsUpdate = true;

        if (k > 0 && k < 1) {
          const e = ease(k);
          n.pulse.position.set(p.x * e, p.y * e, p.z * e);
          n.pulse.material.opacity = Math.sin(k * Math.PI) * 0.95;
          n.pulse.scale.setScalar(1.0 + Math.sin(k * Math.PI) * 0.8);
        } else { n.pulse.material.opacity = 0; }

        if (k >= 1 && !n.revealed) { n.revealed = true; revealKey(n.key); if (i === 0) revealCore(); }
        const grow = clamp01((t - (tStart + PULSE_DUR - 120)) / 360);
        n.grp.scale.setScalar(ease(grow));
        n.halo.material.opacity = ease(grow) * 0.85;
      } else {
        n.grp.scale.setScalar(focusEntry && n !== focusEntry ? Math.max(0, 1 - fp) : 1);
        n.halo.material.opacity = 0.58 + 0.06 * Math.sin(tsec * 0.6 + i);   // лёгкое «дыхание»
        n.halo.material.rotation += dt * (0.035 + (i % 3) * 0.012);          // медленное вращение облака

        // Обычная простая линия, связывающая ядро и планету.
        n.line.material.opacity = focusEntry ? 0 : 0.16;
        const lp = n.line.geometry.attributes.position.array;
        lp[0] = 0; lp[1] = 0; lp[2] = 0; lp[3] = p.x; lp[4] = p.y; lp[5] = p.z;
        n.line.geometry.attributes.position.needsUpdate = true;
      }
    }

    dust.rotation.y += dt * 0.012;

    // Скин-схема: у наведённой планеты «просыпается» неоновая электросхема (волной),
    // крутится вместе с планетой; у остальных — гаснет.
    for (let h = 0; h < hoverables.length; h++) {
      const ent = hoverables[h], c = ent.circuit;
      const tgt = (ent === hovered && phase === 'idle') ? 1 : 0;
      c.prog += (tgt - c.prog) * Math.min(1, dt * 5);
      c.mesh.visible = c.prog > 0.01;
      if (c.mesh.visible) {
        c.mat.uniforms.uProg.value = c.prog;
        c.mat.uniforms.uTime.value = tsec;
      }
    }

    // 3D-кольцо выделения: ставим в центр наведённой планеты, лицом к камере,
    // масштаб = радиус планеты → совпадение идеальное (рисуется тем же кадром).
    if (hovered && phase === 'idle') {
      hovered.grp.getWorldPosition(_vc);
      selRing.position.copy(_vc);
      selRing.lookAt(camera.position);
      selRing.scale.setScalar(((hovered.mesh.geometry.parameters.radius || 0.5) * hovered.grp.scale.x) * 1.06);
      selRing.visible = true;
      selRing.material.opacity = Math.min(1, selRing.material.opacity + dt * 8);
      selGlow.material.opacity = selRing.material.opacity * 0.55;
    } else if (selRing.visible) {
      selRing.material.opacity = Math.max(0, selRing.material.opacity - dt * 10);
      selGlow.material.opacity = selRing.material.opacity * 0.55;
      if (selRing.material.opacity <= 0.02) selRing.visible = false;
    }

    composer.render();

    // Карточка следует за планетой (после render — матрицы свежие).
    if (hovered && phase === 'idle') positionCard(hovered);

    if (phase === 'intro') {
      if (t >= END && !endAt) endAt = now;
      if (endAt && now - endAt > 250) { enterIdle(); }
    }
    raf = requestAnimationFrame(frame);
  }

  // ── Пауза при скрытой вкладке ─────────────────────────────────────────
  function onVisibility() {
    if (document.hidden) { paused = true; cancelAnimationFrame(raf); }
    else if (paused) { paused = false; last = 0; raf = requestAnimationFrame(frame); }
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onMouse);
  window.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });   // нужен preventDefault при вращении
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', onVisibility);
  if (skip) skip.addEventListener('click', skipIntro);
  const bar = document.querySelector('.topbar');
  if (bar) bar.addEventListener('click', skipIntro, true);
  document.addEventListener('keydown', onKey);
  // Кнопки рамки детали
  const pdClose = document.getElementById('pd-close');
  if (pdClose) pdClose.addEventListener('click', () => setFocus(null));
  const pdCta = document.getElementById('pd-cta');
  if (pdCta) pdCta.addEventListener('click', () => {
    const k = focusTarget && focusTarget.key;
    const live = k ? cardData(k).live : true;
    if (live) document.getElementById('hero-platform-dl')?.click();          // скачать лаунчер
    else window.open('https://t.me/VacantrixB_O_T', '_blank', 'noopener');   // «Узнать первым»
  });

  raf = requestAnimationFrame(frame);
  // Страховка: если интро зависло — гарантированно раскрыть контент.
  setTimeout(() => { if (phase === 'intro') enterIdle(); }, END + 2500);
})();

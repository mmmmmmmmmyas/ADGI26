/* ==========================================================================
   HOLLOW CUBE — drop-in three.js hero object
   Plain ES module. No build step. Needs the three.js import map (see index.html).

   Usage:
     import { mountHollowCube } from './js/hollow-cube.js';
     const cube = mountHollowCube(document.getElementById('hollow-cube'), { tilt: -12 });

   The container must have a size (width + height) — the canvas fills it.
   ========================================================================== */

import * as THREE from 'three';

/* ---------- 1. DEFAULT SETTINGS (override any of these via options) ---------- */
export const DEFAULTS = {
  surfaceColor: '#ffffff',   // wall color
  surfaceOpacity: 0.15,      // 0–1
  surfacesVisible: true,
  gridsVisible: false,       // 3×3 grid lines on each wall
  iconScale: 0.9,            // × (1.25 grid cells)
  spinSpeed: 0.35,           // × base speed (0.25 rad/s); spins left
  tilt: -12,                 // degrees; negative = left, positive = right
  layerGap: 26,              // pt between stacked layers at rest
  scrollLayerGap: 60,        // pt between layers while scrolling
  zoom: 1,                   // 0.5 (far) – 3 (close)
  numberScale: 1,            // × circular number size
  numberColor: '#000000',    // circular number ink
  collageOpacity: 1,         // 0–1
  mapOpacity: 1,             // 0–1 (fades the multiplied maps toward white)
  scrollTrigger: 'page',     // 'page' = page scroll speed | 'wheel' = mouse wheel | 'none'
  assetsBase: new URL('../assets/', import.meta.url).href,
};

/* ---------- 2. FIXED COMPOSITION CONSTANTS ---------- */
const S = 1;                                        // wall size, world units
const PT = 0.42 * (S / 3) / 96 * (96 * 5 / 512);    // 1 design pt in world units
const CELL = S / 3;                                 // one grid cell
const ROW = CELL - 40 * PT;                         // row pitch for placed elements (−40pt vertical tightening)
const ICON = 1.25 * CELL;                           // icon size at iconScale 1
const BASE_SPIN = 0.25;                             // rad/s at spinSpeed 1×
const Z = { pill: 1, iconBack: 2, collage: 3, numbers: 4, map: 5, iconFront: 6 }; // stack order, × layer gap
const SIDE = { wall_front: 1, wall_back: -1, wall_left: -1, wall_right: 1 };     // outward direction per wall
const CAMERA = { position: [2.052, 0.564, 1.936], target: [0, 0.5, 0], fov: 45 };
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@600&display=swap';

const ICON_FILES = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => `icons/lg-${k}.svg`);
const COLLAGE_FILES = ['a', 'b', 'c', 'd'].map((k) => `collages/col-${k}.png`);
const MAP_FILES = ['a', 'b', 'c', 'd'].map((k) => `maps/map-${k}.png`);

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

/* ---------- 3. MOUNT ---------- */
export function mountHollowCube(container, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const base = o.assetsBase.endsWith('/') ? o.assetsBase : o.assetsBase + '/';
  const state = {
    surfaceColor: o.surfaceColor, surfaceOpacity: o.surfaceOpacity, surfacesVisible: o.surfacesVisible,
    gridsVisible: o.gridsVisible, iconScale: o.iconScale, spinSpeed: o.spinSpeed, tilt: o.tilt,
    layerGap: o.layerGap, scrollLayerGap: o.scrollLayerGap, zoom: o.zoom,
    numberScale: o.numberScale, numberColor: o.numberColor, collageOpacity: o.collageOpacity,
    mapOpacity: o.mapOpacity,
  };

  // Host Grotesk for the circular numbers (added once if the page doesn't already load it)
  if (!document.querySelector(`link[href="${FONT_URL}"]`)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONT_URL; document.head.appendChild(l);
  }

  /* --- renderer, scene, camera, lights --- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.01, 100);
  const target = new THREE.Vector3().fromArray(CAMERA.target);
  camera.position.fromArray(CAMERA.position);
  camera.lookAt(target);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 7, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.5); fill.position.set(-5, 3, -4); scene.add(fill);

  // No pointer interaction: camera is fixed. Motion comes only from auto-rotate, tilt setting and scroll.

  /* --- cube: 4 open walls (no top, no bottom) --- */
  let gap = state.layerGap * PT;
  const surfaceMat = new THREE.MeshStandardMaterial({
    name: 'surface', color: state.surfaceColor, roughness: 0.75, metalness: 0, side: THREE.DoubleSide,
    transparent: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const gridMat = new THREE.LineBasicMaterial({ name: 'grid_lines', color: 0x2a2926, transparent: true });
  const gridGeo = (() => {
    const pts = [], h = S / 2;
    for (let i = 0; i <= 3; i++) { const t = -h + i * CELL; pts.push(t, -h, 0, t, h, 0, -h, t, 0, h, t, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  })();

  const h = S / 2, P = Math.PI / 2;
  const cube = new THREE.Group(); cube.name = 'hollow_cube';
  const walls = [
    ['wall_front', 0, h, h, 0], ['wall_back', 0, h, -h, 0],
    ['wall_left', -h, h, 0, P], ['wall_right', h, h, 0, P],
  ].map(([name, x, y, z, ry]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(S, S), surfaceMat);
    m.name = name; m.position.set(x, y, z); m.rotation.y = ry;
    const grid = new THREE.LineSegments(gridGeo, gridMat); grid.name = name + '_grid';
    m.add(grid); cube.add(m);
    return m;
  });
  const tilt = new THREE.Group(); tilt.name = 'tilt_pivot';   // pivots about the cube's center
  tilt.position.set(0, h, 0); cube.position.set(0, -h, 0);
  tilt.add(cube); scene.add(tilt);

  // put a flat element on a wall's outer face at its stack layer
  const addLayer = (wall, mesh, layer) => {
    mesh.userData.layer = layer;
    mesh.position.z = SIDE[wall.name] * Z[layer] * gap;
    mesh.rotation.y = SIDE[wall.name] < 0 ? Math.PI : 0;
    wall.add(mesh);
  };
  const applyGap = (g) => {
    gap = g;
    walls.forEach((w) => w.children.forEach((c) => {
      if (c.userData.layer) c.position.z = SIDE[w.name] * Z[c.userData.layer] * gap;
    }));
  };
  const flatMat = (props) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, ...props });
  const texLoader = new THREE.TextureLoader();
  const prepTex = (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

  /* --- grid placement helpers (cells are [col, row], 0–2) --- */
  const cells = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push([c, r]);
  const farPairs = []; // cell pairs 2 apart in a row or column → icons never overlap
  cells.forEach((a, i) => cells.forEach((b, j) => {
    if (j > i && (Math.abs(a[0] - b[0]) === 2 || Math.abs(a[1] - b[1]) === 2)) farPairs.push([a, b]);
  }));
  const key2 = (cell) => (cell ? cell[0] + ',' + cell[1] : '');
  const place = (m, cell) => { m.userData.cell = cell; m.position.x = (cell[0] - 1) * CELL; m.position.y = (1 - cell[1]) * ROW; };

  /* --- PILL: off-white, 2 cells × 1 cell, centered in a random 2×2 block, bottom layer --- */
  const pillMat = flatMat({ name: 'pill', color: 0xf4f3f0 });
  const pillGeo = (() => {
    const w = 2 * CELL, ph = CELL, r = ph / 2, sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -ph / 2); sh.lineTo(w / 2 - r, -ph / 2);
    sh.absarc(w / 2 - r, 0, r, -P, P, false);
    sh.lineTo(-w / 2 + r, ph / 2);
    sh.absarc(-w / 2 + r, 0, r, P, Math.PI * 1.5, false);
    return new THREE.ShapeGeometry(sh, 48);
  })();
  const pills = walls.map((w) => { const m = new THREE.Mesh(pillGeo, pillMat); m.name = w.name + '_pill'; addLayer(w, m, 'pill'); return m; });
  const randomizePills = () => pills.forEach((m) => {
    m.position.x = (Math.random() < 0.5 ? -1 : 1) * CELL / 2;
    m.position.y = (Math.random() < 0.5 ? -1 : 1) * ROW / 2;
  });
  randomizePills();

  /* --- COLLAGES: 4 shuffled across 4 walls, 1.12 × wall height, random column (col-a always center) --- */
  const collages = [];
  const randomizeCollages = () => {
    shuffle(collages).forEach((m, i) => {
      const w = walls[i]; if (!w) return;
      addLayer(w, m, 'collage');
      m.position.x = (m.name === 'collage_a' ? 0 : Math.floor(Math.random() * 3) - 1) * CELL;
      m.position.y = 0;
    });
  };
  const collagesReady = Promise.all(COLLAGE_FILES.map((f) => texLoader.loadAsync(base + f).catch(() => null))).then((texs) => {
    texs.forEach((t, i) => {
      if (!t) return;
      prepTex(t);
      const aspect = t.image.width / t.image.height;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.12 * S * aspect, 1.12 * S), flatMat({ name: 'collage', map: t, opacity: state.collageOpacity }));
      m.name = 'collage_' + 'abcd'[i];
      collages.push(m);
    });
    randomizeCollages();
  });

  /* --- MAPS: 4 shuffled across 4 walls, fill 2 cols × 3 rows (left or right), multiply blend --- */
  const maps = [];
  const mapFade = { value: state.mapOpacity }; // shared shader uniform for every map
  const randomizeMaps = () => {
    shuffle(maps).forEach((m, i) => {
      const w = walls[i]; if (!w) return;
      addLayer(w, m, 'map');
      m.position.x = (Math.random() < 0.5 ? -1 : 1) * CELL / 2;
      m.position.y = 0;
    });
  };
  const mapsReady = Promise.all(MAP_FILES.map((f) => texLoader.loadAsync(base + f).catch(() => null))).then((texs) => {
    const W = 2 * CELL, H = S, ratio = W / H;
    texs.forEach((t, i) => {
      if (!t) return;
      prepTex(t);
      const aspect = t.image.width / t.image.height; // cover-crop to 2:3
      if (aspect > ratio) { t.repeat.set(ratio / aspect, 1); t.offset.set((1 - ratio / aspect) / 2, 0); }
      else { t.repeat.set(1, aspect / ratio); t.offset.set(0, (1 - aspect / ratio) / 2); }
      const mat = flatMat({ name: 'map', map: t, blending: THREE.MultiplyBlending, premultipliedAlpha: true });
      // Multiply blending can't fade with opacity (it would darken), so mapOpacity mixes the
      // map toward white instead: multiplying by white leaves what's behind unchanged.
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.mapFade = mapFade;
        shader.fragmentShader = 'uniform float mapFade;\n' + shader.fragmentShader.replace(
          '#include <premultiplied_alpha_fragment>',
          'gl_FragColor.rgb = mix(vec3(1.0), gl_FragColor.rgb, mapFade);\n#include <premultiplied_alpha_fragment>');
      };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
      m.visible = state.mapOpacity > 0;
      m.name = 'map_' + 'abcd'[i];
      maps.push(m);
    });
    randomizeMaps();
  });

  /* --- ICONS (legends): 2 per wall — one on the very top layer, one on the very bottom --- */
  const icons = [];
  let iconMats = [];
  const svgTexture = async (url) => {
    const svg = await (await fetch(url)).text();
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 512;
        c.getContext('2d').drawImage(img, 0, 0, 512, 512);
        res(prepTex(new THREE.CanvasTexture(c)));
      };
      img.onerror = () => res(null);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  };
  const randomizeIcons = () => {
    if (!iconMats.length) return;
    for (let i = 0; i < icons.length; i += 2) {
      const mats = shuffle(iconMats);
      const blocked = [numbers[i], numbers[i + 1]].map((n) => key2(n?.userData.cell));
      const pair = pickOne(farPairs.filter((p) => !p.some((c) => blocked.includes(key2(c)))));
      [icons[i], icons[i + 1]].forEach((m, k) => { m.material = mats[k]; place(m, pair[k]); });
    }
  };
  const iconGeo = new THREE.PlaneGeometry(ICON, ICON);
  const iconsReady = Promise.all(ICON_FILES.map((f) => svgTexture(base + f).catch(() => null))).then((texs) => {
    iconMats = texs.filter(Boolean).map((t) => flatMat({ name: 'icon', map: t }));
    if (!iconMats.length) return;
    walls.forEach((w) => {
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(iconGeo, iconMats[0]);
        m.name = `${w.name}_icon_${i ? 'back' : 'front'}`;
        m.scale.setScalar(state.iconScale);
        addLayer(w, m, i ? 'iconBack' : 'iconFront');
        icons.push(m);
      }
    });
    randomizeIcons();
  });

  /* --- CIRCULAR NUMBERS: per wall one single + one trio (−24pt overlap), 01–60, Host Grotesk 600 --- */
  const K = 5, PX = 512, FS = 40 * K, DIAM = 96 * K, STEP = DIAM - 24 * K;
  const NUM_SIZE = 0.42 * CELL;
  const FONT = `600 ${FS}px "Host Grotesk"`;
  const numbers = [];
  let stem = 4 * K; // circle stroke = measured stem width of the font
  const measureStem = () => {
    const c = document.createElement('canvas'); c.width = c.height = FS * 2;
    const x = c.getContext('2d'); x.font = FONT; x.textBaseline = 'middle'; x.fillText('l', FS / 2, FS);
    const row = x.getImageData(0, FS, c.width, 1).data;
    let w = 0; for (let i = 3; i < row.length; i += 4) w += row[i] / 255;
    return w || 4 * K;
  };
  const drawNumber = (canvas, nums) => {
    const x = canvas.getContext('2d');
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.strokeStyle = x.fillStyle = '#fff'; // drawn white; the material colour tints it (numberColor)
    x.lineWidth = stem;
    x.font = FONT;
    x.letterSpacing = (-0.02 * FS) + 'px';
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    nums.forEach((n, i) => {
      const cx = PX / 2 + i * STEP;
      x.beginPath(); x.arc(cx, PX / 2, DIAM / 2 - stem / 2, 0, Math.PI * 2); x.stroke();
      const label = String(n).padStart(2, '0');
      const m = x.measureText(label);
      x.fillText(label, cx + 0.01 * FS, PX / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    });
  };
  const randomizeNumbers = () => {
    for (let w = 0; w * 2 < numbers.length; w++) {
      const taken = [icons[w * 2], icons[w * 2 + 1]].map((m) => key2(m?.userData.cell));
      const free = shuffle(cells.filter((c) => !taken.includes(key2(c))));
      const pool = []; while (pool.length < 4) { const v = 1 + Math.floor(Math.random() * 60); if (!pool.includes(v)) pool.push(v); }
      [numbers[w * 2], numbers[w * 2 + 1]].forEach((n, k) => {
        place(n, free[k]);
        drawNumber(n.userData.canvas, k ? pool.slice(1) : pool.slice(0, 1));
        n.material.map.needsUpdate = true;
      });
    }
  };
  const numbersReady = document.fonts.load(FONT).catch(() => {}).then(() => {
    stem = measureStem();
    walls.forEach((w) => {
      for (let i = 0; i < 2; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = PX + (i ? 2 : 0) * STEP; canvas.height = PX;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(NUM_SIZE * canvas.width / PX, NUM_SIZE),
          flatMat({ name: 'circular_number', map: prepTex(new THREE.CanvasTexture(canvas)), color: state.numberColor }));
        m.name = `${w.name}_circular_number_${i ? 'trio' : 'single'}`;
        m.scale.setScalar(state.numberScale);
        m.userData.canvas = canvas;
        addLayer(w, m, 'numbers');
        numbers.push(m);
      }
    });
    randomizeNumbers();
  });

  /* --- settings appliers --- */
  const applySurface = () => {
    surfaceMat.opacity = state.surfacesVisible ? state.surfaceOpacity : 0;
    surfaceMat.depthWrite = state.surfacesVisible && state.surfaceOpacity === 1;
  };
  const applyGrids = () => { gridMat.visible = state.gridsVisible; };
  const baseDist = camera.position.distanceTo(target);
  const applyZoom = () => {
    camera.position.sub(target).setLength(baseDist / state.zoom).add(target);
    camera.lookAt(target);
  };
  applySurface(); applyGrids(); applyZoom();

  /* --- scroll interaction: scroll speed adds spin; layers spread to scrollLayerGap while scrolling --- */
  let boost = 0, lastScrollAt = -1e9, lastY = window.scrollY;
  const bump = (px) => { boost = Math.min(8, boost + px * 0.015); lastScrollAt = performance.now(); };
  const onWheel = (e) => bump(Math.abs(e.deltaY) * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1));
  const onScroll = () => { const y = window.scrollY; bump(Math.abs(y - lastY)); lastY = y; };
  if (o.scrollTrigger === 'wheel') addEventListener('wheel', onWheel, { passive: true });
  if (o.scrollTrigger === 'page') addEventListener('scroll', onScroll, { passive: true });

  /* --- sizing + pause when off-screen --- */
  const resize = () => {
    const w = container.clientWidth || 1, hh = container.clientHeight || 1;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(container); resize();
  let inView = true;
  const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; }); io.observe(container);

  /* --- settings that can be eased with transitionTo() --- */
  const setters = {
    iconScale: (v) => { state.iconScale = v; icons.forEach((m) => m.scale.setScalar(v)); },
    numberScale: (v) => { state.numberScale = v; numbers.forEach((m) => m.scale.setScalar(v)); },
    numberColor: (c) => { state.numberColor = c; numbers.forEach((m) => m.material.color.set(c)); },
    collageOpacity: (v) => { state.collageOpacity = v; collages.forEach((m) => { m.material.opacity = v; }); },
    mapOpacity: (v) => { state.mapOpacity = v; mapFade.value = v; maps.forEach((m) => { m.visible = v > 0; }); },
  };
  let tween = null;
  const _from = new THREE.Color(), _to = new THREE.Color();
  const stepTween = (now) => {
    const p = Math.min(1, (now - tween.start) / tween.ms), e = p * p * (3 - 2 * p); // smoothstep
    for (const k in tween.to) {
      const a = tween.from[k], b = tween.to[k];
      setters[k](typeof b === 'number' ? a + (b - a) * e : '#' + _from.set(a).lerp(_to.set(b), e).getHexString());
    }
    if (p === 1) tween = null;
  };

  /* --- frame loop --- */
  const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _v = new THREE.Vector3(), _axis = new THREE.Vector3();
  const facesCamera = (obj, sign = 1) => {
    obj.getWorldPosition(_p);
    _n.set(0, 0, sign).transformDirection(obj.matrixWorld);
    return _n.dot(_v.copy(camera.position).sub(_p)) > 0;
  };
  let last = performance.now(), raf = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!inView) return;
    if (tween) stepTween(now);

    boost *= Math.exp(-dt * 2.5);
    const scrolling = now - lastScrollAt < 180;
    const gapTarget = (scrolling ? state.scrollLayerGap : state.layerGap) * PT;
    if (Math.abs(gap - gapTarget) > 1e-5) applyGap(gap + (gapTarget - gap) * (1 - Math.exp(-dt * (scrolling ? 10 : 4))));
    cube.rotation.y -= (BASE_SPIN * state.spinSpeed + boost) * dt;

    // tilt about the horizontal camera→cube axis (positive = clockwise as seen by viewer)
    _axis.copy(camera.position).sub(tilt.position).setY(0).normalize();
    tilt.quaternion.setFromAxisAngle(_axis, THREE.MathUtils.degToRad(-state.tilt));
    tilt.updateMatrixWorld();

    // draw order: walls turned away first with their stack reversed, near walls after in normal order
    walls.forEach((w) => {
      const near = facesCamera(w, SIDE[w.name]);
      const b = near ? 20 : 0;
      w.renderOrder = near ? b : b + 10;
      w.children.forEach((c) => {
        const z = Z[c.userData.layer];
        c.renderOrder = z === undefined ? w.renderOrder : b + (near ? z : 10 - z);
      });
    });
    // logos only show on walls facing the camera
    icons.forEach((m) => { m.visible = facesCamera(m); });

    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  /* ---------- 4. PUBLIC API ---------- */
  const api = {
    ready: Promise.all([collagesReady, mapsReady, iconsReady, numbersReady]),
    setSurfaceColor: (c) => { state.surfaceColor = c; surfaceMat.color.set(c); },
    setSurfaceOpacity: (v) => { state.surfaceOpacity = v; applySurface(); },
    setSurfacesVisible: (b) => { state.surfacesVisible = b; applySurface(); },
    setGridsVisible: (b) => { state.gridsVisible = b; applyGrids(); },
    setIconScale: setters.iconScale,
    setNumberScale: setters.numberScale,
    setNumberColor: setters.numberColor,
    setCollageOpacity: setters.collageOpacity,
    setMapOpacity: setters.mapOpacity,
    // ease any of iconScale, numberScale, numberColor, collageOpacity, mapOpacity to new values over ms
    transitionTo: (to, ms = 600) => {
      const from = {}; for (const k in to) if (setters[k]) from[k] = state[k];
      tween = { from, to: Object.fromEntries(Object.keys(from).map((k) => [k, to[k]])), start: performance.now(), ms };
    },
    setSpinSpeed: (v) => { state.spinSpeed = v; },
    setTilt: (deg) => { state.tilt = deg; },
    setLayerGap: (pt) => { state.layerGap = pt; applyGap(pt * PT); },
    setScrollLayerGap: (pt) => { state.scrollLayerGap = pt; },
    setZoom: (z) => { state.zoom = z; applyZoom(); },
    randomizeIcons, randomizeNumbers, randomizePills, randomizeCollages, randomizeMaps,
    randomizeAll: () => { randomizeCollages(); randomizeMaps(); randomizePills(); randomizeNumbers(); randomizeIcons(); },
    getSettings: () => ({ ...state }),
    destroy: () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      removeEventListener('wheel', onWheel); removeEventListener('scroll', onScroll);
      scene.traverse((obj) => {
        obj.geometry?.dispose();
        [].concat(obj.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); });
      });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
  return api;
}

// Lightbox Standee — 3D viewer. Content: data/layers.csv · Behaviour: data/settings.csv
const stage = document.querySelector('three-d-stage');
const loader = document.getElementById('loader');
const { THREE } = await stage.ready;

// ---------- content from CSV (falls back to built-in defaults) ----------
const DEFAULT_LAYERS = [
  { slot: 'face', file: 'assets/map-layer-1.webp' },
  { slot: 'pane1', file: 'assets/map-layer-2.svg' },
  { slot: 'pane2', file: 'assets/map-layer-3.svg' },
];
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (ch === '"') q = false;
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(f.trim()); f = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(f.trim()); rows.push(row); row = []; f = '';
    } else f += ch;
  }
  if (f || row.length) { row.push(f.trim()); rows.push(row); }
  const data = rows.filter((r) => r.some((c) => c) && !r[0].startsWith('#'));
  const keys = data.shift() || [];
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}
async function loadCSV(url, fallback) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status + ' ' + url);
    return parseCSV(await res.text());
  } catch (e) {
    console.warn('[standee] using defaults for', url, e);
    return fallback;
  }
}
const [LAYERS, SETTING_ROWS] = await Promise.all([
  loadCSV('data/layers.csv', DEFAULT_LAYERS),
  loadCSV('data/settings.csv', []),
]);
const SETTINGS = Object.fromEntries(SETTING_ROWS.map((r) => [r.key, parseFloat(r.value)]));
const setting = (k, d) => (Number.isFinite(SETTINGS[k]) ? SETTINGS[k] : d);
const layerFor = (slot) => LAYERS.find((l) => l.slot === slot && l.file);
function loadImage(src) {
  return new Promise((res) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => { console.warn('[standee] image failed:', src); res(null); };
    img.src = src;
  });
}

// Light chrome on the white stage (matches the home page background)
const st = document.createElement('style');
st.textContent = `.toolbar button{white-space:nowrap;background:rgba(255,255,255,.7);color:#191919;border-color:rgba(0,0,0,.14)}
.toolbar button:hover{background:rgba(0,0,0,.06)}
.note{color:rgba(25,25,25,.45)}
@media (max-width:1100px){.note{display:none}}
@media (max-width:520px){.toolbar{left:50%;right:auto;transform:translateX(-50%)}.toolbar button{font-size:11px;padding:6px 9px}}`;
stage.shadowRoot.appendChild(st);
// Embedded on the home page: no OBJ/GLB buttons and no orbit hint (the grab cursor shows it)
stage._toolbar.style.display = 'none';
stage.shadowRoot.querySelector('.note').style.display = 'none';

// ---------- dimensions (meters) ----------
const POST = 0.08, POST_H = 1.2;
const PX = 0.4775, PZ = 0.735;          // post centers
const TILT = THREE.MathUtils.degToRad(6.5);
const RAIL_TOP_Y = 0.88;                // rail top height at center
const RAIL_L = 1.46, RAIL_W = 0.07, RAIL_H = 0.09;
const RAIL_Z = PZ - POST / 2 - RAIL_W / 2;
const SURF_X = 1.36, SURF_Z = (RAIL_Z + RAIL_W / 2) * 2 - 0.002, SURF_T = 0.012;
const MAP_W = 2481, MAP_H = 2127;            // map image px (width runs along box Z)
const BOX_Z = 1.23, BOX_X = BOX_Z * MAP_H / MAP_W, BOX_T = 0.09;
const BOX_CX = SURF_X / 2 - (SURF_Z - BOX_Z) / 2 - BOX_X / 2; // top gap = side gaps
const BOX_CZ = 0;
const BOX_BASE = SURF_T + 0.001;
const BOX_TOP = BOX_BASE + BOX_T;

// ---------- materials ----------
// Standee drawn as outline: transparent fill, black stroke on every edge
const wood = new THREE.MeshBasicMaterial({ name: 'wood_frame', color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
const stroke = new THREE.LineBasicMaterial({ name: 'wood_stroke', color: 0x000000, transparent: true, opacity: 0.5 });
function outline(mesh) {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), stroke);
  l.name = mesh.name + '_outline';
  mesh.add(l);
  return mesh;
}
const shell = new THREE.MeshStandardMaterial({
  name: 'lightbox_shell', color: 0xf3f1ec, roughness: 0.7, metalness: 0,
  emissive: 0xfff8ef, emissiveIntensity: 0.12,
});

// Diffuser face: soft edge-lit glow
// Canvas x = box X (low end → high end), canvas y = box Z (−Z → +Z)
const cv = document.createElement('canvas');
cv.height = 1904; cv.width = Math.round(cv.height * BOX_X / BOX_Z);
const cx = cv.getContext('2d');
const K = cv.width / 512;
function paintBase(withMap) {
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1; cx.filter = 'none';
  cx.fillStyle = withMap ? '#7d7972' : '#cfcbc3'; cx.fillRect(0, 0, cv.width, cv.height);
}
function paintGlow(over) {
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.globalCompositeOperation = over ? 'screen' : 'source-over';
  cx.globalAlpha = over ? 0.3 : 1;
  cx.filter = `blur(${22 * K}px)`;
  cx.strokeStyle = '#fffaf2'; cx.lineWidth = 46 * K;
  cx.beginPath(); cx.roundRect(46 * K, 46 * K, cv.width - 92 * K, cv.height - 92 * K, 30 * K); cx.stroke();
  cx.filter = `blur(${40 * K}px)`;
  cx.fillStyle = 'rgba(255,252,246,0.22)';
  cx.fillRect(150 * K, 150 * K, cv.width - 300 * K, cv.height - 300 * K);
  cx.filter = 'none';
  cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
}
paintBase(false); paintGlow(false);
const glowTex = new THREE.CanvasTexture(cv);
glowTex.colorSpace = THREE.SRGBColorSpace;
glowTex.anisotropy = 8;

// Map print, "plus darker" blended onto the glow: max(0, base + map − 1). Map top → high (+X) end.
function paintFace(mapImg) {
  if (!mapImg) return;
  paintBase(false); paintGlow(false);
  const W = mapImg.naturalWidth, Hm = mapImg.naturalHeight;
  const mc = document.createElement('canvas');
  mc.width = cv.width; mc.height = cv.height;
  const mx = mc.getContext('2d');
  mx.fillStyle = '#fff'; mx.fillRect(0, 0, mc.width, mc.height);
  mx.setTransform(0, cv.height / W, -cv.width / Hm, 0, cv.width, 0);
  mx.drawImage(mapImg, 0, 0);
  const base = cx.getImageData(0, 0, cv.width, cv.height);
  const mp = mx.getImageData(0, 0, mc.width, mc.height).data;
  const b = base.data;
  for (let i = 0; i < b.length; i += 4) {
    b[i] = Math.max(0, b[i] + mp[i] - 255);
    b[i + 1] = Math.max(0, b[i + 1] + mp[i + 1] - 255);
    b[i + 2] = Math.max(0, b[i + 2] + mp[i + 2] - 255);
  }
  cx.putImageData(base, 0, 0);
  glowTex.needsUpdate = true;
}
const faceLayer = layerFor('face');
const faceReady = faceLayer ? loadImage(faceLayer.file).then(paintFace) : Promise.resolve();
const diffuser = new THREE.MeshStandardMaterial({
  name: 'lightbox_diffuser', color: 0x141414, roughness: 0.95, metalness: 0,
  emissive: 0xffffff, emissiveMap: glowTex, emissiveIntensity: 0.85,
});

// ---------- model ----------
const model = new THREE.Group();
model.name = 'lightbox_standee';

const frame = new THREE.Group(); frame.name = 'wood_frame';
model.add(frame);
const postGeo = new THREE.BoxGeometry(POST, POST_H, POST);
[['post_front', -PX, PZ], ['post_right', PX, PZ], ['post_left', -PX, -PZ], ['post_back', PX, -PZ]]
  .forEach(([n, x, z]) => {
    const m = new THREE.Mesh(postGeo, wood); m.name = n;
    m.position.set(x, POST_H / 2, z); frame.add(outline(m));
  });

// Inclined deck (rails + surface + lightbox), rising toward +X
const deck = new THREE.Group(); deck.name = 'deck';
deck.position.set(0, RAIL_TOP_Y, 0);
deck.rotation.z = TILT;
model.add(deck);

const railGeo = new THREE.BoxGeometry(RAIL_L, RAIL_H, RAIL_W);
const pegGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
[['front', 1], ['back', -1]].forEach(([side, s]) => {
  const r = new THREE.Mesh(railGeo, wood); r.name = 'rail_' + side;
  r.position.set(0, -RAIL_H / 2, s * RAIL_Z); deck.add(outline(r));
  [-1, 1].forEach((e) => {
    const p = new THREE.Mesh(pegGeo, wood); p.name = `stop_${side}_${e < 0 ? 'low' : 'high'}`;
    p.position.set(e * (RAIL_L / 2 - 0.02), 0.0175 + 0.001, s * (RAIL_Z + 0.015));
    deck.add(outline(p));
  });
});

const surface = new THREE.Mesh(new THREE.BoxGeometry(SURF_X, SURF_T, SURF_Z), wood);
surface.name = 'surface_plane';
surface.position.set(0, SURF_T / 2 + 0.001, 0);
deck.add(outline(surface));

const lightbox = new THREE.Group(); lightbox.name = 'lightbox';
lightbox.position.set(BOX_CX, 0, BOX_CZ);
deck.add(lightbox);
const body = new THREE.Mesh(new THREE.BoxGeometry(BOX_X, BOX_T, BOX_Z), shell);
body.name = 'lightbox_body';
body.position.y = BOX_BASE + BOX_T / 2;
lightbox.add(body);
const face = new THREE.Mesh(new THREE.PlaneGeometry(BOX_X, BOX_Z), diffuser);
face.name = 'lightbox_diffuser';
face.rotation.x = -Math.PI / 2;
face.position.y = BOX_TOP + 0.0012;
lightbox.add(face);

// Two flat screen panes stacked above the lightbox face
const SCREEN_GAP = 0.20, SCREEN_T = 0.006;
const screenMat = new THREE.MeshStandardMaterial({
  name: 'screen_pane', color: 0xf4f6f8, roughness: 0.15, metalness: 0,
  transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide,
});
const screenEdge = new THREE.LineBasicMaterial({ name: 'screen_edge', color: 0xffffff, transparent: true, opacity: 0.55 });
const screenGeo = new THREE.BoxGeometry(BOX_X, SCREEN_T, BOX_Z);
const screens = [];
[1, 2].forEach((n) => {
  const sc = new THREE.Mesh(screenGeo, screenMat);
  sc.name = 'screen_' + n;
  sc.position.y = BOX_TOP + SCREEN_GAP * n + SCREEN_T / 2;
  sc.renderOrder = 5;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(screenGeo), screenEdge);
  e.name = sc.name + '_outline';
  sc.add(e);
  lightbox.add(sc);
  screens.push(sc);
});

stage.setObject(model);
model.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
stage._key.castShadow = false;

// ---------- lighting for the void ----------
const scene = stage._scene;
scene.children.forEach((o) => {
  if (o.isHemisphereLight) o.visible = false;
  if (o.isMesh && o.material && o.material.isShadowMaterial) o.visible = false;
});
stage._key.intensity = 1.9;
scene.children.filter((o) => o.isDirectionalLight && o !== stage._key).forEach((o) => (o.intensity = 0.22));
const rim = new THREE.DirectionalLight(0xdfe6ff, 0.7);
rim.position.set(3, 4, -4);
scene.add(rim);

// ---------- light effects (viewer only, not exported) ----------
const fx = new THREE.Group();
fx.position.copy(deck.position);
fx.rotation.copy(deck.rotation);
scene.add(fx);

const spillTop = new THREE.PointLight(0xfff4e8, 0.4, 3, 2);
spillTop.position.set(BOX_CX, BOX_TOP + 0.35, BOX_CZ);
fx.add(spillTop);

const beam = new THREE.Group();
beam.position.set(BOX_CX, BOX_TOP + 0.0015, BOX_CZ);
fx.add(beam);

const H = 1.35, SPREAD = 0.2, HX = BOX_X / 2, HZ = BOX_Z / 2, Y0 = -BOX_T;
const softAt = (t) => 0.02 + 0.22 * t;
const extX = (t) => HX * (1 + SPREAD * t) + 1.6 * softAt(t) + 0.12 * (1 - t);
const extZ = (t) => HZ * (1 + SPREAD * t) + 1.6 * softAt(t) + 0.12 * (1 - t);

const pos = [], nrm = [], del = [], idx = [];
function quad(a, b, c, d, n, dl) {
  const i = pos.length / 3;
  [a, b, c, d].forEach((v) => { pos.push(...v); nrm.push(...n); del.push(dl); });
  idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
const NY = 46, NX = 30, NZ = 34;
for (let i = 0; i < NY; i++) {
  const y = Y0 + ((i + 0.5) / NY) * (H - Y0);
  const t = Math.max(y, 0) / H, ex = extX(t), ez = extZ(t);
  quad([-ex, y, -ez], [ex, y, -ez], [ex, y, ez], [-ex, y, ez], [0, 1, 0], (H - Y0) / NY);
}
const EX1 = extX(1), EZ1 = extZ(1), EX0 = extX(0), EZ0 = extZ(0);
for (let i = 0; i < NX; i++) {
  const x = -EX1 + ((i + 0.5) / NX) * 2 * EX1;
  quad([x, Y0, -EZ0], [x, Y0, EZ0], [x, H, EZ1], [x, H, -EZ1], [1, 0, 0], (2 * EX1) / NX);
}
for (let i = 0; i < NZ; i++) {
  const z = -EZ1 + ((i + 0.5) / NZ) * 2 * EZ1;
  quad([-EX0, Y0, z], [EX0, Y0, z], [EX1, H, z], [-EX1, H, z], [0, 0, 1], (2 * EZ1) / NZ);
}
const bg = new THREE.BufferGeometry();
bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
bg.setAttribute('aN', new THREE.Float32BufferAttribute(nrm, 3));
bg.setAttribute('aD', new THREE.Float32BufferAttribute(del, 1));
bg.setIndex(idx);

const uniforms = {
  uH: { value: H }, uHalf: { value: new THREE.Vector2(HX, HZ) },
  uSpread: { value: SPREAD }, uGain: { value: 0.2 },
  uColor: { value: new THREE.Color(1.0, 0.97, 0.92) },
};
const beamMat = new THREE.ShaderMaterial({
  uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  vertexShader: `
    attribute vec3 aN; attribute float aD;
    varying vec3 vL; varying float vW; varying float vD;
    void main(){
      vL = position;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec3 nW = normalize(mat3(modelMatrix) * aN);
      vW = abs(dot(nW, normalize(cameraPosition - wp.xyz)));
      vD = aD;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    uniform vec3 uColor; uniform float uGain, uH, uSpread; uniform vec2 uHalf;
    varying vec3 vL; varying float vW; varying float vD;
    float sdRect(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
    void main(){
      float t = clamp(vL.y / uH, 0.0, 1.0);
      float soft = 0.02 + 0.22 * t;
      vec2 hb = uHalf * (1.0 + uSpread * t);
      float core = 1.0 - smoothstep(-soft, soft, sdRect(vL.xz, hb - soft * 0.5));
      float halo = 1.0 - smoothstep(-0.02, 0.16, sdRect(vL.xz, uHalf));
      float glow = exp(-abs(vL.y) * 9.0);
      float vert = pow(1.0 - t, 1.5) * (vL.y < 0.0 ? 0.0 : 1.0);
      float dens = core * vert * 0.85 + halo * glow * 0.12;
      float a = dens * vD * vW * uGain;
      gl_FragColor = vec4(uColor * a, a);
    }`,
});
const beamMesh = new THREE.Mesh(bg, beamMat);
beamMesh.frustumCulled = false;
beamMesh.renderOrder = 10;
beam.add(beamMesh);

// Layer prints on the panes, "plus darker": dst + src − 1 → subtract (1 − src)·a
function addPrint(src, level, name, order) {
  const c = document.createElement('canvas');
  c.width = cv.width; c.height = cv.height;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const ready = loadImage(src).then((img) => {
    if (!img) return;
    const x = c.getContext('2d');
    const W = img.naturalWidth || 3307, Hm = img.naturalHeight || 2835;
    x.setTransform(0, c.height / W, -c.width / Hm, 0, c.width, 0);
    x.drawImage(img, 0, 0, W, Hm);
    tex.needsUpdate = true;
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(BOX_X, BOX_Z),
    new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.ReverseSubtractEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv;
        void main(){ vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4((1.0 - t.rgb) * t.a, 0.0); }`,
    })
  );
  m.name = name;
  m.rotation.x = -Math.PI / 2;
  m.position.set(BOX_CX, BOX_TOP + SCREEN_GAP * level + SCREEN_T + 0.0008, BOX_CZ);
  m.renderOrder = order;
  m.userData.level = level;
  m.userData.ready = ready;
  fx.add(m);
  return m;
}
const prints = [];
['pane1', 'pane2'].forEach((slot, i) => {
  const L = layerFor(slot);
  if (L) prints.push(addPrint(L.file, i + 1, slot + '_print', 12 + i));
});

// ---------- camera ----------
const cam = stage._camera, ctl = stage._controls;
cam.near = 0.05; cam.far = 200; cam.updateProjectionMatrix();
// 100% zoom reference = original framing distance (3.5 m)
const baseDist = 3.5;
const ZOOM_MIN = 100, ZOOM_MAX = 240, ZOOM_DEFAULT = 220; // %, also the slider's range in index.html
ctl.minDistance = baseDist / (ZOOM_MAX / 100);  // max 240%
ctl.maxDistance = baseDist / (ZOOM_MIN / 100);  // min 100%
// Zoom is set with the slider only, so scrolling over the frame scrolls the home page
ctl.enableZoom = false;
// Pane gap follows zoom: ≤ zoom_low → gap_max, ≥ zoom_high → gap_min, linear in between
const zoomEl = document.getElementById('zoom');
const GAP_MAX = setting('gap_max_cm', 20) / 100, GAP_MIN = setting('gap_min_cm', 2) / 100;
const Z_LO = setting('zoom_low_pct', 120), Z_HI = setting('zoom_high_pct', 220);
function setGap(g) {
  screens.forEach((sc, i) => { sc.position.y = BOX_TOP + g * (i + 1) + SCREEN_T / 2; });
  prints.forEach((p) => { p.position.y = BOX_TOP + g * p.userData.level + SCREEN_T + 0.0008; });
}
const showZoom = () => {
  const z = (baseDist / cam.position.distanceTo(ctl.target)) * 100;
  zoomEl.value = String(Math.round(z));
  const k = THREE.MathUtils.clamp((z - Z_LO) / (Z_HI - Z_LO), 0, 1);
  setGap(THREE.MathUtils.lerp(GAP_MAX, GAP_MIN, k));
};
// Default view
cam.position.set(-1.0998, 2.2303, -1.4091);
ctl.target.set(0.0497, 0.8256, 0.0356);
// Keep the model centred at any frame size: orbit around the centre of its bounds (camera moved
// by the same amount, so the view angle and zoom stay as above), and no panning off-centre.
const modelCentre = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
cam.position.add(modelCentre.clone().sub(ctl.target));
ctl.target.copy(modelCentre);
ctl.enablePan = false;
// Default tilt: 10% further toward the viewer than the original view (as if dragged down):
// the camera's angle from straight overhead × 0.9 (≈52.7° → 47.4°)
const view = new THREE.Spherical().setFromVector3(cam.position.clone().sub(ctl.target));
view.phi *= 0.9;
// Default zoom: 220%
view.radius = baseDist / (ZOOM_DEFAULT / 100);
cam.position.copy(ctl.target).add(new THREE.Vector3().setFromSpherical(view));
ctl.update();
ctl.addEventListener('change', showZoom);
showZoom();
// Slider → camera distance along the current view direction
zoomEl.addEventListener('input', () => {
  const dist = baseDist / (parseFloat(zoomEl.value) / 100);
  cam.position.sub(ctl.target).setLength(dist).add(ctl.target);
  ctl.update();
});

// Frame is 30% taller than the original framing (home page CSS): render as if it were its
// original height, extended evenly above and below, so the model keeps its size and stays centred.
const EXTRA = 0.3;
function fitStage() {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1, h0 = h / (1 + EXTRA);
  stage._renderer.setSize(w, h);
  cam.aspect = w / h0;
  cam.setViewOffset(w, h0, 0, (h0 - h) / 2, w, h);
  cam.updateProjectionMatrix();
}
stage._ro.disconnect();
stage._ro = new ResizeObserver(fitStage);
stage._ro.observe(stage);
fitStage();

// Drag cue: open hand over the stage, closed hand while dragging
const canvasEl = stage._renderer.domElement;
canvasEl.style.cursor = 'grab';
ctl.addEventListener('start', () => { canvasEl.style.cursor = 'grabbing'; });
ctl.addEventListener('end', () => { canvasEl.style.cursor = 'grab'; });

// Turntable rotation (rotate_on / rotate_speed in data/settings.csv): pauses while dragging,
// resumes on release. No on-screen controls on the home page.
const rotating = !!setting('rotate_on', 1);
ctl.autoRotate = rotating;
ctl.autoRotateSpeed = -setting('rotate_speed', 1); // 1.0 ≈ one full turn per minute; negative = reversed direction
ctl.addEventListener('end', () => { ctl.autoRotate = rotating; });

// Reveal once all imagery is painted
await Promise.all([faceReady, ...prints.map((p) => p.userData.ready)]);
document.body.classList.add('ready');
loader?.remove();

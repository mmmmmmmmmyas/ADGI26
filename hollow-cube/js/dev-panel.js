/* ==========================================================================
   DEV PANEL — optional tuning controls for the Hollow Cube.
   Loaded only when the URL has ?controls (see index.html). Not needed in production.
   "Copy settings" copies the current values as JSON — paste them into the
   mountHollowCube(..., { ... }) options in index.html to make them the new defaults.
   ========================================================================== */

export function mountDevPanel(cube) {
  const s = cube.getSettings();
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:16px;left:16px;z-index:9999;display:grid;grid-template-columns:auto auto;gap:8px 14px;align-items:center;padding:12px 14px;background:rgba(255,255,255,.9);backdrop-filter:blur(8px);border-radius:10px;font:13px/1 ui-sans-serif,system-ui,sans-serif;color:#2a2926;box-shadow:0 1px 3px rgba(0,0,0,.12)';
  const ctl = 'font:inherit;min-width:56px;padding:6px 10px;border:1px solid #bdbab3;border-radius:6px;background:#fff;color:inherit;cursor:pointer';

  const row = (label, el) => { const l = document.createElement('span'); l.textContent = label; panel.append(l, el); };
  const button = (text, fn) => { const b = document.createElement('button'); b.textContent = text; b.style.cssText = ctl; b.onclick = fn; return b; };
  const toggle = (label, on, fn) => {
    const b = button(on ? 'Hide' : 'Show', () => { on = !on; b.textContent = on ? 'Hide' : 'Show'; fn(on); });
    row(label, b);
  };
  const slider = (label, min, max, step, value, fmt, fn) => {
    const wrap = document.createElement('span'); wrap.style.cssText = 'display:flex;align-items:center;gap:8px';
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value });
    input.style.cssText = 'width:110px;cursor:pointer';
    const out = document.createElement('output'); out.style.cssText = 'min-width:40px;font-variant-numeric:tabular-nums';
    out.textContent = fmt(+value);
    input.oninput = () => { out.textContent = fmt(+input.value); fn(+input.value); };
    wrap.append(input, out); row(label, wrap);
  };

  toggle('Surfaces', s.surfacesVisible, cube.setSurfacesVisible);
  const color = Object.assign(document.createElement('input'), { type: 'color', value: s.surfaceColor });
  color.style.cssText = 'width:56px;height:30px;padding:2px;border:1px solid #bdbab3;border-radius:6px;background:#fff;cursor:pointer';
  color.oninput = () => cube.setSurfaceColor(color.value);
  row('Color', color);
  slider('Opacity', 0, 100, 1, Math.round(s.surfaceOpacity * 100), (v) => v + '%', (v) => cube.setSurfaceOpacity(v / 100));
  toggle('Grids', s.gridsVisible, cube.setGridsVisible);
  slider('Icon scale', 0.25, 2, 0.05, s.iconScale, (v) => v.toFixed(2) + '×', cube.setIconScale);
  row('Icons', button('Randomize', cube.randomizeIcons));
  row('Numbers', button('Randomize', cube.randomizeNumbers));
  row('Collages', button('Randomize', cube.randomizeCollages));
  row('Maps', button('Randomize', cube.randomizeMaps));
  row('Pills', button('Randomize', cube.randomizePills));
  slider('Zoom', 0.5, 3, 0.05, s.zoom, (v) => v.toFixed(2) + '×', cube.setZoom);
  slider('Auto rotate', 0, 4, 0.05, s.spinSpeed, (v) => v.toFixed(2) + '×', cube.setSpinSpeed);
  slider('Tilt', -45, 45, 1, s.tilt, (v) => (v > 0 ? 'R ' : v < 0 ? 'L ' : '') + Math.abs(v) + '°', cube.setTilt);
  slider('Layer gap', 0, 60, 1, s.layerGap, (v) => v + 'pt', cube.setLayerGap);
  slider('Scroll gap', 0, 120, 1, s.scrollLayerGap, (v) => v + 'pt', cube.setScrollLayerGap);
  const copy = button('Copy settings', async () => {
    await navigator.clipboard.writeText(JSON.stringify(cube.getSettings(), null, 2));
    copy.textContent = 'Copied'; setTimeout(() => (copy.textContent = 'Copy settings'), 1200);
  });
  copy.style.gridColumn = '1 / -1';
  panel.append(copy);

  document.body.appendChild(panel);
  return () => panel.remove();
}

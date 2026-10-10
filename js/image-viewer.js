// Image viewer: clicking the Project image or the Now Viewing studio photo opens it full-screen.
// Initial size: the image's own resolution and proportions, at most 6 grid columns wide and
// at most the screen height minus a 40px margin top and bottom. From there it can be zoomed
// (wheel, trackpad pinch, touch pinch) and dragged past those limits. A click anywhere closes it.

(() => {
  const ZOOMABLE = "img.section-card__image, video.section-card__image, img.view__photo";
  const MARGIN_Y = 40;
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 12;
  const CLICK_TOLERANCE = 5; // px a pointer may move and still count as a click

  const viewer = document.createElement("dialog");
  viewer.className = "viewer";
  viewer.setAttribute("aria-label", "Image viewer");
  viewer.innerHTML = `
    <div class="viewer__stage"></div>
    <span class="viewer__close" aria-hidden="true">
      <img src="assets/icons/ic-cross-light.svg" width="12" height="12" alt="">
    </span>`;
  document.body.append(viewer);
  const stage = viewer.querySelector(".viewer__stage");

  let media = null;
  let natural = { width: 1, height: 1 };
  const view = { scale: 1, x: 0, y: 0 };

  function cssPx(name, fallback) {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback;
  }

  // Base size: natural resolution, capped at 6 columns wide, then at the screen height
  function fitBaseSize() {
    if (!media) return;
    const col = (innerWidth - 2 * cssPx("--grid-margin", 24) - 11 * cssPx("--grid-gutter", 12)) / 12;
    const maxWidth = col * 6 + cssPx("--grid-gutter", 12) * 5;
    const maxHeight = innerHeight - 2 * MARGIN_Y;
    const ratio = natural.height / natural.width;
    let width = Math.min(natural.width, maxWidth);
    let height = width * ratio;
    if (height > maxHeight) {
      height = maxHeight;
      width = height / ratio;
    }
    media.style.width = `${width}px`;
    media.style.height = `${height}px`;
  }

  function applyView() {
    if (!media) return;
    media.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    // Counter the zoom so the corners always look like the cards' 26px radius
    media.style.setProperty("--viewer-zoom", view.scale);
  }

  // Zoom by `factor` keeping the screen point (clientX, clientY) fixed
  function zoomAt(factor, clientX, clientY) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    const applied = next / view.scale;
    const px = clientX - innerWidth / 2;
    const py = clientY - innerHeight / 2;
    view.x = px - (px - view.x) * applied;
    view.y = py - (py - view.y) * applied;
    view.scale = next;
    applyView();
  }

  function open(source) {
    const isVideo = source.tagName === "VIDEO";
    media = document.createElement(isVideo ? "video" : "img");
    media.className = "viewer__media";
    media.draggable = false;
    if (isVideo) Object.assign(media, { muted: true, loop: true, autoplay: true, playsInline: true });
    else media.alt = source.alt || "";
    Object.assign(view, { scale: 1, x: 0, y: 0 });
    stage.replaceChildren(media);

    const ready = () => {
      natural = isVideo
        ? { width: media.videoWidth || 16, height: media.videoHeight || 9 }
        : { width: media.naturalWidth || 1, height: media.naturalHeight || 1 };
      fitBaseSize();
      applyView();
    };
    media.addEventListener(isVideo ? "loadedmetadata" : "load", ready, { once: true });
    // Cards show web-sized copies; the viewer opens the full-resolution original
    media.src = source.dataset.full || source.currentSrc || source.src;
    if (!isVideo && media.complete) ready();
    viewer.showModal();
  }

  function close() {
    viewer.close();
  }

  viewer.addEventListener("close", () => {
    stage.replaceChildren();
    media = null;
  });

  document.addEventListener("click", (event) => {
    const source = event.target.closest(ZOOMABLE);
    if (source) open(source);
  });

  // Wheel: scroll zooms; trackpad pinch arrives as ctrl+wheel with smaller deltas
  viewer.addEventListener("wheel", (event) => {
    event.preventDefault();
    const speed = event.ctrlKey ? 0.01 : 0.002;
    zoomAt(Math.exp(-event.deltaY * speed), event.clientX, event.clientY);
  }, { passive: false });

  // Pointers: one drags, two pinch. A press that barely moves (and wasn't a pinch) closes.
  const pointers = new Map();
  let travel = 0;
  let pinched = false;
  let lastPinch = null;

  function pinchState() {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  viewer.addEventListener("pointerdown", (event) => {
    viewer.setPointerCapture(event.pointerId);
    if (pointers.size === 0) { travel = 0; pinched = false; }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) { pinched = true; lastPinch = pinchState(); }
  });

  viewer.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    travel += Math.hypot(dx, dy);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      view.x += dx;
      view.y += dy;
      applyView();
    } else if (pointers.size === 2) {
      const now = pinchState();
      view.x += now.x - lastPinch.x;
      view.y += now.y - lastPinch.y;
      zoomAt(now.distance / lastPinch.distance, now.x, now.y);
      lastPinch = now;
    }
  });

  function release(event) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 1) lastPinch = null;
    if (pointers.size === 0 && event.type === "pointerup" && !pinched && travel < CLICK_TOLERANCE) close();
  }
  viewer.addEventListener("pointerup", release);
  viewer.addEventListener("pointercancel", release);

  window.addEventListener("resize", () => { if (viewer.open) fitBaseSize(); });
})();

// Map page: basemap, legend show/hide, directory-number active state, and POI cards.
const BANDUNG = [107.6191, -6.9175];
const { accessToken, style } = window.MAPBOX_CONFIG;

mapboxgl.accessToken = accessToken;

const map = new mapboxgl.Map({
  container: "basemap",
  style,
  center: BANDUNG,
  zoom: 12,
  bearing: 17.9, // horizontal rotation, degrees clockwise from north
  pitch: 57, // vertical tilt, degrees from straight down
  minZoom: 11, // can't zoom out past city level
});

// Right panel: the legend card and the statistics card share the space under the
// top-right controls. Their toggles switch between them; only one shows at a time.
const legend = document.querySelector(".legend");
const legendToggle = document.querySelector(".legend-toggle");
const statsCard = document.querySelector(".stats-card");
const statsToggle = document.querySelector(".stats-toggle");
const RIGHT_PANELS = {
  legend: { card: legend, toggle: legendToggle, name: "legend" },
  stats: { card: statsCard, toggle: statsToggle, name: "Creative Ecosystem statistics" },
};
let rightPanel = "legend";

function setRightPanel(panel) {
  rightPanel = panel;
  for (const [key, { card, toggle, name }] of Object.entries(RIGHT_PANELS)) {
    const shown = key === panel;
    card.hidden = !shown;
    toggle.setAttribute("aria-expanded", String(shown));
    toggle.setAttribute("aria-label", `${shown ? "Hide" : "Show"} ${name}`);
  }
}

legendToggle.addEventListener("click", () => setRightPanel(rightPanel === "legend" ? null : "legend"));
statsToggle.addEventListener("click", () => setRightPanel(rightPanel === "stats" ? null : "stats"));

// Legend show/hide: each row toggles its Mapbox layer(s) listed in data-layers
const EYE_ICONS = `
  <svg class="legend__eye-on" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6s1.8-3.5 5-3.5S11 6 11 6s-1.8 3.5-5 3.5S1 6 1 6Z"/><circle cx="6" cy="6" r="1.5"/></svg>
  <svg class="legend__eye-off" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6s1.8-3.5 5-3.5S11 6 11 6s-1.8 3.5-5 3.5S1 6 1 6Z"/><circle cx="6" cy="6" r="1.5"/><path d="M1.5 1.5l9 9"/></svg>`;

const legendItems = legend.querySelectorAll("button.legend__item");

function applyLayerVisibility(item) {
  const visibility = item.getAttribute("aria-pressed") === "true" ? "visible" : "none";
  for (const id of item.dataset.layers.split(",")) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
    if (visibility === "none" && id === activePoiLayer) closePoiCard();
  }
}

legendItems.forEach((item) => {
  const label = item.querySelector(".legend__label").textContent;
  item.insertAdjacentHTML("beforeend", `<span class="legend__eye" aria-hidden="true">${EYE_ICONS}</span>`);
  item.setAttribute("aria-label", `Show ${label} on map`);

  item.addEventListener("click", () => {
    const shown = item.getAttribute("aria-pressed") !== "true";
    item.setAttribute("aria-pressed", String(shown));
    applyLayerVisibility(item);
    savedLegendState = null;
    syncEcosystemToggle();
  });
});

// Creative Ecosystem eye: hides every legend category (directory numbers stay).
// Turning it back on restores the categories that were showing before.
const ecosystemToggle = document.querySelector(".ecosystem__toggle");
let savedLegendState = null;

function setLegendItem(item, shown) {
  item.setAttribute("aria-pressed", String(shown));
  applyLayerVisibility(item);
}

function syncEcosystemToggle() {
  const anyShown = [...legendItems].some((item) => item.getAttribute("aria-pressed") === "true");
  ecosystemToggle.setAttribute("aria-pressed", String(anyShown));
  ecosystemToggle.setAttribute("aria-label", `${anyShown ? "Hide" : "Show"} creative ecosystem on map`);
}

ecosystemToggle.addEventListener("click", () => {
  const anyShown = ecosystemToggle.getAttribute("aria-pressed") === "true";
  if (anyShown) {
    savedLegendState = [...legendItems].map((item) => item.getAttribute("aria-pressed") === "true");
    legendItems.forEach((item) => setLegendItem(item, false));
  } else {
    const restore = savedLegendState?.some(Boolean) ? savedLegendState : null;
    legendItems.forEach((item, i) => setLegendItem(item, restore ? restore[i] : true));
    savedLegendState = null;
  }
  syncEcosystemToggle();
});

syncEcosystemToggle();

// Re-apply toggles made before the style finished loading
map.on("style.load", () => legendItems.forEach(applyLayerVisibility));

// Directory numbers: clicking one marks it active and fills the directory section cards.
const DIRECTORY_LAYER = "Design Num";

// Active state: a black number drawn over the clicked one. A DOM marker shows
// instantly, whereas re-filtering a map layer waits on a tile rebuild (~1s).
const activeMarkerElement = document.createElement("div");
activeMarkerElement.className = "directory-marker";
const activeMarker = new mapboxgl.Marker({ element: activeMarkerElement });

// The 3D building under the active number takes the style's building "select"
// state (colorBuildingSelect in Mapbox Studio).
const BUILDINGS = { featuresetId: "buildings", importId: "basemap" };
let activePlaceId = null;
let activeLngLat = null;
let activeBuilding = null;

function ringContains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function footprintContains(geometry, point) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates]
    : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  // Inside the outer ring and outside any holes
  return polygons.some(([outer, ...holes]) => ringContains(outer, point) && !holes.some((hole) => ringContains(hole, point)));
}

function clearActiveBuilding() {
  if (activeBuilding) map.setFeatureState(activeBuilding, { select: false });
  activeBuilding = null;
}

// Buildings only render when zoomed in, so this re-runs after each move until one is found.
function selectBuildingUnderActiveDirectory() {
  if (!activeLngLat || activeBuilding) return;
  const point = map.project(activeLngLat);
  const box = [[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]];
  const lngLat = [activeLngLat.lng, activeLngLat.lat];
  const building = map
    .queryRenderedFeatures(box, { target: BUILDINGS })
    .find((feature) => feature.geometry && footprintContains(feature.geometry, lngLat));
  if (!building) return;
  activeBuilding = building;
  map.setFeatureState(building, { select: true });
}

// The style draws directory numbers symbol-z-offset metres above the ground
// (measured on screen: the 3 m Bandung rooftops are not added), so the active
// marker sits at the same height.
function directoryZOffset() {
  const offset = map.getLayer(DIRECTORY_LAYER) && map.getPaintProperty(DIRECTORY_LAYER, "symbol-z-offset");
  return typeof offset === "number" ? offset : 0;
}

function setActiveAltitude(metres) {
  activeMarker.setAltitude(metres);
}

map.on("idle", selectBuildingUnderActiveDirectory);

function setActiveDirectory(placeId, lngLat) {
  clearActiveBuilding();
  activePlaceId = placeId;
  if (placeId === null) {
    activeLngLat = null;
    activeMarker.remove();
    hideStudioPopup();
    return;
  }
  activeLngLat = lngLat;
  activeMarkerElement.textContent = placeId;
  activeMarker.setLngLat(lngLat).addTo(map);
  setActiveAltitude(directoryZOffset());
  selectBuildingUnderActiveDirectory();
}

const directorySections = document.querySelector(".directory-sections");
const aboutCard = document.querySelector(".about-card");
const viewCard = document.querySelector(".view-card");

// Every directory number seen so far (place_id -> { properties, lngLat }), for the
// "Now Viewing" previous/next buttons. The whole city fits in view at the min zoom,
// so all 60 are collected on the first load.
const directoryIndex = new Map();

// Seeded from the bundled dataset (js/directory-data.js) so the list and navigation work
// before the map has loaded; the live Mapbox tileset replaces each entry once it renders.
for (const { latitude, longitude, ...properties } of window.DIRECTORY_DATA ?? []) {
  directoryIndex.set(properties.place_id, { properties, lngLat: { lng: longitude, lat: latitude } });
}
const fromTileset = new Set();

function indexDirectoryFeatures() {
  if (!map.getLayer(DIRECTORY_LAYER)) return;
  for (const feature of map.queryRenderedFeatures({ layers: [DIRECTORY_LAYER] })) {
    const id = feature.properties.place_id;
    if (fromTileset.has(id)) continue;
    fromTileset.add(id);
    const [lng, lat] = feature.geometry.coordinates;
    directoryIndex.set(id, { properties: feature.properties, lngLat: { lng, lat } });
  }
}

map.on("idle", indexDirectoryFeatures);

// Idle-state list of every studio (top-left); a row opens that directory number
const listCard = document.querySelector(".list-card");
const directoryList = createDirectoryList(listCard, { onSelect: (placeId) => activateDirectory(placeId) });
let listedFromTileset = -1;
const refreshList = () => directoryList.setEntries([...directoryIndex.values()].map((entry) => entry.properties));
refreshList();

map.on("idle", () => {
  if (fromTileset.size === listedFromTileset) return;
  listedFromTileset = fromTileset.size;
  refreshList();
});

// Previous/next by place_id, wrapping around the ends
function directoryNeighbors(placeId) {
  const ids = [...directoryIndex.keys()].sort((a, b) => a - b);
  const i = ids.indexOf(placeId);
  if (i === -1 || ids.length < 2) return {};
  const pick = (id) => ({ id, name: directoryIndex.get(id).properties.name });
  return { _prev: pick(ids[(i - 1 + ids.length) % ids.length]), _next: pick(ids[(i + 1) % ids.length]) };
}

// The right panel (legend / statistics) makes way for the about card while a directory
// number is active. Either can still be opened; closing the directory restores it.
let rightPanelBeforeDirectory;

function openDirectorySections(properties) {
  if (rightPanelBeforeDirectory === undefined) {
    rightPanelBeforeDirectory = rightPanel;
    setRightPanel(null);
  }
  const props = { ...properties, ...directoryNeighbors(properties.place_id) };
  // Top cards update straight away. Rendering needs the about card visible so
  // "Read More" can measure the paragraph.
  aboutCard.hidden = false;
  viewCard.hidden = false;
  listCard.hidden = true;
  renderDirectorySections(document.querySelector(".map-overlay"), props);
  [aboutCard, viewCard].forEach((card) => { card.scrollTop = 0; });
  loadBottomCards(props);
  fitViewPhoto();
}

// Bottom cards: quick fade-out while loading, swap content once invisible, then float
// up + fade in (staggered) after the camera lands and the studio pop-up has appeared.
let bottomCardsRenderTimer = null;
let bottomCardsRevealTimer = null;

function renderBottomCards(props) {
  renderDirectorySections(directorySections, props);
  directorySections.querySelectorAll(".section-card").forEach((card) => { card.scrollTop = 0; });
  fitViewPhoto();
}

function loadBottomCards(props) {
  clearTimeout(bottomCardsRenderTimer);
  clearTimeout(bottomCardsRevealTimer);
  const wasShown = !directorySections.hidden && !directorySections.classList.contains("is-leaving");
  directorySections.classList.remove("is-leaving");
  directorySections.classList.add("is-loading");
  directorySections.hidden = false;
  if (wasShown) {
    bottomCardsRenderTimer = setTimeout(() => renderBottomCards(props), CARDS_EXIT_MS);
  } else {
    renderBottomCards(props);
  }
}

// Shuffled stagger: each card gets a distinct delay (0, 1, 2, 3 × stagger) in random order
function revealBottomCards() {
  const cards = [...directorySections.querySelectorAll(".section-card")];
  const slots = cards.map((_, i) => i).sort(() => Math.random() - 0.5);
  cards.forEach((card, i) => card.style.setProperty("--enter-delay", `${slots[i] * CARDS_STAGGER_MS}ms`));
  directorySections.classList.remove("is-loading");
}

function hideBottomCards() {
  clearTimeout(bottomCardsRenderTimer);
  clearTimeout(bottomCardsRevealTimer);
  if (directorySections.hidden) return;
  directorySections.classList.remove("is-loading");
  directorySections.classList.add("is-leaving");
  bottomCardsRenderTimer = setTimeout(() => {
    directorySections.hidden = true;
    directorySections.classList.remove("is-leaving");
  }, CARDS_EXIT_MS);
}

function closeDirectory() {
  setActiveDirectory(null);
  hideBottomCards();
  aboutCard.hidden = true;
  viewCard.hidden = true;
  listCard.hidden = false;
  if (rightPanelBeforeDirectory !== undefined) {
    setRightPanel(rightPanelBeforeDirectory);
    rightPanelBeforeDirectory = undefined;
  }
}

// Active state camera: centered on the directory number, zoom 20, 55° tilt
const ACTIVE_CAMERA = { zoom: 20, pitch: 55 };

// Studio pop-up shown once the camera has arrived. Its 24px anchor box is centered on the
// directory number (same point and altitude as the active marker); the logo + name sit
// to the lower right and the primary services stack to the upper left.
const studioPopupElement = document.createElement("div");
studioPopupElement.className = "studio-popup";
const studioPopup = new mapboxgl.Marker({ element: studioPopupElement, anchor: "center" });

// Motion timings live in style.css (:root); read them here so JS waits line up
const cssMs = (name, fallback) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback;
const POPUP_MS = cssMs("--popup-duration", 200);
const CHIP_INTERVAL_MIN_MS = cssMs("--popup-chip-interval-min", 40);
const CHIP_INTERVAL_MAX_MS = cssMs("--popup-chip-interval-max", 110);
let studioPopupChipSpan = 0; // ms between the first and last service chip starting
const CARDS_EXIT_MS = cssMs("--cards-exit-duration", 150);
const CARDS_STAGGER_MS = cssMs("--cards-enter-stagger", 80);
let studioPopupRemoveTimer = null;

function showStudioPopup(properties, lngLat) {
  clearTimeout(studioPopupRemoveTimer);
  const services = splitList(properties.services_primary);
  const logo = renderAsset(properties.studio_logo, "studio-popup__logo", `${properties.name ?? ""} logo`);
  // Inner wrapper carries the fade-in: Mapbox positions the marker via the root's transform
  studioPopupElement.innerHTML = `
    <div class="studio-popup__body">
      <div class="studio-popup__services">
        ${services.map((service) => `<span class="studio-popup__service">${escapeHtml(service)}</span>`).join("")}
      </div>
      <div class="studio-popup__info">
        ${logo || `<span class="studio-popup__logo" aria-hidden="true"></span>`}
        <span class="studio-popup__name">${escapeHtml(properties.name)}</span>
      </div>
    </div>`;
  // Start collapsed at the center, then let the transition carry it outward
  studioPopupElement.classList.add("studio-popup--collapsed");
  studioPopup.setLngLat(lngLat).setAltitude(directoryZOffset()).addTo(map);
  staggerServiceChips();
  void studioPopupElement.offsetWidth;
  studioPopupElement.classList.remove("studio-popup--collapsed");
}

// Service chips: shuffled order, random intervals; the exit plays the same times reversed
function staggerServiceChips() {
  const stack = studioPopupElement.querySelector(".studio-popup__services");
  const chips = [...stack.querySelectorAll(".studio-popup__service")];
  const order = chips.map((_, i) => i).sort(() => Math.random() - 0.5);
  let delay = 0;
  const delays = [];
  order.forEach((chipIndex, step) => {
    if (step > 0) delay += CHIP_INTERVAL_MIN_MS + Math.random() * (CHIP_INTERVAL_MAX_MS - CHIP_INTERVAL_MIN_MS);
    delays[chipIndex] = delay;
  });
  studioPopupChipSpan = delay;
  chips.forEach((chip, i) => {
    chip.style.setProperty("--chip-shift-y", `${stack.offsetHeight - chip.offsetTop - chip.offsetHeight}px`);
    chip.style.setProperty("--chip-delay", `${Math.round(delays[i])}ms`);
    chip.style.setProperty("--chip-exit-delay", `${Math.round(studioPopupChipSpan - delays[i])}ms`);
  });
}

function hideStudioPopup() {
  if (!studioPopupElement.isConnected) return;
  studioPopupElement.classList.add("studio-popup--collapsed");
  clearTimeout(studioPopupRemoveTimer);
  studioPopupRemoveTimer = setTimeout(() => studioPopup.remove(), POPUP_MS + studioPopupChipSpan);
}

function flyToDirectory(lngLat) {
  hideStudioPopup();
  const placeId = activePlaceId;
  map.flyTo({ center: lngLat, ...ACTIVE_CAMERA, essential: true });
  // Appear after the flight, unless another number (or none) became active meanwhile
  map.once("moveend", () => {
    if (activePlaceId !== placeId) return;
    showStudioPopup(directoryIndex.get(placeId)?.properties ?? {}, lngLat);
    // Bottom cards enter once the pop-up's entrance has finished (timer as a fallback)
    let revealed = false;
    const reveal = () => {
      if (revealed || activePlaceId !== placeId) return;
      revealed = true;
      clearTimeout(bottomCardsRevealTimer);
      revealBottomCards();
    };
    // The pop-up is finished when its last service chip (largest delay) has arrived
    const chips = [...studioPopupElement.querySelectorAll(".studio-popup__service")];
    const lastChip = chips.sort((a, b) => parseFloat(b.style.getPropertyValue("--chip-delay")) - parseFloat(a.style.getPropertyValue("--chip-delay")))[0];
    const finishTarget = lastChip ?? studioPopupElement.querySelector(".studio-popup__body");
    const onFinish = (event) => {
      if (event.target !== finishTarget || event.propertyName !== "opacity") return;
      finishTarget.removeEventListener("transitionend", onFinish);
      reveal();
    };
    finishTarget.addEventListener("transitionend", onFinish);
    clearTimeout(bottomCardsRevealTimer);
    bottomCardsRevealTimer = setTimeout(reveal, (POPUP_MS + studioPopupChipSpan) * 3 + 300); // only if transitionend never fires
  });
}

map.on("click", DIRECTORY_LAYER, (event) => {
  const feature = event.features[0];
  const lngLat = { lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] };

  // Clicking the active number again returns it to idle
  if (feature.properties.place_id === activePlaceId) {
    closeDirectory();
    return;
  }

  setActiveDirectory(feature.properties.place_id, lngLat);
  openDirectorySections(feature.properties);
  flyToDirectory(lngLat);
});

// "Now Viewing" photo height: as tall as it can be while the card ends a grid gutter
// (12px) above the bottom-left card. Re-fit when content, images or the window change.
const websiteCard = document.querySelector('.directory-sections [data-section="website"]');

function fitViewPhoto() {
  const photo = viewCard.querySelector(".view__photo");
  if (!photo || viewCard.hidden || directorySections.hidden) return;
  photo.style.maxHeight = "";
  const gutter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--grid-gutter")) || 12;
  const card = viewCard.getBoundingClientRect();
  const rest = card.height - photo.getBoundingClientRect().height;
  // Use the card's resting position, ignoring its float-up entrance offset
  const shiftY = new DOMMatrixReadOnly(getComputedStyle(websiteCard).transform).m42;
  const limit = websiteCard.getBoundingClientRect().top - shiftY - gutter;
  photo.style.maxHeight = `${Math.max(0, Math.floor(limit - card.top - rest))}px`;
}

viewCard.addEventListener("load", fitViewPhoto, true); // photo finished loading (capture: load doesn't bubble)
new ResizeObserver(fitViewPhoto).observe(websiteCard);
window.addEventListener("resize", fitViewPhoto);

// "Now Viewing" card: Back returns to idle; previous/next fly to that directory number
viewCard.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="back"]')) {
    closeDirectory();
    return;
  }
  const goto = event.target.closest("[data-goto]");
  if (goto) activateDirectory(Number(goto.dataset.goto));
});

// Open a directory number by place_id (list rows, previous/next)
function activateDirectory(placeId) {
  const entry = directoryIndex.get(placeId);
  if (!entry || placeId === activePlaceId) return;
  setActiveDirectory(placeId, entry.lngLat);
  openDirectorySections(entry.properties);
  flyToDirectory(entry.lngLat);
}

// POI cards: the other legend categories (not directory numbers or Design Agency & Firm)
// open a small card stacked over the clicked icon. The card's icon center sits on the
// POI's point, so it replaces the map icon in place.
const POI_ICONS = Object.fromEntries(
  [...legendItems]
    .filter((item) => item.dataset.layers !== "Design")
    .map((item) => [item.dataset.layers, item.querySelector("img").getAttribute("src")]),
);
const POI_LAYERS = Object.keys(POI_ICONS);
// Card icon center from the card's left edge: 1px border + 10px padding + half the 16px icon
const POI_ICON_CENTER_X = 19;

const poiCardElement = document.createElement("div");
poiCardElement.className = "poi-card";
poiCardElement.innerHTML = `
  <img class="poi-card__icon" width="16" height="16" alt="">
  <div class="poi-card__text">
    <p class="poi-card__category"></p>
    <p class="poi-card__name"></p>
  </div>`;
const poiCard = new mapboxgl.Marker({ element: poiCardElement, anchor: "left", offset: [-POI_ICON_CENTER_X, 0] });
let activePoiLayer = null;
let activePoiKey = null;

function openPoiCard(layerId, feature) {
  const { category = "", name = "" } = feature.properties;
  poiCardElement.querySelector(".poi-card__icon").src = POI_ICONS[layerId];
  poiCardElement.querySelector(".poi-card__category").textContent = category;
  poiCardElement.querySelector(".poi-card__name").textContent = name;
  poiCard.setLngLat(feature.geometry.coordinates).addTo(map);
  activePoiLayer = layerId;
  activePoiKey = `${layerId}:${feature.geometry.coordinates.join(",")}`;
}

function closePoiCard() {
  poiCard.remove();
  activePoiLayer = null;
  activePoiKey = null;
}

map.on("click", POI_LAYERS, (event) => {
  // A directory number on top of the same spot wins
  if (map.queryRenderedFeatures(event.point, { layers: [DIRECTORY_LAYER] }).length) return;
  const feature = event.features[0];
  const layerId = feature.layer.id;
  // Clicking the same POI again closes its card
  if (`${layerId}:${feature.geometry.coordinates.join(",")}` === activePoiKey) {
    closePoiCard();
    return;
  }
  openPoiCard(layerId, feature);
});

// Clicking empty map closes whatever is open; clicks on numbers and POIs are handled above.
map.on("click", (event) => {
  const onDirectory = map.queryRenderedFeatures(event.point, { layers: [DIRECTORY_LAYER] }).length > 0;
  const onPoi = map.queryRenderedFeatures(event.point, { layers: POI_LAYERS.filter((id) => map.getLayer(id)) }).length > 0;
  if (!onDirectory && !onPoi) closeDirectory();
  if (!onPoi || onDirectory) closePoiCard();
});

document.addEventListener("keydown", (event) => {
  // An open modal or the image viewer handles Esc itself; leave the map selection alone
  if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
  closeDirectory();
  closePoiCard();
});

// Modals: chart and info controls open them; close via the X, Esc, or a click on the backdrop
document.querySelectorAll("[data-modal]").forEach((button) => {
  button.addEventListener("click", () => document.getElementById(button.dataset.modal).showModal());
});

document.querySelectorAll(".modal").forEach((modal) => {
  modal.querySelector(".modal__close").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close(); // the dialog itself is only hit outside its content
  });
});

for (const layerId of [DIRECTORY_LAYER, ...POI_LAYERS]) {
  map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
}

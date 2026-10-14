// Fills the bottom directory section cards for the active directory number.
// Field names match the dataset columns (see DATASET/01_DD_Data_Agency_NORMALIZED.csv).

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

// Asset codes like "23-pp" resolve to files via js/directory-assets.js
function renderAsset(code, className, alt) {
  const src = window.DIRECTORY_ASSETS?.[code];
  if (!src) return "";
  if (src.endsWith(".mp4")) {
    return `<video class="${className}" src="${escapeHtml(src)}" muted loop autoplay playsinline aria-label="${escapeHtml(alt)}"></video>`;
  }
  const full = window.DIRECTORY_ASSETS_FULL?.[code];
  const fullAttr = full && full !== src ? ` data-full="${escapeHtml(full)}"` : "";
  return `<img class="${className}" src="${escapeHtml(src)}"${fullAttr} alt="${escapeHtml(alt)}" decoding="async">`;
}

function renderProjectSection(props) {
  const link = String(props.project_link ?? "").trim();
  const cta = /^https?:\/\//i.test(link)
    ? `<a class="section-card__cta" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
        Visit Works
        <img src="assets/icons/ic-new-tab.svg" width="12" height="12" alt="">
        <span class="visually-hidden">(opens in a new tab)</span>
      </a>`
    : "";
  const media = renderAsset(props.project_photo, "section-card__image", props.project_name ?? "Project photo");

  return `
    <div class="section-card__inner">
      <div class="section-card__title">
        <h2 class="section-card__name">${escapeHtml(hasValue(props.project_name) ? props.project_name : "—")}</h2>
        <p class="section-card__desc">${escapeHtml(props.project_desc)}</p>
      </div>
      ${media || cta ? `<div class="section-card__media${media ? "" : " section-card__media--no-image"}">${media}${cta}</div>` : ""}
    </div>`;
}

// "a, b, c" -> ["a", "b", "c"]; every non-empty entry becomes one chip
function splitList(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function renderChips(items, modifier) {
  if (!items.length) return `<p class="section-card__empty">—</p>`;
  return `<ul class="chips chips--${modifier}">${items.map((item) => `<li class="chip">${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderPracticesSection(props) {
  // services_all holds codes; labels come from DATASET/AllServices_Code.csv via js/directory-services.js
  const services = splitList(props.services_all).map((code) => window.DIRECTORY_SERVICES?.[code] ?? code);
  const sectors = splitList(props.primary_sector);

  return `
    <div class="section-card__inner">
      <div class="section-card__group">
        <h3 class="section-card__name">Design Fields</h3>
        <p class="section-card__note">Design Fields Covered per Social Media and Website Data.</p>
      </div>
      ${renderChips(services, "services")}
      <div class="section-card__group">
        <h3 class="section-card__name">Primary Industries</h3>
        <p class="section-card__note">Most Industries Covered per Public-Facing Published Works.</p>
      </div>
      ${renderChips(sectors, "sectors")}
    </div>`;
}

function renderFounderSection(props) {
  const name = hasValue(props.founder_name) ? props.founder_name : "—";
  const photo = renderAsset(props.founder_photo, "founder__photo", name);
  const linkedin = String(props.founder_linkedin ?? "").trim();
  const link = /^https?:\/\//i.test(linkedin)
    ? `<a class="founder__linkedin" href="${escapeHtml(linkedin)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(name)} on LinkedIn (opens in a new tab)">
        <img src="assets/icons/ic-linkedin.svg" width="20" height="20" alt="">
      </a>`
    : "";

  return `
    <div class="founder">
      ${photo || `<span class="founder__photo founder__photo--empty" aria-hidden="true"></span>`}
      <div class="founder__text">
        <h2 class="founder__name">${escapeHtml(name)}</h2>
        <p class="founder__role">Founder</p>
      </div>
      ${link}
    </div>`;
}

// Homepage screenshots come from scripts/capture-websites.py ("<place_id>-web");
// sites that could not be captured show a globe placeholder.
function renderWebsiteSection(props) {
  const url = String(props.website ?? "").trim();
  const shot = window.DIRECTORY_ASSETS?.[`${props.place_id}-web`];
  const viewer = shot
    ? `<img class="website__viewer" src="${escapeHtml(shot)}" alt="${escapeHtml(props.name ?? "Studio")} homepage">`
    : `<div class="website__viewer website__viewer--empty" role="img" aria-label="No homepage preview">
        <img src="assets/icons/ic-globe.svg" width="24" height="24" alt="">
      </div>`;
  const cta = /^https?:\/\//i.test(url)
    ? `<a class="section-card__cta" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        Visit Website
        <img src="assets/icons/ic-new-tab.svg" width="12" height="12" alt="">
        <span class="visually-hidden">(opens in a new tab)</span>
      </a>`
    : "";

  return `<div class="website">${viewer}${cta}</div>`;
}

const STYLE_KEYWORDS_HELP = "Keywords are generated automatically by a natural language processing method using each studio’s public social or online profile.";

// Top-right about card: logo, name, year, about + value quote, style keyword chips.
// The about paragraph is clamped to 6 lines; "Read More" appears only if it overflows.
function renderAboutSection(props) {
  const name = hasValue(props.name) ? props.name : "—";
  const logo = renderAsset(props.studio_logo, "about__logo", `${name} logo`);
  const keywords = splitList(props.style_keywords);

  return `
    <div class="about">
      <div class="about__header">
        ${logo || `<span class="about__logo about__logo--empty" aria-hidden="true"></span>`}
        <h2 class="about__name">${escapeHtml(name)}</h2>
        ${hasValue(props.est) ? `<p class="about__est">Est. ${escapeHtml(props.est)}</p>` : ""}
      </div>
      <div class="about__body">
        <div class="about__about">
          <p class="about__text" id="about-text">${escapeHtml(props.about)}</p>
          <button class="about__more" type="button" aria-expanded="false" aria-controls="about-text" hidden>Read More</button>
        </div>
        <img class="about__quote" src="assets/icons/ic-quote.svg" width="12" height="7.744" alt="">
        <p class="about__value">${escapeHtml(props.value)}”</p>
        <div class="about__keywords">
          ${keywords.length ? `<ul class="chips chips--keywords">${keywords.map((k) => `<li class="chip">${escapeHtml(k)}</li>`).join("")}</ul>` : ""}
          <p class="about__keywords-label">Style Key Words</p>
          <span class="about__help" tabindex="0" aria-describedby="about-help-tip">
            <img src="assets/icons/ic-help.svg" width="10" height="10" alt="What are style key words?">
            <span class="about__tooltip" id="about-help-tip" role="tooltip">${STYLE_KEYWORDS_HELP}</span>
          </span>
        </div>
      </div>
    </div>`;
}

// Show "Read More" only when the clamped paragraph actually overflows its 6 lines
function setupAboutReadMore(card) {
  const text = card.querySelector(".about__text");
  const more = card.querySelector(".about__more");
  if (!text || !more) return;
  more.hidden = text.scrollHeight <= text.clientHeight + 1;
  more.addEventListener("click", () => {
    const expanded = card.classList.toggle("about--expanded");
    more.setAttribute("aria-expanded", String(expanded));
    more.textContent = expanded ? "Read Less" : "Read More";
  });
}

// Top-left "Now Viewing" card. props._prev / props._next ({ id, name }) are supplied by map.js.
const SOCIAL_LINKS = [
  { field: "soc_ig", icon: "ic-instagram", label: "Instagram" },
  { field: "soc_beh", icon: "ic-behance", label: "Behance" },
  { field: "soc_lk", icon: "ic-linkedin-sm", label: "LinkedIn" },
];

function renderNumberBadge(id, size) {
  return `<span class="number-badge number-badge--${size}" aria-hidden="true">${escapeHtml(id)}</span>`;
}

function renderViewChip(text, icon, iconWidth, iconHeight) {
  return `<li class="view-chip">${escapeHtml(text)}<span class="view-chip__icon"><img src="assets/icons/${icon}.svg" width="${iconWidth}" height="${iconHeight}" alt=""></span></li>`;
}

function renderNeighborButton(neighbor, direction) {
  if (!neighbor) return "";
  const badge = renderNumberBadge(neighbor.id, "sm");
  const name = `<span class="view-nav__name"><span class="view-nav__label">${direction === "prev" ? "Previous:" : "Next:"}</span> ${escapeHtml(neighbor.name)}</span>`;
  const label = `${direction === "prev" ? "Previous" : "Next"}: ${neighbor.id}, ${neighbor.name}`;
  return `<button class="view-nav__button view-nav__button--${direction}" type="button" data-goto="${escapeHtml(neighbor.id)}" aria-label="${escapeHtml(label)}">
      ${direction === "prev" ? badge + name : name + badge}
    </button>`;
}

function renderViewSection(props) {
  const name = hasValue(props.name) ? props.name : "—";
  const photo = renderAsset(props.studio_photo, "view__photo", `${name} studio`);
  const freelance = String(props.freelance ?? "").trim().toUpperCase() === "Y"
    ? renderViewChip("With Freelances", "ic-check", 10, 10)
    : renderViewChip("No Freelance", "ic-cross", 5.58917, 5.58917);
  const socials = SOCIAL_LINKS
    .filter(({ field }) => /^https?:\/\//i.test(String(props[field] ?? "").trim()))
    .map(({ field, icon, label }) => `<a class="view__social" href="${escapeHtml(String(props[field]).trim())}" target="_blank" rel="noopener noreferrer" aria-label="${label} (opens in a new tab)"><img src="assets/icons/${icon}.svg" width="16" height="16" alt=""></a>`)
    .join("");
  const mapLink = /^https?:\/\//i.test(String(props.gmaps_url ?? "").trim())
    ? `<a class="view__map" href="${escapeHtml(String(props.gmaps_url).trim())}" target="_blank" rel="noopener noreferrer" aria-label="Open in Google Maps (new tab)"><img src="assets/icons/ic-map.svg" width="10.049" height="11.9994" alt=""></a>`
    : `<span class="view__map" aria-hidden="true"><img src="assets/icons/ic-map.svg" width="10.049" height="11.9994" alt=""></span>`;

  return `
    <div class="view__header">
      <p class="view__now">Now Viewing</p>
    </div>
    <div class="view__content">
      <div class="view__studio">
        ${renderNumberBadge(props.place_id, "lg")}
        <div class="view__title">
          <h2 class="view__name">${escapeHtml(name)}</h2>
          <div class="view__meta">
            ${hasValue(props.est) ? `<p class="view__est">Est. ${escapeHtml(props.est)}</p>` : ""}
            <p class="view__services">${escapeHtml(props.services_primary)}</p>
          </div>
        </div>
      </div>
      <div class="view__details">
        <div class="view__media">
          ${photo || `<div class="view__photo view__photo--empty" aria-hidden="true"></div>`}
          <ul class="view__chips">
            ${hasValue(props.setup) ? renderViewChip(props.setup, "ic-computer", 10, 9.16667) : ""}
            ${hasValue(props.staff_count) ? renderViewChip(`${props.staff_count} Staff`, "ic-people", 10, 10) : ""}
            ${freelance}
          </ul>
        </div>
        <div class="view__contact">
          <div class="view__address-row">
            <p class="view__address">${escapeHtml(props.address)}</p>
            ${mapLink}
          </div>
          <div class="view__links">
            ${socials}
            <p class="view__phone">${hasValue(props.phone) ? escapeHtml(props.phone) : "N/A"}</p>
          </div>
        </div>
      </div>
    </div>
    <nav class="view-nav" aria-label="Browse directory">
      ${renderNeighborButton(props._prev, "prev")}
      ${renderNeighborButton(props._next, "next")}
    </nav>`;
}

const SECTION_RENDERERS = {
  view: renderViewSection,
  about: renderAboutSection,
  project: renderProjectSection,
  practices: renderPracticesSection,
  founder: renderFounderSection,
  website: renderWebsiteSection,
};

function renderDirectorySections(container, props) {
  container.querySelectorAll("[data-section]").forEach((card) => {
    const render = SECTION_RENDERERS[card.dataset.section];
    if (!render) return;
    card.classList.remove("about--expanded");
    card.innerHTML = render(props);
    if (card.dataset.section === "about") setupAboutReadMore(card);
  });
}

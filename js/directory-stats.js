// Statistics card charts. renderFoundingHistogram(container, studios) draws studios per
// founding year as stacks of the Design Agency & Firm icon (one icon per studio), with a
// faint bar behind each stack and its count on top. Hovering, focusing or tapping a year
// lists the studios founded then.

const HISTOGRAM_FIRST_YEAR = 2010;
const HISTOGRAM_LAST_YEAR = 2026;

function foundingBins(studios) {
  const bins = [{ label: `< ${HISTOGRAM_FIRST_YEAR}`, test: (y) => y < HISTOGRAM_FIRST_YEAR, studios: [] }];
  for (let year = HISTOGRAM_FIRST_YEAR; year <= HISTOGRAM_LAST_YEAR; year++) {
    bins.push({ label: String(year), test: (y) => y === year, studios: [] });
  }
  for (const studio of studios) {
    const year = Number(studio.est);
    const bin = Number.isFinite(year) && year > 0 ? bins.find((b) => b.test(year)) : null;
    if (bin) bin.studios.push(studio);
  }
  for (const bin of bins) bin.studios.sort((a, b) => a.place_id - b.place_id);
  return bins;
}

function renderFoundingHistogram(container, studios) {
  const bins = foundingBins(studios);
  // Skip redrawing when nothing changed (keeps an open hover in place)
  const signature = bins.map((b) => b.studios.map((s) => `${s.place_id}:${s.name}`).join("|")).join("/");
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  const max = Math.max(1, ...bins.map((b) => b.studios.length));
  const icon = `<img class="histogram__icon" src="assets/legend/ic-design.svg" width="16" height="16" alt="">`;

  container.innerHTML = `
    <figure class="histogram" style="--max: ${max}">
      <figcaption class="histogram__caption">
        <h3 class="histogram__title">Founding Years of Design Studios</h3>
        <p class="histogram__note">Studios by year established. Hover a year to see who.</p>
      </figcaption>
      <div class="histogram__plot">
        ${bins.map((bin, i) => `
          <button class="histogram__column" type="button" data-bin="${i}"
                  aria-label="${escapeHtml(bin.label)}: ${bin.studios.length} studio${bin.studios.length === 1 ? "" : "s"}">
            <span class="histogram__count">${bin.studios.length || ""}</span>
            <span class="histogram__bar" style="--n: ${bin.studios.length}">
              ${icon.repeat(bin.studios.length)}
            </span>
            <span class="histogram__year">${escapeHtml(bin.label)}</span>
          </button>`).join("")}
        <div class="histogram__tooltip" role="tooltip" hidden></div>
      </div>
      <table class="visually-hidden">
        <caption>Studios by founding year</caption>
        <thead><tr><th scope="col">Year</th><th scope="col">Studios</th><th scope="col">Names</th></tr></thead>
        <tbody>
          ${bins.map((bin) => `<tr><th scope="row">${escapeHtml(bin.label)}</th><td>${bin.studios.length}</td><td>${bin.studios.map((s) => escapeHtml(s.name)).join(", ")}</td></tr>`).join("")}
        </tbody>
      </table>
    </figure>`;

  const plot = container.querySelector(".histogram__plot");
  const tooltip = container.querySelector(".histogram__tooltip");

  function show(column) {
    const bin = bins[Number(column.dataset.bin)];
    tooltip.innerHTML = `
      <p class="histogram__tooltip-title">${escapeHtml(bin.label)} · ${bin.studios.length} studio${bin.studios.length === 1 ? "" : "s"}</p>
      ${bin.studios.length
        ? `<ul>${bin.studios.map((s) => `<li><span class="histogram__tooltip-id">${escapeHtml(s.place_id)}</span>${escapeHtml(s.name)}</li>`).join("")}</ul>`
        : `<p class="histogram__tooltip-empty">No studios founded this year</p>`}`;
    tooltip.hidden = false;
    // Beside the column (right of it in the left half, left of it in the right half),
    // inside the plot so the card never clips it
    const plotBox = plot.getBoundingClientRect();
    const colBox = column.getBoundingClientRect();
    const scale = plotBox.width / plot.offsetWidth || 1; // screen px per CSS px (UI scale)
    const colLeft = (colBox.left - plotBox.left) / scale;
    const colRight = (colBox.right - plotBox.left) / scale;
    const width = tooltip.offsetWidth;
    const inLeftHalf = colLeft + (colRight - colLeft) / 2 < plot.offsetWidth / 2;
    const left = inLeftHalf ? colRight + 6 : colLeft - width - 6;
    tooltip.style.left = `${Math.min(Math.max(0, left), plot.offsetWidth - width)}px`;
    plot.querySelectorAll(".histogram__column").forEach((c) => c.classList.toggle("is-active", c === column));
  }

  function hide() {
    tooltip.hidden = true;
    plot.querySelectorAll(".histogram__column.is-active").forEach((c) => c.classList.remove("is-active"));
  }

  plot.addEventListener("pointerover", (event) => {
    const column = event.target.closest(".histogram__column");
    if (column) show(column);
  });
  plot.addEventListener("pointerleave", hide);
  plot.addEventListener("focusin", (event) => {
    const column = event.target.closest(".histogram__column");
    if (column) show(column);
  });
  plot.addEventListener("focusout", (event) => {
    if (!plot.contains(event.relatedTarget)) hide();
  });
}

// Idle-state directory list (top-left card): every studio, filterable by design field
// (services_primary),
// sortable, and searchable by name. Clicking a row hands its place_id to onSelect.

const DEFAULT_SORT = "id-asc";

const LIST_SORTS = {
  "id-asc": { label: "1 - 60", compare: (a, b) => a.place_id - b.place_id },
  "id-desc": { label: "60 - 1", compare: (a, b) => b.place_id - a.place_id },
  "name-asc": { label: "A - Z", compare: (a, b) => String(a.name).localeCompare(String(b.name)) },
  "name-desc": { label: "Z - A", compare: (a, b) => String(b.name).localeCompare(String(a.name)) },
  "est-desc": { label: "Newest", compare: (a, b) => (Number(b.est) || 0) - (Number(a.est) || 0) || a.place_id - b.place_id },
  "est-asc": { label: "Oldest", compare: (a, b) => (Number(a.est) || 9999) - (Number(b.est) || 9999) || a.place_id - b.place_id },
};

// Design fields come from the services_primary column (comma separated)
function designFields(props) {
  return splitList(props.services_primary);
}

function createDirectoryList(root, { onSelect }) {
  const state = { entries: [], field: "", sort: DEFAULT_SORT, query: "" };
  const header = root.querySelector(".list__header");
  const items = root.querySelector(".list__items");
  const fieldTrigger = root.querySelector('[data-list="field"]');
  const fieldText = root.querySelector('[data-list="field-text"]');
  const fieldClear = root.querySelector('[data-list="field-clear"]');
  const sortTrigger = root.querySelector('[data-list="sort"]');
  const sortText = root.querySelector('[data-list="sort-text"]');
  const sortClear = root.querySelector('[data-list="sort-clear"]');
  const searchToggle = root.querySelector('[data-list="search-toggle"]');
  const searchInput = root.querySelector('[data-list="search"]');

  const fieldDropdown = createDropdown(fieldTrigger, {
    label: "Filter by design field",
    options: [{ value: "", label: "All Design Field", divider: true }],
    value: state.field,
    onChange: (value) => { state.field = value; render(); },
    maxHeight: 240,
  });
  const sortDropdown = createDropdown(sortTrigger, {
    label: "Sort studios",
    options: Object.entries(LIST_SORTS).map(([value, { label }]) => ({ value, label })),
    value: state.sort,
    onChange: (value) => { state.sort = value; render(); },
  });

  function buildFieldOptions() {
    const fields = [...new Set(state.entries.flatMap(designFields))].sort((a, b) => a.localeCompare(b));
    if (!fields.includes(state.field)) state.field = "";
    fieldDropdown.setOptions([{ value: "", label: "All Design Field", divider: true }, ...fields.map((field) => ({ value: field, label: field }))]);
  }

  function render() {
    const query = state.query.trim().toLowerCase();
    const rows = state.entries
      .filter((props) => !state.field || designFields(props).includes(state.field))
      .filter((props) => !query || String(props.name ?? "").toLowerCase().includes(query))
      .sort(LIST_SORTS[state.sort].compare);

    fieldText.textContent = state.field || "All Design Field";
    // A non-default filter or sort swaps that pill's dropdown arrow for a clear (×) button
    showClear(fieldClear, Boolean(state.field));
    showClear(sortClear, state.sort !== DEFAULT_SORT);
    // Keep each dropdown's selected option in step with the list state
    fieldDropdown.setValue(state.field);
    sortDropdown.setValue(state.sort);
    sortText.textContent = `Sort by: ${LIST_SORTS[state.sort].label}`;
    items.innerHTML = rows.length
      ? rows.map((props) => `
        <li>
          <button class="list__row" type="button" data-place-id="${escapeHtml(props.place_id)}">
            ${renderNumberBadge(props.place_id, "lg")}
            <span class="view__title">
              <span class="view__name">${escapeHtml(props.name ?? "—")}</span>
              <span class="view__meta">
                ${hasValue(props.est) ? `<span class="view__est">Est. ${escapeHtml(props.est)}</span>` : ""}
                <span class="view__services">${escapeHtml(props.services_primary)}</span>
              </span>
            </span>
          </button>
        </li>`).join("")
      : `<li class="list__empty">No studios match.</li>`;
  }

  function showClear(button, active) {
    button.hidden = !active;
    button.parentElement.querySelector(".list__arrow").hidden = active;
  }

  function setSearching(searching) {
    header.classList.toggle("is-searching", searching);
    searchToggle.setAttribute("aria-expanded", String(searching));
    searchToggle.setAttribute("aria-label", searching ? "Close search" : "Search studios");
    if (searching) {
      searchInput.focus();
    } else {
      searchInput.value = "";
      state.query = "";
      render();
    }
  }

  fieldClear.addEventListener("click", () => {
    state.field = "";
    render();
    fieldTrigger.focus();
  });
  sortClear.addEventListener("click", () => {
    state.sort = DEFAULT_SORT;
    render();
    sortTrigger.focus();
  });
  searchToggle.addEventListener("click", () => setSearching(!header.classList.contains("is-searching")));
  searchInput.addEventListener("input", () => { state.query = searchInput.value; render(); });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setSearching(false);
      searchToggle.focus();
    }
  });
  items.addEventListener("click", (event) => {
    const row = event.target.closest(".list__row");
    if (row) onSelect(Number(row.dataset.placeId));
  });

  return {
    setEntries(entries) {
      state.entries = entries;
      buildFieldOptions();
      render();
    },
  };
}

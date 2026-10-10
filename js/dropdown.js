// Dropdown card (Figma "drop-down"): replaces native <select> menus.
// createDropdown(trigger, { label, options: [{ value, label, divider? }], value, onChange, maxHeight? })
// An option with divider: true gets a stroke under it; maxHeight (px) caps the card, which scrolls.
// opens a listbox card under the trigger. It lives on <body> (position: fixed) so cards
// with overflow: hidden don't clip it. Keyboard: arrows, Home/End, Enter/Space, Esc, type-ahead.

let openDropdown = null; // only one open at a time

function createDropdown(trigger, { label, options, value, onChange, maxHeight = Infinity }) {
  const id = `dropdown-${Math.random().toString(36).slice(2, 8)}`;
  const card = document.createElement("ul");
  card.className = "dropdown";
  card.id = id;
  card.setAttribute("role", "listbox");
  card.setAttribute("aria-label", label);
  card.hidden = true;
  document.body.append(card);

  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", id);

  let state = { options, value };
  let activeIndex = -1;

  function render() {
    card.innerHTML = state.options.map((option, i) => `
      <li class="dropdown__option" id="${id}-${i}" role="option" data-index="${i}"
          aria-selected="${option.value === state.value}">${escapeHtml(option.label)}</li>
      ${option.divider ? `<li class="dropdown__divider" role="separator"></li>` : ""}`).join("");
  }

  function setActive(index) {
    const items = card.querySelectorAll(".dropdown__option");
    if (!items.length) return;
    activeIndex = (index + items.length) % items.length;
    items.forEach((item, i) => item.classList.toggle("is-active", i === activeIndex));
    items[activeIndex].scrollIntoView({ block: "nearest" });
    card.setAttribute("aria-activedescendant", items[activeIndex].id);
  }

  function position() {
    const rect = trigger.getBoundingClientRect();
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.bottom + 4}px`;
    card.style.minWidth = `${rect.width}px`;
    card.style.maxHeight = `${Math.min(maxHeight, Math.max(120, innerHeight - rect.bottom - 4 - 24))}px`;
  }

  function open() {
    if (openDropdown && openDropdown !== api) openDropdown.close();
    render();
    card.hidden = false;
    position();
    trigger.setAttribute("aria-expanded", "true");
    setActive(Math.max(0, state.options.findIndex((o) => o.value === state.value)));
    card.focus({ preventScroll: true });
    openDropdown = api;
  }

  function close({ returnFocus = false } = {}) {
    if (card.hidden) return;
    card.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    card.removeAttribute("aria-activedescendant");
    if (openDropdown === api) openDropdown = null;
    if (returnFocus) trigger.focus();
  }

  function choose(index) {
    const option = state.options[index];
    if (!option) return;
    close({ returnFocus: true });
    if (option.value !== state.value) {
      state.value = option.value;
      onChange(option.value);
    }
  }

  card.tabIndex = -1;
  trigger.addEventListener("click", () => (card.hidden ? open() : close()));
  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      open();
    }
  });
  card.addEventListener("click", (event) => {
    const item = event.target.closest(".dropdown__option");
    if (item) choose(Number(item.dataset.index));
  });
  card.addEventListener("mousemove", (event) => {
    const item = event.target.closest(".dropdown__option");
    if (item && Number(item.dataset.index) !== activeIndex) setActive(Number(item.dataset.index));
  });
  card.addEventListener("keydown", (event) => {
    const last = state.options.length - 1;
    const keys = {
      ArrowDown: () => setActive(activeIndex + 1),
      ArrowUp: () => setActive(activeIndex - 1),
      Home: () => setActive(0),
      End: () => setActive(last),
      Enter: () => choose(activeIndex),
      " ": () => choose(activeIndex),
      Escape: () => close({ returnFocus: true }),
      Tab: () => close(),
    };
    if (keys[event.key]) {
      if (event.key !== "Tab") event.preventDefault();
      event.stopPropagation(); // keep Esc from also closing map selections
      keys[event.key]();
      return;
    }
    // Type-ahead: jump to the next option starting with the typed character
    if (event.key.length === 1) {
      const char = event.key.toLowerCase();
      const order = state.options.map((_, i) => (activeIndex + 1 + i) % state.options.length);
      const match = order.find((i) => state.options[i].label.toLowerCase().startsWith(char));
      if (match !== undefined) setActive(match);
    }
  });

  const api = {
    open,
    close,
    setOptions(nextOptions) { state.options = nextOptions; if (!card.hidden) render(); },
    setValue(nextValue) { state.value = nextValue; if (!card.hidden) render(); },
    contains: (node) => card.contains(node) || trigger.contains(node),
  };
  return api;
}

// Close on outside click, scroll or resize
document.addEventListener("pointerdown", (event) => {
  if (openDropdown && !openDropdown.contains(event.target)) openDropdown.close();
}, true);
window.addEventListener("resize", () => openDropdown?.close());
document.addEventListener("scroll", (event) => {
  if (openDropdown && !openDropdown.contains(event.target)) openDropdown.close();
}, true);

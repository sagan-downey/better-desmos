interface Dropdown {
  select: HTMLSelectElement;
  button: HTMLButtonElement;
  popup: HTMLDivElement;
  active: number;
  search: string;
  searchTime: number;
}

const dropdowns = new WeakMap<HTMLSelectElement, Dropdown>();
let opened: Dropdown | undefined;
let nextId = 1;

function enabledOptions(dropdown: Dropdown): HTMLOptionElement[] {
  return [...dropdown.select.options].filter((option) => !option.hidden && !option.disabled &&
    !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled));
}

function closeDropdown(): void {
  if (!opened) return;
  const dropdown = opened;
  opened = undefined;
  dropdown.popup.hidePopover();
  dropdown.button.setAttribute("aria-expanded", "false");
  dropdown.button.removeAttribute("aria-activedescendant");
}

function positionPopup(dropdown: Dropdown): void {
  const bounds = dropdown.button.getBoundingClientRect();
  const popup = dropdown.popup;
  const margin = 8;
  const below = window.innerHeight - bounds.bottom - margin - 4;
  const above = bounds.top - margin - 4;
  const height = Math.min(300, Math.max(below, above));
  popup.style.maxHeight = `${Math.max(40, height)}px`;
  popup.style.width = `${Math.min(Math.max(bounds.width, 180), window.innerWidth - margin * 2)}px`;
  popup.style.left = `${Math.max(margin, Math.min(bounds.left, window.innerWidth - popup.offsetWidth - margin))}px`;
  popup.style.top = `${below >= Math.min(300, popup.scrollHeight) || below >= above
    ? bounds.bottom + 4 : Math.max(margin, bounds.top - popup.offsetHeight - 4)}px`;
}

function setActive(dropdown: Dropdown, index: number): void {
  const options = enabledOptions(dropdown);
  dropdown.active = Math.max(0, Math.min(index, options.length - 1));
  const active = options[dropdown.active];
  for (const element of dropdown.popup.querySelectorAll<HTMLElement>("[role=option]")) {
    const matches = active && element.dataset.index === String(active.index);
    element.classList.toggle("dropdown-active", Boolean(matches));
    if (matches) {
      dropdown.button.setAttribute("aria-activedescendant", element.id);
      const top = element.offsetTop;
      const bottom = top + element.offsetHeight;
      if (top < dropdown.popup.scrollTop) dropdown.popup.scrollTop = top;
      else if (bottom > dropdown.popup.scrollTop + dropdown.popup.clientHeight) {
        dropdown.popup.scrollTop = bottom - dropdown.popup.clientHeight;
      }
    }
  }
}

function choose(dropdown: Dropdown): void {
  const option = enabledOptions(dropdown)[dropdown.active];
  if (!option) return;
  const changed = dropdown.select.selectedIndex !== option.index;
  dropdown.select.selectedIndex = option.index;
  closeDropdown();
  dropdown.button.focus();
  if (changed) {
    dropdown.select.dispatchEvent(new Event("input", { bubbles: true }));
    dropdown.select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  refreshDropdowns();
}

function openDropdown(dropdown: Dropdown): void {
  if (dropdown.button.disabled) return;
  closeDropdown();
  refreshDropdown(dropdown);
  dropdown.popup.replaceChildren();
  let previousGroup: Element | null = null;
  for (const option of dropdown.select.options) {
    if (option.hidden) continue;
    const group = option.parentElement;
    if (group instanceof HTMLOptGroupElement && group !== previousGroup) {
      const heading = document.createElement("div");
      heading.className = "dropdown-group";
      heading.textContent = group.label;
      dropdown.popup.append(heading);
    }
    previousGroup = group;
    const element = document.createElement("div");
    element.id = `${dropdown.popup.id}-option-${option.index}`;
    element.className = "dropdown-option";
    element.setAttribute("role", "option");
    element.setAttribute("aria-selected", String(option.selected));
    const disabled = option.disabled || (group instanceof HTMLOptGroupElement && group.disabled);
    element.setAttribute("aria-disabled", String(disabled));
    element.dataset.index = String(option.index);
    element.textContent = option.label || dropdown.select.getAttribute("aria-label") || "Choose an option";
    element.addEventListener("pointermove", () => {
      if (!disabled) setActive(dropdown, enabledOptions(dropdown).indexOf(option));
    });
    element.addEventListener("pointerdown", (event) => event.preventDefault());
    element.addEventListener("click", (event) => {
      event.preventDefault();
      if (disabled) return;
      dropdown.active = enabledOptions(dropdown).indexOf(option);
      choose(dropdown);
    });
    dropdown.popup.append(element);
  }
  opened = dropdown;
  dropdown.search = "";
  dropdown.popup.showPopover();
  positionPopup(dropdown);
  dropdown.button.setAttribute("aria-expanded", "true");
  setActive(dropdown, enabledOptions(dropdown).findIndex((option) => option.selected));
}

function refreshDropdown(dropdown: Dropdown): void {
  const { select, button } = dropdown;
  button.textContent = select.selectedOptions[0]?.label || select.getAttribute("aria-label") || "Choose an option";
  button.disabled = select.disabled;
  if (select.hasAttribute("aria-label")) button.setAttribute("aria-label", select.getAttribute("aria-label")!);
}

function enhanceDropdown(select: HTMLSelectElement): void {
  if (select.multiple || select.size > 1) return;
  const existing = dropdowns.get(select);
  if (existing) {
    refreshDropdown(existing);
    return;
  }
  const wrapper = document.createElement("span");
  wrapper.className = "themed-select";
  const button = document.createElement("button");
  button.type = "button";
  button.className = `themed-select-trigger ${select.className}`;
  button.id = `dropdown-trigger-${nextId++}`;
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  const popup = document.createElement("div");
  popup.id = `${button.id}-list`;
  popup.className = "dropdown-popup";
  popup.popover = "manual";
  popup.setAttribute("role", "listbox");
  button.setAttribute("aria-controls", popup.id);
  const labels = [...select.labels ?? []];
  const labelIds = labels.map((label, index) => {
    label.id ||= `${button.id}-label-${index}`;
    label.htmlFor = button.id;
    return label.id;
  });
  if (!select.hasAttribute("aria-label") && labelIds.length) {
    button.setAttribute("aria-labelledby", labelIds.join(" "));
    popup.setAttribute("aria-labelledby", labelIds.join(" "));
  } else {
    popup.setAttribute("aria-label", select.getAttribute("aria-label") || "Options");
  }
  const dropdown: Dropdown = { select, button, popup, active: 0, search: "", searchTime: 0 };
  dropdowns.set(select, dropdown);
  select.before(wrapper);
  wrapper.append(select, button, popup);
  select.hidden = true;
  select.addEventListener("change", () => refreshDropdown(dropdown));
  button.addEventListener("click", () => opened === dropdown ? closeDropdown() : openDropdown(dropdown));
  button.addEventListener("keydown", (event) => {
    const isOpen = opened === dropdown;
    const options = enabledOptions(dropdown);
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeDropdown();
    } else if (event.key === "Tab") {
      closeDropdown();
    } else if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (!isOpen) {
        openDropdown(dropdown);
        if (event.key === "Home") setActive(dropdown, 0);
        if (event.key === "End" || event.key === "ArrowUp") setActive(dropdown, options.length - 1);
      } else if (event.key === "Enter" || event.key === " ") {
        choose(dropdown);
      } else {
        setActive(dropdown, event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 :
          dropdown.active + (event.key === "ArrowDown" ? 1 : -1));
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!isOpen) openDropdown(dropdown);
      const now = performance.now();
      dropdown.search = now - dropdown.searchTime > 700 ? event.key : dropdown.search + event.key;
      dropdown.searchTime = now;
      const search = dropdown.search.toLowerCase();
      const index = options.findIndex((option) => option.label.toLowerCase().startsWith(search));
      if (index >= 0) setActive(dropdown, index);
    }
  });
  button.addEventListener("blur", () => {
    if (opened === dropdown) closeDropdown();
  });
  refreshDropdown(dropdown);
}

export function refreshDropdowns(): void {
  if (opened && (!opened.button.isConnected || opened.select.disabled)) closeDropdown();
  for (const select of document.querySelectorAll<HTMLSelectElement>("select")) enhanceDropdown(select);
}

document.addEventListener("pointerdown", (event) => {
  if (opened && event.target instanceof Node && !opened.button.contains(event.target) &&
      !opened.popup.contains(event.target)) closeDropdown();
}, true);
document.addEventListener("scroll", (event) => {
  if (opened && event.target !== opened.popup) closeDropdown();
}, true);
document.addEventListener("close", closeDropdown, true);
window.addEventListener("resize", closeDropdown);

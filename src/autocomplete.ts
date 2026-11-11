import { COLLECTION_FUNCTIONS } from "./collections";
import { FUNCTION_REFERENCE } from "./functionReference";
import { BUILTIN_NAMES } from "./math";

const descriptions = new Map(FUNCTION_REFERENCE.flatMap((category) => category.entries.flatMap((entry) =>
  [entry.name, ...(entry.aliases ?? [])].map((name) => [name, entry] as const))));
const graphSignatures = new Map([
  ["polygon", "polygon((x1,y1), (x2,y2), ...)"],
  ["list", "list(value1, value2, ...)"],
  ["parametric", "parametric(x(t), y(t), start, end)"],
  ["polar", "polar(radius, startAngle, endAngle)"],
  ["derivative", "derivative(expression)"],
  ["integral", "integral(expression, start, end)"],
]);
const names = [...new Set([...BUILTIN_NAMES, ...COLLECTION_FUNCTIONS, ...graphSignatures.keys()])].sort();

export function functionCompletions(text: string, caret: number): { start: number; end: number; names: string[] } | undefined {
  const match = /[a-z]+$/i.exec(text.slice(0, caret));
  if (!match || match[0].length < 2) return undefined;
  const start = caret - match[0].length;
  if (start > 0 && /[a-z0-9_.]/i.test(text[start - 1]!)) return undefined;
  const suffix = /^[a-z]*/i.exec(text.slice(caret))![0];
  const end = caret + suffix.length;
  if (/^_/.test(text.slice(end))) return undefined;
  const prefix = match[0].toLowerCase();
  const matches = names.filter((name) => name.startsWith(prefix)).slice(0, 8);
  if (!matches.length || (matches.length === 1 && matches[0] === text.slice(start, end).toLowerCase() && /^\s*\(/.test(text.slice(end)))) {
    return undefined;
  }
  return { start, end, names: matches };
}

export function completeFunction(text: string, start: number, end: number, name: string): { text: string; caret: number } {
  const hasParenthesis = /^\s*\(/.test(text.slice(end));
  const inserted = hasParenthesis ? name : `${name}()`;
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    caret: start + name.length + (hasParenthesis ? text.slice(end).indexOf("(") + 1 : 1),
  };
}

export function installFunctionAutocomplete(root: HTMLElement, report: (message: string) => void): void {
  const popup = document.createElement("div");
  popup.id = "function-completions";
  popup.className = "function-completions";
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-label", "Function suggestions. Arrow keys select, Enter or Tab inserts, Escape closes.");
  popup.hidden = true;
  document.body.append(popup);
  let input: HTMLInputElement | undefined;
  let completion: ReturnType<typeof functionCompletions>;
  let selected = 0;
  const close = () => {
    input?.setAttribute("aria-expanded", "false");
    input?.removeAttribute("aria-activedescendant");
    popup.hidden = true;
    completion = undefined;
  };
  const position = () => {
    if (!input || popup.hidden) return;
    const bounds = input.getBoundingClientRect();
    popup.style.width = `${Math.min(380, Math.max(240, bounds.width))}px`;
    const height = popup.offsetHeight;
    popup.style.left = `${Math.max(4, Math.min(bounds.left, window.innerWidth - popup.offsetWidth - 4))}px`;
    popup.style.top = `${Math.max(4, bounds.bottom + height + 4 <= window.innerHeight ? bounds.bottom + 4 : bounds.top - height - 4)}px`;
  };
  const highlight = () => {
    for (const [index, option] of [...popup.children].entries()) {
      option.setAttribute("aria-selected", String(index === selected));
    }
    input?.setAttribute("aria-activedescendant", `function-completion-${selected}`);
  };
  const accept = () => {
    if (!input || !completion) return;
    const result = completeFunction(input.value, completion.start, completion.end, completion.names[selected]!);
    if (result.text.length > input.maxLength) {
      report(`Expression is too long; use at most ${input.maxLength} characters.`);
      close();
      return;
    }
    input.setRangeText(result.text.slice(completion.start, result.text.length - (input.value.length - completion.end)),
      completion.start, completion.end, "end");
    input.setSelectionRange(result.caret, result.caret);
    close();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const update = (target: HTMLInputElement) => {
    if (input !== target) { close(); input = target; }
    if (target.selectionStart !== target.selectionEnd) { close(); return; }
    completion = functionCompletions(target.value, target.selectionStart ?? target.value.length);
    if (!completion) { close(); return; }
    popup.replaceChildren();
    selected = 0;
    for (const [index, name] of completion.names.entries()) {
      const option = document.createElement("div");
      option.id = `function-completion-${index}`;
      option.setAttribute("role", "option");
      const title = document.createElement("code");
      title.textContent = `${name}()`;
      const hint = document.createElement("span");
      hint.textContent = descriptions.get(name)?.syntax ?? graphSignatures.get(name) ?? `${name}()`;
      option.append(title, hint);
      option.addEventListener("pointerdown", (event) => event.preventDefault());
      option.addEventListener("click", () => { selected = index; accept(); });
      popup.append(option);
    }
    target.setAttribute("role", "combobox");
    target.setAttribute("aria-autocomplete", "list");
    target.setAttribute("aria-controls", popup.id);
    target.setAttribute("aria-expanded", "true");
    popup.hidden = false;
    highlight();
    position();
  };
  const field = (target: EventTarget | null): HTMLInputElement | undefined =>
    target instanceof HTMLInputElement && target.matches("[data-function-autocomplete]") ? target : undefined;
  root.addEventListener("input", (event) => {
    const target = field(event.target);
    if (target && !(event instanceof InputEvent && event.isComposing)) update(target);
  });
  root.addEventListener("click", (event) => { const target = field(event.target); if (target) update(target); });
  root.addEventListener("keydown", (event) => {
    if (event.target !== input || popup.hidden || !completion || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      selected = (selected + (event.key === "ArrowDown" ? 1 : -1) + completion.names.length) % completion.names.length;
      highlight();
    } else if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      accept();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") close();
  });
  root.addEventListener("focusout", () => close());
  root.addEventListener("compositionstart", close);
  document.addEventListener("pointerdown", (event) => {
    if (event.target !== input && event.target instanceof Node && !popup.contains(event.target)) close();
  });
  document.addEventListener("scroll", close, true);
  window.addEventListener("resize", close);
}

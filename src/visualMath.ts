import { MathfieldElement } from "mathlive";
import "mathlive/fonts.css";
import { latexToSource, sourceToLatex } from "./mathInput";

MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;
MathfieldElement.keypressSound = null;
MathfieldElement.plonkSound = null;
MathfieldElement.computeEngine = null;

export function installVisualMath(
  host: HTMLElement, input: HTMLInputElement, report: (message: string) => void,
): { sync: () => void; insert: (text: string) => boolean; focus: () => void } {
  const field = new MathfieldElement();
  field.mathVirtualKeyboardPolicy = "manual";
  field.smartFence = false;
  field.popoverPolicy = "off";
  field.setAttribute("aria-label", "Visual expression editor");
  field.setAttribute("aria-describedby", "visual-math-help");
  field.addEventListener("mount", () => {
    field.menuItems = [];
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
    field.shadowRoot!.append(style);
  });
  host.prepend(field);
  let syncing = false;
  let usable = true;
  let visualFocused = false;
  field.addEventListener("pointerdown", () => { visualFocused = true; });
  field.addEventListener("focus", () => { visualFocused = true; });
  field.addEventListener("focusin", () => { visualFocused = true; });
  input.addEventListener("focus", () => { visualFocused = false; });
  field.addEventListener("input", () => {
    if (syncing) return;
    try {
      const source = latexToSource(field.getValue("latex"));
      input.value = source;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      report("");
    } catch (reason) {
      report(`Visual edit not applied: ${reason instanceof Error ? reason.message : "Could not read the expression."}`);
    }
  });
  const sync = () => {
    if (document.activeElement === field) return;
    syncing = true;
    try {
      field.setValue(sourceToLatex(input.value), { silenceNotifications: true });
      field.readOnly = false;
      usable = true;
      report("");
    } catch (reason) {
      field.readOnly = true;
      usable = false;
      field.setValue("", { silenceNotifications: true });
      report(`Use text input for this expression: ${reason instanceof Error ? reason.message : "Unsupported visual notation."}`);
    } finally { syncing = false; }
  };
  input.addEventListener("input", sync);
  const insert = (text: string): boolean => {
    if (!usable || !visualFocused && document.activeElement !== field) return false;
    if (text === "left" || text === "right") field.executeCommand(text === "left" ? "moveToPreviousChar" : "moveToNextChar");
    else if (text === "backspace") field.executeCommand("deleteBackward");
    else if (text === "clear") field.setValue("");
    else {
      const templates: Record<string, string> = {
        "/": "\\frac{#@}{#?}", "^()": "^{#?}", "sqrt()": "\\sqrt{#0}",
        "abs()": "\\left|#0\\right|", "{}": "\\{#0\\}",
      };
      const functionCall = /^([a-z]+)\(\)$/.exec(text);
      field.insert(templates[text] ?? (functionCall ? `\\operatorname{${functionCall[1]}}(#0)` : sourceToLatex(text)));
    }
    field.focus();
    return true;
  };
  return { sync, insert, focus: () => { if (usable) { visualFocused = true; field.focus(); } else input.focus(); } };
}

export function workspaceWidth(width: number, available: number): number {
  return Math.round(Math.min(Math.min(800, Math.max(810, available) - 366), Math.max(280, width)));
}

export function installWorkspaceResize(
  workspace: HTMLElement, separator: HTMLElement, redraw: () => void, report: (message: string) => void,
): void {
  const key = "better-desmos-workspace-width";
  let preferred = 330;
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const parsed = Number(stored);
      if (!Number.isFinite(parsed) || parsed < 280 || parsed > 800) {
        report("Saved workspace width is invalid; using the default width.");
      } else preferred = parsed;
    }
  } catch (reason) {
    report(`Could not restore workspace width: ${reason instanceof Error ? reason.message : "Browser storage is unavailable."}`);
  }
  const apply = () => {
    const width = workspaceWidth(preferred, workspace.clientWidth);
    workspace.style.setProperty("--workspace-width", `${width}px`);
    separator.setAttribute("aria-valuenow", String(width));
    separator.setAttribute("aria-valuemin", "280");
    separator.setAttribute("aria-valuemax", String(workspaceWidth(800, workspace.clientWidth)));
    redraw();
  };
  const save = () => {
    try { localStorage.setItem(key, String(preferred)); }
    catch (reason) {
      report(`Could not remember workspace width: ${reason instanceof Error ? reason.message : "Browser storage is unavailable."}`);
    }
  };
  let drag: { id: number; x: number; width: number; preferred: number } | undefined;
  separator.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || drag) return;
    event.preventDefault();
    separator.focus();
    drag = { id: event.pointerId, x: event.clientX, width: workspaceWidth(preferred, workspace.clientWidth), preferred };
    separator.setPointerCapture(event.pointerId);
    workspace.classList.add("workspace-resizing");
  });
  separator.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    preferred = workspaceWidth(drag.width + event.clientX - drag.x, workspace.clientWidth);
    apply();
  });
  const finish = (cancel: boolean) => {
    if (!drag) return;
    if (cancel) { preferred = drag.preferred; apply(); }
    else save();
    drag = undefined;
    workspace.classList.remove("workspace-resizing");
  };
  separator.addEventListener("pointerup", () => finish(false));
  separator.addEventListener("pointercancel", () => finish(true));
  separator.addEventListener("lostpointercapture", () => finish(true));
  separator.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    preferred = event.key === "Home" ? 330 : event.key === "End" ? workspaceWidth(800, workspace.clientWidth)
      : workspaceWidth(preferred, workspace.clientWidth) + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 50 : 10);
    preferred = workspaceWidth(preferred, workspace.clientWidth);
    apply();
    save();
  });
  window.addEventListener("resize", apply);
  apply();
}

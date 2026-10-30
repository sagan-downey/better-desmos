import { compileExpression } from "./math";
import "./style.css";

interface Expression {
  id: number;
  text: string;
  color: string;
}

const colors = ["#55d6be", "#ff8c69", "#8da7ff", "#f0c75e", "#d18cff"];
let nextId = 4;
let expressions: Expression[] = [
  { id: 1, text: "y = x^2", color: colors[0]! },
  { id: 2, text: "y = sin(x)", color: colors[1]! },
  { id: 3, text: "y = 1 / x", color: colors[2]! },
];
let centerX = 0;
let centerY = 0;
let scale = 48;
let drag: { x: number; y: number; centerX: number; centerY: number } | undefined;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Better Desmos home"><span class="brand-mark">∿</span> better<span>desmos</span></a>
    <div class="top-note"><span class="status-dot"></span> Exact where possible · 50-digit approximations</div>
  </header>
  <main class="workspace">
    <aside class="sidebar">
      <div class="panel-heading">
        <div><p class="eyebrow">WORKSPACE</p><h1>Expressions</h1></div>
        <button class="add-button" id="add-expression" type="button" aria-label="Add expression">+</button>
      </div>
      <div class="expressions" id="expressions"></div>
      <div class="sidebar-bottom">
        <p class="eyebrow">QUICK GUIDE</p>
        <p>Enter an expression for <code>y</code> as a function of <code>x</code>.</p>
        <p class="examples"><code>y = x^2</code><code>sin(x)</code><code>1 / x</code></p>
        <p class="small-note">Rational arithmetic stays exact internally. Graphs are numerical samples and can miss narrow features.</p>
      </div>
    </aside>
    <section class="graph-panel" aria-label="Coordinate graph">
      <div class="graph-toolbar">
        <div><p class="eyebrow">2D GRAPH</p><p class="toolbar-caption">Static plot · no animated updates</p></div>
        <div class="view-controls">
          <button type="button" data-pan="up" aria-label="Pan up">↑</button>
          <button type="button" data-pan="left" aria-label="Pan left">←</button>
          <button type="button" data-pan="down" aria-label="Pan down">↓</button>
          <button type="button" data-pan="right" aria-label="Pan right">→</button>
          <span class="control-divider"></span>
          <button type="button" id="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" id="zoom-in" aria-label="Zoom in">+</button>
          <button type="button" id="reset-view">Reset</button>
        </div>
      </div>
      <div class="canvas-wrap"><canvas id="graph" aria-label="Graph of the entered expressions"></canvas></div>
      <div class="graph-footer"><span>Drag to pan · scroll to zoom</span><span id="view-readout"></span></div>
    </section>
  </main>
`;

const expressionList = document.querySelector<HTMLDivElement>("#expressions")!;
const canvas = document.querySelector<HTMLCanvasElement>("#graph")!;
const context = canvas.getContext("2d")!;
const viewReadout = document.querySelector<HTMLSpanElement>("#view-readout")!;

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-9) return "0";
  return Number(value.toPrecision(4)).toString();
}

function tickStep(): number {
  const raw = 72 / scale;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

function drawGrid(width: number, height: number): void {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101722";
  context.fillRect(0, 0, width, height);
  const originX = width / 2 - centerX * scale;
  const originY = height / 2 + centerY * scale;
  const step = tickStep();
  context.font = "12px Inter, ui-sans-serif, system-ui, sans-serif";
  context.lineWidth = 1;

  for (let xValue = Math.ceil((centerX - width / (2 * scale)) / step) * step;
    xValue <= centerX + width / (2 * scale); xValue += step) {
    const x = originX + xValue * scale;
    context.strokeStyle = Math.abs(xValue) < step / 1000 ? "#546273" : "#1d2938";
    context.beginPath();
    context.moveTo(Math.round(x) + 0.5, 0);
    context.lineTo(Math.round(x) + 0.5, height);
    context.stroke();
    if (Math.abs(xValue) >= step / 1000) {
      context.fillStyle = "#8695a7";
      context.fillText(formatTick(xValue), x + 5, Math.min(Math.max(originY + 16, 16), height - 8));
    }
  }
  for (let yValue = Math.ceil((centerY - height / (2 * scale)) / step) * step;
    yValue <= centerY + height / (2 * scale); yValue += step) {
    const y = originY - yValue * scale;
    context.strokeStyle = Math.abs(yValue) < step / 1000 ? "#546273" : "#1d2938";
    context.beginPath();
    context.moveTo(0, Math.round(y) + 0.5);
    context.lineTo(width, Math.round(y) + 0.5);
    context.stroke();
    if (Math.abs(yValue) >= step / 1000) {
      context.fillStyle = "#8695a7";
      context.fillText(formatTick(yValue), Math.min(Math.max(originX + 6, 6), width - 36), y - 5);
    }
  }
}

function draw(): void {
  const bounds = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(bounds.width * dpr));
  canvas.height = Math.max(1, Math.round(bounds.height * dpr));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = bounds.width;
  const height = bounds.height;
  drawGrid(width, height);
  const originY = height / 2 + centerY * scale;

  for (const expression of expressions) {
    let evaluate: ReturnType<typeof compileExpression>;
    try {
      evaluate = compileExpression(expression.text);
    } catch {
      continue;
    }
    context.strokeStyle = expression.color;
    context.lineWidth = 2;
    context.beginPath();
    let previousY: number | undefined;
    let drawing = false;
    for (let screenX = 0; screenX <= width; screenX += 1) {
      const x = (screenX - width / 2) / scale + centerX;
      try {
        const result = evaluate(x).value.toNumber();
        const screenY = originY - result * scale;
        if (!Number.isFinite(screenY) || screenY < -height * 2 || screenY > height * 3 ||
            (previousY !== undefined && Math.abs(screenY - previousY) > height)) {
          drawing = false;
          previousY = screenY;
          continue;
        }
        if (!drawing) {
          context.moveTo(screenX, screenY);
          drawing = true;
        } else {
          context.lineTo(screenX, screenY);
        }
        previousY = screenY;
      } catch {
        drawing = false;
        previousY = undefined;
      }
    }
    context.stroke();
  }
  viewReadout.textContent = `Center (${formatTick(centerX)}, ${formatTick(centerY)}) · ${formatTick(1 / scale)} units/px`;
}

function renderExpressions(): void {
  expressionList.replaceChildren();
  expressions.forEach((expression, index) => {
    const row = document.createElement("div");
    row.className = "expression-row";
    const marker = document.createElement("span");
    marker.className = "expression-marker";
    marker.style.backgroundColor = expression.color;
    marker.setAttribute("aria-hidden", "true");
    const input = document.createElement("input");
    input.type = "text";
    input.value = expression.text;
    input.maxLength = 512;
    input.setAttribute("aria-label", `Expression ${index + 1}`);
    const error = document.createElement("p");
    error.className = "expression-error";
    try {
      compileExpression(expression.text);
      error.textContent = "";
      input.removeAttribute("aria-invalid");
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : "Invalid expression";
      input.setAttribute("aria-invalid", "true");
    }
    input.addEventListener("input", () => {
      expression.text = input.value;
      try {
        compileExpression(expression.text);
        error.textContent = "";
        input.removeAttribute("aria-invalid");
      } catch (reason) {
        error.textContent = reason instanceof Error ? reason.message : "Invalid expression";
        input.setAttribute("aria-invalid", "true");
      }
      draw();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove expression ${index + 1}`);
    remove.addEventListener("click", () => {
      expressions = expressions.filter((entry) => entry.id !== expression.id);
      renderExpressions();
      draw();
    });
    row.append(marker, input, remove, error);
    expressionList.append(row);
  });
}

function addExpression(text = ""): void {
  expressions.push({
    id: nextId++,
    text,
    color: colors[(nextId - 2) % colors.length]!,
  });
  renderExpressions();
  draw();
  expressionList.lastElementChild?.querySelector<HTMLInputElement>("input")?.focus();
}

document.querySelector("#add-expression")!.addEventListener("click", () => addExpression());
document.querySelector("#zoom-in")!.addEventListener("click", () => {
  scale = Math.min(scale * 1.25, 100_000);
  draw();
});
document.querySelector("#zoom-out")!.addEventListener("click", () => {
  scale = Math.max(scale / 1.25, 0.001);
  draw();
});
document.querySelector("#reset-view")!.addEventListener("click", () => {
  centerX = 0;
  centerY = 0;
  scale = 48;
  draw();
});
document.querySelectorAll<HTMLButtonElement>("[data-pan]").forEach((button) => {
  button.addEventListener("click", () => {
    const amount = 80 / scale;
    switch (button.dataset.pan) {
      case "up": centerY += amount; break;
      case "down": centerY -= amount; break;
      case "left": centerX -= amount; break;
      case "right": centerX += amount; break;
    }
    draw();
  });
});

canvas.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, centerX, centerY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!drag) return;
  centerX = drag.centerX - (event.clientX - drag.x) / scale;
  centerY = drag.centerY + (event.clientY - drag.y) / scale;
  draw();
});
canvas.addEventListener("pointerup", () => { drag = undefined; });
canvas.addEventListener("pointercancel", () => { drag = undefined; });
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const bounds = canvas.getBoundingClientRect();
  const mouseX = event.clientX - bounds.left;
  const mouseY = event.clientY - bounds.top;
  const beforeX = (mouseX - bounds.width / 2) / scale + centerX;
  const beforeY = (bounds.height / 2 - mouseY) / scale + centerY;
  scale = Math.min(100_000, Math.max(0.001, scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
  centerX = beforeX - (mouseX - bounds.width / 2) / scale;
  centerY = beforeY - (bounds.height / 2 - mouseY) / scale;
  draw();
}, { passive: false });

window.addEventListener("resize", draw);
renderExpressions();
draw();

import {
  compileFastGraphExpression,
  compileGraphExpression,
  fitPolynomialRegression,
  fitLogarithmicRegression,
  fitExponentialRegression,
  fitPowerRegression,
  fitSineRegression,
  fitTangentRegression,
  compileColorExpression,
  FAST_MODE_PRECISION_DIGITS,
  getPrecisionDigits,
  setPrecisionDigits,
  type GraphExpression,
  type ImplicitEvaluation,
  type LogarithmicRegression,
  type ExponentialRegression,
  type PowerRegression,
  type PolynomialRegression,
  type TrigonometricRegression,
} from "./math";
import "./style.css";

type CompiledGraph = GraphExpression;
type ColorEvaluator = (x: number, y: number) => number;
type CompiledRGB = [
  ColorEvaluator | undefined,
  ColorEvaluator | undefined,
  ColorEvaluator | undefined,
];

interface RGBFormulas {
  red: string;
  green: string;
  blue: string;
}

interface Expression {
  id: number;
  text: string;
  color: string;
  folderId?: number;
  note?: string;
  hidden?: boolean;
  rgb?: RGBFormulas;
  compiledRgb?: CompiledRGB;
  compiledRgbKey?: string;
  rgbError?: string;
  parsedText?: string;
  compiledMode?: "precise" | "desmos";
  compiled?: CompiledGraph;
  compileError?: string;
  evaluationError?: string;
}

interface TableRow {
  id: number;
  x: string;
  y: string;
}

interface DataTable {
  id: number;
  rows: TableRow[];
  sourceExpressionId?: number;
  regressionDegree?: number;
  regressionKind?: "logarithmic" | "exponential" | "power" | "sine" | "tangent";
  color: string;
  regression?: RegressionFit;
  regressionError?: string;
  regressionSummary?: string;
  regressionKey?: string;
}

interface Folder {
  id: number;
  name: string;
}

interface ProjectState {
  version: 1;
  expressions: Expression[];
  tables: DataTable[];
  folders: Folder[];
  sliders: Record<string, number>;
  sliderOptions?: Record<string, SliderOptions>;
  centerX: number;
  centerY: number;
  scale: number;
}

interface SliderOptions {
  min: number;
  max: number;
  speed: number;
}

type RegressionFit =
  | { kind: "polynomial"; fit: PolynomialRegression }
  | { kind: "logarithmic"; fit: LogarithmicRegression }
  | { kind: "exponential"; fit: ExponentialRegression }
  | { kind: "power"; fit: PowerRegression }
  | { kind: "sine" | "tangent"; fit: TrigonometricRegression };

interface GraphSample {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  connected: boolean;
}

interface PointCandidate {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  type: string;
  graphIds: string[];
  color: string;
}

interface CurveGeometry {
  id: string;
  color: string;
  segments: number[];
  colorAt?: (x: number, y: number) => string;
}

interface ExplicitCurveData extends CurveGeometry {
  samples: GraphSample[];
}

interface HoverState {
  x: number;
  y: number;
}

const CONTOUR_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0]] as const;
const MAX_AXIS_INTERCEPTS_PER_CURVE = 10;
const colors = ["#55d6be", "#ff8c69", "#8da7ff", "#f0c75e", "#d18cff"];
const defaultExpressions: Expression[] = [
  { id: 1, text: "y = x^2", color: colors[0]! },
  { id: 2, text: "y = sin(x)", color: colors[1]! },
  { id: 3, text: "y = 1 / x", color: colors[2]! },
  { id: 4, text: "x^2 + y^2 = 4", color: colors[3]! },
];
let projectStatus = "";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRGBFormulas(value: unknown): value is RGBFormulas {
  return isRecord(value) &&
    ["red", "green", "blue"].every((channel) =>
      typeof value[channel] === "string" && value[channel].length <= 512);
}

function parseProjectState(text: string): ProjectState {
  if (text.length > 5_000_000) {
    throw new Error("Project files must be 5 MB or smaller.");
  }
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.version !== 1 ||
      !Array.isArray(value.expressions) || !Array.isArray(value.tables) ||
      !Array.isArray(value.folders) || !isRecord(value.sliders) ||
      typeof value.centerX !== "number" || !Number.isFinite(value.centerX) ||
      typeof value.centerY !== "number" || !Number.isFinite(value.centerY) ||
      typeof value.scale !== "number" || !Number.isFinite(value.scale) ||
      value.scale <= 0 || value.expressions.length > 200 ||
      value.tables.length > 100 || value.folders.length > 100) {
    throw new Error("Project file has an invalid or unsupported structure.");
  }
  const parsedExpressions = value.expressions.map((item): Expression => {
    const rgb = isRecord(item) ? item.rgb : undefined;
    if (!isRecord(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
        typeof item.text !== "string" ||
        item.text.length > 512 || typeof item.color !== "string" ||
        !/^#[\da-f]{6}$/i.test(item.color) ||
        (item.folderId !== undefined && !Number.isInteger(item.folderId)) ||
        (item.note !== undefined && (typeof item.note !== "string" || item.note.length > 10_000)) ||
        (item.hidden !== undefined && typeof item.hidden !== "boolean") ||
        (rgb !== undefined && !isRGBFormulas(rgb))) {
      throw new Error("Project contains an invalid expression.");
    }
    return {
      id: item.id as number,
      text: item.text,
      color: item.color,
      folderId: item.folderId as number | undefined,
      note: item.note as string | undefined,
      hidden: item.hidden as boolean | undefined,
      rgb: rgb === undefined ? undefined : {
        red: rgb.red,
        green: rgb.green,
        blue: rgb.blue,
      },
    };
  });
  const parsedFolders = value.folders.map((item): Folder => {
    if (!isRecord(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
        typeof item.name !== "string" || item.name.length > 40) {
      throw new Error("Project contains an invalid folder.");
    }
    return { id: item.id as number, name: item.name };
  });
  const parsedTables = value.tables.map((item): DataTable => {
    if (!isRecord(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
        !Array.isArray(item.rows) || item.rows.length > 5000 ||
        typeof item.color !== "string" || !/^#[\da-f]{6}$/i.test(item.color)) {
      throw new Error("Project contains an invalid table.");
    }
    const rows = item.rows.map((row): TableRow => {
      if (!isRecord(row) || !Number.isSafeInteger(row.id) || Number(row.id) < 1 ||
          typeof row.x !== "string" || row.x.length > 128 ||
          typeof row.y !== "string" || row.y.length > 128) {
        throw new Error("Project contains an invalid table row.");
      }
      return { id: row.id as number, x: row.x, y: row.y };
    });
    const regressionKind = item.regressionKind;
    if (regressionKind !== undefined &&
        !["logarithmic", "exponential", "power", "sine", "tangent"].includes(String(regressionKind))) {
      throw new Error("Project contains an unsupported regression kind.");
    }
    if (item.regressionDegree !== undefined &&
        (!Number.isInteger(item.regressionDegree) || Number(item.regressionDegree) < 1 ||
          Number(item.regressionDegree) > 5)) {
      throw new Error("Project contains an invalid regression degree.");
    }
    return {
      id: item.id as number,
      rows,
      color: item.color,
      sourceExpressionId: Number.isInteger(item.sourceExpressionId)
        ? item.sourceExpressionId as number
        : undefined,
      regressionDegree: item.regressionDegree as number | undefined,
      regressionKind: regressionKind as DataTable["regressionKind"],
    };
  });
  const sliders: Record<string, number> = {};
  for (const [name, slider] of Object.entries(value.sliders)) {
    if (!/^[a-z]$/i.test(name) || typeof slider !== "number" || !Number.isFinite(slider)) {
      throw new Error("Project contains an invalid slider.");
    }
    sliders[name] = slider;
  }
  const sliderOptions: Record<string, SliderOptions> = {};
  if (value.sliderOptions !== undefined) {
    if (!isRecord(value.sliderOptions)) throw new Error("Project contains invalid slider settings.");
    for (const [name, options] of Object.entries(value.sliderOptions)) {
      if (!/^[a-z]$/i.test(name) || !isRecord(options) ||
          typeof options.min !== "number" || !Number.isFinite(options.min) ||
          typeof options.max !== "number" || !Number.isFinite(options.max) ||
          options.max <= options.min || Math.abs(options.min) > 1_000_000 ||
          Math.abs(options.max) > 1_000_000 ||
          typeof options.speed !== "number" || !Number.isFinite(options.speed) ||
          options.speed <= 0 || options.speed > 100) {
        throw new Error(`Project contains invalid settings for slider "${name}".`);
      }
      sliderOptions[name] = {
        min: options.min,
        max: options.max,
        speed: options.speed,
      };
    }
  }
  const expressionIds = parsedExpressions.map(({ id }) => id);
  const tableIds = parsedTables.map(({ id }) => id);
  const folderIds = parsedFolders.map(({ id }) => id);
  const rowIds = parsedTables.flatMap(({ rows }) => rows.map(({ id }) => id));
  if (new Set(expressionIds).size !== expressionIds.length ||
      new Set(tableIds).size !== tableIds.length ||
      new Set(folderIds).size !== folderIds.length ||
      new Set(rowIds).size !== rowIds.length ||
      parsedTables.reduce((count, table) => count + table.rows.length, 0) > 20_000) {
    throw new Error("Project contains duplicate IDs or too many table rows.");
  }
  return {
    version: 1,
    expressions: parsedExpressions,
    tables: parsedTables,
    folders: parsedFolders,
    sliders,
    sliderOptions,
    centerX: value.centerX,
    centerY: value.centerY,
    scale: Math.min(100_000, Math.max(0.001, value.scale)),
  };
}

function decodeProjectHash(): string | undefined {
  const match = /^#project=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!match) return undefined;
  if (match[1]!.length > 50_000) {
    throw new Error("Share link is too large to open.");
  }
  const base64 = match[1]!.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function loadInitialProject(): ProjectState | undefined {
  try {
    const shared = decodeProjectHash();
    if (shared) return parseProjectState(shared);
    const saved = localStorage.getItem("better-desmos-project-v1");
    return saved ? parseProjectState(saved) : undefined;
  } catch (reason) {
    projectStatus = reason instanceof Error ? reason.message : "Could not load saved project.";
    return undefined;
  }
}

const initialProject = loadInitialProject();
let expressions: Expression[] = initialProject?.expressions ?? defaultExpressions;
let tables: DataTable[] = initialProject?.tables ?? [];
let folders: Folder[] = initialProject?.folders ?? [];
const sliderValues: Record<string, number> = initialProject?.sliders ?? {};
const sliderOptions: Record<string, SliderOptions> = initialProject?.sliderOptions ?? {};
let sliderAnimation: { name: string; direction: 1 | -1; lastTime: number } | undefined;
let sliderAnimationTimer: number | undefined;
const explicitSpacingOptions = [4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
const implicitSpacingOptions = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
let nextId = Math.max(0, ...expressions.map((expression) => expression.id)) + 1;
let nextTableId = Math.max(0, ...tables.map((table) => table.id)) + 1;
let nextRowId = Math.max(0, ...tables.flatMap((table) => table.rows.map((row) => row.id))) + 1;
let nextFolderId = Math.max(0, ...folders.map((folder) => folder.id)) + 1;
let centerX = initialProject?.centerX ?? 0;
let centerY = initialProject?.centerY ?? 0;
let scale = initialProject?.scale ?? 48;
let graphMode: "precise" | "desmos" = "precise";
const graphSettings = {
  precisionDigits: getPrecisionDigits(),
  explicitSampleSpacing: 1,
  implicitSampleSpacing: 6,
};
let savedPreciseSettings: typeof graphSettings | undefined;
let drag: {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  moved: boolean;
} | undefined;
let hoverPosition: HoverState | undefined;
let hoverCandidates: PointCandidate[] = [];
let hoverCurves: CurveGeometry[] = [];

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Better Desmos 1.3 home"><span class="brand-mark">∿</span> better<span>desmos</span><span class="version-label">1.3</span></a>
    <div class="top-note"><span class="status-dot"></span><span id="mode-note">Exact where possible · configurable precision</span></div>
  </header>
  <main class="workspace">
    <aside class="sidebar">
      <div class="panel-heading">
        <div><p class="eyebrow">WORKSPACE</p><h1>Expressions</h1></div>
        <div class="workspace-actions">
          <button class="add-button" id="add-folder" type="button" aria-label="Add folder" title="Add folder">▱</button>
          <button class="add-button" id="add-expression" type="button" aria-label="Add expression">+</button>
        </div>
      </div>
      <div class="sidebar-scroll">
        <div class="expressions" id="expressions"></div>
        <section class="sliders-panel" id="sliders" aria-label="Parameter sliders"></section>
        <section class="tables-panel" aria-label="Data tables">
          <div class="tables-heading"><h2>Tables</h2><button class="add-button" id="add-table" type="button" aria-label="Add table">+</button></div>
          <div id="tables"></div>
        </section>
        <details class="graph-settings">
        <summary>Accuracy &amp; performance</summary>
        <div class="setting-control">
          <label class="mode-setting" for="desmos-mode">
            <span><strong>Desmos mode</strong><small>Potato-PC settings · fast math (~10 digits)</small></span>
            <input id="desmos-mode" type="checkbox" />
          </label>
        </div>
        <div class="setting-control">
          <label for="precision-setting">Math precision <output id="precision-value">50 digits</output></label>
          <input id="precision-setting" type="range" min="20" max="100" step="10" value="50" />
          <div class="setting-scale"><span>Better performance</span><span>Worse performance · more precision</span></div>
          <p id="precision-help">Digits used for approximate calculations. Higher precision takes more work. Desmos mode uses standard JavaScript number precision instead.</p>
        </div>
        <div class="setting-control">
          <label for="explicit-spacing-setting">Explicit curve spacing <output id="explicit-spacing-value">1 px</output></label>
          <input id="explicit-spacing-setting" type="range" min="0" max="7" step="1" value="6" />
          <div class="setting-scale"><span>Better performance · less detail</span><span>Worse performance · more detail</span></div>
          <p>Screen pixels between samples for curves such as <code>y = sin(x)</code>.</p>
        </div>
        <div class="setting-control">
          <label for="implicit-spacing-setting">Implicit contour spacing <output id="implicit-spacing-value">6 px</output></label>
          <input id="implicit-spacing-setting" type="range" min="0" max="11" step="1" value="6" />
          <div class="setting-scale"><span>Better performance · less detail</span><span>Worse performance · more detail</span></div>
          <p>Maximum grid spacing for equations such as <code>x^2 + y^2 = 4</code>. Smaller spacing may show more detail but takes longer.</p>
        </div>
        </details>
        <div class="sidebar-bottom">
          <p class="eyebrow">QUICK GUIDE</p>
          <p>Graph <code>y = f(x)</code>, add a table, or plot an implicit equation.</p>
          <p class="examples"><code>y = x^2</code><code>sin(x)</code><code>x^2 + y^2 = 4</code></p>
          <p class="small-note">Rational arithmetic stays exact internally. Graphs are numerical samples and can miss narrow features.</p>
        </div>
      </div>
    </aside>
    <section class="graph-panel" aria-label="Coordinate graph">
      <div class="graph-toolbar">
        <div><p class="eyebrow">2D GRAPH</p><p class="toolbar-caption">Numerical plot · slider playback available</p></div>
        <div class="toolbar-actions">
        <div class="project-controls" aria-label="Project actions">
          <button type="button" id="save-project">Save</button>
          <button type="button" id="export-project">Export</button>
          <button type="button" id="import-project">Import</button>
          <button type="button" id="share-project">Share</button>
          <input type="file" id="project-file" accept="application/json,.json" hidden />
          <span id="project-status" role="status"></span>
        </div>
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
      </div>
      <div class="canvas-wrap"><canvas id="graph" aria-label="Graph of the entered expressions"></canvas><canvas id="graph-points" aria-hidden="true"></canvas></div>
      <div class="graph-footer"><span>Click a curve to collect points · drag to pan · scroll to zoom</span><span id="view-readout"></span></div>
    </section>
  </main>
`;

const expressionList = document.querySelector<HTMLDivElement>("#expressions")!;
const sliderList = document.querySelector<HTMLElement>("#sliders")!;
const tableList = document.querySelector<HTMLDivElement>("#tables")!;
const canvas = document.querySelector<HTMLCanvasElement>("#graph")!;
const context = canvas.getContext("2d")!;
const pointCanvas = document.querySelector<HTMLCanvasElement>("#graph-points")!;
const pointContext = pointCanvas.getContext("2d")!;
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
  const originX = width / 2 - centerX * scale;
  const originY = height / 2 + centerY * scale;
  const step = tickStep();
  context.font = "12px Inter, ui-sans-serif, system-ui, sans-serif";
  context.lineWidth = 1;
  context.beginPath();

  for (let xValue = Math.ceil((centerX - width / (2 * scale)) / step) * step;
    xValue <= centerX + width / (2 * scale); xValue += step) {
    const x = originX + xValue * scale;
    const axis = Math.abs(xValue) < step / 1000;
    if (axis) {
      continue;
    }
    context.moveTo(Math.round(x) + 0.5, 0);
    context.lineTo(Math.round(x) + 0.5, height);
  }
  for (let yValue = Math.ceil((centerY - height / (2 * scale)) / step) * step;
    yValue <= centerY + height / (2 * scale); yValue += step) {
    const axis = Math.abs(yValue) < step / 1000;
    if (axis) {
      continue;
    }
    const y = originY - yValue * scale;
    context.moveTo(0, Math.round(y) + 0.5);
    context.lineTo(width, Math.round(y) + 0.5);
  }
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.stroke();

  context.beginPath();
  const zeroX = originX;
  const zeroY = originY;
  context.moveTo(Math.round(zeroX) + 0.5, 0);
  context.lineTo(Math.round(zeroX) + 0.5, height);
  context.moveTo(0, Math.round(zeroY) + 0.5);
  context.lineTo(width, Math.round(zeroY) + 0.5);
  context.strokeStyle = "rgba(255, 255, 255, 0.72)";
  context.stroke();

  for (let xValue = Math.ceil((centerX - width / (2 * scale)) / step) * step;
    xValue <= centerX + width / (2 * scale); xValue += step) {
    if (Math.abs(xValue) < step / 1000) {
      continue;
    }
    const x = originX + xValue * scale;
    context.fillStyle = "#ffffff";
    context.fillText(formatTick(xValue), x + 5, Math.min(Math.max(originY + 16, 16), height - 8));
  }

  for (let yValue = Math.ceil((centerY - height / (2 * scale)) / step) * step;
    yValue <= centerY + height / (2 * scale); yValue += step) {
    const y = originY - yValue * scale;
    if (Math.abs(yValue) >= step / 1000) {
      context.fillStyle = "#ffffff";
      context.fillText(formatTick(yValue), Math.min(Math.max(originX + 6, 6), width - 36), y - 5);
    }
  }
}

function compileRGB(expression: Expression): ((x: number, y: number) => string) | undefined {
  const formulas = expression.rgb;
  if (!formulas) {
    expression.rgbError = undefined;
    return undefined;
  }
  const key = `${graphMode}:${formulas.red}\u0000${formulas.green}\u0000${formulas.blue}`;
  if (expression.compiledRgbKey !== key) {
    expression.compiledRgbKey = key;
    expression.compiledRgb = undefined;
    expression.rgbError = undefined;
    try {
      expression.compiledRgb = [
        formulas.red.trim()
          ? compileColorExpression(formulas.red, sliderValues, graphMode === "desmos")
          : undefined,
        formulas.green.trim()
          ? compileColorExpression(formulas.green, sliderValues, graphMode === "desmos")
          : undefined,
        formulas.blue.trim()
          ? compileColorExpression(formulas.blue, sliderValues, graphMode === "desmos")
          : undefined,
      ];
    } catch (reason) {
      expression.rgbError = reason instanceof Error ? reason.message : "Invalid RGB formula";
    }
  }
  if (!expression.compiledRgb) return undefined;
  const base = [
    Number.parseInt(expression.color.slice(1, 3), 16),
    Number.parseInt(expression.color.slice(3, 5), 16),
    Number.parseInt(expression.color.slice(5, 7), 16),
  ];
  return (x, y) => {
    try {
      const values = expression.compiledRgb!.map((evaluate, index) => {
        const value = evaluate ? evaluate(x, y) : base[index]!;
        if (!Number.isFinite(value)) {
          throw new Error("RGB channel results must be finite numbers from 0 to 255");
        }
        return Math.round(Math.min(255, Math.max(0, value)));
      });
      return `#${values.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    } catch (reason) {
      expression.rgbError = reason instanceof Error ? reason.message : "Could not evaluate RGB formula";
      return expression.color;
    }
  };
}

function strokeColoredSegments(
  geometry: CurveGeometry,
  colorAt: (x: number, y: number) => string,
  width: number,
  height: number,
): void {
  const paths = new Map<string, number[]>();
  for (let index = 0; index < geometry.segments.length; index += 4) {
    const x1 = geometry.segments[index]!;
    const y1 = geometry.segments[index + 1]!;
    const x2 = geometry.segments[index + 2]!;
    const y2 = geometry.segments[index + 3]!;
    const x = ((x1 + x2) / 2 - width / 2) / scale + centerX;
    const y = (height / 2 - (y1 + y2) / 2) / scale + centerY;
    let color: string;
    try {
      color = colorAt(x, y);
    } catch {
      color = geometry.color;
    }
    const segments = paths.get(color) ?? [];
    segments.push(x1, y1, x2, y2);
    paths.set(color, segments);
  }
  context.save();
  context.lineWidth = 2;
  context.lineCap = "round";
  for (const [color, segments] of paths) {
    context.beginPath();
    context.strokeStyle = color;
    for (let index = 0; index < segments.length; index += 4) {
      context.moveTo(segments[index]!, segments[index + 1]!);
      context.lineTo(segments[index + 2]!, segments[index + 3]!);
    }
    context.stroke();
  }
  context.restore();
}

function drawImplicit(
  evaluate: ImplicitEvaluation,
  width: number,
  height: number,
  id: string,
  color: string,
  colorAt?: (x: number, y: number) => string,
): CurveGeometry {
  const geometry: CurveGeometry = { id, color, segments: [], colorAt };
  const addSegment = (x1: number, y1: number, x2: number, y2: number) => {
    if (!colorAt) {
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
    }
    geometry.segments.push(x1, y1, x2, y2);
  };
  const step = Math.max(1, Math.min(graphSettings.implicitSampleSpacing, scale * 0.15));
  const columns = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;
  const screenX = (column: number) => Math.min(column * step, width);
  const screenY = (row: number) => Math.min(row * step, height);
  const screenXs = Float64Array.from({ length: columns }, (_, column) => screenX(column));
  const screenYs = Float64Array.from({ length: rows }, (_, row) => screenY(row));
  const xCoordinates = Float64Array.from(screenXs, (px) => (px - width / 2) / scale + centerX);
  const yCoordinates = Float64Array.from(screenYs, (py) => (height / 2 - py) / scale + centerY);
  const values = new Float64Array(columns * rows);
  values.fill(Number.NaN);

  for (let row = 0; row < rows; row += 1) {
    const y = yCoordinates[row]!;
    for (let column = 0; column < columns; column += 1) {
      const x = xCoordinates[column]!;
      try {
        const result = evaluate(x, y);
        const value = typeof result === "number" ? result : result.toNumber();
        if (Number.isFinite(value)) {
          values[row * columns + column] = value;
        }
      } catch {
        // Undefined samples leave gaps in the implicit contour.
      }
    }
  }

  context.beginPath();
  const intersectionX = new Float64Array(4);
  const intersectionY = new Float64Array(4);
  const intersectionEdge = new Uint8Array(4);
  const emitSegment = (first: number, second: number, count: number) => {
    let start = -1;
    let end = -1;
    for (let index = 0; index < count; index += 1) {
      if (intersectionEdge[index] === first) start = index;
      if (intersectionEdge[index] === second) end = index;
    }
    if (start >= 0 && end >= 0) {
      addSegment(
        intersectionX[start]!,
        intersectionY[start]!,
        intersectionX[end]!,
        intersectionY[end]!,
      );
    }
  };
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const topLeft = values[row * columns + column]!;
      const topRight = values[row * columns + column + 1]!;
      const bottomRight = values[(row + 1) * columns + column + 1]!;
      const bottomLeft = values[(row + 1) * columns + column]!;
      if (!Number.isFinite(topLeft) || !Number.isFinite(topRight) ||
          !Number.isFinite(bottomRight) || !Number.isFinite(bottomLeft)) {
        continue;
      }
      if ((topLeft < 0 && topRight < 0 && bottomRight < 0 && bottomLeft < 0) ||
          (topLeft > 0 && topRight > 0 && bottomRight > 0 && bottomLeft > 0)) {
        continue;
      }
      let intersectionCount = 0;
      for (let edge = 0; edge < CONTOUR_EDGES.length; edge += 1) {
        let startValue: number;
        let endValue: number;
        let startX: number;
        let startY: number;
        let endX: number;
        let endY: number;
        if (edge === 0) {
          startValue = topLeft;
          endValue = topRight;
          startX = screenXs[column]!;
          startY = screenYs[row]!;
          endX = screenXs[column + 1]!;
          endY = startY;
        } else if (edge === 1) {
          startValue = topRight;
          endValue = bottomRight;
          startX = screenXs[column + 1]!;
          startY = screenYs[row]!;
          endX = startX;
          endY = screenYs[row + 1]!;
        } else if (edge === 2) {
          startValue = bottomRight;
          endValue = bottomLeft;
          startX = screenXs[column + 1]!;
          startY = screenYs[row + 1]!;
          endX = screenXs[column]!;
          endY = startY;
        } else {
          startValue = bottomLeft;
          endValue = topLeft;
          startX = screenXs[column]!;
          startY = screenYs[row + 1]!;
          endX = startX;
          endY = screenYs[row]!;
        }
        if ((startValue < 0 && endValue < 0) || (startValue > 0 && endValue > 0) ||
            (startValue === 0 && endValue === 0)) {
          continue;
        }
        const fraction = startValue === 0 ? 0
          : endValue === 0 ? 1
            : startValue / (startValue - endValue);
        const x = startX + (endX - startX) * fraction;
        const y = startY + (endY - startY) * fraction;
        let duplicate = false;
        for (let index = 0; index < intersectionCount; index += 1) {
          if (Math.abs(intersectionX[index]! - x) < 0.001 &&
              Math.abs(intersectionY[index]! - y) < 0.001) {
            duplicate = true;
            break;
          }
        }
        if (!duplicate) {
          intersectionEdge[intersectionCount] = edge;
          intersectionX[intersectionCount] = x;
          intersectionY[intersectionCount] = y;
          intersectionCount += 1;
        }
      }

      if (intersectionCount === 2) {
        addSegment(intersectionX[0]!, intersectionY[0]!, intersectionX[1]!, intersectionY[1]!);
      } else if (intersectionCount === 4) {
        const centerValue = (topLeft + topRight + bottomRight + bottomLeft) / 4;
        if ((centerValue >= 0) === (topLeft >= 0)) {
          emitSegment(0, 1, intersectionCount);
          emitSegment(2, 3, intersectionCount);
        } else {
          emitSegment(0, 3, intersectionCount);
          emitSegment(1, 2, intersectionCount);
        }
      }
    }
  }
  if (colorAt) {
    strokeColoredSegments(geometry, colorAt, width, height);
  } else {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
  }
  return geometry;
}

function addPointCandidate(
  candidates: PointCandidate[],
  x: number,
  y: number,
  type: string,
  graphIds: string[],
  color: string,
  width: number,
  height: number,
): void {
  const screenX = width / 2 + (x - centerX) * scale;
  const screenY = height / 2 - (y - centerY) * scale;
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY) ||
      screenX < -8 || screenX > width + 8 || screenY < -8 || screenY > height + 8) {
    return;
  }
  const existing = candidates.find((candidate) =>
    Math.hypot(candidate.screenX - screenX, candidate.screenY - screenY) < 2.5);
  if (existing) {
    if (!existing.type.includes(type)) {
      existing.type += ` · ${type}`;
    }
    for (const graphId of graphIds) {
      if (!existing.graphIds.includes(graphId)) {
        existing.graphIds.push(graphId);
      }
    }
    return;
  }
  candidates.push({ x, y, screenX, screenY, type, graphIds: [...graphIds], color });
}

function drawExplicitCurve(
  id: string,
  color: string,
  evaluate: (x: number) => number,
  width: number,
  height: number,
  colorAt?: (x: number, y: number) => string,
): ExplicitCurveData {
  const samples: GraphSample[] = [];
  const geometry: ExplicitCurveData = { id, color, samples, segments: [], colorAt };
  const originY = height / 2 + centerY * scale;
  if (!colorAt) {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
  }
  let previousY: number | undefined;
  let drawing = false;
  for (let screenX = 0; screenX <= width; screenX += graphSettings.explicitSampleSpacing) {
    const x = (screenX - width / 2) / scale + centerX;
    try {
      const y = evaluate(x);
      const screenY = originY - y * scale;
      const valid = Number.isFinite(screenY) && screenY >= -height * 2 && screenY <= height * 3;
      const connected = valid && drawing && previousY !== undefined &&
        Math.abs(screenY - previousY) <= height;
      if (!valid || (previousY !== undefined && Math.abs(screenY - previousY) > height)) {
        drawing = false;
        previousY = screenY;
        samples.push({ x, y, screenX, screenY, connected: false });
        continue;
      }
      if (!drawing) {
        if (!colorAt) context.moveTo(screenX, screenY);
        drawing = true;
      } else {
        if (!colorAt) context.lineTo(screenX, screenY);
      }
      if (connected && samples.length > 0) {
        const previous = samples[samples.length - 1]!;
        geometry.segments.push(previous.screenX, previous.screenY, screenX, screenY);
      }
      samples.push({ x, y, screenX, screenY, connected });
      previousY = screenY;
    } catch {
      drawing = false;
      previousY = undefined;
      samples.push({ x, y: Number.NaN, screenX, screenY: Number.NaN, connected: false });
    }
  }
  if (colorAt) {
    strokeColoredSegments(geometry, colorAt, width, height);
  } else {
    context.stroke();
  }
  return geometry;
}

function detectExplicitPoints(
  curve: ExplicitCurveData,
  evaluate: (x: number) => number,
  candidates: PointCandidate[],
  width: number,
  height: number,
): void {
  const { samples, id, color, colorAt } = curve;
  const axisIntercepts: PointCandidate[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    if (!current.connected) {
      continue;
    }
    if ((previous.y < 0 && current.y > 0) || (previous.y > 0 && current.y < 0) ||
        previous.y === 0 || current.y === 0) {
      if (previous.y !== 0 || current.y !== 0) {
        const fraction = previous.y === 0 ? 0
          : current.y === 0 ? 1
            : previous.y / (previous.y - current.y);
        addPointCandidate(
          axisIntercepts, previous.x + (current.x - previous.x) * fraction, 0,
          "x-intercept", [id],
          colorAt?.(previous.x + (current.x - previous.x) * fraction, 0) ?? color,
          width, height,
        );
      }
    }
  }

  if (Math.abs(centerX) <= width / (2 * scale)) {
    try {
      const y = evaluate(0);
      addPointCandidate(
        axisIntercepts, 0, y, "y-intercept", [id], colorAt?.(0, y) ?? color, width, height,
      );
    } catch {
      // The function may be undefined on the y-axis.
    }
  }

  appendLimitedIntercepts(axisIntercepts, candidates, width, height);

  for (let index = 1; index < samples.length - 1; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    const next = samples[index + 1]!;
    if (!current.connected || !next.connected ||
        !Number.isFinite(previous.y) || !Number.isFinite(next.y)) {
      continue;
    }
    const firstSlope = current.y - previous.y;
    const secondSlope = next.y - current.y;
    if (firstSlope === 0 || secondSlope === 0 ||
        Math.sign(firstSlope) === Math.sign(secondSlope)) {
      continue;
    }
    const curvature = previous.y - 2 * current.y + next.y;
    if (curvature === 0) {
      continue;
    }
    const offset = Math.max(-1, Math.min(1, 0.5 * (previous.y - next.y) / curvature));
    const stepX = next.x - current.x;
    const x = current.x + offset * stepX;
    const y = current.y - 0.25 * (previous.y - next.y) * offset;
    addPointCandidate(
      candidates, x, y, "vertex", [id], colorAt?.(x, y) ?? color, width, height,
    );
  }
}

function appendLimitedIntercepts(
  intercepts: PointCandidate[],
  candidates: PointCandidate[],
  width: number,
  height: number,
): void {
  const centerScreenX = width / 2;
  const centerScreenY = height / 2;
  intercepts
    .sort((left, right) =>
      Math.hypot(left.screenX - centerScreenX, left.screenY - centerScreenY) -
      Math.hypot(right.screenX - centerScreenX, right.screenY - centerScreenY))
    .slice(0, MAX_AXIS_INTERCEPTS_PER_CURVE)
    .forEach((point) => addPointCandidate(
      candidates, point.x, point.y, point.type, point.graphIds, point.color,
      width, height,
    ));
}

function detectExplicitIntersections(
  first: ExplicitCurveData,
  second: ExplicitCurveData,
  candidates: PointCandidate[],
  width: number,
  height: number,
): void {
  const count = Math.min(first.samples.length, second.samples.length);
  for (let index = 1; index < count; index += 1) {
    const a0 = first.samples[index - 1]!;
    const a1 = first.samples[index]!;
    const b0 = second.samples[index - 1]!;
    const b1 = second.samples[index]!;
    if (!a1.connected || !b1.connected) {
      continue;
    }
    const difference0 = a0.y - b0.y;
    const difference1 = a1.y - b1.y;
    if (Math.abs(difference0) * scale < 0.25 && Math.abs(difference1) * scale < 0.25) {
      continue;
    }
    if ((difference0 < 0 && difference1 < 0) || (difference0 > 0 && difference1 > 0) ||
        (difference0 === 0 && difference1 === 0)) {
      continue;
    }
    const fraction = difference0 === 0 ? 0
      : difference1 === 0 ? 1
        : difference0 / (difference0 - difference1);
    const x = a0.x + (a1.x - a0.x) * fraction;
    const y = a0.y + (a1.y - a0.y) * fraction;
    addPointCandidate(
      candidates, x, y, "intersection", [first.id, second.id],
      first.colorAt?.(x, y) ?? first.color, width, height,
    );
  }

  for (let index = 3; index < count - 3; index += 1) {
    const centerFirst = first.samples[index]!;
    const centerSecond = second.samples[index]!;
    if (!centerFirst.connected || !centerSecond.connected) {
      continue;
    }
    let contiguous = true;
    for (let offset = -3; offset <= 3; offset += 1) {
      if (!first.samples[index + offset]!.connected && offset !== -3) {
        contiguous = false;
        break;
      }
      if (!second.samples[index + offset]!.connected && offset !== -3) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) {
      continue;
    }
    const difference = (sampleIndex: number) =>
      first.samples[sampleIndex]!.y - second.samples[sampleIndex]!.y;
    const center = difference(index);
    const left = difference(index - 3);
    const right = difference(index + 3);
    if (Math.abs(center) * scale > 0.25 ||
        Math.abs(center) > Math.abs(difference(index - 1)) ||
        Math.abs(center) > Math.abs(difference(index + 1)) ||
        Math.min(Math.abs(left), Math.abs(right)) * scale < 0.05) {
      continue;
    }
    const denominator = left - 2 * center + right;
    if (denominator === 0) {
      continue;
    }
    const offset = Math.max(-3, Math.min(3, 0.5 * (left - right) / denominator * 3));
    const targetIndex = index + offset;
    const lowerIndex = Math.floor(targetIndex);
    const fraction = targetIndex - lowerIndex;
    const firstLow = first.samples[lowerIndex]!;
    const firstHigh = first.samples[lowerIndex + 1]!;
    const secondLow = second.samples[lowerIndex]!;
    const secondHigh = second.samples[lowerIndex + 1]!;
    const x = firstLow.x + (firstHigh.x - firstLow.x) * fraction;
    const yFirst = firstLow.y + (firstHigh.y - firstLow.y) * fraction;
    const ySecond = secondLow.y + (secondHigh.y - secondLow.y) * fraction;
    addPointCandidate(
      candidates, x, (yFirst + ySecond) / 2, "intersection",
      [first.id, second.id],
      first.colorAt?.(x, (yFirst + ySecond) / 2) ?? first.color, width, height,
    );
  }
}

function implicitValue(evaluate: ImplicitEvaluation, x: number, y: number): number {
  const result = evaluate(x, y);
  return typeof result === "number" ? result : result.toNumber();
}

function detectImplicitAxisIntercepts(
  curve: CurveGeometry,
  evaluate: ImplicitEvaluation,
  candidates: PointCandidate[],
  width: number,
  height: number,
): void {
  const intercepts: PointCandidate[] = [];
  const sampleSpacing = Math.max(1, Math.min(graphSettings.implicitSampleSpacing, scale * 0.15));
  const axes: Array<{ axis: "x" | "y"; min: number; max: number }> = [
    { axis: "x", min: centerX - width / (2 * scale), max: centerX + width / (2 * scale) },
    { axis: "y", min: centerY - height / (2 * scale), max: centerY + height / (2 * scale) },
  ];

  for (const { axis, min, max } of axes) {
    const steps = Math.max(1, Math.ceil((max - min) * scale / sampleSpacing));
    const valueAt = (value: number): number => axis === "x"
      ? implicitValue(evaluate, value, 0)
      : implicitValue(evaluate, 0, value);
    for (let index = 0; index < steps; index += 1) {
      const start = min + (max - min) * index / steps;
      const end = min + (max - min) * (index + 1) / steps;
      let startValue: number;
      let endValue: number;
      try {
        startValue = valueAt(start);
        endValue = valueAt(end);
      } catch {
        continue;
      }
      if (!Number.isFinite(startValue) || !Number.isFinite(endValue) ||
          (startValue === 0 && endValue === 0) ||
          ((startValue < 0 && endValue < 0) || (startValue > 0 && endValue > 0))) {
        continue;
      }
      let low = start;
      let high = end;
      let lowValue = startValue;
      if (startValue !== 0 && endValue !== 0) {
        for (let iteration = 0; iteration < 28; iteration += 1) {
          const middle = (low + high) / 2;
          let middleValue: number;
          try {
            middleValue = valueAt(middle);
          } catch {
            break;
          }
          if ((lowValue < 0 && middleValue < 0) || (lowValue > 0 && middleValue > 0)) {
            low = middle;
            lowValue = middleValue;
          } else {
            high = middle;
          }
        }
      } else {
        low = startValue === 0 ? start : end;
        high = low;
      }
      const root = (low + high) / 2;
      addPointCandidate(
        intercepts,
        axis === "x" ? root : 0,
        axis === "x" ? 0 : root,
        axis === "x" ? "x-intercept" : "y-intercept",
        [curve.id],
        curve.colorAt?.(axis === "x" ? root : 0, axis === "x" ? 0 : root) ?? curve.color,
        width,
        height,
      );
    }
  }
  appendLimitedIntercepts(intercepts, candidates, width, height);
}

function closestPointOnSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number; distance: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  const nearestX = x1 + fraction * dx;
  const nearestY = y1 + fraction * dy;
  return { x: nearestX, y: nearestY, distance: Math.hypot(x - nearestX, y - nearestY) };
}

function addGraphPointAt(screenX: number, screenY: number): void {
  let nearest: { curve: CurveGeometry; x: number; y: number; distance: number } | undefined;
  for (const curve of hoverCurves) {
    if (!curve.id.startsWith("expression-")) {
      continue;
    }
    for (let index = 0; index < curve.segments.length; index += 4) {
      const point = closestPointOnSegment(
        screenX,
        screenY,
        curve.segments[index]!,
        curve.segments[index + 1]!,
        curve.segments[index + 2]!,
        curve.segments[index + 3]!,
      );
      if (!nearest || point.distance < nearest.distance) {
        nearest = { curve, x: point.x, y: point.y, distance: point.distance };
      }
    }
  }
  if (!nearest || nearest.distance > 10) {
    return;
  }

  const expressionId = Number(nearest.curve.id.slice("expression-".length));
  const expression = expressions.find((entry) => entry.id === expressionId);
  if (!expression) {
    return;
  }
  const graph = getCompiled(expression);
  if (!graph || (graph.kind !== "explicit" && graph.kind !== "parametric")) {
    return;
  }

  const bounds = canvas.getBoundingClientRect();
  const pointCandidate = graph.kind === "explicit"
    ? hoverCandidates
      .filter((candidate) =>
        candidate.graphIds.includes(nearest!.curve.id) &&
        Math.hypot(candidate.screenX - screenX, candidate.screenY - screenY) <= 10)
      .sort((left, right) =>
        Math.hypot(left.screenX - screenX, left.screenY - screenY) -
        Math.hypot(right.screenX - screenX, right.screenY - screenY))[0]
    : undefined;
  const x = pointCandidate?.x ?? (nearest.x - bounds.width / 2) / scale + centerX;
  let y: number;
  if (graph.kind === "explicit") {
    try {
      const result = graph.evaluate(x);
      y = typeof result === "number" ? result : result.value.toNumber();
    } catch {
      return;
    }
  } else {
    y = (bounds.height / 2 - nearest.y) / scale + centerY;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  let table = tables.find((entry) => entry.sourceExpressionId === expression.id);
  const row = { id: nextRowId++, x: String(x), y: String(y) };
  if (!table) {
    table = {
      id: nextTableId++,
      sourceExpressionId: expression.id,
      rows: [row],
      color: expression.color,
    };
    tables.push(table);
  } else {
    table.rows.push(row);
  }
  renderTables();
  document.querySelector(".tables-panel")?.scrollIntoView({ block: "nearest" });
  draw();
}

function drawHoverOverlay(): void {
  const bounds = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width * dpr));
  const height = Math.max(1, Math.round(bounds.height * dpr));
  if (pointCanvas.width !== width || pointCanvas.height !== height) {
    pointCanvas.width = width;
    pointCanvas.height = height;
    pointContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  pointContext.clearRect(0, 0, bounds.width, bounds.height);
  if (!hoverPosition || drag) {
    return;
  }

  let nearest: { curve: CurveGeometry; x: number; y: number; distance: number } | undefined;
  for (const curve of hoverCurves) {
    for (let index = 0; index < curve.segments.length; index += 4) {
      const point = closestPointOnSegment(
        hoverPosition.x, hoverPosition.y,
        curve.segments[index]!, curve.segments[index + 1]!,
        curve.segments[index + 2]!, curve.segments[index + 3]!,
      );
      if (!nearest || point.distance < nearest.distance) {
        nearest = { curve, ...point };
      }
    }
  }
  if (nearest && nearest.distance > 10) {
    nearest = undefined;
  }

  const activeIds = new Set(nearest ? [nearest.curve.id] : []);
  const visibleCandidates = hoverCandidates.filter((candidate) =>
    candidate.graphIds.some((id) => activeIds.has(id)) ||
    (candidate.type.split(" · ").some((type) => type === "table point" || type === "list point") &&
      Math.hypot(candidate.screenX - hoverPosition!.x, candidate.screenY - hoverPosition!.y) <= 10));
  for (const candidate of visibleCandidates) {
    pointContext.beginPath();
    pointContext.arc(candidate.screenX, candidate.screenY, 5, 0, Math.PI * 2);
    pointContext.fillStyle = candidate.color;
    pointContext.fill();
    pointContext.lineWidth = 2;
    pointContext.strokeStyle = "#ffffff";
    pointContext.stroke();
  }

  let selected = visibleCandidates
    .map((candidate) => ({
      candidate,
      distance: Math.hypot(candidate.screenX - hoverPosition!.x, candidate.screenY - hoverPosition!.y),
    }))
    .filter(({ distance }) => distance <= 10)
    .sort((left, right) => left.distance - right.distance)[0]?.candidate;
  let pointX: number | undefined;
  let pointY: number | undefined;
  let label: string | undefined;
  let color = "#ffffff";
  if (selected) {
    pointX = selected.screenX;
    pointY = selected.screenY;
    const typeOrder = [
      "intersection", "vertex", "x-intercept", "y-intercept", "table point", "list point",
    ];
    const type = selected.type.split(" · ").sort(
      (left, right) => typeOrder.indexOf(left) - typeOrder.indexOf(right),
    )[0]!;
    label = `${type} · (${formatTick(selected.x)}, ${formatTick(selected.y)})`;
    color = selected.color;
  } else if (nearest && nearest.curve.id.startsWith("implicit-")) {
    pointX = nearest.x;
    pointY = nearest.y;
    label = `implicit curve · (${formatTick(
      (nearest.x - bounds.width / 2) / scale + centerX,
    )}, ${formatTick(
      (bounds.height / 2 - nearest.y) / scale + centerY,
    )})`;
    color = nearest.curve.colorAt?.(
      (nearest.x - bounds.width / 2) / scale + centerX,
      (bounds.height / 2 - nearest.y) / scale + centerY,
    ) ?? nearest.curve.color;
  }
  if (pointX === undefined || pointY === undefined || !label) {
    return;
  }
  pointContext.beginPath();
  pointContext.arc(pointX, pointY, 5, 0, Math.PI * 2);
  pointContext.fillStyle = color;
  pointContext.fill();
  pointContext.lineWidth = 2;
  pointContext.strokeStyle = "#ffffff";
  pointContext.stroke();
  pointContext.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  const maxLabelWidth = Math.max(50, bounds.width - 24);
  while (label.length > 12 && pointContext.measureText(label).width > maxLabelWidth - 16) {
    label = `${label.slice(0, -4)}…`;
  }
  const textWidth = pointContext.measureText(label).width;
  const boxWidth = Math.min(textWidth + 16, bounds.width - 8);
  const boxX = Math.min(Math.max(pointX + 10, 4), bounds.width - boxWidth - 4);
  const boxY = Math.max(4, pointY - 30);
  pointContext.fillStyle = "rgba(12, 17, 25, 0.96)";
  pointContext.fillRect(boxX, boxY, boxWidth, 24);
  pointContext.strokeStyle = "#526276";
  pointContext.strokeRect(boxX, boxY, boxWidth, 24);
  pointContext.fillStyle = "#f3f6fa";
  pointContext.fillText(label, boxX + 8, boxY + 16);
}

function drawParametricCurve(
  id: string,
  color: string,
  evaluate: (parameter: number) => [number, number],
  start: number,
  end: number,
  width: number,
  height: number,
  colorAt?: (x: number, y: number) => string,
): ExplicitCurveData {
  const samples: GraphSample[] = [];
  const geometry: ExplicitCurveData = { id, color, samples, segments: [], colorAt };
  const count = Math.max(200, Math.ceil(width / graphSettings.explicitSampleSpacing) * 2);
  if (!colorAt) {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
  }
  let previous: GraphSample | undefined;
  for (let index = 0; index <= count; index += 1) {
    const parameter = start + (end - start) * index / count;
    try {
      const [x, y] = evaluate(parameter);
      const screenX = width / 2 + (x - centerX) * scale;
      const screenY = height / 2 - (y - centerY) * scale;
      const valid = Number.isFinite(screenX) && Number.isFinite(screenY) &&
        screenX >= -width * 2 && screenX <= width * 3 &&
        screenY >= -height * 2 && screenY <= height * 3;
      const connected = Boolean(valid && previous &&
        Math.hypot(screenX - previous.screenX, screenY - previous.screenY) <= height);
      if (!valid) {
        previous = undefined;
        continue;
      }
      if (connected && previous) {
        if (!colorAt) context.lineTo(screenX, screenY);
        geometry.segments.push(previous.screenX, previous.screenY, screenX, screenY);
      } else {
        if (!colorAt) context.moveTo(screenX, screenY);
      }
      const sample = { x, y, screenX, screenY, connected };
      samples.push(sample);
      previous = sample;
    } catch {
      previous = undefined;
    }
  }
  if (colorAt) {
    strokeColoredSegments(geometry, colorAt, width, height);
  } else {
    context.stroke();
  }
  return geometry;
}

function drawInequality(
  evaluate: ImplicitEvaluation,
  relation: "<" | "<=" | ">" | ">=",
  id: string,
  color: string,
  width: number,
  height: number,
  colorAt?: (x: number, y: number) => string,
): CurveGeometry {
  const cellSize = 5;
  context.save();
  context.globalAlpha = 0.18;
  for (let screenY = 0; screenY < height; screenY += cellSize) {
    const y = (height / 2 - (screenY + cellSize / 2)) / scale + centerY;
    for (let screenX = 0; screenX < width; screenX += cellSize) {
      const x = (screenX + cellSize / 2 - width / 2) / scale + centerX;
      try {
        try {
          context.fillStyle = colorAt ? colorAt(x, y) : color;
        } catch {
          context.fillStyle = color;
        }
        const residual = evaluate(x, y);
        const value = typeof residual === "number" ? residual : residual.toNumber();
        const inside = relation === "<" ? value < 0
          : relation === "<=" ? value <= 0
            : relation === ">" ? value > 0
              : value >= 0;
        if (inside) context.fillRect(screenX, screenY, cellSize, cellSize);
      } catch {
        continue;
      }
    }
  }
  context.restore();
  return drawImplicit(evaluate, width, height, id, color, colorAt);
}

function draw(): void {
  const bounds = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasWidth = Math.max(1, Math.round(bounds.width * dpr));
  const canvasHeight = Math.max(1, Math.round(bounds.height * dpr));
  if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const width = bounds.width;
  const height = bounds.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101722";
  context.fillRect(0, 0, width, height);
  const candidates: PointCandidate[] = [];
  const explicitCurves: ExplicitCurveData[] = [];
  const implicitCurves: CurveGeometry[] = [];
  const listPoints: Array<{ x: number; y: number; color: string; graphId: string }> = [];
  for (const expression of expressions) {
    if (expression.compiledRgb) expression.rgbError = undefined;
  }

  for (const expression of expressions) {
    if (expression.hidden) continue;
    const graph = getCompiled(expression);
    if (!graph) {
      continue;
    }
    const graphId = graph.kind === "implicit"
      ? `implicit-${expression.id}`
      : `expression-${expression.id}`;
    const colorAt = compileRGB(expression);
    if (graph.kind === "implicit") {
      const curve = drawImplicit(graph.evaluate, width, height, graphId, expression.color, colorAt);
      implicitCurves.push(curve);
      detectImplicitAxisIntercepts(curve, graph.evaluate, candidates, width, height);
      continue;
    }
    if (graph.kind === "inequality") {
      const curve = drawInequality(
        graph.evaluate, graph.relation, graphId, expression.color, width, height, colorAt,
      );
      implicitCurves.push(curve);
      continue;
    }
    if (graph.kind === "parametric") {
      const curve = drawParametricCurve(
        graphId, expression.color, graph.evaluate, graph.start, graph.end, width, height, colorAt,
      );
      explicitCurves.push(curve);
      continue;
    }
    if (graph.kind === "list") {
      try {
        expression.evaluationError = undefined;
        const values = graph.evaluate();
        if (values.some((value) => !Number.isFinite(value))) {
          throw new Error("List values must be finite numbers");
        }
        const expressionError = expressionList.querySelector<HTMLParagraphElement>(
          `[data-expression-id="${expression.id}"] .expression-error`,
        );
        if (expressionError) expressionError.textContent = "";
        expressionList.querySelector<HTMLInputElement>(
          `[data-expression-id="${expression.id}"] input[type="text"]`,
        )?.removeAttribute("aria-invalid");
        values.forEach((y, index) => {
          const x = index + 1;
          const screenX = width / 2 + (x - centerX) * scale;
          const screenY = height / 2 - (y - centerY) * scale;
          const pointColor = colorAt?.(x, y) ?? expression.color;
          listPoints.push({ x, y, color: pointColor, graphId });
          if (screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height) {
            addPointCandidate(
              candidates, x, y, "list point", [graphId], pointColor, width, height,
            );
          }
        });
      } catch (reason) {
        expression.evaluationError = reason instanceof Error ? reason.message : "Could not evaluate list";
        const error = expressionList.querySelector<HTMLParagraphElement>(
          `[data-expression-id="${expression.id}"] .expression-error`,
        );
        if (error) error.textContent = expression.evaluationError;
        expressionList.querySelector<HTMLInputElement>(
          `[data-expression-id="${expression.id}"] input[type="text"]`,
        )?.setAttribute("aria-invalid", "true");
      }
      continue;
    }
    const evaluate = (x: number) => {
      const result = graph.evaluate(x);
      return typeof result === "number" ? result : result.value.toNumber();
    };
    const curve = drawExplicitCurve(graphId, expression.color, evaluate, width, height, colorAt);
    explicitCurves.push(curve);
    detectExplicitPoints(curve, evaluate, candidates, width, height);
  }

  for (const table of tables) {
    const values = tableValues(table);
    for (let index = 0; index < values.x.length; index += 1) {
      const x = values.x[index]!;
      const y = values.y[index]!;
      const screenX = width / 2 + (x - centerX) * scale;
      const screenY = height / 2 - (y - centerY) * scale;
      if (screenX < 0 || screenX > width || screenY < 0 || screenY > height) {
        continue;
      }
      addPointCandidate(candidates, x, y, "table point", [`table-${table.id}`],
        table.color, width, height);
    }

    updateTableRegression(table);
    if (table.regression) {
      const evaluate = (x: number) => evaluateRegression(table.regression!, x);
      context.setLineDash([6, 4]);
      const curve = drawExplicitCurve(
        `table-regression-${table.id}`, table.color, evaluate, width, height,
      );
      context.setLineDash([]);
      explicitCurves.push(curve);
      detectExplicitPoints(curve, evaluate, candidates, width, height);
    }
  }

  for (let first = 0; first < explicitCurves.length; first += 1) {
    for (let second = first + 1; second < explicitCurves.length; second += 1) {
      detectExplicitIntersections(
        explicitCurves[first]!, explicitCurves[second]!, candidates, width, height,
      );
    }
  }
  drawGrid(width, height);
  for (const point of listPoints) {
    const screenX = width / 2 + (point.x - centerX) * scale;
    const screenY = height / 2 - (point.y - centerY) * scale;
    if (screenX < -6 || screenX > width + 6 || screenY < -6 || screenY > height + 6) continue;
    context.beginPath();
    context.arc(screenX, screenY, 4, 0, Math.PI * 2);
    context.fillStyle = point.color;
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.stroke();
  }
  for (const table of tables) {
    const values = tableValues(table);
    context.fillStyle = table.color;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    for (let index = 0; index < values.x.length; index += 1) {
      const screenX = width / 2 + (values.x[index]! - centerX) * scale;
      const screenY = height / 2 - (values.y[index]! - centerY) * scale;
      if (screenX < -6 || screenX > width + 6 || screenY < -6 || screenY > height + 6) {
        continue;
      }
      context.beginPath();
      context.arc(screenX, screenY, 4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  }
  hoverCandidates = candidates;
  hoverCurves = [...explicitCurves, ...implicitCurves];
  for (const expression of expressions) {
    const rgbError = expressionList.querySelector<HTMLParagraphElement>(
      `[data-expression-id="${expression.id}"] .rgb-error`,
    );
    if (rgbError) rgbError.textContent = expression.rgbError ?? "";
    for (const channelInput of expressionList.querySelectorAll<HTMLInputElement>(
      `[data-expression-id="${expression.id}"] .rgb-fields input`,
    )) {
      channelInput.setAttribute("aria-invalid", String(Boolean(expression.rgbError)));
    }
  }
  drawHoverOverlay();
  viewReadout.textContent = `Center (${formatTick(centerX)}, ${formatTick(centerY)}) · ${formatTick(1 / scale)} units/px`;
  scheduleProjectSave();
}

function getCompiled(expression: Expression): CompiledGraph | undefined {
  if (expression.parsedText !== expression.text || expression.compiledMode !== graphMode) {
    expression.parsedText = expression.text;
    expression.compiledMode = graphMode;
    expression.compiled = undefined;
    expression.compileError = undefined;
    expression.evaluationError = undefined;
    try {
      expression.compiled = graphMode === "desmos"
        ? compileFastGraphExpression(expression.text, sliderValues)
        : compileGraphExpression(expression.text, sliderValues);
    } catch (reason) {
      expression.compileError = reason instanceof Error ? reason.message : "Invalid expression";
    }
  }
  return expression.compiled;
}

function sliderNames(): string[] {
  const reserved = new Set([
    "x", "y", "t", "pi", "e", "sqrt", "sin", "cos", "tan", "asin", "acos",
    "atan", "ln", "log", "exp", "abs", "parametric", "polar", "derivative", "integral",
    "list", "sum", "product", "min", "max", "mean", "median", "variance", "stdev", "factorial",
  ]);
  return [...new Set(expressions.flatMap((expression) =>
    [expression.text, expression.rgb?.red ?? "", expression.rgb?.green ?? "",
      expression.rgb?.blue ?? ""].flatMap((source) => source.match(/[a-zA-Z]+/g) ?? [])
  ).filter((name) =>
    name.length === 1 && !reserved.has(name.toLowerCase())))].sort();
}

function renderSliders(): void {
  sliderList.replaceChildren();
  const names = sliderNames();
  if (sliderAnimation && !names.includes(sliderAnimation.name)) {
    stopSliderAnimation();
  }
  if (names.length === 0) {
    sliderList.hidden = true;
    return;
  }
  sliderList.hidden = false;
  const heading = document.createElement("h2");
  heading.textContent = "Sliders";
  const help = document.createElement("p");
  help.className = "slider-help";
  help.textContent = "Play animates this parameter back and forth. Fast mode favors smoother playback; higher detail may update more slowly.";
  sliderList.append(heading, help);
  for (const name of names) {
    sliderValues[name] ??= 1;
    sliderOptions[name] ??= { min: -10, max: 10, speed: 1 };
    const options = sliderOptions[name]!;
    if (sliderValues[name]! < options.min || sliderValues[name]! > options.max) {
      sliderValues[name] = Math.min(options.max, Math.max(options.min, sliderValues[name]!));
    }
    const row = document.createElement("label");
    row.className = "slider-row";
    const title = document.createElement("span");
    title.textContent = name;
    const range = document.createElement("input");
    range.type = "range";
    range.min = String(options.min);
    range.max = String(options.max);
    range.step = "any";
    range.value = String(sliderValues[name]);
    range.setAttribute("aria-label", `Slider ${name}`);
    const number = document.createElement("input");
    number.type = "number";
    number.min = String(options.min);
    number.max = String(options.max);
    number.step = "any";
    number.value = String(sliderValues[name]);
    number.setAttribute("aria-label", `Slider ${name} value`);
    const update = (value: string) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return;
      sliderValues[name] = Math.min(options.max, Math.max(options.min, parsed));
      range.value = String(sliderValues[name]);
      number.value = String(sliderValues[name]);
      draw();
      scheduleProjectSave();
    };
    range.addEventListener("input", () => update(range.value));
    number.addEventListener("change", () => update(number.value));
    const play = document.createElement("button");
    play.type = "button";
    play.className = "slider-play";
    play.textContent = sliderAnimation?.name === name ? "Pause" : "Play";
    play.setAttribute("aria-label", `${sliderAnimation?.name === name ? "Pause" : "Play"} slider ${name}`);
    play.setAttribute("aria-pressed", String(sliderAnimation?.name === name));
    play.addEventListener("click", () => {
      if (sliderAnimation?.name === name) {
        stopSliderAnimation();
      } else {
        startSliderAnimation(name);
      }
      renderSliders();
    });

    const minInput = document.createElement("input");
    minInput.type = "number";
    minInput.step = "any";
    minInput.value = String(options.min);
    minInput.setAttribute("aria-label", `Slider ${name} minimum`);
    const maxInput = document.createElement("input");
    maxInput.type = "number";
    maxInput.step = "any";
    maxInput.value = String(options.max);
    maxInput.setAttribute("aria-label", `Slider ${name} maximum`);
    const speedInput = document.createElement("input");
    speedInput.type = "number";
    speedInput.min = "0.01";
    speedInput.max = "100";
    speedInput.step = "any";
    speedInput.value = String(options.speed);
    speedInput.setAttribute("aria-label", `Slider ${name} speed`);
    const updateOptions = () => {
      const min = Number(minInput.value);
      const max = Number(maxInput.value);
      const speed = Number(speedInput.value);
      if (![min, max, speed].every(Number.isFinite) || min >= max ||
          Math.max(Math.abs(min), Math.abs(max)) > 1_000_000 ||
          speed <= 0 || speed > 100) {
        minInput.setAttribute("aria-invalid", String(!Number.isFinite(min) || min >= max));
        maxInput.setAttribute("aria-invalid", String(!Number.isFinite(max) || max <= min));
        speedInput.setAttribute("aria-invalid", String(!Number.isFinite(speed) || speed <= 0 || speed > 100));
        return;
      }
      minInput.removeAttribute("aria-invalid");
      maxInput.removeAttribute("aria-invalid");
      speedInput.removeAttribute("aria-invalid");
      options.min = min;
      options.max = max;
      options.speed = speed;
      sliderValues[name] = Math.min(max, Math.max(min, sliderValues[name]!));
      range.min = String(min);
      range.max = String(max);
      range.value = String(sliderValues[name]);
      number.min = String(min);
      number.max = String(max);
      number.value = String(sliderValues[name]);
      draw();
      scheduleProjectSave();
    };
    minInput.addEventListener("change", updateOptions);
    maxInput.addEventListener("change", updateOptions);
    speedInput.addEventListener("change", updateOptions);
    row.append(title, play, range, number);
    sliderList.append(row);
    const boundsRow = document.createElement("div");
    boundsRow.className = "slider-settings-row";
    boundsRow.append(
      document.createTextNode("Min"),
      minInput,
      document.createTextNode("Max"),
      maxInput,
      document.createTextNode("Speed"),
      speedInput,
    );
    sliderList.append(boundsRow);
  }
}

function stopSliderAnimation(): void {
  const wasAnimating = sliderAnimation !== undefined;
  if (sliderAnimationTimer !== undefined) {
    window.clearInterval(sliderAnimationTimer);
    sliderAnimationTimer = undefined;
  }
  sliderAnimation = undefined;
  if (wasAnimating && !saveProjectLocally()) scheduleProjectSave();
}

function startSliderAnimation(name: string): void {
  stopSliderAnimation();
  const options = sliderOptions[name];
  if (!options) return;
  sliderAnimation = { name, direction: 1, lastTime: performance.now() };
  sliderAnimationTimer = window.setInterval(() => {
    if (!sliderAnimation) return;
    const activeOptions = sliderOptions[sliderAnimation.name];
    if (!activeOptions) {
      stopSliderAnimation();
      renderSliders();
      return;
    }
    const now = performance.now();
    const elapsedSeconds = Math.min(0.25, Math.max(0, now - sliderAnimation.lastTime) / 1000);
    sliderAnimation.lastTime = now;
    const span = activeOptions.max - activeOptions.min;
    const currentOffset = sliderValues[sliderAnimation.name]! - activeOptions.min;
    const phase = sliderAnimation.direction > 0
      ? currentOffset
      : 2 * span - currentOffset;
    const nextPhase = (phase + activeOptions.speed * elapsedSeconds) % (2 * span);
    const movingForward = nextPhase <= span;
    const value = movingForward
      ? activeOptions.min + nextPhase
      : activeOptions.max - (nextPhase - span);
    sliderAnimation.direction = movingForward ? 1 : -1;
    sliderValues[sliderAnimation.name] = value;
    const number = sliderList.querySelector<HTMLInputElement>(
      `[aria-label="Slider ${sliderAnimation.name} value"]`,
    );
    const range = sliderList.querySelector<HTMLInputElement>(
      `[aria-label="Slider ${sliderAnimation.name}"]`,
    );
    if (number) number.value = String(Number(value.toPrecision(8)));
    if (range) range.value = String(value);
    draw();
  }, 30);
}

function renderExpressions(): void {
  for (const name of sliderNames()) sliderValues[name] ??= 1;
  expressionList.replaceChildren();
  const renderExpression = (expression: Expression, index: number, container: HTMLElement) => {
    const row = document.createElement("div");
    row.className = `expression-row${expression.hidden ? " expression-hidden" : ""}`;
    row.dataset.expressionId = String(expression.id);
    const marker = document.createElement("span");
    marker.className = "expression-marker";
    marker.style.backgroundColor = expression.color;
    marker.setAttribute("aria-hidden", "true");
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.className = "expression-color";
    colorPicker.value = expression.color;
    colorPicker.setAttribute("aria-label", `Expression ${index + 1} base color`);
    colorPicker.addEventListener("input", () => {
      expression.color = colorPicker.value;
      marker.style.backgroundColor = expression.color;
      draw();
      scheduleProjectSave();
    });
    const input = document.createElement("input");
    input.type = "text";
    input.value = expression.text;
    input.maxLength = 512;
    input.setAttribute("aria-label", `Expression ${index + 1}`);
    const error = document.createElement("p");
    error.className = "expression-error";
    getCompiled(expression);
    if (!expression.compileError && !expression.evaluationError) {
      error.textContent = "";
      input.removeAttribute("aria-invalid");
    } else {
      error.textContent = expression.compileError ?? expression.evaluationError ?? "";
      input.setAttribute("aria-invalid", "true");
    }
    input.addEventListener("input", () => {
      expression.text = input.value;
      expression.evaluationError = undefined;
      renderSliders();
      getCompiled(expression);
      if (!expression.compileError) {
        error.textContent = "";
        input.removeAttribute("aria-invalid");
      } else {
        error.textContent = expression.compileError;
        input.setAttribute("aria-invalid", "true");
      }
      draw();
      return;
    });
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.className = "visibility-button";
    visibility.textContent = expression.hidden ? "○" : "●";
    visibility.setAttribute("aria-label", `${expression.hidden ? "Show" : "Hide"} expression ${index + 1}`);
    visibility.addEventListener("click", () => {
      expression.hidden = !expression.hidden;
      renderExpressions();
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
    const rgbDetails = document.createElement("details");
    rgbDetails.className = "expression-rgb";
    const rgbSummary = document.createElement("summary");
    rgbSummary.textContent = "Spatial RGB";
    const rgbFields = document.createElement("div");
    rgbFields.className = "rgb-fields";
    const rgbError = document.createElement("p");
    rgbError.className = "rgb-error";
    rgbError.textContent = expression.rgbError ?? "";
    const rgbFormulas = expression.rgb ?? { red: "", green: "", blue: "" };
    for (const [channel, label] of [
      ["red", "Red (0-255)"],
      ["green", "Green (0-255)"],
      ["blue", "Blue (0-255)"],
    ] as const) {
      const channelInput = document.createElement("input");
      channelInput.type = "text";
      channelInput.maxLength = 512;
      channelInput.value = rgbFormulas[channel];
      channelInput.placeholder = label;
      channelInput.setAttribute("aria-label", `Expression ${index + 1} ${label} formula`);
      channelInput.addEventListener("input", () => {
        const updated: RGBFormulas = {
          ...(expression.rgb ?? { red: "", green: "", blue: "" }),
          [channel]: channelInput.value,
        };
        expression.rgb = Object.values(updated).some((value) => value.trim())
          ? updated
          : undefined;
        expression.compiledRgbKey = undefined;
        renderSliders();
        compileRGB(expression);
        channelInput.setAttribute("aria-invalid", String(Boolean(expression.rgbError)));
        rgbError.textContent = expression.rgbError ?? "";
        draw();
        scheduleProjectSave();
      });
      rgbFields.append(channelInput);
    }
    const rgbHelp = document.createElement("small");
    rgbHelp.textContent = "Formulas use x, y, and sliders; blank channels use the base color. Results are rounded and clamped to 0-255.";
    rgbDetails.append(rgbSummary, rgbFields, rgbHelp, rgbError);
    const folderSelect = document.createElement("select");
    folderSelect.className = "expression-folder";
    folderSelect.setAttribute("aria-label", `Expression ${index + 1} folder`);
    const noFolder = document.createElement("option");
    noFolder.value = "";
    noFolder.textContent = "No folder";
    folderSelect.append(noFolder);
    for (const folder of folders) {
      const option = document.createElement("option");
      option.value = String(folder.id);
      option.textContent = folder.name;
      folderSelect.append(option);
    }
    folderSelect.value = expression.folderId === undefined ? "" : String(expression.folderId);
    folderSelect.addEventListener("change", () => {
      expression.folderId = folderSelect.value ? Number(folderSelect.value) : undefined;
      renderExpressions();
    });
    const noteDetails = document.createElement("details");
    noteDetails.className = "expression-note";
    const noteSummary = document.createElement("summary");
    noteSummary.textContent = expression.note ? "Note" : "Add note";
    const note = document.createElement("textarea");
    note.value = expression.note ?? "";
    note.setAttribute("aria-label", `Expression ${index + 1} note`);
    note.addEventListener("input", () => {
      expression.note = note.value;
      noteSummary.textContent = expression.note ? "Note" : "Add note";
      scheduleProjectSave();
    });
    noteDetails.append(noteSummary, note);
    row.append(marker, colorPicker, input, visibility, remove, error, rgbDetails, folderSelect, noteDetails);
    container.append(row);
  };
  for (const [index, expression] of expressions.entries()) {
    if (expression.folderId === undefined || !folders.some((folder) => folder.id === expression.folderId)) {
      renderExpression(expression, index, expressionList);
    }
  }
  for (const folder of folders) {
    const group = document.createElement("section");
    group.className = "folder-group";
    const header = document.createElement("div");
    header.className = "folder-heading";
    const name = document.createElement("input");
    name.value = folder.name;
    name.maxLength = 40;
    name.setAttribute("aria-label", `Folder ${folder.name} name`);
    name.addEventListener("input", () => {
      folder.name = name.value;
      for (const option of expressionList.querySelectorAll<HTMLOptionElement>(
        `.expression-folder option[value="${folder.id}"]`,
      )) option.textContent = folder.name;
      scheduleProjectSave();
    });
    const removeFolder = document.createElement("button");
    removeFolder.type = "button";
    removeFolder.className = "remove-button";
    removeFolder.textContent = "×";
    removeFolder.setAttribute("aria-label", `Remove folder ${folder.name}`);
    removeFolder.addEventListener("click", () => {
      expressions = expressions.map((expression) =>
        expression.folderId === folder.id ? { ...expression, folderId: undefined } : expression);
      folders = folders.filter((entry) => entry.id !== folder.id);
      renderExpressions();
    });
    header.append(name, removeFolder);
    group.append(header);
    for (const [index, expression] of expressions.entries()) {
      if (expression.folderId === folder.id) renderExpression(expression, index, group);
    }
    expressionList.append(group);
  }
  renderSliders();
  scheduleProjectSave();
}

function tableValues(table: DataTable): { x: number[]; y: number[]; error?: string } {
  const x: number[] = [];
  const y: number[] = [];
  for (const [index, row] of table.rows.entries()) {
    const xText = row.x.trim();
    const yText = row.y.trim();
    if (!xText && !yText) {
      continue;
    }
    if (!xText || !yText) {
      return { x, y, error: `Enter both x and y values in row ${index + 1}.` };
    }
    const xValue = Number(xText);
    const yValue = Number(yText);
    if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
      return { x, y, error: `Row ${index + 1} must contain finite numbers.` };
    }
    x.push(xValue);
    y.push(yValue);
  }
  return { x, y };
}

function updateTableRegression(table: DataTable): void {
  const key = JSON.stringify([
    table.regressionDegree,
    table.regressionKind,
    table.rows.map((row) => [row.x, row.y]),
  ]);
  if (table.regressionKey === key) {
    return;
  }
  table.regressionKey = key;
  table.regression = undefined;
  table.regressionError = undefined;
  table.regressionSummary = undefined;
  if (table.regressionDegree === undefined && !table.regressionKind) {
    return;
  }
  const values = tableValues(table);
  if (values.error) {
    table.regressionError = values.error;
    return;
  }
  try {
    if (table.regressionDegree !== undefined) {
      table.regression = {
        kind: "polynomial",
        fit: fitPolynomialRegression(values.x, values.y, table.regressionDegree),
      };
    } else if (table.regressionKind === "logarithmic") {
      table.regression = {
        kind: "logarithmic",
        fit: fitLogarithmicRegression(values.x, values.y),
      };
    } else if (table.regressionKind === "exponential") {
      table.regression = {
        kind: "exponential",
        fit: fitExponentialRegression(values.x, values.y),
      };
    } else if (table.regressionKind === "power") {
      table.regression = {
        kind: "power",
        fit: fitPowerRegression(values.x, values.y),
      };
    } else if (table.regressionKind === "sine") {
      table.regression = { kind: "sine", fit: fitSineRegression(values.x, values.y) };
    } else if (table.regressionKind === "tangent") {
      table.regression = { kind: "tangent", fit: fitTangentRegression(values.x, values.y) };
    } else {
      return;
    }

    const meanY = values.y.reduce((sum, value) => sum + value, 0) / values.y.length;
    let residualTotal = 0;
    let variationTotal = 0;
    for (let index = 0; index < values.x.length; index += 1) {
      const predicted = evaluateRegression(table.regression, values.x[index]!);
      if (!Number.isFinite(predicted)) {
        throw new Error("Regression produced a non-finite result for the input data");
      }
      residualTotal += (values.y[index]! - predicted) ** 2;
      variationTotal += (values.y[index]! - meanY) ** 2;
    }
    const rSquared = variationTotal === 0
      ? residualTotal === 0 ? 1 : 0
      : 1 - residualTotal / variationTotal;
    table.regressionSummary =
      `y ≈ ${regressionExpression(table.regression, 5)} · R² ${formatTick(rSquared)}`;
  } catch (reason) {
    table.regressionError = reason instanceof Error ? reason.message : "Could not fit regression";
  }
}

function tableStatistics(table: DataTable): string {
  const { x, y, error } = tableValues(table);
  if (error || y.length === 0) return "Statistics appear when the table has valid data.";
  const sorted = [...y].sort((left, right) => left - right);
  const mean = y.reduce((sum, value) => sum + value, 0) / y.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
    : sorted[Math.floor(sorted.length / 2)]!;
  const standardDeviation = Math.sqrt(
    y.reduce((sum, value) => sum + (value - mean) ** 2, 0) / y.length,
  );
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  return `n ${y.length} · x̄ ${formatTick(meanX)} · ȳ ${formatTick(mean)} · median ${formatTick(median)} · SD ${formatTick(standardDeviation)} · range ${formatTick(sorted[0]!)}–${formatTick(sorted[sorted.length - 1]!)}`;
}

function polynomialExpression(regression: PolynomialRegression, digits: number): string {
  const terms = regression.powerCoefficients
    .map((coefficient, power) => ({ value: coefficient.toNumber(), power }))
    .reverse()
    .filter(({ value }) => Math.abs(value) > 1e-10)
    .map(({ value, power }, index) => {
      const magnitude = formatRegressionNumber(Math.abs(value), digits);
      const term = power === 0 ? magnitude
        : power === 1 ? `${magnitude}x`
          : `${magnitude}x^${power}`;
      if (index === 0) {
        return value < 0 ? `-${term}` : term;
      }
      return value < 0 ? ` - ${term}` : ` + ${term}`;
    });
  return terms.join("") || "0";
}

function formatRegressionNumber(value: number, digits = 8): string {
  const formatted = Number(value.toPrecision(digits)).toString();
  if (!/[eE]/.test(formatted)) {
    return formatted;
  }
  const [mantissa = "", exponentText = "0"] = formatted.toLowerCase().split("e");
  const exponent = Number(exponentText);
  const negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const decimalPosition = (unsigned.indexOf(".") < 0 ? unsigned.length : unsigned.indexOf(".")) + exponent;
  const digitsOnly = unsigned.replace(".", "");
  const expanded = decimalPosition <= 0
    ? `0.${"0".repeat(-decimalPosition)}${digitsOnly}`
    : decimalPosition >= digitsOnly.length
      ? `${digitsOnly}${"0".repeat(decimalPosition - digitsOnly.length)}`
      : `${digitsOnly.slice(0, decimalPosition)}.${digitsOnly.slice(decimalPosition)}`;
  const normalized = expanded.includes(".")
    ? expanded.replace(/\.?0+$/, "")
    : expanded;
  return `${negative ? "-" : ""}${normalized}`;
}

function evaluateRegression(regression: RegressionFit, x: number): number {
  switch (regression.kind) {
    case "polynomial": {
      const fit = regression.fit;
      const normalized = (x - fit.center.toNumber()) / fit.scale.toNumber();
      return fit.coefficients.reduceRight(
        (value, coefficient) => value * normalized + coefficient.toNumber(),
        0,
      );
    }
    case "logarithmic":
      return regression.fit.intercept.toNumber() +
        regression.fit.slope.toNumber() * Math.log(x);
    case "exponential":
      return regression.fit.scale.toNumber() * Math.exp(regression.fit.rate.toNumber() * x);
    case "power":
      return regression.fit.scale.toNumber() * x ** regression.fit.exponent.toNumber();
    case "sine":
      return regression.fit.amplitude *
        Math.sin(regression.fit.frequency * x + regression.fit.phase) + regression.fit.offset;
    case "tangent":
      return regression.fit.amplitude *
        Math.tan(regression.fit.frequency * x + regression.fit.phase) + regression.fit.offset;
  }
}

function regressionExpression(regression: RegressionFit, digits = 12): string {
  switch (regression.kind) {
    case "polynomial":
      return polynomialExpression(regression.fit, digits);
    case "logarithmic": {
      const intercept = regression.fit.intercept.toNumber();
      const slope = regression.fit.slope.toNumber();
      const interceptText = formatRegressionNumber(intercept, digits);
      const slopeText = formatRegressionNumber(Math.abs(slope), digits);
      if (intercept === 0) {
        return `${slope < 0 ? "-" : ""}${slopeText}ln(x)`;
      }
      return `${interceptText} ${slope < 0 ? "-" : "+"} ${slopeText}ln(x)`;
    }
    case "exponential":
      return `${formatRegressionNumber(regression.fit.scale.toNumber(), digits)}exp(${
        formatRegressionNumber(regression.fit.rate.toNumber(), digits)}x)`;
    case "power":
      return `${formatRegressionNumber(regression.fit.scale.toNumber(), digits)}x^${
        formatRegressionNumber(regression.fit.exponent.toNumber(), digits)}`;
    case "sine":
    case "tangent": {
      const fit = regression.fit;
      const trig = regression.kind === "sine" ? "sin" : "tan";
      const sign = fit.phase < 0 ? "-" : "+";
      const phaseText = fit.phase === 0 ? "" : ` ${sign} ${
        formatRegressionNumber(Math.abs(fit.phase), digits)
      }`;
      const offsetText = formatRegressionNumber(Math.abs(fit.offset), digits);
      const offsetTerm = fit.offset === 0 ? "" : ` ${fit.offset < 0 ? "-" : "+"} ${offsetText}`;
      return `${formatRegressionNumber(fit.amplitude, digits)}${trig}(${
        formatRegressionNumber(fit.frequency, digits)
      }x${phaseText})${offsetTerm}`;
    }
  }
}

function updateRegressionSummary(summary: HTMLParagraphElement, table: DataTable, tableIndex: number): void {
  summary.replaceChildren();
  if (!table.regressionSummary || !table.regression) {
    return;
  }
  summary.append(document.createTextNode(`${table.regressionSummary} `));
  const copyRegression = document.createElement("button");
  copyRegression.type = "button";
  copyRegression.className = "copy-regression";
  copyRegression.textContent = "Copy to expressions";
  copyRegression.setAttribute("aria-label", `Copy Table ${tableIndex + 1} regression to expressions`);
  copyRegression.addEventListener("click", () => {
    if (table.regression) {
      addExpression(`y = ${regressionExpression(table.regression)}`);
    }
  });
  summary.append(copyRegression);
}

function renderTables(): void {
  tableList.replaceChildren();
  for (const [tableIndex, table] of tables.entries()) {
    updateTableRegression(table);
    const container = document.createElement("section");
    container.className = "data-table";
    const heading = document.createElement("div");
    heading.className = "data-table-heading";
    const title = document.createElement("span");
    const sourceExpression = table.sourceExpressionId === undefined
      ? undefined
      : expressions.findIndex((entry) => entry.id === table.sourceExpressionId);
    title.textContent = sourceExpression === undefined
      ? `Table ${tableIndex + 1}`
      : sourceExpression < 0
        ? `Table ${tableIndex + 1} · source removed`
        : `Table ${tableIndex + 1} · Expression ${sourceExpression + 1}`;
    title.style.color = table.color;
    const removeTable = document.createElement("button");
    removeTable.className = "table-remove";
    removeTable.type = "button";
    removeTable.textContent = "×";
    removeTable.setAttribute("aria-label", `Remove table ${tableIndex + 1}`);
    removeTable.addEventListener("click", () => {
      tables = tables.filter((entry) => entry.id !== table.id);
      renderTables();
      draw();
    });
    heading.append(title, removeTable);

    const columns = document.createElement("div");
    columns.className = "table-columns";
    const xHeading = document.createElement("span");
    xHeading.textContent = "x";
    const yHeading = document.createElement("span");
    yHeading.textContent = "y";
    columns.append(xHeading, yHeading, document.createElement("span"));

    const rowList = document.createElement("div");
    for (const [rowIndex, dataRow] of table.rows.entries()) {
      const row = document.createElement("div");
      row.className = "table-data-row";
      const xInput = document.createElement("input");
      xInput.type = "text";
      xInput.inputMode = "decimal";
      xInput.value = dataRow.x;
      xInput.setAttribute("aria-label", `Table ${tableIndex + 1} x value ${rowIndex + 1}`);
      const yInput = document.createElement("input");
      yInput.type = "text";
      yInput.inputMode = "decimal";
      yInput.value = dataRow.y;
      yInput.setAttribute("aria-label", `Table ${tableIndex + 1} y value ${rowIndex + 1}`);
      const removeRow = document.createElement("button");
      removeRow.type = "button";
      removeRow.className = "row-remove";
      removeRow.textContent = "×";
      removeRow.setAttribute("aria-label", `Remove table ${tableIndex + 1} row ${rowIndex + 1}`);
      const updateValues = () => {
        dataRow.x = xInput.value;
        dataRow.y = yInput.value;
        const values = tableValues(table);
        const rowTouched = Boolean(dataRow.x.trim() || dataRow.y.trim());
        xInput.setAttribute("aria-invalid", String(
          rowTouched && (!dataRow.x.trim() || !Number.isFinite(Number(dataRow.x.trim()))),
        ));
        yInput.setAttribute("aria-invalid", String(
          rowTouched && (!dataRow.y.trim() || !Number.isFinite(Number(dataRow.y.trim()))),
        ));
        updateTableRegression(table);
        error.textContent = table.regressionError ?? values.error ?? "";
        updateRegressionSummary(summary, table, tableIndex);
        stats.textContent = tableStatistics(table);
        draw();
      };
      xInput.addEventListener("input", updateValues);
      yInput.addEventListener("input", updateValues);
      removeRow.addEventListener("click", () => {
        table.rows = table.rows.filter((entry) => entry.id !== dataRow.id);
        renderTables();
        draw();
      });
      row.append(xInput, yInput, removeRow);
      rowList.append(row);
    }

    const actions = document.createElement("div");
    actions.className = "table-actions";
    const addRow = document.createElement("button");
    addRow.type = "button";
    addRow.textContent = "Add row";
    addRow.addEventListener("click", () => {
      table.rows.push({ id: nextRowId++, x: "", y: "" });
      renderTables();
      draw();
      tableList.querySelector<HTMLInputElement>(
        `[aria-label="Table ${tableIndex + 1} x value ${table.rows.length}"]`,
      )?.focus();
    });
    actions.append(addRow);

    const regression = document.createElement("label");
    regression.className = "table-regression";
    regression.append(document.createTextNode("Regression"));
    const model = document.createElement("select");
    model.setAttribute("aria-label", `Table ${tableIndex + 1} regression model`);
    const modelOptions = [
      ["", "Off"],
      ["1", "Linear"],
      ["2", "Quadratic"],
      ["3", "Polynomial"],
      ["logarithmic", "Logarithmic"],
      ["exponential", "Exponential"],
      ["power", "Power"],
      ["sine", "Sine"],
      ["tangent", "Tangent"],
    ];
    for (const [value, label] of modelOptions) {
      const option = document.createElement("option");
      option.value = value!;
      option.textContent = label!;
      model.append(option);
    }
    model.value = table.regressionDegree !== undefined
      ? String(Math.min(table.regressionDegree, 3))
      : table.regressionKind ?? "";
    model.addEventListener("change", () => {
      if (model.value === "") {
        table.regressionDegree = undefined;
        table.regressionKind = undefined;
      } else if (["1", "2", "3"].includes(model.value)) {
        table.regressionDegree = Number(model.value);
        table.regressionKind = undefined;
      } else if (isRegressionKind(model.value)) {
        table.regressionDegree = undefined;
        table.regressionKind = model.value;
      }
      renderTables();
      draw();
    });
    regression.append(model);
    actions.append(regression);

    if (table.regressionDegree !== undefined && table.regressionDegree >= 3) {
      const degree = document.createElement("select");
      degree.className = "table-degree";
      degree.setAttribute("aria-label", `Table ${tableIndex + 1} polynomial degree`);
      for (let value = 3; value <= 5; value += 1) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = `degree ${value}`;
        degree.append(option);
      }
      degree.value = String(Math.min(table.regressionDegree, 5));
      degree.addEventListener("change", () => {
        table.regressionDegree = Number(degree.value);
        updateTableRegression(table);
        error.textContent = table.regressionError ?? "";
        updateRegressionSummary(summary, table, tableIndex);
        draw();
      });
      actions.append(degree);
    }

    const error = document.createElement("p");
    error.className = "table-error";
    error.textContent = table.regressionError ?? "";
    const summary = document.createElement("p");
    summary.className = "table-summary";
    updateRegressionSummary(summary, table, tableIndex);
    const stats = document.createElement("p");
    stats.className = "table-stats";
    stats.textContent = tableStatistics(table);
    container.append(heading, columns, rowList, actions, summary, stats, error);
    tableList.append(container);
  }
}

function isRegressionKind(value: string): value is NonNullable<DataTable["regressionKind"]> {
  return value === "logarithmic" || value === "exponential" || value === "power" ||
    value === "sine" || value === "tangent";
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

function currentProjectState(): ProjectState {
  return {
    version: 1,
    expressions: expressions.map(({ id, text, color, folderId, note, hidden, rgb }) =>
      ({ id, text, color, folderId, note, hidden, rgb })),
    tables: tables.map(({ id, rows, sourceExpressionId, regressionDegree, regressionKind, color }) =>
      ({ id, rows, sourceExpressionId, regressionDegree, regressionKind, color })),
    folders: folders.map(({ id, name }) => ({ id, name })),
    sliders: { ...sliderValues },
    sliderOptions: { ...sliderOptions },
    centerX,
    centerY,
    scale,
  };
}

function setProjectStatus(message: string): void {
  const status = document.querySelector<HTMLSpanElement>("#project-status");
  if (status) status.textContent = message;
}

function saveProjectLocally(): boolean {
  try {
    localStorage.setItem("better-desmos-project-v1", JSON.stringify(currentProjectState()));
    automaticSavingEnabled = true;
    return true;
  } catch (reason) {
    setProjectStatus(reason instanceof Error
      ? `Could not save locally: ${reason.message}`
      : "Could not save this project in browser storage.");
    return false;
  }
}

let automaticSavingEnabled = !projectStatus;
let saveTimer: number | undefined;
function scheduleProjectSave(): void {
  if (!automaticSavingEnabled || sliderAnimation) return;
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (saveProjectLocally()) setProjectStatus("Saved on this device");
  }, 400);
}

function applyProjectState(project: ProjectState): void {
  stopSliderAnimation();
  expressions = project.expressions.map((expression) => ({ ...expression }));
  tables = project.tables.map((table) => ({
    id: table.id,
    rows: table.rows.map((row) => ({ ...row })),
    sourceExpressionId: table.sourceExpressionId,
    regressionDegree: table.regressionDegree,
    regressionKind: table.regressionKind,
    color: table.color,
  }));
  folders = project.folders.map((folder) => ({ ...folder }));
  for (const key of Object.keys(sliderValues)) delete sliderValues[key];
  Object.assign(sliderValues, project.sliders);
  for (const key of Object.keys(sliderOptions)) delete sliderOptions[key];
  Object.assign(sliderOptions, project.sliderOptions ?? {});
  centerX = project.centerX;
  centerY = project.centerY;
  scale = project.scale;
  nextId = expressions.reduce((next, expression) => Math.max(next, expression.id + 1), 1);
  nextTableId = tables.reduce((next, table) => Math.max(next, table.id + 1), 1);
  nextRowId = tables.reduce(
    (next, table) => table.rows.reduce((rowNext, row) => Math.max(rowNext, row.id + 1), next),
    1,
  );
  nextFolderId = folders.reduce((next, folder) => Math.max(next, folder.id + 1), 1);
  renderExpressions();
  renderTables();
  draw();
  scheduleProjectSave();
}

function encodeProjectShareLink(): string {
  const bytes = new TextEncoder().encode(JSON.stringify(currentProjectState()));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const url = new URL(location.href);
  url.hash = `project=${encoded}`;
  if (url.href.length > 50_000) {
    throw new Error("This project is too large for a shareable link. Export it as JSON instead.");
  }
  return url.href;
}

document.querySelector("#save-project")!.addEventListener("click", () => {
  if (saveProjectLocally()) setProjectStatus("Saved on this device");
});
document.querySelector("#export-project")!.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(currentProjectState(), null, 2)], {
    type: "application/json",
  });
  const download = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  download.href = objectUrl;
  download.download = "better-desmos-project.json";
  download.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  setProjectStatus("Project exported as JSON");
});
const projectFileInput = document.querySelector<HTMLInputElement>("#project-file")!;
document.querySelector("#import-project")!.addEventListener("click", () => projectFileInput.click());
projectFileInput.addEventListener("change", async () => {
  const file = projectFileInput.files?.[0];
  projectFileInput.value = "";
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error("Project files must be 5 MB or smaller.");
    const project = parseProjectState(await file.text());
    applyProjectState(project);
    setProjectStatus(`Imported ${file.name}`);
  } catch (reason) {
    setProjectStatus(reason instanceof Error
      ? `Import failed: ${reason.message}`
      : "Import failed: invalid project file.");
  }
});
document.querySelector("#share-project")!.addEventListener("click", async () => {
  try {
    const link = encodeProjectShareLink();
    await navigator.clipboard.writeText(link);
    setProjectStatus("Share link copied");
  } catch (reason) {
    setProjectStatus(reason instanceof Error
      ? `Could not copy share link: ${reason.message}`
      : "Could not copy share link. Check browser clipboard permissions.");
  }
});

document.querySelector("#add-expression")!.addEventListener("click", () => addExpression());
document.querySelector("#add-folder")!.addEventListener("click", () => {
  folders.push({ id: nextFolderId++, name: `Folder ${folders.length + 1}` });
  renderExpressions();
});
document.querySelector("#add-table")!.addEventListener("click", () => {
  tables.push({
    id: nextTableId++,
    rows: [
      { id: nextRowId++, x: "", y: "" },
      { id: nextRowId++, x: "", y: "" },
      { id: nextRowId++, x: "", y: "" },
    ],
    color: colors[(tables.length + 2) % colors.length]!,
  });
  renderTables();
  document.querySelector(".tables-panel")?.scrollIntoView({ block: "nearest" });
  tableList.querySelector<HTMLInputElement>(`[aria-label="Table ${tables.length} x value 1"]`)?.focus();
  draw();
});
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

const precisionInput = document.querySelector<HTMLInputElement>("#precision-setting")!;
const precisionValue = document.querySelector<HTMLOutputElement>("#precision-value")!;
const desmosModeInput = document.querySelector<HTMLInputElement>("#desmos-mode")!;
precisionInput.value = String(graphSettings.precisionDigits);
desmosModeInput.addEventListener("change", () => {
  if (desmosModeInput.checked) {
    savedPreciseSettings = { ...graphSettings };
    graphMode = "desmos";
    graphSettings.explicitSampleSpacing = explicitSpacingOptions[0]!;
    graphSettings.implicitSampleSpacing = implicitSpacingOptions[0]!;
    explicitSpacingInput.value = "0";
    implicitSpacingInput.value = "0";
    explicitSpacingValue.value = `${graphSettings.explicitSampleSpacing} px`;
    implicitSpacingValue.value = `${graphSettings.implicitSampleSpacing} px`;
  } else {
    graphMode = "precise";
    if (savedPreciseSettings) {
      Object.assign(graphSettings, savedPreciseSettings);
      explicitSpacingInput.value = String(explicitSpacingOptions.indexOf(graphSettings.explicitSampleSpacing));
      implicitSpacingInput.value = String(implicitSpacingOptions.indexOf(graphSettings.implicitSampleSpacing));
      explicitSpacingValue.value = `${graphSettings.explicitSampleSpacing} px`;
      implicitSpacingValue.value = `${graphSettings.implicitSampleSpacing} px`;
      precisionInput.value = String(graphSettings.precisionDigits);
    }
    savedPreciseSettings = undefined;
  }
  precisionInput.disabled = graphMode === "desmos";
  explicitSpacingInput.disabled = graphMode === "desmos";
  implicitSpacingInput.disabled = graphMode === "desmos";
  precisionValue.value = graphMode === "desmos"
    ? `≈${FAST_MODE_PRECISION_DIGITS} digits`
    : `${graphSettings.precisionDigits} digits`;
  document.querySelector("#mode-note")!.textContent = graphMode === "desmos"
    ? "Desmos mode · maximum performance"
    : "Exact where possible · configurable precision";
  renderExpressions();
  draw();
});
precisionInput.addEventListener("input", () => {
  const precision = Number(precisionInput.value);
  setPrecisionDigits(precision);
  graphSettings.precisionDigits = precision;
  precisionValue.value = `${precision} digits`;
  draw();
});

const explicitSpacingInput = document.querySelector<HTMLInputElement>("#explicit-spacing-setting")!;
const explicitSpacingValue = document.querySelector<HTMLOutputElement>("#explicit-spacing-value")!;
explicitSpacingInput.value = String(explicitSpacingOptions.indexOf(graphSettings.explicitSampleSpacing));
explicitSpacingInput.addEventListener("input", () => {
  graphSettings.explicitSampleSpacing = explicitSpacingOptions[Number(explicitSpacingInput.value)]!;
  explicitSpacingValue.value = `${graphSettings.explicitSampleSpacing} px`;
  draw();
});

const implicitSpacingInput = document.querySelector<HTMLInputElement>("#implicit-spacing-setting")!;
const implicitSpacingValue = document.querySelector<HTMLOutputElement>("#implicit-spacing-value")!;
implicitSpacingInput.value = String(implicitSpacingOptions.indexOf(graphSettings.implicitSampleSpacing));
implicitSpacingInput.addEventListener("input", () => {
  graphSettings.implicitSampleSpacing = implicitSpacingOptions[Number(implicitSpacingInput.value)]!;
  implicitSpacingValue.value = `${graphSettings.implicitSampleSpacing} px`;
  draw();
});

canvas.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, centerX, centerY, moved: false };
  canvas.setPointerCapture(event.pointerId);
  drawHoverOverlay();
});
canvas.addEventListener("pointermove", (event) => {
  const bounds = canvas.getBoundingClientRect();
  if (drag) {
    if (drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) {
      drag.moved = true;
      centerX = drag.centerX - (event.clientX - drag.x) / scale;
      centerY = drag.centerY + (event.clientY - drag.y) / scale;
      draw();
    }
  } else {
    hoverPosition = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    drawHoverOverlay();
  }
});
canvas.addEventListener("pointerup", (event) => {
  const bounds = canvas.getBoundingClientRect();
  if (drag && !drag.moved) {
    const screenX = event.clientX - bounds.left;
    const screenY = event.clientY - bounds.top;
    hoverPosition = { x: screenX, y: screenY };
    addGraphPointAt(screenX, screenY);
  }
  drag = undefined;
  drawHoverOverlay();
});
canvas.addEventListener("pointercancel", () => {
  drag = undefined;
  drawHoverOverlay();
});
canvas.addEventListener("pointerleave", () => {
  if (!drag) {
    hoverPosition = undefined;
    drawHoverOverlay();
  }
});
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
setProjectStatus(projectStatus);
renderExpressions();
renderTables();
draw();

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
  hexToHsv,
  hsvToHex,
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
type CompiledChannels = [
  ColorEvaluator | undefined,
  ColorEvaluator | undefined,
  ColorEvaluator | undefined,
];

interface HSVFormulas {
  hue: string;
  saturation: string;
  value: string;
}

interface Expression {
  id: number;
  text: string;
  color: string;
  lineWidth?: number;
  opacity?: number;
  folderId?: number;
  note?: string;
  hidden?: boolean;
  hsv?: HSVFormulas;
  compiledHsv?: CompiledChannels;
  compiledHsvKey?: string;
  colorError?: string;
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
  folderId?: number;
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
  collapsed?: boolean;
}

interface TextBlock {
  id: number;
  text: string;
  folderId?: number;
}

interface ProjectState {
  version: 1;
  expressions: Expression[];
  tables: DataTable[];
  texts?: TextBlock[];
  workspaceOrder: WorkspaceItem[];
  folders: Folder[];
  sliders: Record<string, number>;
  sliderOptions?: Record<string, SliderOptions>;
  centerX: number;
  centerY: number;
  scale: number;
  graphOptions?: GraphOptions;
}

interface GraphOptions {
  showGrid: boolean;
  showXAxis: boolean;
  showYAxis: boolean;
  showLabels: boolean;
  aspectRatio: 0.5 | 1 | 2;
}

interface WorkspaceItem {
  type: "expression" | "table" | "text" | "folder";
  id: number;
  folderId?: number;
}

interface WorkspaceBlock {
  key: string;
  items: WorkspaceItem[];
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
let projectStatus = "";
const PROJECT_STORAGE_KEY = "better-desmos-project-v1";
const AUTO_SAVE_STORAGE_KEY = "better-desmos-autosave-v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHSVFormulas(value: unknown): value is HSVFormulas {
  return isRecord(value) &&
    ["hue", "saturation", "value"].every((channel) =>
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
  const graphOptions = value.graphOptions;
  if (graphOptions !== undefined &&
      (!isRecord(graphOptions) ||
        typeof graphOptions.showGrid !== "boolean" ||
        typeof graphOptions.showXAxis !== "boolean" ||
        typeof graphOptions.showYAxis !== "boolean" ||
        typeof graphOptions.showLabels !== "boolean" ||
        ![0.5, 1, 2].includes(Number(graphOptions.aspectRatio)))) {
    throw new Error("Project contains invalid graph settings.");
  }
  const parsedExpressions = value.expressions.map((item): Expression => {
    const hsv = isRecord(item) ? item.hsv : undefined;
    if (!isRecord(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
        typeof item.text !== "string" ||
        item.text.length > 512 || typeof item.color !== "string" ||
        !/^#[\da-f]{6}$/i.test(item.color) ||
        (item.lineWidth !== undefined &&
          (typeof item.lineWidth !== "number" || !Number.isFinite(item.lineWidth) ||
            item.lineWidth < 1 || item.lineWidth > 10)) ||
        (item.opacity !== undefined &&
          (typeof item.opacity !== "number" || !Number.isFinite(item.opacity) ||
            item.opacity < 0 || item.opacity > 1)) ||
        (item.folderId !== undefined && !Number.isInteger(item.folderId)) ||
        (item.note !== undefined && (typeof item.note !== "string" || item.note.length > 10_000)) ||
        (item.hidden !== undefined && typeof item.hidden !== "boolean") ||
        (hsv !== undefined && !isHSVFormulas(hsv))) {
      throw new Error("Project contains an invalid expression.");
    }
    return {
      id: item.id as number,
      text: item.text,
      color: item.color,
      lineWidth: item.lineWidth === undefined ? 2 : item.lineWidth as number,
      opacity: item.opacity === undefined ? 1 : item.opacity as number,
      folderId: item.folderId as number | undefined,
      note: item.note as string | undefined,
      hidden: item.hidden as boolean | undefined,
      hsv: hsv === undefined ? undefined : {
        hue: hsv.hue,
        saturation: hsv.saturation,
        value: hsv.value,
      },
    };
  });
  const parsedFolders = value.folders.map((item): Folder => {
    if (!isRecord(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
        typeof item.name !== "string" || item.name.length > 40 ||
        (item.collapsed !== undefined && typeof item.collapsed !== "boolean")) {
      throw new Error("Project contains an invalid folder.");
    }
    return {
      id: item.id as number,
      name: item.name,
      collapsed: item.collapsed as boolean | undefined,
    };
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
      folderId: Number.isInteger(item.folderId) ? item.folderId as number : undefined,
      regressionDegree: item.regressionDegree as number | undefined,
      regressionKind: regressionKind as DataTable["regressionKind"],
    };
  });
  const parsedTexts: TextBlock[] = [];
  if (value.texts !== undefined) {
    if (!Array.isArray(value.texts) || value.texts.length > 300) {
      throw new Error("Project contains invalid text blocks.");
    }
    for (const item of value.texts) {
      if (!isRecord(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
          typeof item.text !== "string" || item.text.length > 10_000 ||
          (item.folderId !== undefined && !Number.isSafeInteger(item.folderId))) {
        throw new Error("Project contains an invalid text block.");
      }
      parsedTexts.push({
        id: item.id as number,
        text: item.text,
        folderId: item.folderId as number | undefined,
      });
    }
  }
  if (parsedTexts.length > 300) {
    throw new Error("Project contains too many text blocks.");
  }
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
  const textIds = parsedTexts.map(({ id }) => id);
  const folderIds = parsedFolders.map(({ id }) => id);
  const rowIds = parsedTables.flatMap(({ rows }) => rows.map(({ id }) => id));
  if (new Set(expressionIds).size !== expressionIds.length ||
      new Set(tableIds).size !== tableIds.length ||
      new Set(textIds).size !== textIds.length ||
      new Set(folderIds).size !== folderIds.length ||
      new Set(rowIds).size !== rowIds.length ||
      parsedTables.reduce((count, table) => count + table.rows.length, 0) > 20_000) {
    throw new Error("Project contains duplicate IDs or too many table rows.");
  }
  const rawWorkspaceOrder = value.workspaceOrder;
  if (rawWorkspaceOrder !== undefined &&
      (!Array.isArray(rawWorkspaceOrder) || rawWorkspaceOrder.length > 1000)) {
    throw new Error("Project contains an invalid workspace order.");
  }
  const parsedWorkspaceOrder = rawWorkspaceOrder === undefined
    ? [
      ...parsedExpressions.map(({ id, folderId }): WorkspaceItem => ({
        type: "expression", id, folderId,
      })),
      ...parsedTables.map(({ id, folderId }): WorkspaceItem => ({
        type: "table", id, folderId,
      })),
      ...parsedTexts.map(({ id, folderId }): WorkspaceItem => ({
        type: "text", id, folderId,
      })),
      ...parsedFolders.map(({ id }): WorkspaceItem => ({ type: "folder", id })),
    ]
    : rawWorkspaceOrder.map((item): WorkspaceItem => {
      if (!isRecord(item) ||
          (item.type !== "expression" && item.type !== "table" &&
            item.type !== "text" && item.type !== "folder") ||
          !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
          (item.type === "folder" && item.folderId !== undefined) ||
          (item.folderId !== undefined && !Number.isSafeInteger(item.folderId))) {
        throw new Error("Project contains an invalid workspace order.");
      }
      return {
        type: item.type,
        id: item.id as number,
        folderId: item.folderId as number | undefined,
      };
    });
  let nextParsedTextId = Math.max(0, ...parsedTexts.map(({ id }) => id)) + 1;
  for (const expression of parsedExpressions) {
    if (!expression.note) continue;
    const textBlock: TextBlock = {
      id: nextParsedTextId++,
      text: expression.note,
      folderId: expression.folderId,
    };
    parsedTexts.push(textBlock);
    const expressionIndex = parsedWorkspaceOrder.findIndex((item) =>
      item.type === "expression" && item.id === expression.id);
    parsedWorkspaceOrder.splice(expressionIndex + 1, 0, {
      type: "text",
      id: textBlock.id,
      folderId: textBlock.folderId,
    });
    expression.note = undefined;
  }
  if (parsedTexts.length > 500 || parsedWorkspaceOrder.length > 1000) {
    throw new Error("Project contains too many workspace items.");
  }
  for (const folder of parsedFolders) {
    if (!parsedWorkspaceOrder.some((item) =>
      item.type === "folder" && item.id === folder.id)) {
      parsedWorkspaceOrder.push({ type: "folder", id: folder.id });
    }
  }
  const workspaceKeys = parsedWorkspaceOrder.map(({ type, id }) => `${type}:${id}`);
  const expectedWorkspaceKeys = [
    ...expressionIds.map((id) => `expression:${id}`),
    ...tableIds.map((id) => `table:${id}`),
    ...parsedTexts.map(({ id }) => `text:${id}`),
    ...folderIds.map((id) => `folder:${id}`),
  ];
  if (new Set(workspaceKeys).size !== workspaceKeys.length ||
      workspaceKeys.length !== expectedWorkspaceKeys.length ||
      expectedWorkspaceKeys.some((key) => !workspaceKeys.includes(key))) {
    throw new Error("Project workspace order must include each expression, table, text block, and folder exactly once.");
  }
  return {
    version: 1,
    expressions: parsedExpressions,
    tables: parsedTables,
    texts: parsedTexts,
    workspaceOrder: parsedWorkspaceOrder,
    folders: parsedFolders,
    sliders,
    sliderOptions,
    centerX: value.centerX,
    centerY: value.centerY,
    scale: Math.min(100_000, Math.max(0.001, value.scale)),
    graphOptions: graphOptions === undefined ? undefined : {
      showGrid: graphOptions.showGrid as boolean,
      showXAxis: graphOptions.showXAxis as boolean,
      showYAxis: graphOptions.showYAxis as boolean,
      showLabels: graphOptions.showLabels as boolean,
      aspectRatio: Number(graphOptions.aspectRatio) as GraphOptions["aspectRatio"],
    },
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
    const saved = localStorage.getItem(PROJECT_STORAGE_KEY);
    return saved ? parseProjectState(saved) : undefined;
  } catch (reason) {
    projectStatus = reason instanceof Error ? reason.message : "Could not load saved project.";
    return undefined;
  }
}

const initialProject = loadInitialProject();
function loadAutomaticSavingPreference(): boolean {
  try {
    return localStorage.getItem(AUTO_SAVE_STORAGE_KEY) === "true";
  } catch (reason) {
    projectStatus = reason instanceof Error
      ? `Could not read auto-save preference: ${reason.message}`
      : "Could not read auto-save preference.";
    return false;
  }
}
let automaticSavingEnabled = loadAutomaticSavingPreference();
let expressions: Expression[] = initialProject?.expressions ?? [];
let tables: DataTable[] = initialProject?.tables ?? [];
let textBlocks: TextBlock[] = initialProject?.texts ?? [];
let folders: Folder[] = initialProject?.folders ?? [];
let workspaceOrder: WorkspaceItem[] = initialProject?.workspaceOrder ?? [
  ...expressions.map(({ id }): WorkspaceItem => ({ type: "expression", id })),
  ...tables.map(({ id }): WorkspaceItem => ({ type: "table", id })),
  ...textBlocks.map(({ id }): WorkspaceItem => ({ type: "text", id })),
  ...folders.map(({ id }): WorkspaceItem => ({ type: "folder", id })),
];
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
let nextTextId = Math.max(0, ...textBlocks.map((textBlock) => textBlock.id)) + 1;
let centerX = initialProject?.centerX ?? 0;
let centerY = initialProject?.centerY ?? 0;
let scale = initialProject?.scale ?? 48;
const tableValuesCache = new WeakMap<DataTable, { x: number[]; y: number[]; error?: string }>();
const tableRevisions = new WeakMap<DataTable, number>();
const explicitEvaluationCaches = new WeakMap<
  Expression,
  {
    key: string;
    values: Map<number, { value: number } | { error: string }>;
    cacheable: boolean;
  }
>();
const MAX_EXPRESSION_SAMPLE_CACHE_SIZE = 4_096;
interface PerformanceProfile {
  enabled: boolean;
  cacheEnabled: boolean;
  drawCount: number;
  drawTimes: number[];
  evaluationCount: number;
  cacheHits: number;
  cacheMisses: number;
  cacheBypasses: number;
}
interface DrawPerformanceSnapshot {
  drawCount: number;
  medianDrawMs: number;
  p95DrawMs: number;
  evaluationCount: number;
  cacheHits: number;
  cacheMisses: number;
  cacheBypasses: number;
  cacheHitRate: number;
}
interface DrawPerformanceBenchmark {
  cacheDisabled: DrawPerformanceSnapshot;
  cacheEnabled: DrawPerformanceSnapshot;
  drawTimeReductionPercent: number;
  evaluationReductionPercent: number;
}
interface BetterDesmosProfiler {
  reset(): void;
  snapshot(): DrawPerformanceSnapshot;
  benchmark(iterations?: number): DrawPerformanceBenchmark;
}
declare global {
  interface Window {
    betterDesmosProfiler?: BetterDesmosProfiler;
  }
}
const performanceProfile: PerformanceProfile = {
  enabled: import.meta.env.DEV,
  cacheEnabled: true,
  drawCount: 0,
  drawTimes: [],
  evaluationCount: 0,
  cacheHits: 0,
  cacheMisses: 0,
  cacheBypasses: 0,
};
let nextTableRevision = 1;
let drawFrame: number | undefined;
let graphMode: "precise" | "desmos" = "precise";
const graphOptions: GraphOptions = initialProject?.graphOptions ?? {
  showGrid: true,
  showXAxis: true,
  showYAxis: true,
  showLabels: true,
  aspectRatio: 1,
};
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
  <main class="workspace">
    <aside class="sidebar">
      <header class="sidebar-brand">
        <a class="brand" href="#" aria-label="Better Desmos 2.0 home"><span class="brand-mark">∿</span> better<span>desmos</span><span class="version-label">2.0</span></a>
      </header>
      <div class="panel-heading">
        <div class="project-controls" aria-label="Project actions">
          <button type="button" id="save-project">Save</button>
          <button type="button" id="export-project">Export</button>
          <button type="button" id="import-project">Import</button>
          <button type="button" id="share-project">Share</button>
          <label class="workspace-add-control">
            <span class="visually-hidden">Add to workspace</span>
            <select id="workspace-add" aria-label="Add to workspace">
              <option value="" selected></option>
              <option value="expression">Add expression</option>
              <option value="table">Add table</option>
              <option value="text">Add text</option>
              <option value="folder">Add folder</option>
            </select>
          </label>
          <input type="file" id="project-file" accept="application/json,.json" hidden />
        </div>
      </div>
      <span id="project-status" role="status"></span>
      <div class="sidebar-scroll">
        <div class="workspace-items" id="workspace-items" aria-label="Expressions, tables, text, and folders"></div>
        <section class="sliders-panel" id="sliders" aria-label="Parameter sliders"></section>
      </div>
    </aside>
    <section class="graph-panel" aria-label="Coordinate graph">
      <div class="graph-toolbar">
        <div class="view-controls">
          <button type="button" class="icon-control" id="open-settings" aria-label="Settings" title="Settings" aria-haspopup="dialog">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9 4.7v-2.4l-2.2-.6a7.3 7.3 0 0 0-.7-1.7l1.2-1.9-1.7-1.7-1.9 1.2a7.3 7.3 0 0 0-1.7-.7L13.4 3h-2.4l-.6 2.2a7.3 7.3 0 0 0-1.7.7L6.8 4.7 5.1 6.4l1.2 1.9a7.3 7.3 0 0 0-.7 1.7l-2.2.6V13l2.2.6a7.3 7.3 0 0 0 .7 1.7l-1.2 1.9 1.7 1.7 1.9-1.2a7.3 7.3 0 0 0 1.7.7l.6 2.2h2.4l.6-2.2a7.3 7.3 0 0 0 1.7-.7l1.9 1.2 1.7-1.7-1.2-1.9a7.3 7.3 0 0 0 .7-1.7Z"/><circle cx="12" cy="12" r="2" fill="#17212d"/></svg>
          </button>
          <button type="button" class="icon-control" id="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
          <button type="button" class="icon-control" id="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
          <button type="button" class="icon-control" id="reset-view" aria-label="Reset view" title="Reset view">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1Z"/></svg>
          </button>
        </div>
      </div>
      <div class="canvas-wrap"><canvas id="graph" aria-label="Graph of the entered expressions"></canvas><canvas id="graph-points" aria-hidden="true"></canvas></div>
    </section>
  </main>
  <dialog class="settings-dialog" id="settings-dialog" aria-labelledby="settings-title">
    <div class="settings-dialog-heading">
      <h2 id="settings-title">Settings</h2>
      <button type="button" id="close-settings" aria-label="Close settings">×</button>
    </div>
    <section class="settings-section" aria-labelledby="graph-options-heading">
      <h3 id="graph-options-heading">Graph</h3>
      <label class="setting-check" for="show-grid-setting"><span>Show grid</span><input id="show-grid-setting" type="checkbox" /></label>
      <label class="setting-check" for="show-x-axis-setting"><span>Show x-axis</span><input id="show-x-axis-setting" type="checkbox" /></label>
      <label class="setting-check" for="show-y-axis-setting"><span>Show y-axis</span><input id="show-y-axis-setting" type="checkbox" /></label>
      <label class="setting-check" for="show-labels-setting"><span>Show axis numbers</span><input id="show-labels-setting" type="checkbox" /></label>
      <div class="setting-control">
        <label for="aspect-ratio-setting">Axis scale ratio</label>
        <select id="aspect-ratio-setting">
          <option value="1">Equal units (1:1)</option>
          <option value="2">Wider x scale (2:1)</option>
          <option value="0.5">Taller y scale (1:2)</option>
        </select>
        <p>Controls how many screen pixels represent one unit on each axis.</p>
      </div>
    </section>
    <details class="settings-section graph-settings">
      <summary>Accuracy &amp; performance</summary>
      <div class="setting-control">
        <label class="mode-setting" for="desmos-mode">
          <span><strong>Desmos mode</strong><small>Fast math (~10 digits)</small></span>
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
  </dialog>
  <dialog class="settings-dialog save-dialog" id="save-dialog" aria-labelledby="save-dialog-title">
    <form id="save-dialog-form">
      <div class="settings-dialog-heading">
        <h2 id="save-dialog-title">Save project</h2>
      </div>
      <p class="save-dialog-description">Save this project on this device.</p>
      <label class="save-autosave-option">
        <input type="checkbox" id="save-autosave-option" />
        <span><strong>Auto-save</strong><small>Automatically save future changes on this device.</small></span>
      </label>
      <div class="save-dialog-actions">
        <button type="button" id="cancel-save">Cancel</button>
        <button type="submit" id="confirm-save" autofocus>Save</button>
      </div>
    </form>
  </dialog>
`;

const workspaceList = document.querySelector<HTMLDivElement>("#workspace-items")!;
const expressionList = document.createElement("div");
expressionList.className = "expressions";
const sliderList = document.querySelector<HTMLElement>("#sliders")!;
const tableList = document.createElement("div");
tableList.className = "tables-panel";
const textList = document.createElement("div");
textList.className = "text-blocks";
const workspaceAdd = document.querySelector<HTMLSelectElement>("#workspace-add")!;
const canvas = document.querySelector<HTMLCanvasElement>("#graph")!;
const context = canvas.getContext("2d")!;
const canvasWrap = canvas.parentElement as HTMLDivElement;
const pointCanvas = document.querySelector<HTMLCanvasElement>("#graph-points")!;
const pointContext = pointCanvas.getContext("2d")!;
const GRAPH_BUFFER_VIEWPORTS = 1;
const GRAPH_BUFFER_SCALE = GRAPH_BUFFER_VIEWPORTS * 2 + 1;
let workspaceDragState: {
  pointerId: number;
  sourceKey: string;
  handle: HTMLButtonElement;
  sourceItem: HTMLElement;
  startX: number;
  startY: number;
  active: boolean;
  preview?: HTMLDivElement;
} | undefined;

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-9) return "0";
  return Number(value.toPrecision(4)).toString();
}

function tickStep(pixelsPerUnit = scale): number {
  const raw = 72 / pixelsPerUnit;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

function verticalScale(): number {
  return scale / graphOptions.aspectRatio;
}

function drawGrid(width: number, height: number): void {
  const yScale = verticalScale();
  const originX = width / 2 - centerX * scale;
  const originY = height / 2 + centerY * yScale;
  const xStep = tickStep();
  const yStep = tickStep(yScale);
  context.font = "12px Inter, ui-sans-serif, system-ui, sans-serif";
  context.lineWidth = 1;
  context.beginPath();

  if (graphOptions.showGrid) {
    for (let xValue = Math.ceil((centerX - width / (2 * scale)) / xStep) * xStep;
      xValue <= centerX + width / (2 * scale); xValue += xStep) {
      const x = originX + xValue * scale;
      const axis = Math.abs(xValue) < xStep / 1000;
      if (axis) {
        continue;
      }
      context.moveTo(Math.round(x) + 0.5, 0);
      context.lineTo(Math.round(x) + 0.5, height);
    }
    for (let yValue = Math.ceil((centerY - height / (2 * yScale)) / yStep) * yStep;
      yValue <= centerY + height / (2 * yScale); yValue += yStep) {
      const axis = Math.abs(yValue) < yStep / 1000;
      if (axis) {
        continue;
      }
      const y = originY - yValue * yScale;
      context.moveTo(0, Math.round(y) + 0.5);
      context.lineTo(width, Math.round(y) + 0.5);
    }
    context.strokeStyle = "rgba(255, 255, 255, 0.22)";
    context.stroke();
  }

  context.beginPath();
  const zeroX = originX;
  const zeroY = originY;
  if (graphOptions.showYAxis) {
    context.moveTo(Math.round(zeroX) + 0.5, 0);
    context.lineTo(Math.round(zeroX) + 0.5, height);
  }
  if (graphOptions.showXAxis) {
    context.moveTo(0, Math.round(zeroY) + 0.5);
    context.lineTo(width, Math.round(zeroY) + 0.5);
  }
  context.strokeStyle = "rgba(255, 255, 255, 0.72)";
  context.stroke();

  if (graphOptions.showLabels && graphOptions.showXAxis) {
    for (let xValue = Math.ceil((centerX - width / (2 * scale)) / xStep) * xStep;
      xValue <= centerX + width / (2 * scale); xValue += xStep) {
      if (Math.abs(xValue) < xStep / 1000) {
        continue;
      }
      const x = originX + xValue * scale;
      context.fillStyle = "#ffffff";
      context.fillText(formatTick(xValue), x + 5, Math.min(Math.max(originY + 16, 16), height - 8));
    }
  }

  if (graphOptions.showLabels && graphOptions.showYAxis) {
    for (let yValue = Math.ceil((centerY - height / (2 * yScale)) / yStep) * yStep;
      yValue <= centerY + height / (2 * yScale); yValue += yStep) {
      const y = originY - yValue * yScale;
      if (Math.abs(yValue) >= yStep / 1000) {
        context.fillStyle = "#ffffff";
        context.fillText(formatTick(yValue), Math.min(Math.max(originX + 6, 6), width - 36), y - 5);
      }
    }
  }
}

function compileSpatialColor(expression: Expression): ((x: number, y: number) => string) | undefined {
  const hsv = expression.hsv;
  if (hsv) {
    const key = `${graphMode}:${hsv.hue}\u0000${hsv.saturation}\u0000${hsv.value}`;
    if (expression.compiledHsvKey !== key) {
      expression.compiledHsvKey = key;
      expression.compiledHsv = undefined;
      expression.colorError = undefined;
      try {
        expression.compiledHsv = [
          hsv.hue.trim()
            ? compileColorExpression(hsv.hue, sliderValues, graphMode === "desmos")
            : undefined,
          hsv.saturation.trim()
            ? compileColorExpression(hsv.saturation, sliderValues, graphMode === "desmos")
            : undefined,
          hsv.value.trim()
            ? compileColorExpression(hsv.value, sliderValues, graphMode === "desmos")
            : undefined,
        ];
      } catch (reason) {
        expression.colorError = reason instanceof Error ? reason.message : "Invalid HSV formula";
      }
    }
    if (!expression.compiledHsv) return undefined;
    const base = hexToHsv(expression.color);
    return (x, y) => {
      try {
        const values = expression.compiledHsv!.map((evaluate, index) => {
          const value = evaluate ? evaluate(x, y) : base[index]!;
          if (!Number.isFinite(value)) {
            throw new Error("HSV formula results must be finite numbers");
          }
          return value;
        });
        return hsvToHex(values[0]!, values[1]!, values[2]!);
      } catch (reason) {
        expression.colorError = reason instanceof Error ? reason.message : "Could not evaluate HSV formula";
        return expression.color;
      }
    };
  }

  expression.colorError = undefined;
  return undefined;
}

function strokeColoredSegments(
  geometry: CurveGeometry,
  colorAt: (x: number, y: number) => string,
  width: number,
  height: number,
  lineWidth: number,
  opacity: number,
): void {
  const paths = new Map<string, number[]>();
  for (let index = 0; index < geometry.segments.length; index += 4) {
    const x1 = geometry.segments[index]!;
    const y1 = geometry.segments[index + 1]!;
    const x2 = geometry.segments[index + 2]!;
    const y2 = geometry.segments[index + 3]!;
    const x = ((x1 + x2) / 2 - width / 2) / scale + centerX;
    const y = (height / 2 - (y1 + y2) / 2) / verticalScale() + centerY;
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
  context.globalAlpha = opacity;
  context.lineWidth = lineWidth;
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
  lineWidth = 2,
  opacity = 1,
): CurveGeometry {
  const geometry: CurveGeometry = { id, color, segments: [], colorAt };
  const addSegment = (x1: number, y1: number, x2: number, y2: number) => {
    if (!colorAt) {
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
    }
    geometry.segments.push(x1, y1, x2, y2);
  };
  const step = Math.max(1, Math.min(
    graphSettings.implicitSampleSpacing, Math.min(scale, verticalScale()) * 0.15,
  ));
  const columns = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;
  const screenX = (column: number) => Math.min(column * step, width);
  const screenY = (row: number) => Math.min(row * step, height);
  const screenXs = Float64Array.from({ length: columns }, (_, column) => screenX(column));
  const screenYs = Float64Array.from({ length: rows }, (_, row) => screenY(row));
  const xCoordinates = Float64Array.from(screenXs, (px) => (px - width / 2) / scale + centerX);
  const yCoordinates = Float64Array.from(
    screenYs, (py) => (height / 2 - py) / verticalScale() + centerY,
  );
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
    strokeColoredSegments(geometry, colorAt, width, height, lineWidth, opacity);
  } else {
    context.save();
    context.globalAlpha = opacity;
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.stroke();
    context.restore();
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
  const screenY = height / 2 - (y - centerY) * verticalScale();
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
  lineWidth = 2,
  opacity = 1,
): ExplicitCurveData {
  const samples: GraphSample[] = [];
  const geometry: ExplicitCurveData = { id, color, samples, segments: [], colorAt };
  const yScale = verticalScale();
  const originY = height / 2 + centerY * yScale;
  context.save();
  context.globalAlpha = opacity;
  if (!colorAt) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
  }
  const sampleAt = (x: number, screenX: number): GraphSample => {
    try {
      const y = evaluate(x);
      const screenY = originY - y * yScale;
      return {
        x,
        y,
        screenX,
        screenY,
        connected: false,
      };
    } catch {
      return { x, y: Number.NaN, screenX, screenY: Number.NaN, connected: false };
    }
  };
  const refineInterval = (
    first: GraphSample,
    second: GraphSample,
    depth: number,
  ): GraphSample[] => {
    if (depth >= 10) {
      return [second];
    }

    const firstValid = Number.isFinite(first.screenY) &&
      first.screenY >= -height * 2 && first.screenY <= height * 3;
    const secondValid = Number.isFinite(second.screenY) &&
      second.screenY >= -height * 2 && second.screenY <= height * 3;
    const screenDelta = Math.abs(second.screenY - first.screenY);
    const midpointX = (first.x + second.x) / 2;
    const midpointScreenX = (first.screenX + second.screenX) / 2;
    const midpoint = sampleAt(midpointX, midpointScreenX);
    const midpointValid = Number.isFinite(midpoint.screenY) &&
      midpoint.screenY >= -height * 2 && midpoint.screenY <= height * 3;
    if (![first, second, midpoint].some((sample) => Number.isFinite(sample.screenY))) {
      return [second];
    }
    const linearMidpoint = (first.screenY + second.screenY) / 2;
    const curvature = Math.abs(midpoint.screenY - linearMidpoint);
    const refine = !firstValid || !secondValid || !midpointValid ||
      screenDelta > 24 || curvature > 0.5;
    if (!firstValid && !secondValid && !midpointValid &&
        Math.sign(first.screenY - height / 2) === Math.sign(second.screenY - height / 2) &&
        Math.sign(second.screenY - height / 2) === Math.sign(midpoint.screenY - height / 2) &&
        screenDelta <= 24 && curvature <= 0.5) {
      return [second];
    }
    if (!refine) {
      return [second];
    }
    return [
      ...refineInterval(first, midpoint, depth + 1),
      ...refineInterval(midpoint, second, depth + 1),
    ];
  };
  let previousY: number | undefined;
  let drawing = false;
  let first = sampleAt((0 - width / 2) / scale + centerX, 0);
  const firstIsValid = Number.isFinite(first.screenY) &&
    first.screenY >= -height * 2 && first.screenY <= height * 3;
  if (firstIsValid) {
    drawing = true;
    if (!colorAt) context.moveTo(first.screenX, first.screenY);
    samples.push(first);
    previousY = first.screenY;
  }
  const drawSample = (sample: GraphSample): void => {
    const { y, screenX, screenY } = sample;
    if (!Number.isFinite(y)) {
      drawing = false;
      previousY = undefined;
      samples.push(sample);
      return;
    }
    const valid = Number.isFinite(screenY) && screenY >= -height * 2 && screenY <= height * 3;
    const jumpTooLarge = previousY !== undefined && Math.abs(screenY - previousY) > height;
    const connected = valid && drawing && previousY !== undefined && !jumpTooLarge;
    if (!valid || jumpTooLarge) {
      drawing = false;
      previousY = Number.isFinite(screenY) ? screenY : undefined;
      samples.push(sample);
      return;
    }
    if (!drawing) {
      if (!colorAt) context.moveTo(screenX, screenY);
      drawing = true;
    } else if (!colorAt) {
      context.lineTo(screenX, screenY);
    }
    if (connected && samples.length > 0) {
      const previous = samples[samples.length - 1]!;
      geometry.segments.push(previous.screenX, previous.screenY, screenX, screenY);
    }
    sample.connected = connected;
    samples.push(sample);
    previousY = screenY;
  };
  for (let screenX = graphSettings.explicitSampleSpacing;
    screenX <= width; screenX += graphSettings.explicitSampleSpacing) {
    const x = (screenX - width / 2) / scale + centerX;
    const second = sampleAt(x, screenX);
    for (const refinedSample of refineInterval(first, second, 0)) {
      drawSample(refinedSample);
    }
    first = second;
  }
  if (colorAt) {
    strokeColoredSegments(geometry, colorAt, width, height, lineWidth, opacity);
  } else {
    context.stroke();
  }
  context.restore();
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
    if (Math.abs(difference0) * verticalScale() < 0.25 &&
        Math.abs(difference1) * verticalScale() < 0.25) {
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
    if (Math.abs(center) * verticalScale() > 0.25 ||
        Math.abs(center) > Math.abs(difference(index - 1)) ||
        Math.abs(center) > Math.abs(difference(index + 1)) ||
        Math.min(Math.abs(left), Math.abs(right)) * verticalScale() < 0.05) {
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
  const sampleSpacing = Math.max(1, Math.min(
    graphSettings.implicitSampleSpacing, Math.min(scale, verticalScale()) * 0.15,
  ));
  const axes: Array<{ axis: "x" | "y"; min: number; max: number }> = [
    { axis: "x", min: centerX - width / (2 * scale), max: centerX + width / (2 * scale) },
    {
      axis: "y",
      min: centerY - height / (2 * verticalScale()),
      max: centerY + height / (2 * verticalScale()),
    },
  ];

  for (const { axis, min, max } of axes) {
    const steps = Math.max(1, Math.ceil(
      (max - min) * (axis === "x" ? scale : verticalScale()) / sampleSpacing,
    ));
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

  const width = canvasWrap.clientWidth * GRAPH_BUFFER_SCALE;
  const height = canvasWrap.clientHeight * GRAPH_BUFFER_SCALE;
  const pointCandidate = graph.kind === "explicit"
    ? hoverCandidates
      .filter((candidate) =>
        candidate.graphIds.includes(nearest!.curve.id) &&
        Math.hypot(candidate.screenX - screenX, candidate.screenY - screenY) <= 10)
      .sort((left, right) =>
        Math.hypot(left.screenX - screenX, left.screenY - screenY) -
        Math.hypot(right.screenX - screenX, right.screenY - screenY))[0]
    : undefined;
  const x = pointCandidate?.x ?? (nearest.x - width / 2) / scale + centerX;
  let y: number;
  if (graph.kind === "explicit") {
    try {
      const result = graph.evaluate(x);
      y = typeof result === "number" ? result : result.value.toNumber();
    } catch {
      return;
    }
  } else {
    y = (height / 2 - nearest.y) / verticalScale() + centerY;
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
    workspaceOrder.push({ type: "table", id: table.id });
  } else {
    table.rows.push(row);
    invalidateTableData(table);
  }
  renderTables();
  workspaceList.querySelector(
    `.workspace-item[data-workspace-key="table:${table.id}"]`,
  )?.scrollIntoView({ block: "nearest" });
  draw();
}

function drawHoverOverlay(): void {
  const bounds = canvasWrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(bounds.width * dpr));
  const height = Math.max(1, Math.round(bounds.height * dpr));
  const bufferX = bounds.width * GRAPH_BUFFER_VIEWPORTS;
  const bufferY = bounds.height * GRAPH_BUFFER_VIEWPORTS;
  const graphWidth = bounds.width * GRAPH_BUFFER_SCALE;
  const graphHeight = bounds.height * GRAPH_BUFFER_SCALE;
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
    const screenX = candidate.screenX - bufferX;
    const screenY = candidate.screenY - bufferY;
    if (screenX < -8 || screenX > bounds.width + 8 ||
        screenY < -8 || screenY > bounds.height + 8) continue;
    pointContext.beginPath();
    pointContext.arc(screenX, screenY, 5, 0, Math.PI * 2);
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
    pointX = selected.screenX - bufferX;
    pointY = selected.screenY - bufferY;
    const typeOrder = [
      "intersection", "vertex", "x-intercept", "y-intercept", "table point", "list point",
    ];
    const type = selected.type.split(" · ").sort(
      (left, right) => typeOrder.indexOf(left) - typeOrder.indexOf(right),
    )[0]!;
    label = `${type} · (${formatTick(selected.x)}, ${formatTick(selected.y)})`;
    color = selected.color;
  } else if (nearest && nearest.curve.id.startsWith("implicit-")) {
    pointX = nearest.x - bufferX;
    pointY = nearest.y - bufferY;
    label = `implicit curve · (${formatTick(
      (nearest.x - graphWidth / 2) / scale + centerX,
    )}, ${formatTick(
      (graphHeight / 2 - nearest.y) / verticalScale() + centerY,
    )})`;
    color = nearest.curve.colorAt?.(
      (nearest.x - graphWidth / 2) / scale + centerX,
      (graphHeight / 2 - nearest.y) / verticalScale() + centerY,
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
  lineWidth = 2,
  opacity = 1,
): ExplicitCurveData {
  const samples: GraphSample[] = [];
  const geometry: ExplicitCurveData = { id, color, samples, segments: [], colorAt };
  const count = Math.max(200, Math.ceil(width / graphSettings.explicitSampleSpacing) * 2);
  context.save();
  context.globalAlpha = opacity;
  if (!colorAt) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.beginPath();
  }
  let previous: GraphSample | undefined;
  for (let index = 0; index <= count; index += 1) {
    const parameter = start + (end - start) * index / count;
    try {
      const [x, y] = evaluate(parameter);
      const screenX = width / 2 + (x - centerX) * scale;
      const screenY = height / 2 - (y - centerY) * verticalScale();
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
    strokeColoredSegments(geometry, colorAt, width, height, lineWidth, opacity);
  } else {
    context.stroke();
  }
  context.restore();
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
  lineWidth = 2,
  opacity = 1,
): CurveGeometry {
  const cellSize = 5;
  context.save();
  context.globalAlpha = 0.18 * opacity;
  for (let screenY = 0; screenY < height; screenY += cellSize) {
    const y = (height / 2 - (screenY + cellSize / 2)) / verticalScale() + centerY;
    for (let screenX = 0; screenX < width; screenX += cellSize) {
      const x = (screenX + cellSize / 2 - width / 2) / scale + centerX;
      try {
        const residual = evaluate(x, y);
        const value = typeof residual === "number" ? residual : residual.toNumber();
        const inside = relation === "<" ? value < 0
          : relation === "<=" ? value <= 0
            : relation === ">" ? value > 0
              : value >= 0;
        if (inside) {
          try {
            context.fillStyle = colorAt ? colorAt(x, y) : color;
          } catch {
            context.fillStyle = color;
          }
          context.fillRect(screenX, screenY, cellSize, cellSize);
        }
      } catch {
        continue;
      }
    }
  }
  context.restore();
  return drawImplicit(evaluate, width, height, id, color, colorAt, lineWidth, opacity);
}

function draw(): void {
  const profileStart = performanceProfile.enabled ? performance.now() : 0;
  const bounds = canvasWrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, bounds.width * GRAPH_BUFFER_SCALE);
  const height = Math.max(1, bounds.height * GRAPH_BUFFER_SCALE);
  const canvasWidth = Math.max(1, Math.round(width * dpr));
  const canvasHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101722";
  context.fillRect(0, 0, width, height);
  const candidates: PointCandidate[] = [];
  const explicitCurves: ExplicitCurveData[] = [];
  const implicitCurves: CurveGeometry[] = [];
  const listPoints: Array<{
    x: number;
    y: number;
    color: string;
    graphId: string;
    opacity: number;
  }> = [];
  for (const expression of expressions) {
    if (expression.hidden) continue;
    const graph = getCompiled(expression);
    if (!graph) {
      continue;
    }
    const graphId = graph.kind === "implicit"
      ? `implicit-${expression.id}`
      : `expression-${expression.id}`;
    const colorAt = compileSpatialColor(expression);
    const lineWidth = expression.lineWidth ?? 2;
    const opacity = expression.opacity ?? 1;
    if (graph.kind === "implicit") {
      const curve = drawImplicit(
        graph.evaluate, width, height, graphId, expression.color, colorAt, lineWidth, opacity,
      );
      implicitCurves.push(curve);
      detectImplicitAxisIntercepts(curve, graph.evaluate, candidates, width, height);
      continue;
    }
    if (graph.kind === "inequality") {
      const curve = drawInequality(
        graph.evaluate, graph.relation, graphId, expression.color, width, height, colorAt,
        lineWidth, opacity,
      );
      implicitCurves.push(curve);
      continue;
    }
    if (graph.kind === "parametric") {
      const curve = drawParametricCurve(
        graphId, expression.color, graph.evaluate, graph.start, graph.end, width, height,
        colorAt,
        lineWidth, opacity,
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
        const expressionError = workspaceList.querySelector<HTMLParagraphElement>(
          `[data-expression-id="${expression.id}"] .expression-error`,
        );
        if (expressionError) expressionError.textContent = "";
        workspaceList.querySelector<HTMLInputElement>(
          `[data-expression-id="${expression.id}"] input[type="text"]`,
        )?.removeAttribute("aria-invalid");
        values.forEach((y, index) => {
          const x = index + 1;
          const screenX = width / 2 + (x - centerX) * scale;
          const screenY = height / 2 - (y - centerY) * verticalScale();
          const pointColor = colorAt?.(x, y) ?? expression.color;
          listPoints.push({ x, y, color: pointColor, graphId, opacity });
          if (screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height) {
            addPointCandidate(
              candidates, x, y, "list point", [graphId], pointColor, width, height,
            );
          }
        });
      } catch (reason) {
        expression.evaluationError = reason instanceof Error ? reason.message : "Could not evaluate list";
        const error = workspaceList.querySelector<HTMLParagraphElement>(
          `[data-expression-id="${expression.id}"] .expression-error`,
        );
        if (error) error.textContent = expression.evaluationError;
        workspaceList.querySelector<HTMLInputElement>(
          `[data-expression-id="${expression.id}"] input[type="text"]`,
        )?.setAttribute("aria-invalid", "true");
      }
      continue;
    }
    const evaluate = cachedExplicitEvaluator(expression, (x: number) => {
      const result = graph.evaluate(x);
      return typeof result === "number" ? result : result.value.toNumber();
    });
    const curve = drawExplicitCurve(
      graphId, expression.color, evaluate, width, height, colorAt, lineWidth, opacity,
    );
    explicitCurves.push(curve);
    detectExplicitPoints(curve, evaluate, candidates, width, height);
  }

  const tableData = tables.map((table) => ({ table, values: tableValues(table) }));
  for (const { table, values } of tableData) {
    for (let index = 0; index < values.x.length; index += 1) {
      const x = values.x[index]!;
      const y = values.y[index]!;
      const screenX = width / 2 + (x - centerX) * scale;
      const screenY = height / 2 - (y - centerY) * verticalScale();
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
    const screenY = height / 2 - (point.y - centerY) * verticalScale();
    if (screenX < -6 || screenX > width + 6 || screenY < -6 || screenY > height + 6) continue;
    context.save();
    context.globalAlpha = point.opacity;
    context.beginPath();
    context.arc(screenX, screenY, 4, 0, Math.PI * 2);
    context.fillStyle = point.color;
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  }
  for (const { table, values } of tableData) {
    context.fillStyle = table.color;
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1.5;
    for (let index = 0; index < values.x.length; index += 1) {
      const screenX = width / 2 + (values.x[index]! - centerX) * scale;
      const screenY = height / 2 - (values.y[index]! - centerY) * verticalScale();
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
    const colorError = workspaceList.querySelector<HTMLParagraphElement>(
      `[data-expression-id="${expression.id}"] .color-formula-error`,
    );
    if (colorError) colorError.textContent = expression.colorError ?? "";
    for (const channelInput of workspaceList.querySelectorAll<HTMLInputElement>(
      `[data-expression-id="${expression.id}"] .hsv-fields input`,
    )) {
      channelInput.setAttribute("aria-invalid", String(Boolean(expression.colorError)));
    }
  }
  drawHoverOverlay();
  scheduleProjectSave();
  if (performanceProfile.enabled) {
    performanceProfile.drawCount += 1;
    performanceProfile.drawTimes.push(performance.now() - profileStart);
    if (performanceProfile.drawTimes.length > 300) {
      performanceProfile.drawTimes.shift();
    }
  }
}

function scheduleDraw(): void {
  if (drawFrame !== undefined) return;
  drawFrame = window.requestAnimationFrame(() => {
    drawFrame = undefined;
    draw();
  });
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

function cachedExplicitEvaluator(
  expression: Expression,
  evaluate: (x: number) => number,
): (x: number) => number {
  const sliderSignature = JSON.stringify(
    Object.entries(sliderValues).sort(([left], [right]) => left.localeCompare(right)),
  );
  const key = `${graphMode}:${graphSettings.precisionDigits}\u0000${expression.text}\u0000${sliderSignature}`;
  let cache = explicitEvaluationCaches.get(expression);
  if (!cache || cache.key !== key) {
    cache = { key, values: new Map(), cacheable: true };
    explicitEvaluationCaches.set(expression, cache);
  }
  const values = cache.values;
  return (x: number) => {
    if (!performanceProfile.cacheEnabled || !cache.cacheable) {
      if (performanceProfile.enabled) {
        performanceProfile.cacheMisses += 1;
        performanceProfile.evaluationCount += 1;
        if (performanceProfile.cacheEnabled && !cache.cacheable) {
          performanceProfile.cacheBypasses += 1;
        }
      }
      return evaluate(x);
    }

    const cached = values.get(x);
    if (cached) {
      if (performanceProfile.enabled) performanceProfile.cacheHits += 1;
      if ("error" in cached) throw new Error(cached.error);
      return cached.value;
    }

    if (performanceProfile.enabled) {
      performanceProfile.cacheMisses += 1;
      performanceProfile.evaluationCount += 1;
    }
    try {
      const value = evaluate(x);
      if (values.size >= MAX_EXPRESSION_SAMPLE_CACHE_SIZE) {
        values.clear();
        cache.cacheable = false;
        if (performanceProfile.enabled) performanceProfile.cacheBypasses += 1;
      } else {
        values.set(x, { value });
      }
      return value;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not evaluate expression";
      if (values.size >= MAX_EXPRESSION_SAMPLE_CACHE_SIZE) {
        values.clear();
        cache.cacheable = false;
        if (performanceProfile.enabled) performanceProfile.cacheBypasses += 1;
      } else {
        values.set(x, { error: message });
      }
      throw reason;
    }
  };
}

function resetPerformanceMeasurements(): void {
  performanceProfile.drawCount = 0;
  performanceProfile.drawTimes = [];
  performanceProfile.evaluationCount = 0;
  performanceProfile.cacheHits = 0;
  performanceProfile.cacheMisses = 0;
  performanceProfile.cacheBypasses = 0;
}

function getPerformanceSnapshot(): DrawPerformanceSnapshot {
  const sortedTimes = [...performanceProfile.drawTimes].sort((left, right) => left - right);
  const percentile = (fraction: number) => sortedTimes.length === 0
    ? 0
    : sortedTimes[Math.min(sortedTimes.length - 1, Math.ceil(sortedTimes.length * fraction) - 1)]!;
  const requests = performanceProfile.cacheHits + performanceProfile.cacheMisses;
  return {
    drawCount: performanceProfile.drawCount,
    medianDrawMs: percentile(0.5),
    p95DrawMs: percentile(0.95),
    evaluationCount: performanceProfile.evaluationCount,
    cacheHits: performanceProfile.cacheHits,
    cacheMisses: performanceProfile.cacheMisses,
    cacheBypasses: performanceProfile.cacheBypasses,
    cacheHitRate: requests === 0 ? 0 : performanceProfile.cacheHits / requests,
  };
}

function benchmarkGraphDraws(iterations = 12): DrawPerformanceBenchmark {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 50) {
    throw new Error("Benchmark iterations must be an integer from 1 to 50.");
  }
  const previousCacheEnabled = performanceProfile.cacheEnabled;
  try {
    performanceProfile.cacheEnabled = false;
    draw();
    resetPerformanceMeasurements();
    for (let index = 0; index < iterations; index += 1) draw();
    const cacheDisabled = getPerformanceSnapshot();

    performanceProfile.cacheEnabled = true;
    for (const expression of expressions) {
      explicitEvaluationCaches.delete(expression);
    }
    draw();
    resetPerformanceMeasurements();
    for (let index = 0; index < iterations; index += 1) draw();
    const cacheEnabled = getPerformanceSnapshot();
    const drawTimeReductionPercent = cacheDisabled.medianDrawMs === 0
      ? 0
      : (1 - cacheEnabled.medianDrawMs / cacheDisabled.medianDrawMs) * 100;
    const evaluationReductionPercent = cacheDisabled.evaluationCount === 0
      ? 0
      : (1 - cacheEnabled.evaluationCount / cacheDisabled.evaluationCount) * 100;
    return {
      cacheDisabled,
      cacheEnabled,
      drawTimeReductionPercent,
      evaluationReductionPercent,
    };
  } finally {
    performanceProfile.cacheEnabled = previousCacheEnabled;
  }
}

if (import.meta.env.DEV) {
  window.betterDesmosProfiler = {
    reset: resetPerformanceMeasurements,
    snapshot: getPerformanceSnapshot,
    benchmark: benchmarkGraphDraws,
  };
}

function sliderNames(): string[] {
  const reserved = new Set([
    "x", "y", "t", "pi", "e", "sqrt", "sin", "cos", "tan", "asin", "acos",
    "atan", "ln", "log", "exp", "abs", "parametric", "polar", "derivative", "integral",
    "list", "sum", "product", "min", "max", "mean", "median", "variance", "stdev", "factorial",
  ]);
  return [...new Set(expressions.flatMap((expression) =>
    [expression.text, expression.hsv?.hue ?? "",
      expression.hsv?.saturation ?? "", expression.hsv?.value ?? ""]
      .flatMap((source) => source.match(/[a-zA-Z]+/g) ?? [])
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
      scheduleDraw();
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
      scheduleDraw();
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

function workspaceItemKey(item: WorkspaceItem): string {
  return `${item.type}:${item.id}`;
}

function workspaceBlocks(): WorkspaceBlock[] {
  const blocks: WorkspaceBlock[] = [];
  const groupedFolders = new Set<number>();
  for (const item of workspaceOrder) {
    if (item.type === "folder") {
      if (groupedFolders.has(item.id)) continue;
      groupedFolders.add(item.id);
      blocks.push({
        key: workspaceItemKey(item),
        items: workspaceOrder.filter((candidate) =>
          candidate.type !== "folder" && candidate.folderId === item.id),
      });
      continue;
    }
    const folderId = item.folderId;
    if (folderId !== undefined && folders.some((folder) => folder.id === folderId)) {
      if (groupedFolders.has(folderId)) continue;
      groupedFolders.add(folderId);
      const members = workspaceOrder.filter((candidate) => candidate.folderId === folderId);
      blocks.push({ key: `folder:${folderId}`, items: members });
    } else {
      blocks.push({ key: workspaceItemKey(item), items: [item] });
    }
  }
  for (const folder of folders) {
    if (!groupedFolders.has(folder.id)) {
      blocks.push({ key: `folder:${folder.id}`, items: [] });
    }
  }
  return blocks;
}

function synchronizeWorkspaceOrder(): void {
  const items: WorkspaceItem[] = [
    ...expressions.map(({ id, folderId }) =>
      ({ type: "expression" as const, id, folderId })),
    ...tables.map(({ id, folderId }) =>
      ({ type: "table" as const, id, folderId })),
    ...textBlocks.map(({ id, folderId }) =>
      ({ type: "text" as const, id, folderId })),
    ...folders.map(({ id }) => ({ type: "folder" as const, id })),
  ];
  const availableKeys = new Set(items.map(workspaceItemKey));
  const seen = new Set<string>();
  const order = workspaceOrder.filter((item) => {
    const key = workspaceItemKey(item);
    if (!availableKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((item): WorkspaceItem => {
    const source = items.find((candidate) => workspaceItemKey(candidate) === workspaceItemKey(item));
    const folderId = item.type !== "folder" && folders.some((folder) => folder.id === item.folderId)
      ? item.folderId
      : item.type === "folder" ? undefined : source?.folderId;
    return {
      ...item,
      folderId: item.type !== "folder" && folders.some((folder) => folder.id === folderId)
        ? folderId
        : undefined,
    };
  });
  for (const item of items) {
    const key = workspaceItemKey(item);
    if (!seen.has(key)) order.push({ ...item });
  }
  workspaceOrder = order;
  for (const item of workspaceOrder) {
    if (item.type === "expression") {
      const expression = expressions.find((entry) => entry.id === item.id);
      if (expression) expression.folderId = item.folderId;
    } else if (item.type === "table") {
      const table = tables.find((entry) => entry.id === item.id);
      if (table) table.folderId = item.folderId;
    } else if (item.type === "text") {
      const textBlock = textBlocks.find((entry) => entry.id === item.id);
      if (textBlock) textBlock.folderId = item.folderId;
    }
  }
}

function workspaceOrderFromBlocks(blocks: WorkspaceBlock[]): WorkspaceItem[] {
  return blocks.flatMap((block) => block.key.startsWith("folder:")
    ? [
      { type: "folder" as const, id: Number(block.key.slice("folder:".length)) },
      ...block.items,
    ]
    : block.items);
}

function renderWorkspaceItems(): void {
  synchronizeWorkspaceOrder();
  const nodes = new Map<string, HTMLElement>();
  for (const element of workspaceList.querySelectorAll<HTMLElement>(".workspace-item[data-workspace-key]")) {
    if (element.dataset.workspaceKey) nodes.set(element.dataset.workspaceKey, element);
  }
  for (const staging of [expressionList, tableList, textList]) {
    for (const item of staging.children) {
      const element = item as HTMLElement;
      if (element.dataset.workspaceKey) nodes.set(element.dataset.workspaceKey, element);
    }
  }
  workspaceList.replaceChildren();
  for (const block of workspaceBlocks()) {
    if (block.key.startsWith("folder:")) {
      const folderId = Number(block.key.slice("folder:".length));
      const folder = folders.find((entry) => entry.id === folderId);
      if (!folder) continue;
      const wrapper = createWorkspaceItem(block.key, `Folder ${folder.name}`);
      wrapper.classList.add("workspace-folder", "folder-drop-target");
      wrapper.dataset.folderDropId = String(folder.id);
      const group = document.createElement("section");
      group.className = "folder-group";
      const header = document.createElement("div");
      header.className = "folder-heading";
      const toggleFolder = document.createElement("button");
      toggleFolder.type = "button";
      toggleFolder.className = "folder-toggle";
      toggleFolder.textContent = folder.collapsed ? "▸" : "▾";
      toggleFolder.setAttribute("aria-label", `${folder.collapsed ? "Expand" : "Collapse"} folder ${folder.name}`);
      toggleFolder.setAttribute("aria-expanded", String(!folder.collapsed));
      toggleFolder.setAttribute("aria-controls", `folder-contents-${folder.id}`);
      toggleFolder.addEventListener("click", () => {
        folder.collapsed = !folder.collapsed;
        renderWorkspaceItems();
        scheduleProjectSave();
      });
      const name = document.createElement("input");
      name.value = folder.name;
      name.maxLength = 40;
      name.setAttribute("aria-label", `Folder ${folder.name} name`);
      name.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation();
      });
      name.addEventListener("input", () => {
        folder.name = name.value;
        scheduleProjectSave();
      });
      const removeFolder = document.createElement("button");
      removeFolder.type = "button";
      removeFolder.className = "remove-button";
      removeFolder.textContent = "×";
      removeFolder.setAttribute("aria-label", `Remove folder ${folder.name}`);
      removeFolder.addEventListener("click", () => {
        workspaceOrder = workspaceOrder.map((item) =>
          item.folderId === folder.id ? { ...item, folderId: undefined } : item);
        expressions = expressions.map((expression) =>
          expression.folderId === folder.id ? { ...expression, folderId: undefined } : expression);
        tables = tables.map((table) =>
          table.folderId === folder.id ? { ...table, folderId: undefined } : table);
        textBlocks = textBlocks.map((textBlock) =>
          textBlock.folderId === folder.id ? { ...textBlock, folderId: undefined } : textBlock);
        folders = folders.filter((entry) => entry.id !== folder.id);
        renderTextBlocks();
        renderExpressions();
        renderTables();
      });
      header.append(toggleFolder, name, removeFolder);
      const children = document.createElement("div");
      children.className = "folder-contents";
      children.id = `folder-contents-${folder.id}`;
      children.hidden = Boolean(folder.collapsed);
      for (const item of block.items) {
        const node = nodes.get(workspaceItemKey(item));
        if (node) {
          children.append(node);
          nodes.delete(workspaceItemKey(item));
        }
      }
      group.append(header, children);
      wrapper.append(group);
      workspaceList.append(wrapper);
      continue;
    }
    const node = nodes.get(block.key);
    if (node) workspaceList.append(node);
  }
}

function reorderWorkspaceBlock(
  sourceKey: string,
  beforeKey: string | undefined,
  targetFolderId: number | undefined,
): void {
  const blocks = workspaceBlocks();
  const sourceBlockIndex = blocks.findIndex((block) =>
    block.key === sourceKey || block.items.some((item) => workspaceItemKey(item) === sourceKey));
  if (sourceBlockIndex < 0) return;
  const sourceBlock = blocks[sourceBlockIndex]!;

  if (sourceKey.startsWith("folder:")) {
    if (targetFolderId !== undefined) return;
    blocks.splice(sourceBlockIndex, 1);
    const targetBlockIndex = beforeKey
      ? blocks.findIndex((block) =>
        block.key === beforeKey || block.items.some((item) => workspaceItemKey(item) === beforeKey))
      : blocks.length;
    blocks.splice(Math.max(0, targetBlockIndex), 0, sourceBlock);
    workspaceOrder = workspaceOrderFromBlocks(blocks);
    renderWorkspaceItems();
    scheduleProjectSave();
    return;
  }

  const itemIndex = sourceBlock.items.findIndex((item) => workspaceItemKey(item) === sourceKey);
  const [source] = sourceBlock.items.splice(itemIndex, 1);
  if (!source) return;
  if (!sourceBlock.key.startsWith("folder:")) {
    blocks.splice(sourceBlockIndex, 1);
  }

  const validFolderId = targetFolderId !== undefined &&
      folders.some((folder) => folder.id === targetFolderId)
    ? targetFolderId
    : undefined;
  source.folderId = validFolderId;
  if (source.type === "expression") {
    const expression = expressions.find((entry) => entry.id === source.id);
    if (expression) expression.folderId = validFolderId;
  } else if (source.type === "table") {
    const table = tables.find((entry) => entry.id === source.id);
    if (table) table.folderId = validFolderId;
  } else {
    const textBlock = textBlocks.find((entry) => entry.id === source.id);
    if (textBlock) textBlock.folderId = validFolderId;
  }

  if (validFolderId !== undefined) {
    let folderBlock = blocks.find((block) => block.key === `folder:${validFolderId}`);
    if (!folderBlock) {
      folderBlock = { key: `folder:${validFolderId}`, items: [] };
      blocks.push(folderBlock);
    }
    const targetIndex = beforeKey
      ? folderBlock.items.findIndex((item) => workspaceItemKey(item) === beforeKey)
      : -1;
    folderBlock.items.splice(targetIndex < 0 ? folderBlock.items.length : targetIndex, 0, source);
  } else {
    const targetIndex = beforeKey
      ? blocks.findIndex((block) =>
        block.key === beforeKey || block.items.some((item) => workspaceItemKey(item) === beforeKey))
      : -1;
    blocks.splice(targetIndex < 0 ? blocks.length : targetIndex, 0, {
      key: workspaceItemKey(source),
      items: [source],
    });
  }
  workspaceOrder = workspaceOrderFromBlocks(blocks);
  renderExpressions();
  renderTables();
  scheduleProjectSave();
}

function createFolder(): void {
  const folder = { id: nextFolderId++, name: `Folder ${folders.length + 1}` };
  folders.push(folder);
  workspaceOrder.push({ type: "folder", id: folder.id });
  renderWorkspaceItems();
  workspaceList.querySelector<HTMLInputElement>(
    `.workspace-folder[data-folder-drop-id="${folder.id}"] .folder-heading input`,
  )?.focus();
  scheduleProjectSave();
}

function createWorkspaceItem(key: string, label: string): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "workspace-item";
  wrapper.dataset.workspaceKey = key;
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "workspace-drag-handle";
  handle.textContent = "⋮⋮";
  handle.setAttribute("aria-label", `Reorder ${label}; use up and down arrow keys to move`);
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const workspaceItem = workspaceOrder.find((item) => workspaceItemKey(item) === key);
    const delta = event.key === "ArrowUp" ? -1 : 1;
    if (workspaceItem?.folderId !== undefined) {
      const siblings = workspaceOrder.filter((item) => item.folderId === workspaceItem.folderId);
      const index = siblings.findIndex((item) => workspaceItemKey(item) === key);
      const targetIndex = index + delta;
      if (targetIndex >= 0 && targetIndex < siblings.length) {
        const next = siblings[targetIndex + (delta > 0 ? 1 : 0)];
        reorderWorkspaceBlock(
          key,
          next ? workspaceItemKey(next) : undefined,
          workspaceItem.folderId,
        );
        workspaceList.querySelector<HTMLButtonElement>(
          `.workspace-item[data-workspace-key="${key}"] .workspace-drag-handle`,
        )?.focus();
      }
      return;
    }
    const blocks = workspaceBlocks();
    const index = blocks.findIndex((block) => block.key === key);
    const targetIndex = index + delta;
    if (targetIndex >= 0 && targetIndex < blocks.length) {
      const next = blocks[targetIndex + (delta > 0 ? 1 : 0)];
      reorderWorkspaceBlock(key, next?.key, undefined);
      workspaceList.querySelector<HTMLButtonElement>(
        `.workspace-item[data-workspace-key="${key}"] .workspace-drag-handle`,
      )?.focus();
    }
  });
  wrapper.append(handle);
  return wrapper;
}

function renderExpressions(): void {
  for (const name of sliderNames()) sliderValues[name] ??= 1;
  expressionList.replaceChildren();
  const renderExpression = (expression: Expression, index: number, container: HTMLElement) => {
    const row = document.createElement("div");
    row.className = `expression-row${expression.hidden ? " expression-hidden" : ""}`;
    row.dataset.expressionId = String(expression.id);
    const appearanceDetails = document.createElement("details");
    appearanceDetails.className = "expression-appearance";
    appearanceDetails.id = `expression-appearance-${expression.id}`;
    const marker = document.createElement("button");
    marker.type = "button";
    const hasSpatialColor = expression.hsv &&
      Object.values(expression.hsv).some((formula) => formula.trim());
    marker.className = `expression-marker${hasSpatialColor ? " expression-marker-spatial" : ""}`;
    marker.style.backgroundColor = expression.color;
    marker.setAttribute("aria-label", `Expression ${index + 1} appearance settings`);
    marker.setAttribute("aria-controls", appearanceDetails.id);
    marker.setAttribute("aria-expanded", "false");
    marker.addEventListener("click", () => {
      appearanceDetails.open = !appearanceDetails.open;
      marker.setAttribute("aria-expanded", String(appearanceDetails.open));
    });
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.className = "expression-color";
    colorPicker.value = expression.color;
    colorPicker.setAttribute("aria-label", `Expression ${index + 1} base color`);
    colorPicker.addEventListener("input", () => {
      expression.color = colorPicker.value;
      marker.style.backgroundColor = expression.color;
      scheduleDraw();
      scheduleProjectSave();
    });
    const colorControl = document.createElement("label");
    colorControl.className = "appearance-color-control";
    colorControl.append(document.createTextNode("Base color"), colorPicker);
    const lineWidth = document.createElement("input");
    lineWidth.type = "range";
    lineWidth.min = "1";
    lineWidth.max = "10";
    lineWidth.step = "0.5";
    lineWidth.value = String(expression.lineWidth ?? 2);
    lineWidth.setAttribute("aria-label", `Expression ${index + 1} line width`);
    const lineWidthValue = document.createElement("output");
    lineWidthValue.textContent = `${lineWidth.value}px`;
    lineWidth.addEventListener("input", () => {
      expression.lineWidth = Number(lineWidth.value);
      lineWidthValue.textContent = `${lineWidth.value}px`;
      scheduleDraw();
      scheduleProjectSave();
    });
    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = "0";
    opacity.max = "100";
    opacity.step = "1";
    opacity.value = String(Math.round((expression.opacity ?? 1) * 100));
    opacity.setAttribute("aria-label", `Expression ${index + 1} opacity`);
    const opacityValue = document.createElement("output");
    opacityValue.textContent = `${opacity.value}%`;
    opacity.addEventListener("input", () => {
      expression.opacity = Number(opacity.value) / 100;
      opacityValue.textContent = `${opacity.value}%`;
      scheduleDraw();
      scheduleProjectSave();
    });
    const appearanceControls = document.createElement("div");
    appearanceControls.className = "appearance-controls";
    const lineWidthControl = document.createElement("label");
    lineWidthControl.className = "appearance-range-control";
    lineWidthControl.append(
      document.createTextNode("Line size"),
      lineWidth,
      lineWidthValue,
    );
    const opacityControl = document.createElement("label");
    opacityControl.className = "appearance-range-control";
    opacityControl.append(
      document.createTextNode("Opacity"),
      opacity,
      opacityValue,
    );
    appearanceControls.append(colorControl, lineWidthControl, opacityControl);
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
      scheduleDraw();
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
    const hsvFields = document.createElement("div");
    hsvFields.className = "hsv-fields";
    const colorError = document.createElement("p");
    colorError.className = "color-formula-error";
    colorError.textContent = expression.colorError ?? "";
    const hsvFormulas = expression.hsv ?? { hue: "", saturation: "", value: "" };
    for (const [channel, label] of [
      ["hue", "Hue (0-360°)"],
      ["saturation", "Saturation (0-1)"],
      ["value", "Value (0-1)"],
    ] as const) {
      const channelInput = document.createElement("input");
      channelInput.type = "text";
      channelInput.maxLength = 512;
      channelInput.value = hsvFormulas[channel];
      channelInput.placeholder = label;
      channelInput.dataset.hsvChannel = channel;
      channelInput.setAttribute("aria-label", `Expression ${index + 1} HSV ${label} formula`);
      channelInput.addEventListener("input", () => {
        const updated: HSVFormulas = {
          ...(expression.hsv ?? { hue: "", saturation: "", value: "" }),
          [channel]: channelInput.value,
        };
        expression.hsv = Object.values(updated).some((value) => value.trim())
          ? updated
          : undefined;
        marker.classList.toggle(
          "expression-marker-spatial",
          Boolean(expression.hsv),
        );
        expression.compiledHsvKey = undefined;
        renderSliders();
        compileSpatialColor(expression);
        channelInput.setAttribute("aria-invalid", String(Boolean(expression.colorError)));
        colorError.textContent = expression.colorError ?? "";
        scheduleDraw();
        scheduleProjectSave();
      });
      hsvFields.append(channelInput);
    }
    const hsvHelp = document.createElement("small");
    hsvHelp.textContent = "Formulas use x, y, and sliders. Hue is degrees (0-360); saturation and value are decimals (0-1). The circle marks spatial mode; formulas color the graph.";
    const hsvControls = document.createElement("div");
    hsvControls.className = "appearance-hsv-control";
    const hsvHeading = document.createElement("div");
    hsvHeading.className = "appearance-hsv-heading";
    const hsvTitle = document.createElement("strong");
    hsvTitle.textContent = "Spatial HSV";
    hsvHeading.append(hsvTitle);
    hsvControls.append(hsvHeading, hsvFields, hsvHelp, colorError);
    appearanceDetails.append(appearanceControls, hsvControls);
    row.append(marker, input, visibility, remove, error, appearanceDetails);
    container.append(row);
  };
  for (const [index, expression] of expressions.entries()) {
    const wrapper = createWorkspaceItem(`expression:${expression.id}`, `Expression ${index + 1}`);
    renderExpression(expression, index, wrapper);
    expressionList.append(wrapper);
  }
  renderSliders();
  renderWorkspaceItems();
  scheduleProjectSave();
}

function tableValues(table: DataTable): { x: number[]; y: number[]; error?: string } {
  const cached = tableValuesCache.get(table);
  if (cached) return cached;
  const x: number[] = [];
  const y: number[] = [];
  for (const [index, row] of table.rows.entries()) {
    const xText = row.x.trim();
    const yText = row.y.trim();
    if (!xText && !yText) {
      continue;
    }
    if (!xText || !yText) {
      const values = { x, y, error: `Enter both x and y values in row ${index + 1}.` };
      tableValuesCache.set(table, values);
      return values;
    }
    const xValue = Number(xText);
    const yValue = Number(yText);
    if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
      const values = { x, y, error: `Row ${index + 1} must contain finite numbers.` };
      tableValuesCache.set(table, values);
      return values;
    }
    x.push(xValue);
    y.push(yValue);
  }
  const values = { x, y };
  tableValuesCache.set(table, values);
  return values;
}

function invalidateTableData(table: DataTable): void {
  tableValuesCache.delete(table);
  tableRevisions.set(table, nextTableRevision++);
  table.regressionKey = undefined;
}

function updateTableRegression(table: DataTable): void {
  const key = JSON.stringify([
    table.regressionDegree,
    table.regressionKind,
    tableRevisions.get(table) ?? 0,
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
    const wrapper = createWorkspaceItem(`table:${table.id}`, `Table ${tableIndex + 1}`);
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
        invalidateTableData(table);
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
        scheduleDraw();
      };
      xInput.addEventListener("input", updateValues);
      yInput.addEventListener("input", updateValues);
      removeRow.addEventListener("click", () => {
        table.rows = table.rows.filter((entry) => entry.id !== dataRow.id);
        invalidateTableData(table);
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
      invalidateTableData(table);
      renderTables();
      draw();
      workspaceList.querySelector<HTMLInputElement>(
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
    wrapper.append(container);
    tableList.append(wrapper);
  }
  renderWorkspaceItems();
  scheduleProjectSave();
}

function renderTextBlocks(): void {
  textList.replaceChildren();
  for (const [index, textBlock] of textBlocks.entries()) {
    const wrapper = createWorkspaceItem(`text:${textBlock.id}`, `Text ${index + 1}`);
    const content = document.createElement("div");
    content.className = "text-block";
    const textarea = document.createElement("textarea");
    textarea.value = textBlock.text;
    textarea.maxLength = 10_000;
    textarea.setAttribute("aria-label", `Text ${index + 1}`);
    textarea.placeholder = "Write text…";
    textarea.addEventListener("input", () => {
      textBlock.text = textarea.value;
      scheduleProjectSave();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove text ${index + 1}`);
    remove.addEventListener("click", () => {
      textBlocks = textBlocks.filter((entry) => entry.id !== textBlock.id);
      workspaceOrder = workspaceOrder.filter((item) =>
        item.type !== "text" || item.id !== textBlock.id);
      renderTextBlocks();
      renderWorkspaceItems();
      scheduleProjectSave();
    });
    content.append(textarea, remove);
    wrapper.append(content);
    textList.append(wrapper);
  }
}

function addTextBlock(): void {
  const textBlock: TextBlock = { id: nextTextId++, text: "" };
  textBlocks.push(textBlock);
  workspaceOrder.push({ type: "text", id: textBlock.id });
  renderTextBlocks();
  renderWorkspaceItems();
  workspaceList.querySelector<HTMLTextAreaElement>(
    `.workspace-item[data-workspace-key="text:${textBlock.id}"] textarea`,
  )?.focus();
  scheduleProjectSave();
}

function isRegressionKind(value: string): value is NonNullable<DataTable["regressionKind"]> {
  return value === "logarithmic" || value === "exponential" || value === "power" ||
    value === "sine" || value === "tangent";
}

function addExpression(text = ""): void {
  const expression = {
    id: nextId++,
    text,
    color: colors[(nextId - 2) % colors.length]!,
  };
  expressions.push(expression);
  workspaceOrder.push({ type: "expression", id: expression.id });
  renderExpressions();
  draw();
  workspaceList.querySelector<HTMLInputElement>(
    `.workspace-item[data-workspace-key="expression:${expression.id}"] input[aria-label^="Expression"]`,
  )?.focus();
}

function addTable(): void {
  const table = {
    id: nextTableId++,
    rows: [
      { id: nextRowId++, x: "", y: "" },
      { id: nextRowId++, x: "", y: "" },
      { id: nextRowId++, x: "", y: "" },
    ],
    color: colors[(tables.length + 2) % colors.length]!,
  };
  tables.push(table);
  workspaceOrder.push({ type: "table", id: table.id });
  renderTables();
  workspaceList.scrollTop = workspaceList.scrollHeight;
  workspaceList.querySelector<HTMLInputElement>(
    `.workspace-item[data-workspace-key="table:${table.id}"] input[aria-label="Table ${tables.length} x value 1"]`,
  )?.focus();
  draw();
}

function currentProjectState(): ProjectState {
  return {
    version: 1,
    expressions: expressions.map((
      { id, text, color, lineWidth, opacity, folderId, hidden, hsv },
    ) => ({ id, text, color, lineWidth, opacity, folderId, hidden, hsv })),
    tables: tables.map(({ id, rows, sourceExpressionId, regressionDegree, regressionKind, color, folderId }) =>
      ({ id, rows, sourceExpressionId, regressionDegree, regressionKind, color, folderId })),
    texts: textBlocks.map(({ id, text, folderId }) => ({ id, text, folderId })),
    workspaceOrder: [...workspaceOrder],
    folders: folders.map(({ id, name, collapsed }) => ({ id, name, collapsed })),
    sliders: { ...sliderValues },
    sliderOptions: { ...sliderOptions },
    centerX,
    centerY,
    scale,
    graphOptions: { ...graphOptions },
  };
}

function setProjectStatus(message: string): void {
  const status = document.querySelector<HTMLSpanElement>("#project-status");
  if (status) status.textContent = message;
}

function saveProjectLocally(): boolean {
  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(currentProjectState()));
    return true;
  } catch (reason) {
    setProjectStatus(reason instanceof Error
      ? `Could not save locally: ${reason.message}`
      : "Could not save this project in browser storage.");
    return false;
  }
}

let saveTimer: number | undefined;
function scheduleProjectSave(): void {
  if (!automaticSavingEnabled || sliderAnimation) return;
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    if (!automaticSavingEnabled || sliderAnimation) return;
    if (saveProjectLocally()) setProjectStatus("Saved on this device");
  }, 400);
}

function applyProjectState(project: ProjectState): void {
  stopSliderAnimation();
  expressions = project.expressions.map((expression) => ({ ...expression }));
  textBlocks = (project.texts ?? []).map((textBlock) => ({ ...textBlock }));
  workspaceOrder = project.workspaceOrder.map((item) => ({ ...item }));
  tables = project.tables.map((table) => ({
    id: table.id,
    rows: table.rows.map((row) => ({ ...row })),
    sourceExpressionId: table.sourceExpressionId,
    regressionDegree: table.regressionDegree,
    regressionKind: table.regressionKind,
    color: table.color,
    folderId: table.folderId,
  }));
  folders = project.folders.map((folder) => ({ ...folder }));
  for (const key of Object.keys(sliderValues)) delete sliderValues[key];
  Object.assign(sliderValues, project.sliders);
  for (const key of Object.keys(sliderOptions)) delete sliderOptions[key];
  Object.assign(sliderOptions, project.sliderOptions ?? {});
  centerX = project.centerX;
  centerY = project.centerY;
  scale = project.scale;
  Object.assign(graphOptions, project.graphOptions ?? {
    showGrid: true,
    showXAxis: true,
    showYAxis: true,
    showLabels: true,
    aspectRatio: 1,
  });
  updateGraphOptionControls();
  nextId = expressions.reduce((next, expression) => Math.max(next, expression.id + 1), 1);
  nextTableId = tables.reduce((next, table) => Math.max(next, table.id + 1), 1);
  nextRowId = tables.reduce(
    (next, table) => table.rows.reduce((rowNext, row) => Math.max(rowNext, row.id + 1), next),
    1,
  );
  nextFolderId = folders.reduce((next, folder) => Math.max(next, folder.id + 1), 1);
  nextTextId = textBlocks.reduce((next, textBlock) => Math.max(next, textBlock.id + 1), 1);
  renderTextBlocks();
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

const saveDialog = document.querySelector<HTMLDialogElement>("#save-dialog")!;
const autoSaveOption = document.querySelector<HTMLInputElement>("#save-autosave-option")!;
document.querySelector("#save-project")!.addEventListener("click", () => {
  autoSaveOption.checked = automaticSavingEnabled;
  saveDialog.showModal();
});
document.querySelector("#cancel-save")!.addEventListener("click", () => saveDialog.close());
document.querySelector<HTMLFormElement>("#save-dialog-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!saveProjectLocally()) return;
  const enabled = autoSaveOption.checked;
  let preferenceSaved = false;
  try {
    localStorage.setItem(AUTO_SAVE_STORAGE_KEY, String(enabled));
    automaticSavingEnabled = enabled;
    preferenceSaved = true;
  } catch (reason) {
    setProjectStatus(reason instanceof Error
      ? `Saved, but could not update auto-save: ${reason.message}`
      : "Saved, but could not update auto-save.");
  }
  if (preferenceSaved && enabled) {
    setProjectStatus("Saved on this device · auto-save on");
  } else if (preferenceSaved) {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    setProjectStatus("Saved on this device · auto-save off");
  }
  saveDialog.close();
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

function updateWorkspaceDropPosition(clientY: number, eventTarget: EventTarget | null): void {
  workspaceList.querySelectorAll(".workspace-drop-before").forEach((item) =>
    item.classList.remove("workspace-drop-before"));
  workspaceList.querySelectorAll(".folder-drop-active").forEach((folder) =>
    folder.classList.remove("folder-drop-active"));
  workspaceList.classList.remove("workspace-drop-end");
  delete workspaceList.dataset.dropBeforeKey;
  delete workspaceList.dataset.dropFolderId;

  const sourceKey = workspaceDragState?.sourceKey;
  if (!sourceKey) return;
  const folder = eventTarget instanceof Element
    ? eventTarget.closest<HTMLElement>(".workspace-folder")
    : null;
  if (folder && !sourceKey.startsWith("folder:")) {
    folder.classList.add("folder-drop-active");
    workspaceList.dataset.dropFolderId = folder.dataset.folderDropId;
    const children = [...folder.querySelectorAll<HTMLElement>(
      ".folder-contents > .workspace-item",
    )].filter((item) => item.dataset.workspaceKey !== sourceKey);
    const before = children.find((item) => {
      const bounds = item.getBoundingClientRect();
      return clientY < bounds.top + bounds.height / 2;
    });
    if (before?.dataset.workspaceKey) {
      workspaceList.dataset.dropBeforeKey = before.dataset.workspaceKey;
      before.classList.add("workspace-drop-before");
    }
    return;
  }

  const items = [...workspaceList.children].filter(
    (item): item is HTMLElement =>
      item instanceof HTMLElement && item.dataset.workspaceKey !== sourceKey,
  );
  const before = items.find((item) => {
    const bounds = item.getBoundingClientRect();
    return clientY < bounds.top + bounds.height / 2;
  });
  if (before?.dataset.workspaceKey) {
    workspaceList.dataset.dropBeforeKey = before.dataset.workspaceKey;
    before.classList.add("workspace-drop-before");
  } else {
    workspaceList.classList.add("workspace-drop-end");
  }
}

function clearWorkspaceDropPosition(): void {
  workspaceList.querySelectorAll(".workspace-drop-before").forEach((item) =>
    item.classList.remove("workspace-drop-before"));
  workspaceList.querySelectorAll(".folder-drop-active").forEach((folder) =>
    folder.classList.remove("folder-drop-active"));
  workspaceList.classList.remove("workspace-drop-end");
}

function finishWorkspaceDrag(commit: boolean): void {
  const state = workspaceDragState;
  if (!state) return;
  workspaceDragState = undefined;
  if (commit && state.active) {
    const targetFolderId = workspaceList.dataset.dropFolderId === undefined
      ? undefined
      : Number(workspaceList.dataset.dropFolderId);
    reorderWorkspaceBlock(
      state.sourceKey,
      workspaceList.dataset.dropBeforeKey,
      Number.isSafeInteger(targetFolderId) ? targetFolderId : undefined,
    );
  }
  state.sourceItem.classList.remove("workspace-item-dragging");
  state.preview?.remove();
  clearWorkspaceDropPosition();
  delete workspaceList.dataset.dropBeforeKey;
  delete workspaceList.dataset.dropFolderId;
  if (state.handle.hasPointerCapture(state.pointerId)) {
    state.handle.releasePointerCapture(state.pointerId);
  }
}

workspaceList.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || !(event.target instanceof Element)) return;
  const handle = event.target.closest<HTMLButtonElement>(".workspace-drag-handle");
  const sourceItem = handle?.closest<HTMLElement>(".workspace-item");
  const sourceKey = sourceItem?.dataset.workspaceKey;
  if (!handle || !sourceItem || !sourceKey) return;
  workspaceDragState = {
    pointerId: event.pointerId,
    sourceKey,
    handle,
    sourceItem,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
  };
  handle.setPointerCapture(event.pointerId);
});
workspaceList.addEventListener("pointermove", (event) => {
  const state = workspaceDragState;
  if (!state || event.pointerId !== state.pointerId) return;
  if (!state.active && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 5) {
    return;
  }
  if (!state.active) {
    state.active = true;
    state.sourceItem.classList.add("workspace-item-dragging");
    const label = state.handle.getAttribute("aria-label") ?? "Workspace item";
    state.preview = document.createElement("div");
    state.preview.className = "workspace-drag-preview";
    state.preview.textContent = label.replace(/^Reorder /, "").replace(/;.*$/, "");
    document.body.append(state.preview);
  }
  const scrollContainer = workspaceList.closest<HTMLElement>(".sidebar-scroll");
  if (scrollContainer) {
    const bounds = scrollContainer.getBoundingClientRect();
    const edgeSize = 48;
    if (event.clientY < bounds.top + edgeSize) {
      scrollContainer.scrollTop -= Math.max(4, (bounds.top + edgeSize - event.clientY) / 3);
    } else if (event.clientY > bounds.bottom - edgeSize) {
      scrollContainer.scrollTop += Math.max(4, (event.clientY - bounds.bottom + edgeSize) / 3);
    }
  }
  if (state.preview) {
    state.preview.style.left = `${event.clientX + 14}px`;
    state.preview.style.top = `${event.clientY + 14}px`;
  }
  updateWorkspaceDropPosition(event.clientY, document.elementFromPoint(event.clientX, event.clientY));
});
workspaceList.addEventListener("pointerup", (event) => {
  if (!workspaceDragState || event.pointerId !== workspaceDragState.pointerId) return;
  if (workspaceDragState.active) {
    updateWorkspaceDropPosition(event.clientY, document.elementFromPoint(event.clientX, event.clientY));
  }
  finishWorkspaceDrag(workspaceDragState.active);
});
workspaceList.addEventListener("pointercancel", () => finishWorkspaceDrag(false));
workspaceList.addEventListener("lostpointercapture", () => {
  if (workspaceDragState) finishWorkspaceDrag(false);
});
workspaceAdd.addEventListener("change", () => {
  if (workspaceAdd.value === "expression") {
    addExpression();
  } else if (workspaceAdd.value === "table") {
    addTable();
  } else if (workspaceAdd.value === "text") {
    addTextBlock();
  } else if (workspaceAdd.value === "folder") {
    createFolder();
  }
  workspaceAdd.value = "";
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
const settingsDialog = document.querySelector<HTMLDialogElement>("#settings-dialog")!;
document.querySelector("#open-settings")!.addEventListener("click", () => settingsDialog.showModal());
document.querySelector("#close-settings")!.addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") settingsDialog.close();
});

function updateGraphOptionControls(): void {
  document.querySelector<HTMLInputElement>("#show-grid-setting")!.checked = graphOptions.showGrid;
  document.querySelector<HTMLInputElement>("#show-x-axis-setting")!.checked = graphOptions.showXAxis;
  document.querySelector<HTMLInputElement>("#show-y-axis-setting")!.checked = graphOptions.showYAxis;
  document.querySelector<HTMLInputElement>("#show-labels-setting")!.checked = graphOptions.showLabels;
  document.querySelector<HTMLSelectElement>("#aspect-ratio-setting")!.value =
    String(graphOptions.aspectRatio);
}
updateGraphOptionControls();

const graphOptionInputs: Array<[keyof Omit<GraphOptions, "aspectRatio">, string]> = [
  ["showGrid", "#show-grid-setting"],
  ["showXAxis", "#show-x-axis-setting"],
  ["showYAxis", "#show-y-axis-setting"],
  ["showLabels", "#show-labels-setting"],
];
for (const [option, selector] of graphOptionInputs) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  input.addEventListener("change", () => {
    graphOptions[option] = input.checked;
    draw();
  });
}
const aspectRatioInput = document.querySelector<HTMLSelectElement>("#aspect-ratio-setting")!;
aspectRatioInput.value = String(graphOptions.aspectRatio);
aspectRatioInput.addEventListener("change", () => {
  const aspectRatio = Number(aspectRatioInput.value);
  if (aspectRatio !== 0.5 && aspectRatio !== 1 && aspectRatio !== 2) {
    throw new Error("Unsupported axis scale ratio.");
  }
  graphOptions.aspectRatio = aspectRatio;
  draw();
});

const precisionInput = document.querySelector<HTMLInputElement>("#precision-setting")!;
const precisionValue = document.querySelector<HTMLOutputElement>("#precision-value")!;
const desmosModeInput = document.querySelector<HTMLInputElement>("#desmos-mode")!;
precisionInput.value = String(graphSettings.precisionDigits);
desmosModeInput.addEventListener("change", () => {
  if (desmosModeInput.checked) {
    savedPreciseSettings = { ...graphSettings };
    graphMode = "desmos";
    graphSettings.explicitSampleSpacing = 1;
    graphSettings.implicitSampleSpacing = implicitSpacingOptions[0]!;
    explicitSpacingInput.value = String(explicitSpacingOptions.indexOf(graphSettings.explicitSampleSpacing));
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
  const bounds = canvasWrap.getBoundingClientRect();
  hoverPosition = {
    x: event.clientX - bounds.left + bounds.width * GRAPH_BUFFER_VIEWPORTS,
    y: event.clientY - bounds.top + bounds.height * GRAPH_BUFFER_VIEWPORTS,
  };
  drawHoverOverlay();
});
canvas.addEventListener("pointermove", (event) => {
  const bounds = canvasWrap.getBoundingClientRect();
  if (drag) {
    if (drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) {
      drag.moved = true;
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      centerX = drag.centerX - deltaX / scale;
      centerY = drag.centerY + deltaY / verticalScale();
      canvas.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
    }
  } else {
    hoverPosition = {
      x: event.clientX - bounds.left + bounds.width * GRAPH_BUFFER_VIEWPORTS,
      y: event.clientY - bounds.top + bounds.height * GRAPH_BUFFER_VIEWPORTS,
    };
    drawHoverOverlay();
  }
});
canvas.addEventListener("pointerup", (event) => {
  const bounds = canvasWrap.getBoundingClientRect();
  if (drag && !drag.moved) {
    const screenX = event.clientX - bounds.left + bounds.width * GRAPH_BUFFER_VIEWPORTS;
    const screenY = event.clientY - bounds.top + bounds.height * GRAPH_BUFFER_VIEWPORTS;
    hoverPosition = { x: screenX, y: screenY };
    addGraphPointAt(screenX, screenY);
  }
  const moved = drag?.moved ?? false;
  drag = undefined;
  canvas.style.transform = "";
  if (moved) {
    hoverPosition = undefined;
    scheduleDraw();
  } else {
    drawHoverOverlay();
  }
});
canvas.addEventListener("pointercancel", () => {
  if (drag?.moved) {
    centerX = drag.centerX;
    centerY = drag.centerY;
  }
  drag = undefined;
  canvas.style.transform = "";
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
  const bounds = canvasWrap.getBoundingClientRect();
  const graphWidth = bounds.width * GRAPH_BUFFER_SCALE;
  const graphHeight = bounds.height * GRAPH_BUFFER_SCALE;
  const mouseX = event.clientX - bounds.left + bounds.width * GRAPH_BUFFER_VIEWPORTS;
  const mouseY = event.clientY - bounds.top + bounds.height * GRAPH_BUFFER_VIEWPORTS;
  const beforeX = (mouseX - graphWidth / 2) / scale + centerX;
  const beforeY = (graphHeight / 2 - mouseY) / verticalScale() + centerY;
  scale = Math.min(100_000, Math.max(0.001, scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
  centerX = beforeX - (mouseX - graphWidth / 2) / scale;
  centerY = beforeY - (graphHeight / 2 - mouseY) / verticalScale();
  scheduleDraw();
}, { passive: false });

window.addEventListener("resize", draw);
desmosModeInput.checked = true;
desmosModeInput.dispatchEvent(new Event("change"));
setProjectStatus(projectStatus);
renderTextBlocks();
renderExpressions();
renderTables();
draw();

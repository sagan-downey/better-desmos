import {
  compileExpression,
  resultCommand,
  graphRelation,
  UndefinedPointError,
  compileFastGraphExpression,
  compileGraphExpression,
  compileCollectionGraph,
  compileTickerAction,
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
  getAngleMode,
  setAngleMode,
  BUILTIN_NAMES,
  freeIdentifiers,
  type AngleMode,
  setPrecisionDigits,
  expandUserFunctions,
  functionParameters,
  type Evaluation,
  type GraphExpression,
  type ImplicitEvaluation,
  type UserFunctionDefinition,
  type LogarithmicRegression,
  type ExponentialRegression,
  type PowerRegression,
  type PolynomialRegression,
  type TrigonometricRegression,
} from "./math";
import { BoundedCache, referencedVariableSignature, SegmentIndex, selectHoverPoint, tangentBranchRange, tangentPixelCoverage, refinementLevels, isFlatOffscreenInterval } from "./performance";
import { expandCollections, hasCollections, COLLECTION_FUNCTIONS, type StatisticsMode } from "./collections";
import {
  fitCustomRegression, regressionParameters, regressionSides,
  type CustomRegressionResult, type RegressionSides,
} from "./customRegression";
import { fitLogistic, type FitResult } from "./regression";
import { filterFunctionReference } from "./functionReference";
import { installFunctionAutocomplete } from "./autocomplete";
import { STATISTICAL_PLOTS, statisticalPlotCall, statisticsSummary } from "./statisticalPlots";
import { DISTRIBUTION_NAMES, PROBABILITY_KERNELS } from "./probability";
import { distributionCall, distributionDefinition, expandDistributionDefinitions, readDistribution, rewriteDistributions } from "./distributionSyntax";
import { INFERENCE_NAMES, inferenceCall, inferenceDefinition, expandInferenceDefinitions, regressionSlopeSummary, inferenceProperty, inferenceSummary, readInference, rewriteInferenceProperties } from "./inference";
import { RANDOM_NAMES, getRandomSeed, setRandomSeed } from "./random";
import { rewriteRandom } from "./randomSyntax";
import { actionDefinition, actionUpdateSource, evaluateActions, expandActions, type ActionUpdate } from "./actions";
import { connectContourSegments, dashedSegments, drawStyledPoint, inequalityLineStyle, lineDash, type LineStyle, type PointStyle } from "./graphAppearance";
import { axisStep, fitViewportBounds, projectCoordinate, unprojectCoordinate, logarithmicTicks, type AxisScale } from "./viewport";
import { compileComplexExpression,complexExpressionIsReal } from "./math";
import { COMPLEX_FUNCTIONS, formatComplex, type Complex } from "./complex";
import { AudioTracePlayer,tracePoints,type TracePoint } from "./audioTrace";
import { bracketedRoot,bracketedExtremum,segmentCrossings,polygonSignedDistance } from "./graphAnalysis";
import { traceContour,tracePolyline,traceRegion } from "./regionTrace";
import { numericSource } from "./numericSource";
import { advanceSlider, PLAYBACK_MODES, type PlaybackMode } from "./sliderPlayback";
import { TonePlayer, evaluateTone, isTone } from "./tones";
import { detectRestrictionEndpoints } from "./restrictionEndpoints";
import { ADVANCED_GRAPH_NAMES, RESULT_COMMAND_NAMES } from "./advancedGraphs";
import { ANALYSIS_GRAPH_NAMES, ANALYSIS_RESULT_NAMES } from "./analysisTools";
import { EXAMPLES, inspectDependencies, type DependencyNode } from "./workspaceAnalysis";
import { parseCSV, csvNumericCell, encodeCSV } from "./csv";
import { graphSVG, svgDocument, xml, type SVGView } from "./svgExport";
import { installWorkspaceResize } from "./workspaceResize";
import { MAX_TABLE_ROWS, nextTableCell, spreadsheetCells, tableAxisAt, validateSpreadsheetPaste } from "./spreadsheet";
import { imageExportSize } from "./image-export";
import { refreshDropdowns } from "./dropdowns";
import { tableColumns, tableColumnName, tableColumnFormula, tableCell, tableRowSource, validateTableColumnName, evaluateTableColumn, type TableColumn, type TableAxis } from "./tables";
import { expandNamedPoints, pointSources, polygonVertexSources, replacePolygonVertex, dynamicLabel, type PointSources } from "./geometry";
import { parsePhotos, evaluatePhotoTransform, photoMatrix, photoLocalPoint, photoDragTransform, PHOTO_FIELDS, PHOTO_TYPES, MAX_PHOTO_BYTES, MAX_PHOTO_PIXELS, MAX_TOTAL_PHOTO_PIXELS, type Photo, type PhotoTransform } from "./photos";
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
  lineStyle?: LineStyle;
  pointStyle?: PointStyle;
  pointSize?: number;
  clickAction?: string;
  opacity?: number;
  draggable?: boolean;
  folderId?: number;
  note?: string;
  hidden?: boolean;
  label?: string;
  labelX?: string;
  labelY?: string;
  labelError?: string;
  hsv?: HSVFormulas;
  compiledHsv?: CompiledChannels;
  compiledHsvKey?: string;
  colorError?: string;
  parsedText?: string;
  parsedFunctionSignature?: string;
  parsedCollectionSignature?: string;
  compiledMode?: "precise" | "desmos";
  compiled?: CompiledGraph;
  compileError?: string;
  evaluationError?: string;
  definitionText?: string;
  definition?: {
    target: string;
    source: string;
    value?: number;
    display?: string;
    error?: string;
    evaluatorKey?: string;
    evaluator?: (x: number) => Evaluation | number;
  } | null;
  scalarText?: string;
  scalarEvaluator?: () => Evaluation | number;
  commandResult?: {key:string;value:string};
  regressionCache?: { key: string; result: CustomRegressionResult };
  regressionError?: string;
  regressionSummary?: string;
  regressionGraph?: string;
}

interface TableRow {
  extra?: string[];
  id: number;
  x: string;
  y: string;
}

interface DataTable {
  extraColumns?: Array<{ id: number; name?: string; formula?: string }>;
  id: number;
  rows: TableRow[];
  name?: string;
  xColumn?: string;
  yColumn?: string;
  xFormula?: string;
  yFormula?: string;
  collapsed?: boolean;
  folderId?: number;
  sourceExpressionId?: number;
  regressionDegree?: number;
  regressionKind?: "logarithmic" | "exponential" | "power" | "sine" | "tangent" | "logistic";
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

interface Ticker {
  id: number;
  action: string;
  name?: string;
  collapsed?: boolean;
  intervalMs: number;
  runMode: "repeat" | "count";
  tickCount: number;
  folderId?: number;
  error?: string;
}

interface ProjectState {
  version: 1;
  expressions: Expression[];
  tables: DataTable[];
  texts?: TextBlock[];
  tickers?: Ticker[];
  photos?: Photo[];
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
  aspectRatio: number;
  gridMode?: "cartesian" | "polar";
  minorGrid?: boolean;
  xStep?: number;
  yStep?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  complexMode?: boolean;
  xScale?: AxisScale;
  yScale?: AxisScale;
  statisticsMode: StatisticsMode;
  angleMode: AngleMode;
  randomSeed?: number;
}

interface WorkspaceItem {
  type: "expression" | "table" | "text" | "ticker" | "photo" | "folder";
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
  mode?: PlaybackMode;
}

type RegressionFit =
  | { kind: "polynomial"; fit: PolynomialRegression }
  | { kind: "logarithmic"; fit: LogarithmicRegression }
  | { kind: "exponential"; fit: ExponentialRegression }
  | { kind: "power"; fit: PowerRegression }
  | { kind: "sine" | "tangent"; fit: TrigonometricRegression }
  | { kind: "logistic"; fit: FitResult };

interface GraphSample {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  connected: boolean;
  region?: string;
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

interface DraggableGraphPoint {
  expressionId: number;
  draggable: boolean;
  xVariables: string[];
  yVariables: string[];
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  color: string;
  opacity: number;
  directSource?:string;
  vertexIndex?:number;
}

interface CurveGeometry {
  id: string;
  color: string;
  segments: number[];
  colorAt?: (x: number, y: number) => string;
  sideways?: boolean;
  hoverPoint?: (x: number, y: number) => { x: number; y: number };
}

interface ExplicitCurveData extends CurveGeometry {
  samples: GraphSample[];
  evaluate?: (x:number)=>number;
}

interface HoverState {
  x: number;
  y: number;
}

const CONTOUR_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0]] as const;
const MAX_AXIS_INTERCEPTS_PER_CURVE = 10;
const ZOOM_REDRAW_DELAY_MS = 200;
const colors = ["#55d6be", "#ff8c69", "#8da7ff", "#f0c75e", "#d18cff"];
let projectStatus = "";
const PROJECT_STORAGE_KEY = "better-desmos-project-v1";
const AUTO_SAVE_STORAGE_KEY = "better-desmos-autosave-v1";
const THEME_STORAGE_KEY = "better-desmos-themes-v1";

interface ThemeColors {
  appBg: string;
  sidebarBg: string;
  panelBg: string;
  inputBg: string;
  raisedBg: string;
  text: string;
  strongText: string;
  mutedText: string;
  accent: string;
  accentContrast: string;
  border: string;
}

interface ColorScheme {
  id: string;
  name: string;
  colors: ThemeColors;
}

const builtInColorSchemes: ColorScheme[] = [
  { id: "dark", name: "Dark", colors: {
    appBg: "#0c1119", sidebarBg: "#111823", panelBg: "#151f2b", inputBg: "#101722",
    raisedBg: "#17212d", text: "#e6edf5", strongText: "#f3f6fa", mutedText: "#97a5b7",
    accent: "#55d6be", accentContrast: "#071411", border: "#263445",
  } },
  { id: "light", name: "Light", colors: {
    appBg: "#f3f6fa", sidebarBg: "#e6ebf2", panelBg: "#ffffff", inputBg: "#ffffff",
    raisedBg: "#e9eef5", text: "#243244", strongText: "#111827", mutedText: "#627186",
    accent: "#087f74", accentContrast: "#ffffff", border: "#c5cfdb",
  } },
  { id: "ocean", name: "Ocean", colors: {
    appBg: "#081923", sidebarBg: "#0d2430", panelBg: "#12303d", inputBg: "#0b202b",
    raisedBg: "#193947", text: "#e0f2f5", strongText: "#f3fcff", mutedText: "#91b1bc",
    accent: "#4dd0c3", accentContrast: "#06201e", border: "#28505d",
  } },
  { id: "forest", name: "Forest", colors: {
    appBg: "#111a15", sidebarBg: "#18231c", panelBg: "#202e24", inputBg: "#151f19",
    raisedBg: "#26372b", text: "#e4eee5", strongText: "#f5fff5", mutedText: "#a1b4a2",
    accent: "#91d18b", accentContrast: "#142018", border: "#3b5140",
  } },
  { id: "sunset", name: "Sunset", colors: {
    appBg: "#211514", sidebarBg: "#2a1b1a", panelBg: "#392321", inputBg: "#261a19",
    raisedBg: "#432a27", text: "#f4e8e4", strongText: "#fff8f4", mutedText: "#c0a39c",
    accent: "#ff9b72", accentContrast: "#301610", border: "#60403a",
  } },
  { id: "rose", name: "Rose", colors: {
    appBg: "#1d141c", sidebarBg: "#271a26", panelBg: "#332331", inputBg: "#211821",
    raisedBg: "#3c2938", text: "#f1e7f0", strongText: "#fff7ff", mutedText: "#bba5b8",
    accent: "#ed91c2", accentContrast: "#2b1221", border: "#563d52",
  } },
  { id: "lavender", name: "Lavender", colors: {
    appBg: "#171625", sidebarBg: "#201f32", panelBg: "#2a2940", inputBg: "#1b1a2c",
    raisedBg: "#32314a", text: "#ebe9f8", strongText: "#fbfaff", mutedText: "#aaa8c5",
    accent: "#b4a0ff", accentContrast: "#211742", border: "#45435f",
  } },
  { id: "high-contrast", name: "High contrast", colors: {
    appBg: "#000000", sidebarBg: "#080808", panelBg: "#141414", inputBg: "#050505",
    raisedBg: "#1e1e1e", text: "#ffffff", strongText: "#ffffff", mutedText: "#c8c8c8",
    accent: "#00f5d4", accentContrast: "#001b17", border: "#777777",
  } },
];

const themeColorFields: Array<[keyof ThemeColors, string, string]> = [
  ["appBg", "Graph background", "theme-app-bg"],
  ["sidebarBg", "Sidebar background", "theme-sidebar-bg"],
  ["panelBg", "Panel background", "theme-panel-bg"],
  ["inputBg", "Input background", "theme-input-bg"],
  ["raisedBg", "Raised controls", "theme-raised-bg"],
  ["text", "Main text", "theme-text"],
  ["strongText", "Bright text", "theme-strong-text"],
  ["mutedText", "Secondary text", "theme-muted-text"],
  ["accent", "Accent color", "theme-accent"],
  ["accentContrast", "Text on accent", "theme-accent-contrast"],
  ["border", "Borders", "theme-border"],
];

function isThemeColors(value: unknown): value is ThemeColors {
  return isRecord(value) && themeColorFields.every(([key]) => {
    const color: unknown = value[key];
    return typeof color === "string" && /^#[\da-f]{6}$/i.test(color);
  });
}

function applyColorScheme(colorsToApply: ThemeColors): void {
  const root = document.documentElement;
  for (const [key, , cssName] of themeColorFields) {
    root.style.setProperty(`--${cssName.replace("theme-", "")}`, colorsToApply[key]);
  }
  const red = Number.parseInt(colorsToApply.appBg.slice(1, 3), 16);
  const green = Number.parseInt(colorsToApply.appBg.slice(3, 5), 16);
  const blue = Number.parseInt(colorsToApply.appBg.slice(5, 7), 16);
  const colorScheme = (red * 0.299 + green * 0.587 + blue * 0.114) > 150 ? "light" : "dark";
  root.dataset.colorScheme = colorScheme;
  root.style.setProperty("--native-color-scheme", colorScheme);
  root.style.setProperty("--error", colorScheme === "light" ? "#a11232" : "#ff9a9e");
  root.style.setProperty("--error-border", colorScheme === "light" ? "#9f1239" : "#a95258");
}

function loadColorSchemes(): { selectedId: string; custom: ColorScheme[] } {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (!stored) return { selectedId: "dark", custom: [] };
    const value: unknown = JSON.parse(stored);
    if (!isRecord(value) || typeof value.selectedId !== "string" ||
        !Array.isArray(value.custom) || value.custom.length > 30) {
      throw new Error("Saved color scheme settings are invalid.");
    }
    const custom = value.custom.map((item): ColorScheme => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" ||
          !/^custom-[\w-]{1,60}$/.test(item.id) || item.name.trim().length === 0 ||
          item.name.length > 40 || !isThemeColors(item.colors)) {
        throw new Error("A saved custom color scheme is invalid.");
      }
      return { id: item.id, name: item.name, colors: item.colors };
    });
    if (new Set(custom.map((scheme) => scheme.id)).size !== custom.length) {
      throw new Error("Saved custom color scheme identifiers must be unique.");
    }
    const available = [...builtInColorSchemes, ...custom];
    if (!available.some((scheme) => scheme.id === value.selectedId)) {
      throw new Error("The selected saved color scheme could not be found.");
    }
    return { selectedId: value.selectedId, custom };
  } catch (reason) {
    projectStatus = reason instanceof Error
      ? `Could not load color schemes: ${reason.message}`
      : "Could not load color schemes.";
    return { selectedId: "dark", custom: [] };
  }
}

let colorSchemeSettings = loadColorSchemes();
function selectedColorScheme(): ColorScheme {
  return [...builtInColorSchemes, ...colorSchemeSettings.custom]
    .find((scheme) => scheme.id === colorSchemeSettings.selectedId) ?? builtInColorSchemes[0]!;
}
applyColorScheme(selectedColorScheme().colors);

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
  const parsedPhotos = parsePhotos(value.photos);
  if (graphOptions !== undefined &&
      (!isRecord(graphOptions) ||
        typeof graphOptions.showGrid !== "boolean" ||
        typeof graphOptions.showXAxis !== "boolean" ||
        typeof graphOptions.showYAxis !== "boolean" ||
        typeof graphOptions.showLabels !== "boolean" ||
        (graphOptions.angleMode !== undefined && !["radians", "degrees"].includes(String(graphOptions.angleMode))) ||
        (graphOptions.randomSeed !== undefined && (typeof graphOptions.randomSeed !== "number" ||
          !Number.isSafeInteger(graphOptions.randomSeed) || graphOptions.randomSeed < 0 || graphOptions.randomSeed > 0xffffffff)) ||
        (graphOptions.statisticsMode !== undefined && !["population", "sample"].includes(String(graphOptions.statisticsMode))) ||
        (graphOptions.gridMode !== undefined && !["cartesian", "polar"].includes(String(graphOptions.gridMode))) ||
        (graphOptions.minorGrid !== undefined && typeof graphOptions.minorGrid !== "boolean") ||
        (graphOptions.complexMode !== undefined && typeof graphOptions.complexMode !== "boolean") ||
        (["xScale","yScale"].some((key)=>graphOptions[key] !== undefined && !["linear","log"].includes(String(graphOptions[key])))) ||
        (["xStep", "yStep"].some((key) => graphOptions[key] !== undefined &&
          (typeof graphOptions[key] !== "number" || !Number.isFinite(graphOptions[key]) || graphOptions[key] <= 0))) ||
        (["xAxisLabel", "yAxisLabel"].some((key) => graphOptions[key] !== undefined &&
          (typeof graphOptions[key] !== "string" || graphOptions[key].length > 80))) ||
        (typeof graphOptions.aspectRatio !== "number" || !Number.isFinite(graphOptions.aspectRatio) ||
          graphOptions.aspectRatio < 0.001 || graphOptions.aspectRatio > 1000))) {
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
        (item.lineStyle !== undefined && !["solid", "dashed", "dotted"].includes(String(item.lineStyle))) ||
        (item.pointStyle !== undefined && !["filled", "open", "cross"].includes(String(item.pointStyle))) ||
        (item.pointSize !== undefined && (typeof item.pointSize !== "number" || !Number.isFinite(item.pointSize) || item.pointSize < 2 || item.pointSize > 12)) ||
        (item.clickAction !== undefined && (typeof item.clickAction !== "string" || item.clickAction.length > 512)) ||
        (item.opacity !== undefined &&
          (typeof item.opacity !== "number" || !Number.isFinite(item.opacity) ||
            item.opacity < 0 || item.opacity > 1)) ||
        (item.folderId !== undefined && !Number.isInteger(item.folderId)) ||
        (item.note !== undefined && (typeof item.note !== "string" || item.note.length > 10_000)) ||
        (item.hidden !== undefined && typeof item.hidden !== "boolean") ||
        (["label", "labelX", "labelY"].some((key) => item[key] !== undefined &&
          (typeof item[key] !== "string" || item[key].length > 512))) ||
        (item.draggable !== undefined && typeof item.draggable !== "boolean") ||
        (hsv !== undefined && !isHSVFormulas(hsv))) {
      throw new Error("Project contains an invalid expression.");
    }
    return {
      id: item.id as number,
      text: item.text,
      color: item.color,
      lineWidth: item.lineWidth === undefined ? 2 : item.lineWidth as number,
      lineStyle: item.lineStyle === "dashed" || item.lineStyle === "dotted" ? item.lineStyle : "solid",
      pointStyle: item.pointStyle === "open" || item.pointStyle === "cross" ? item.pointStyle : "filled",
      pointSize: typeof item.pointSize === "number" ? item.pointSize : undefined,
      clickAction: typeof item.clickAction === "string" ? item.clickAction : undefined,
      opacity: item.opacity === undefined ? 1 : item.opacity as number,
      folderId: item.folderId as number | undefined,
      note: item.note as string | undefined,
      hidden: item.hidden as boolean | undefined,
      label: item.label as string | undefined,
      labelX: item.labelX as string | undefined,
      labelY: item.labelY as string | undefined,
      draggable: item.draggable as boolean | undefined,
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
        typeof item.color !== "string" || !/^#[\da-f]{6}$/i.test(item.color) ||
        (item.name !== undefined && (typeof item.name !== "string" || item.name.length > 40)) ||
        (["xColumn", "yColumn", "xFormula", "yFormula"].some((key) => item[key] !== undefined &&
          (typeof item[key] !== "string" || item[key].length > (key.endsWith("Column") ? 40 : 512)))) ||
        (item.collapsed !== undefined && typeof item.collapsed !== "boolean")) {
      throw new Error("Project contains an invalid table.");
    }
    let extraColumns: DataTable["extraColumns"];
    if (item.extraColumns !== undefined) {
      if (!Array.isArray(item.extraColumns) || item.extraColumns.some((column) =>
        !isRecord(column) || !Number.isSafeInteger(column.id) || Number(column.id) < 1 ||
        (column.name !== undefined && (typeof column.name !== "string" || column.name.length > 40)) ||
        (column.formula !== undefined && (typeof column.formula !== "string" || column.formula.length > 512)))) {
        throw new Error("Project contains invalid extra table columns.");
      }
      extraColumns = item.extraColumns.map((column) => ({
        id: column.id as number, name: column.name as string | undefined, formula: column.formula as string | undefined,
      }));
      if (new Set(extraColumns.map(({ id }) => id)).size !== extraColumns.length) {
        throw new Error("Project contains duplicate extra table column IDs.");
      }
    }
    const rows = item.rows.map((row): TableRow => {
      if (!isRecord(row) || !Number.isSafeInteger(row.id) || Number(row.id) < 1 ||
          typeof row.x !== "string" || row.x.length > 128 ||
          typeof row.y !== "string" || row.y.length > 128) {
        throw new Error("Project contains an invalid table row.");
      }
      if (row.extra !== undefined && (!Array.isArray(row.extra) || row.extra.length > (extraColumns?.length ?? 0) ||
          row.extra.some((cell) => typeof cell !== "string" || cell.length > 128))) {
        throw new Error("Project contains invalid extra table cells.");
      }
      return { id: row.id as number, x: row.x, y: row.y, extra: row.extra ? [...row.extra as string[]] : undefined };
    });
    const regressionKind = item.regressionKind;
    if (regressionKind !== undefined &&
        !["logarithmic", "exponential", "power", "sine", "tangent", "logistic"].includes(String(regressionKind))) {
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
      extraColumns,
      name: item.name as string | undefined,
      xColumn: item.xColumn as string | undefined,
      yColumn: item.yColumn as string | undefined,
      xFormula: item.xFormula as string | undefined,
      yFormula: item.yFormula as string | undefined,
      collapsed: item.collapsed as boolean | undefined,
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
  const parsedTickers: Ticker[] = [];
  if (value.tickers !== undefined) {
    if (!Array.isArray(value.tickers) || value.tickers.length > 100) {
      throw new Error("Project contains invalid tickers.");
    }
    for (const item of value.tickers) {
      if (!isRecord(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 1 ||
          typeof item.action !== "string" || item.action.length > 512 ||
          (item.name !== undefined && (typeof item.name !== "string" || item.name.length > 40)) ||
          (item.collapsed !== undefined && typeof item.collapsed !== "boolean") ||
          typeof item.intervalMs !== "number" || !Number.isInteger(item.intervalMs) ||
          item.intervalMs < 10 || item.intervalMs > 60_000 ||
          (item.runMode !== "repeat" && item.runMode !== "count") ||
          typeof item.tickCount !== "number" || !Number.isInteger(item.tickCount) ||
          item.tickCount < 1 || item.tickCount > 1_000_000 ||
          (item.folderId !== undefined && !Number.isSafeInteger(item.folderId))) {
        throw new Error("Project contains an invalid ticker.");
      }
      parsedTickers.push({
        id: item.id as number,
        action: item.action,
        name: item.name as string | undefined,
        collapsed: item.collapsed as boolean | undefined,
        intervalMs: item.intervalMs,
        runMode: item.runMode,
        tickCount: item.tickCount,
        folderId: item.folderId as number | undefined,
      });
    }
  }
  const sliders: Record<string, number> = {};
  for (const [name, slider] of Object.entries(value.sliders)) {
    if (!/^[a-z](?:_[a-z0-9]+)?$/i.test(name) ||
        typeof slider !== "number" || !Number.isFinite(slider)) {
      throw new Error("Project contains an invalid slider.");
    }
    sliders[name] = slider;
  }
  const sliderOptions: Record<string, SliderOptions> = {};
  if (value.sliderOptions !== undefined) {
    if (!isRecord(value.sliderOptions)) throw new Error("Project contains invalid slider settings.");
    for (const [name, options] of Object.entries(value.sliderOptions)) {
      if (!/^[a-z](?:_[a-z0-9]+)?$/i.test(name) || !isRecord(options) ||
          typeof options.min !== "number" || !Number.isFinite(options.min) ||
          typeof options.max !== "number" || !Number.isFinite(options.max) ||
          options.max <= options.min || Math.abs(options.min) > 1_000_000 ||
          Math.abs(options.max) > 1_000_000 ||
          typeof options.speed !== "number" || !Number.isFinite(options.speed) ||
          options.speed <= 0 || options.speed > 100 ||
          options.mode !== undefined && !PLAYBACK_MODES.includes(options.mode as PlaybackMode)) {
        throw new Error(`Project contains invalid settings for slider "${name}".`);
      }
      sliderOptions[name] = {
        min: options.min,
        max: options.max,
        speed: options.speed,
        mode: options.mode as PlaybackMode | undefined,
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
      ...parsedTickers.map(({ id, folderId }): WorkspaceItem => ({
        type: "ticker", id, folderId,
      })),
      ...parsedPhotos.map(({ id, folderId }): WorkspaceItem => ({
        type: "photo", id, folderId,
      })),
      ...parsedFolders.map(({ id }): WorkspaceItem => ({ type: "folder", id })),
    ]
    : rawWorkspaceOrder.map((item): WorkspaceItem => {
      if (!isRecord(item) ||
          (item.type !== "expression" && item.type !== "table" &&
            item.type !== "text" && item.type !== "ticker" && item.type !== "photo" && item.type !== "folder") ||
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
    ...parsedTickers.map(({ id }) => `ticker:${id}`),
    ...parsedPhotos.map(({ id }) => `photo:${id}`),
    ...folderIds.map((id) => `folder:${id}`),
  ];
  if (new Set(workspaceKeys).size !== workspaceKeys.length ||
      workspaceKeys.length !== expectedWorkspaceKeys.length ||
      expectedWorkspaceKeys.some((key) => !workspaceKeys.includes(key))) {
    throw new Error("Project workspace order must include each expression, table, text block, ticker, photo, and folder exactly once.");
  }
  return {
    version: 1,
    expressions: parsedExpressions,
    tables: parsedTables,
    texts: parsedTexts,
    tickers: parsedTickers,
    photos: parsedPhotos,
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
      angleMode: graphOptions.angleMode === "degrees" ? "degrees" : "radians",
      statisticsMode: graphOptions.statisticsMode === "sample" ? "sample" : "population",
      randomSeed: typeof graphOptions.randomSeed === "number" ? graphOptions.randomSeed : 1,
      gridMode: graphOptions.gridMode === "polar" ? "polar" : "cartesian",
      minorGrid: graphOptions.minorGrid === true,
      complexMode: graphOptions.complexMode === true,
      xScale: graphOptions.xScale === "log" ? "log" : "linear",
      yScale: graphOptions.yScale === "log" ? "log" : "linear",
      xStep: typeof graphOptions.xStep === "number" ? graphOptions.xStep : undefined,
      yStep: typeof graphOptions.yStep === "number" ? graphOptions.yStep : undefined,
      xAxisLabel: typeof graphOptions.xAxisLabel === "string" ? graphOptions.xAxisLabel : undefined,
      yAxisLabel: typeof graphOptions.yAxisLabel === "string" ? graphOptions.yAxisLabel : undefined,
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
let tickers: Ticker[] = initialProject?.tickers ?? [];
let photos: Photo[] = initialProject?.photos ?? [];
interface PhotoImage {
  bitmap?: ImageBitmap;
  error?: string;
  transformError?: string;
  retryOnRelease?: boolean;
  loading: boolean;
}
const photoImages = new Map<Photo, PhotoImage>();
let photoPixels = 0;
let photoUploadRevision = 0;
let folders: Folder[] = initialProject?.folders ?? [];
let workspaceOrder: WorkspaceItem[] = initialProject?.workspaceOrder ?? [
  ...expressions.map(({ id }): WorkspaceItem => ({ type: "expression", id })),
  ...tables.map(({ id }): WorkspaceItem => ({ type: "table", id })),
  ...textBlocks.map(({ id }): WorkspaceItem => ({ type: "text", id })),
  ...tickers.map(({ id }): WorkspaceItem => ({ type: "ticker", id })),
  ...photos.map(({ id }): WorkspaceItem => ({ type: "photo", id })),
  ...folders.map(({ id }): WorkspaceItem => ({ type: "folder", id })),
];
const sliderValues: Record<string, number> = initialProject?.sliders ?? {};
let collectionValues: Record<string, string[]> = {};
let complexValues: Record<string,Complex>={};
let tableColumnErrors: Record<string, string> = {};
let pointValues: Record<string, PointSources> = {};
const sliderOptions: Record<string, SliderOptions> = initialProject?.sliderOptions ?? {};
interface SliderAnimation {
  direction: 1 | -1;
  lastTime: number;
}
const sliderAnimations = new Map<string, SliderAnimation>();
let sliderAnimationTimer: number | undefined;
interface RunningTicker {
  timer: number;
  remainingTicks?: number;
}
const runningTickers = new Map<number, RunningTicker>();
const explicitSpacingOptions = [4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
const implicitSpacingOptions = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
let nextId = Math.max(0, ...expressions.map((expression) => expression.id)) + 1;
let nextTableId = Math.max(0, ...tables.map((table) => table.id)) + 1;
let nextRowId = Math.max(0, ...tables.flatMap((table) => table.rows.map((row) => row.id))) + 1;
let nextFolderId = Math.max(0, ...folders.map((folder) => folder.id)) + 1;
let nextTextId = Math.max(0, ...textBlocks.map((textBlock) => textBlock.id)) + 1;
let nextTickerId = Math.max(0, ...tickers.map((ticker) => ticker.id)) + 1;
let nextPhotoId = Math.max(0, ...photos.map((photo) => photo.id)) + 1;
let centerX = initialProject?.centerX ?? 0;
let centerY = initialProject?.centerY ?? 0;
let scale = initialProject?.scale ?? 48;
let renderedView = { centerX, centerY, scale };
let zoomRedrawTimer: number | undefined;
interface TableValues {
  x: number[];
  y: number[];
  extra: Array<Array<number | undefined>>;
  columnErrors: Array<string | undefined>;
  primaryError?: string;
  error?: string;
}
const tableValuesCache = new WeakMap<DataTable, TableValues>();
const tableRevisions = new WeakMap<DataTable, number>();
const explicitEvaluationCaches = new WeakMap<
  Expression,
  {
    key: string;
    values: BoundedCache<number, { value: number } | { error: string }>;
  }
>();
const tonePlayer=new TonePlayer();
const enabledTones=new Set<number>();
const pendingTones=new Map<number,number>();
let toneRequest=0;
let tonesMutedByUser=false;
function muteTones():void{
  pendingTones.clear();enabledTones.clear();tonePlayer.stop();updateToneControl();
}
function updateToneControl():void{
  const control=document.querySelector<HTMLButtonElement>("#mute-all-tones");
  if(control){
    const hasTones=expressions.some(expression=>isTone(expression.text));
    if(!hasTones)tonesMutedByUser=false;
    control.hidden=!hasTones;
    const playing=enabledTones.size>0||pendingTones.size>0;
    control.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4Z" fill="none"/>${playing?'<path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" fill="none"/>':'<path d="m3 3 18 18" fill="none"/>'}</svg>`;
    control.setAttribute("aria-label",playing?"Mute tones":"Play tones");
    control.title=playing?"Mute tones":"Play tones";
    control.setAttribute("aria-pressed",String(playing));
  }
}
async function playExpressionTone(expression:Expression):Promise<void>{
  const request=++toneRequest,source=expression.text;
  pendingTones.delete(expression.id);
  if(!isTone(source)||expression.hidden||tonesMutedByUser){updateToneControl();return;}
  try{
    evaluateTone(source,sliderValues,expandFunctions);
    pendingTones.set(expression.id,request);updateToneControl();
    const generation=await tonePlayer.start();
    if(!tonePlayer.valid(generation)||pendingTones.get(expression.id)!==request||
      expression.text!==source||expression.hidden||!expressions.includes(expression))return;
    enabledTones.add(expression.id);draw();
  }catch(reason){
    enabledTones.delete(expression.id);tonePlayer.stop(expression.id);
    expression.evaluationError=reason instanceof Error?reason.message:"Could not play tone.";
    updateExpressionErrorDisplay(expression);setProjectStatus(expression.evaluationError);
  }finally{if(pendingTones.get(expression.id)===request)pendingTones.delete(expression.id);updateToneControl();}
}
function synchronizeTones():void{
  for(const id of enabledTones){
    const expression=expressions.find(expression=>expression.id===id);
    if(!expression||expression.hidden||!isTone(expression.text)){enabledTones.delete(id);tonePlayer.stop(id);continue;}
    try{
      const {frequency,gain}=evaluateTone(expression.text,sliderValues,expandFunctions);
      tonePlayer.update(id,frequency,gain);
    }catch(reason){
      enabledTones.delete(id);tonePlayer.stop(id);
      expression.evaluationError=reason instanceof Error?reason.message:"Could not play tone.";
      updateExpressionErrorDisplay(expression);setProjectStatus(expression.evaluationError);
    }
  }
  updateToneControl();
}
const MAX_EXPRESSION_SAMPLE_CACHE_SIZE = 32_768;
const expressionCurveCaches = new WeakMap<Expression, {
  key: string;
  curve: ExplicitCurveData;
  path: Path2D;
}>();
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
let clearDragTransformAfterDraw = false;
let graphMode: "precise" | "desmos" = "precise";
const graphOptions: GraphOptions = initialProject?.graphOptions ?? {
  showGrid: true,
  showXAxis: true,
  showYAxis: true,
  showLabels: true,
  aspectRatio: 1,
  statisticsMode: initialProject ? "population" : "sample",
  angleMode: "radians",
};
setAngleMode(graphOptions.angleMode);
setRandomSeed(graphOptions.randomSeed ?? 1);
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
  point?: DraggableGraphPoint;
  startSliderValues?: Record<string, number>;
  pointerOffsetX?: number;
  pointerOffsetY?: number;
  photo?: { item: Photo; transform: PhotoTransform; start: [number,number]; mode: "move"|"scale"|"rotate"; original: Pick<Photo,"centerX"|"centerY"|"width"|"height"|"rotation"> };
} | undefined;
let hoverPosition: HoverState | undefined;
let hoverCandidates: PointCandidate[] = [];
let hoverCurves: CurveGeometry[] = [];
let hoverSegmentIndex: SegmentIndex<CurveGeometry> | undefined;
let draggableGraphPoints: DraggableGraphPoint[] = [];

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <main class="workspace">
    <aside class="sidebar">
      <header class="sidebar-brand">
        <a class="brand" href="#" aria-label="Better Desmos 4.4 home"><span class="brand-mark">∿</span> better<span>desmos</span><span class="version-label">4.4</span></a>
      </header>
      <div class="panel-heading">
        <div class="project-controls" aria-label="Project actions">
          <div class="project-tools">
            <button type="button" class="icon-control" id="project-tools-toggle" aria-label="Project tools" title="Project tools" aria-expanded="false" aria-controls="project-tools-dropdown">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5a5 5 0 0 0-6.3 6.3L3 18a2.1 2.1 0 0 0 3 3l5.2-5.2a5 5 0 0 0 6.3-6.3L14 13l-3-3 3.5-3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
            </button>
            <button type="button" class="icon-control tone-control" id="mute-all-tones" aria-label="Play tones" title="Play tones" aria-pressed="false" hidden></button>
            <div id="project-tools-dropdown" class="project-tools-dropdown" hidden>
              <button type="button" id="save-project" aria-haspopup="dialog">Save</button>
              <button type="button" id="export-project">Export</button>
              <button type="button" id="export-image" aria-haspopup="dialog">PNG</button>
              <button type="button" id="export-svg">SVG</button>
              <button type="button" id="import-csv" aria-haspopup="dialog">Import CSV</button>
              <button type="button" id="open-dependencies" aria-haspopup="dialog">Dependencies</button>
              <button type="button" id="open-examples" aria-haspopup="dialog">Examples</button>
              <button type="button" id="import-project">Import</button>
              <button type="button" id="share-project">Share</button>
              <button type="button" id="open-audio-trace" aria-haspopup="dialog">Audio trace</button>
            </div>
          </div>
          <div class="project-history">
            <button type="button" class="icon-control" id="undo-project" aria-label="Undo" title="Undo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5-6 6 6 6M3 11h10a7 7 0 0 1 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button type="button" class="icon-control" id="redo-project" aria-label="Redo" title="Redo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 6 6-6 6m6-6H11a7 7 0 0 0-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <label class="workspace-add-control">
            <span class="visually-hidden">Add to workspace</span>
            <select id="workspace-add" aria-label="Add to workspace">
              <option value="" selected hidden></option>
              <option value="expression">Add expression</option>
              <option value="table">Add table</option>
              <option value="text">Add text</option>
              <option value="ticker">Add ticker</option>
              <option value="photo">Add photo</option>
              <option value="folder">Add folder</option>
            </select>
          </label>
          <input type="file" id="project-file" accept="application/json,.json" hidden />
          <input type="file" id="photo-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
        </div>
      </div>
      <span id="project-status" role="status"></span>
      <div class="sidebar-scroll">
        <div class="workspace-items" id="workspace-items" aria-label="Expressions, tables, text, tickers, photos, and folders"></div>
        <section class="sliders-panel" id="sliders" aria-label="Parameter sliders"></section>
      </div>
    </aside>
    <div id="workspace-divider" class="workspace-divider" role="separator" tabindex="0" aria-label="Workspace width" aria-orientation="vertical" aria-controls="workspace-items" title="Drag to resize workspace. Arrow keys resize; Home resets."></div>
    <section class="graph-panel" aria-label="Coordinate graph">
      <div class="graph-toolbar">
        <div class="view-controls">
          <button type="button" class="icon-control" id="open-settings" aria-label="Settings" title="Settings" aria-haspopup="dialog">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9 4.7v-2.4l-2.2-.6a7.3 7.3 0 0 0-.7-1.7l1.2-1.9-1.7-1.7-1.9 1.2a7.3 7.3 0 0 0-1.7-.7L13.4 3h-2.4l-.6 2.2a7.3 7.3 0 0 0-1.7.7L6.8 4.7 5.1 6.4l1.2 1.9a7.3 7.3 0 0 0-.7 1.7l-2.2.6V13l2.2.6a7.3 7.3 0 0 0 .7 1.7l-1.2 1.9 1.7 1.7 1.9-1.2a7.3 7.3 0 0 0 1.7.7l.6 2.2h2.4l.6-2.2a7.3 7.3 0 0 0 1.7-.7l1.9 1.2 1.7-1.7-1.2-1.9a7.3 7.3 0 0 0 .7-1.7Z"/><circle cx="12" cy="12" r="2" fill="var(--sidebar-bg)"/></svg>
          </button>
          <button type="button" class="icon-control" id="zoom-out" aria-label="Zoom out" title="Zoom out">
            <svg class="zoom-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
          </button>
          <button type="button" class="icon-control" id="zoom-in" aria-label="Zoom in" title="Zoom in">
            <svg class="zoom-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>
          </button>
          <button type="button" class="icon-control" id="reset-view" aria-label="Reset view" title="Reset view">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1Z"/></svg>
          </button>
          <button type="button" class="icon-control" id="rerandomize" aria-label="Rerandomize samples" title="Rerandomize samples">↻</button>
        </div>
      </div>
      <div class="canvas-wrap"><canvas id="graph" aria-label="Graph of the entered expressions"></canvas><canvas id="graph-detail" aria-hidden="true" hidden></canvas><canvas id="graph-grid" aria-hidden="true"></canvas><canvas id="graph-points" aria-hidden="true"></canvas></div>
    </section>
  </main>
  <dialog class="settings-dialog" id="audio-trace-dialog" aria-labelledby="audio-trace-title">
    <div class="settings-dialog-heading"><h2 id="audio-trace-title">Audio trace</h2><button type="button" id="close-audio-trace" aria-label="Close audio trace">×</button></div>
    <p>Higher y is higher pitch; x pans left to right. Negative y uses a triangle tone. Undefined samples are silent. Arrow keys trace individual points; Home/End go to the bounds.</p>
    <label class="setting-control">Curve<select id="audio-trace-expression" aria-label="Audio trace curve"></select></label>
    <label class="setting-control" hidden>Trace<select id="audio-trace-mode" aria-label="Audio trace mode"><option value="boundary">Boundary</option><option value="region">Shaded region</option></select></label>
    <label class="setting-control" hidden>Branch<select id="audio-trace-branch" aria-label="Audio trace branch"></select></label>
    <p id="audio-trace-limits"></p>
    <div class="theme-actions"><button type="button" id="play-audio-trace">Play viewport</button><button type="button" id="stop-audio-trace">Stop</button><button type="button" id="previous-audio-point">Previous point</button><button type="button" id="next-audio-point">Next point</button></div>
    <input id="audio-trace-position" type="range" min="0" max="200" value="0" aria-label="Audio trace position" />
    <output id="audio-trace-result" role="status" aria-live="polite"></output>
  </dialog>
  <dialog class="settings-dialog" id="math-keypad-dialog" aria-labelledby="math-keypad-title">
    <div class="settings-dialog-heading"><h2 id="math-keypad-title">Math keypad</h2><button type="button" id="close-math-keypad" aria-label="Close math keypad">×</button></div>
    <label class="setting-control">Expression<select id="math-keypad-expression" aria-label="Keypad expression"></select></label>
    <label class="keypad-source-label" for="math-keypad-input">Expression text</label>
    <input id="math-keypad-input" type="text" maxlength="512" aria-label="Expression text editor" autocomplete="off" spellcheck="false" />
    <div id="math-keypad-keys" class="math-keypad-keys"></div>
    <p id="math-keypad-error" class="expression-error" role="status"></p>
  </dialog>
  <dialog class="settings-dialog" id="dependencies-dialog" aria-labelledby="dependencies-title">
    <div class="settings-dialog-heading"><h2 id="dependencies-title">Expression dependencies</h2><button type="button" id="close-dependencies" aria-label="Close dependencies">×</button></div>
    <p class="analysis-dialog-help">Static snapshot of expressions and table-column formulas. Cycles can be intentional recursive functions; they are not automatically errors. Unknown names may be incomplete input. Coordinates x/y/t are not sliders.</p>
    <div id="dependency-list" class="analysis-dialog-list"></div>
    <p id="dependencies-error" class="expression-error" role="status"></p>
  </dialog>
  <dialog class="settings-dialog" id="examples-dialog" aria-labelledby="examples-title">
    <div class="settings-dialog-heading"><h2 id="examples-title">Example gallery</h2><button type="button" id="close-examples" aria-label="Close example gallery">×</button></div>
    <p class="analysis-dialog-help">Append editable examples without replacing your project, changing its viewport, or starting sound/playback. Use Reset view if an example is off-screen.</p>
    <div id="example-list" class="analysis-dialog-list"></div>
    <p id="examples-error" class="expression-error" role="status"></p>
  </dialog>
  <dialog class="settings-dialog" id="csv-import-dialog" aria-labelledby="csv-import-title">
    <div class="settings-dialog-heading"><h2 id="csv-import-title">Import CSV as a new table</h2><button type="button" id="close-csv-import" aria-label="Close CSV import">×</button></div>
    <label class="setting-check"><span>First row contains column names</span><input id="csv-has-header" type="checkbox" checked /></label>
    <div class="setting-control"><p>Use 2–20 columns of finite numbers or empty cells. Headers must be distinct letter/subscript names, such as x_2, y_2, or a_1. Existing tables are not replaced.</p><input id="csv-file" type="file" accept=".csv,text/csv" aria-label="Choose CSV file" /></div>
    <p id="csv-import-error" class="expression-error" role="status"></p>
  </dialog>
  <dialog class="settings-dialog" id="image-export-dialog" aria-labelledby="image-export-title">
    <form id="image-export-form">
      <div class="settings-dialog-heading"><h2 id="image-export-title">Export graph as PNG</h2></div>
      <div class="setting-control">
        <label for="image-export-resolution">Resolution</label>
        <select id="image-export-resolution">
          <option value="1">1x visible graph size</option>
          <option value="2" selected>2x visible graph size</option>
          <option value="3">3x visible graph size</option>
          <option value="4">4x visible graph size</option>
        </select>
      </div>
      <p>Renders the current view with photos, grid, and axis numbers. Maximum 16 million pixels. Higher resolutions may take longer.</p>
      <div class="theme-actions">
        <button type="button" id="cancel-image-export">Cancel</button>
        <button type="submit" id="download-image">Download PNG</button>
      </div>
    </form>
  </dialog>
  <dialog class="settings-dialog" id="settings-dialog" aria-labelledby="settings-title">
    <div class="settings-dialog-heading">
      <h2 id="settings-title">Settings</h2>
      <button type="button" id="close-settings" aria-label="Close settings">×</button>
    </div>
    <section class="settings-section" aria-labelledby="input-settings-heading">
      <h3 id="input-settings-heading">Math input</h3>
      <label class="setting-check" for="auto-keypad-setting"><span>Open math keypad when clicking a math box</span><input id="auto-keypad-setting" type="checkbox" /></label>
      <p>Opens the keypad for expressions, table values, and table formulas. Other text fields stay unchanged.</p>
    </section>
    <section class="settings-section theme-settings" aria-labelledby="color-scheme-heading">
      <h3 id="color-scheme-heading">Color scheme</h3>
      <div class="setting-control">
        <label for="color-scheme-setting">Choose a scheme</label>
        <select id="color-scheme-setting"></select>
      </div>
      <div class="theme-actions">
        <button type="button" id="new-color-scheme">Create custom scheme</button>
        <button type="button" id="delete-color-scheme" hidden>Delete custom scheme</button>
      </div>
      <form class="custom-theme-form" id="custom-theme-form" hidden>
        <label class="theme-name-control" for="custom-theme-name">
          <span>Scheme name</span>
          <input id="custom-theme-name" maxlength="40" required />
        </label>
        <div class="theme-color-fields">
          ${themeColorFields.map(([key, label, id]) => `
            <label for="${id}"><span>${label}</span><input id="${id}" type="color" value="${builtInColorSchemes[0]!.colors[key]}" /></label>
          `).join("")}
        </div>
        <div class="theme-actions">
          <button type="button" id="cancel-color-scheme">Cancel</button>
          <button type="submit" id="save-color-scheme">Save scheme</button>
        </div>
      </form>
    </section>
    <section class="settings-section" aria-labelledby="graph-options-heading">
      <h3 id="graph-options-heading">Graph</h3>
      <label class="setting-check" for="show-grid-setting"><span>Show grid</span><input id="show-grid-setting" type="checkbox" /></label>
      <div class="setting-control"><label for="grid-mode-setting">Grid coordinates</label><select id="grid-mode-setting"><option value="cartesian">Cartesian</option><option value="polar">Polar</option></select></div>
      <label class="setting-check" for="minor-grid-setting"><span>Minor grid</span><input id="minor-grid-setting" type="checkbox" /></label>
      <label class="setting-check" for="complex-mode-setting"><span>Complex numbers (principal branches)</span><input id="complex-mode-setting" type="checkbox" /></label>
      <div class="setting-control"><label for="x-scale-setting">X-axis scale</label><select id="x-scale-setting"><option value="linear">Linear</option><option value="log">Logarithmic (base 10)</option></select></div>
      <div class="setting-control"><label for="y-scale-setting">Y-axis scale</label><select id="y-scale-setting"><option value="linear">Linear</option><option value="log">Logarithmic (base 10)</option></select></div>
      <p>Logarithmic axes show positive coordinates only. Bounds remain actual values; grid steps on a log axis are automatic.</p>
      <div class="setting-control"><label for="x-step-setting">X / radial step</label><input id="x-step-setting" type="number" step="any" placeholder="Automatic" /></div>
      <div class="setting-control"><label for="y-step-setting">Y step</label><input id="y-step-setting" type="number" step="any" placeholder="Automatic" /></div>
      <p id="grid-step-warning" class="expression-error" role="status"></p>
      <div class="setting-control"><label for="x-axis-label-setting">X-axis label</label><input id="x-axis-label-setting" maxlength="80" placeholder="x" /></div>
      <div class="setting-control"><label for="y-axis-label-setting">Y-axis label</label><input id="y-axis-label-setting" maxlength="80" placeholder="y" /></div>
      <div class="setting-control"><label for="x-min-setting">X minimum</label><input id="x-min-setting" type="number" step="any" /></div>
      <div class="setting-control"><label for="x-max-setting">X maximum</label><input id="x-max-setting" type="number" step="any" /></div>
      <div class="setting-control"><label for="y-min-setting">Y minimum</label><input id="y-min-setting" type="number" step="any" /></div>
      <div class="setting-control"><label for="y-max-setting">Y maximum</label><input id="y-max-setting" type="number" step="any" /></div>
      <button type="button" id="apply-view-bounds">Apply exact viewport bounds</button>
      <label class="setting-check" for="show-x-axis-setting"><span>Show x-axis</span><input id="show-x-axis-setting" type="checkbox" /></label>
      <label class="setting-check" for="show-y-axis-setting"><span>Show y-axis</span><input id="show-y-axis-setting" type="checkbox" /></label>
      <label class="setting-check" for="show-labels-setting"><span>Show axis numbers</span><input id="show-labels-setting" type="checkbox" /></label>
      <div class="setting-control">
        <label for="statistics-mode-setting">Statistics convention</label>
        <select id="statistics-mode-setting">
          <option value="sample">Sample (Desmos-style, n−1)</option>
          <option value="population">Population (legacy, n)</option>
        </select>
        <p>Controls variance and stdev. Older projects keep population statistics; new projects use sample statistics. variancep and stdevp always use population statistics.</p>
      </div>
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
        <label for="angle-mode-setting">Angle mode</label>
        <select id="angle-mode-setting"><option value="radians">Radians</option><option value="degrees">Degrees</option></select>
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
    <section class="settings-section function-reference" aria-labelledby="function-reference-heading">
      <h3 id="function-reference-heading">Functions</h3>
      <div class="setting-control">
        <label for="function-reference-search">Search functions</label>
        <input id="function-reference-search" type="search" placeholder="e.g. mean, floor, log" autocomplete="off" spellcheck="false" aria-controls="function-reference-list" />
      </div>
      <div id="function-reference-list" class="function-reference-list" aria-live="polite"></div>
    </section>
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
const tickerList = document.createElement("div");
tickerList.className = "tickers-panel";
const photoList = document.createElement("div");
const workspaceAdd = document.querySelector<HTMLSelectElement>("#workspace-add")!;
const projectTools = document.querySelector<HTMLDivElement>(".project-tools")!;
const projectToolsToggle = document.querySelector<HTMLButtonElement>("#project-tools-toggle")!;
const projectToolsDropdown = document.querySelector<HTMLDivElement>("#project-tools-dropdown")!;
function setProjectToolsOpen(open: boolean): void {
  projectToolsDropdown.hidden = !open;
  projectToolsToggle.setAttribute("aria-expanded", String(open));
}
projectToolsToggle.addEventListener("click", () => setProjectToolsOpen(projectToolsDropdown.hidden));
projectToolsDropdown.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("button")) {
    setProjectToolsOpen(false);
    if (!document.querySelector("dialog[open]")) projectToolsToggle.focus();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (event.target instanceof Node && !projectTools.contains(event.target)) setProjectToolsOpen(false);
});
projectTools.addEventListener("focusout", (event) => {
  if (!(event.relatedTarget instanceof Node) || !projectTools.contains(event.relatedTarget)) setProjectToolsOpen(false);
});
projectTools.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !projectToolsDropdown.hidden) {
    event.preventDefault();
    setProjectToolsOpen(false);
    projectToolsToggle.focus();
  } else if (event.key === "ArrowDown" && event.target === projectToolsToggle) {
    event.preventDefault();
    setProjectToolsOpen(true);
    projectToolsDropdown.querySelector<HTMLButtonElement>("button")!.focus();
  }
});
const canvas = document.querySelector<HTMLCanvasElement>("#graph")!;
let context = canvas.getContext("2d")!;
const detailCanvas = document.querySelector<HTMLCanvasElement>("#graph-detail")!;
const canvasWrap = canvas.parentElement as HTMLDivElement;
const gridCanvas = document.querySelector<HTMLCanvasElement>("#graph-grid")!;
const gridContext = gridCanvas.getContext("2d")!;
const pointCanvas = document.querySelector<HTMLCanvasElement>("#graph-points")!;
const pointContext = pointCanvas.getContext("2d")!;
const GRAPH_BUFFER_VIEWPORTS = 1;
const GRAPH_BUFFER_SCALE = GRAPH_BUFFER_VIEWPORTS * 2 + 1;
let refinementTimer: number | undefined;
let refinementRevision = 0;
let renderDetailFactor = 1;

function cancelRefinement(): void {
  refinementRevision += 1;
  if (refinementTimer !== undefined) {
    window.clearTimeout(refinementTimer);
    refinementTimer = undefined;
  }
}

function scheduleRefinement(): void {
  cancelRefinement();
  const bounds = canvasWrap.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const dpr = window.devicePixelRatio || 1;
  const levels = refinementLevels(bounds.width, bounds.height, dpr);
  const revision = refinementRevision;
  const refine = (index: number) => {
    refinementTimer = undefined;
    if (revision !== refinementRevision || drag || drawFrame !== undefined ||
        zoomRedrawTimer !== undefined || sliderAnimations.size > 0 || runningTickers.size > 0) return;
    const factor = levels[index];
    if (factor === undefined) return;
    const target = document.createElement("canvas");
    const targetContext = target.getContext("2d");
    if (!targetContext) {
      setProjectStatus("Could not create the high-resolution graph canvas.");
      return;
    }
    const previousContext = context;
    const explicitSpacing = graphSettings.explicitSampleSpacing;
    const implicitSpacing = graphSettings.implicitSampleSpacing;
    const profilingEnabled = performanceProfile.enabled;
    const started = performance.now();
    try {
      context = targetContext;
      renderDetailFactor = factor;
      performanceProfile.enabled = false;
      graphSettings.explicitSampleSpacing = explicitSpacing / factor;
      graphSettings.implicitSampleSpacing = implicitSpacing / factor;
      renderGraph(target, bounds.width, bounds.height, dpr * factor);
      if (revision !== refinementRevision) return;
      detailCanvas.width = target.width;
      detailCanvas.height = target.height;
      const detailContext = detailCanvas.getContext("2d");
      if (!detailContext) throw new Error("Could not display the high-resolution graph.");
      detailContext.drawImage(target, 0, 0);
      detailCanvas.style.transform = "";
      detailCanvas.dataset.resolution = String(factor);
      detailCanvas.hidden = false;
    } catch (reason) {
      console.error("Graph refinement failed", reason);
      setProjectStatus(reason instanceof Error ? reason.message : "Could not refine the graph.");
      return;
    } finally {
      context = previousContext;
      renderDetailFactor = 1;
      performanceProfile.enabled = profilingEnabled;
      graphSettings.explicitSampleSpacing = explicitSpacing;
      graphSettings.implicitSampleSpacing = implicitSpacing;
    }
    // Stop escalating expensive views rather than repeatedly blocking interaction.
    if (performance.now() - started < 120 && index + 1 < levels.length) {
      refinementTimer = window.setTimeout(() => refine(index + 1), 700);
    }
  };
  if (levels.length > 0) refinementTimer = window.setTimeout(() => refine(0), 700);
}
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
function screenXAt(x: number, width: number): number {
  return width / 2 + (projectCoordinate(x, graphOptions.xScale) - centerX) * scale;
}
function screenYAt(y: number, height: number): number {
  return height / 2 - (projectCoordinate(y, graphOptions.yScale) - centerY) * verticalScale();
}
function worldXAt(pixel: number, width: number): number {
  return unprojectCoordinate((pixel - width / 2) / scale + centerX, graphOptions.xScale);
}
function worldYAt(pixel: number, height: number): number {
  return unprojectCoordinate((height / 2 - pixel) / verticalScale() + centerY, graphOptions.yScale);
}

function currentThemeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

function themeColorWithAlpha(name: string, alpha: number): string {
  const color = currentThemeColor(name);
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (!match) throw new Error(`Invalid theme color for --${name}.`);
  const [red, green, blue] = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function alignCanvasStrokeCenter(coordinate: number, dpr: number, lineWidth: number): number {
  const devicePixels = Math.round(lineWidth * dpr);
  const halfPixel = devicePixels % 2 === 1 ? 0.5 : 0;
  return (Math.round(coordinate * dpr) + halfPixel) / dpr;
}
function drawLogarithmicGrid(ctx: CanvasRenderingContext2D, width:number, height:number):void {
  const warnings:string[]=graphOptions.gridMode==="polar"?["Polar grid is displayed as Cartesian while logarithmic axes are active."]:[];
  const axisX = graphOptions.xScale === "log" ? 0 : Math.max(0,Math.min(width,screenXAt(0,width)));
  const axisY = graphOptions.yScale === "log" ? height : Math.max(0,Math.min(height,screenYAt(0,height)));
  ctx.font="12px ui-sans-serif, system-ui, sans-serif";ctx.lineWidth=1;
  for(const axis of ["x","y"] as const){
    const horizontal=axis==="x", mode=horizontal?graphOptions.xScale:graphOptions.yScale;
    const pixels=horizontal?width:height, unit=horizontal?scale:verticalScale(), center=horizontal?centerX:centerY;
    const lower=center-pixels/(2*unit),upper=center+pixels/(2*unit);
    const requested=horizontal?graphOptions.xStep:graphOptions.yStep;
    const tooDense=requested!==undefined&&(upper-lower)/requested>1000;
    if(mode!=="log"&&tooDense)warnings.push("Manual grid step is too small at this zoom; displaying automatic steps.");
    const step=mode==="log"||tooDense?tickStep(unit):requested??tickStep(unit);
    const minorStep=graphOptions.minorGrid?step/5:step;
    const firstTick=Math.ceil(lower/minorStep);
    const ticks=mode==="log"?logarithmicTicks(lower,upper):
      Array.from({length:Math.min(5000,Math.ceil((upper-lower)/minorStep)+1)},(_,i)=>({
        value:(firstTick+i)*minorStep,major:!graphOptions.minorGrid||(firstTick+i)%5===0,
      }));
    for(const tick of ticks){
      const position=horizontal?screenXAt(tick.value,width):screenYAt(tick.value,height);
      if(!Number.isFinite(position)||position<0||position>pixels)continue;
      if(graphOptions.showGrid&&(tick.major||graphOptions.minorGrid)){
        ctx.beginPath();ctx.strokeStyle=themeColorWithAlpha("text",tick.major?0.22:0.09);
        if(horizontal){ctx.moveTo(position,0);ctx.lineTo(position,height);}
        else{ctx.moveTo(0,position);ctx.lineTo(width,position);}ctx.stroke();
      }
      if(tick.major&&graphOptions.showLabels&&(horizontal?graphOptions.showXAxis:graphOptions.showYAxis)){
        ctx.fillStyle=currentThemeColor("text-strong");
        const label=Number(tick.value.toPrecision(4)).toString();
        if(horizontal)ctx.fillText(label,position+4,Math.min(height-8,axisY+16));
        else ctx.fillText(label,Math.min(width-60,axisX+6),position-5);
      }
    }
  }
  ctx.beginPath();ctx.strokeStyle=themeColorWithAlpha("text",0.72);
  if(graphOptions.showXAxis){ctx.moveTo(0,axisY);ctx.lineTo(width,axisY);}
  if(graphOptions.showYAxis){ctx.moveTo(axisX,0);ctx.lineTo(axisX,height);}ctx.stroke();
  ctx.fillStyle=currentThemeColor("text");
  if(graphOptions.showXAxis&&graphOptions.xAxisLabel)ctx.fillText(graphOptions.xAxisLabel,width-70,Math.max(14,axisY-8));
  if(graphOptions.showYAxis&&graphOptions.yAxisLabel)ctx.fillText(graphOptions.yAxisLabel,Math.min(width-80,axisX+8),18);
  const warning=document.querySelector("#grid-step-warning");
  if(warning)warning.textContent=[...new Set(warnings)].join(" ");
}

function drawGrid(target = gridCanvas, exportWidth?: number, exportHeight?: number, exportDpr?: number): void {
  const bounds = canvasWrap.getBoundingClientRect();
  const width = Math.max(1, exportWidth ?? bounds.width);
  const height = Math.max(1, exportHeight ?? bounds.height);
  const dpr = exportDpr ?? (window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (target.width !== pixelWidth || target.height !== pixelHeight) {
    target.width = pixelWidth;
    target.height = pixelHeight;
  }
  const context = target === gridCanvas ? gridContext : target.getContext("2d");
  if (!context) throw new Error("Could not create the grid canvas.");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  if(graphOptions.xScale==="log"||graphOptions.yScale==="log"){drawLogarithmicGrid(context,width,height);return;}
  const yScale = verticalScale();
  const originX = width / 2 - centerX * scale;
  const originY = height / 2 + centerY * yScale;
  const warnings: string[] = [];
  const boundedStep = (requested: number | undefined, automatic: number, span: number) => {
    if (requested !== undefined && span / requested > 1000) {
      warnings.push("Manual grid step is too small at this zoom; displaying automatic steps.");
      return automatic;
    }
    return requested ?? automatic;
  };
  const xStep = boundedStep(graphOptions.xStep, tickStep(), width / scale);
  const yStep = boundedStep(graphOptions.yStep, tickStep(yScale), height / yScale);
  const warning = document.querySelector("#grid-step-warning");
  if (warning) warning.textContent = [...new Set(warnings)].join(" ");
  context.font = "12px Inter, ui-sans-serif, system-ui, sans-serif";
  context.lineWidth = 1;
  context.beginPath();

  if (graphOptions.showGrid) {
    if (graphOptions.gridMode === "polar") {
      const radius = Math.max(...[0,width].flatMap((x) => [0,height].map((y) =>
        Math.hypot((x - originX) / scale, (y - originY) / yScale))));
      const step = Math.max(boundedStep(graphOptions.xStep, tickStep(Math.min(scale,yScale)), radius), radius / 1000);
      for (const [spacing, alpha] of [[graphOptions.minorGrid ? step / 5 : step, 0.1], [step, 0.22]]) {
        context.beginPath();
        for (let r = spacing!; r <= radius; r += spacing!) {
          context.moveTo(originX + r * scale, originY);
          context.ellipse(originX, originY, r * scale, r * yScale, 0, 0, Math.PI * 2);
        }
        const rays = graphOptions.minorGrid && alpha === 0.1 ? 24 : 12;
        for (let ray = 0; ray < rays; ray += 1) {
          const theta = ray / rays * Math.PI * 2;
          context.moveTo(originX,originY);
          context.lineTo(originX + radius * Math.cos(theta) * scale,originY - radius * Math.sin(theta) * yScale);
        }
        context.strokeStyle = themeColorWithAlpha("text", alpha!);
        context.stroke();
      }
    } else {
    if (graphOptions.minorGrid) {
      context.beginPath();
      for (let x = Math.ceil((centerX - width / (2 * scale)) / (xStep / 5)) * (xStep / 5);
        x <= centerX + width / (2 * scale); x += xStep / 5) {
        context.moveTo(originX + x * scale,0); context.lineTo(originX + x * scale,height);
      }
      for (let y = Math.ceil((centerY - height / (2 * yScale)) / (yStep / 5)) * (yStep / 5);
        y <= centerY + height / (2 * yScale); y += yStep / 5) {
        context.moveTo(0,originY - y * yScale); context.lineTo(width,originY - y * yScale);
      }
      context.strokeStyle = themeColorWithAlpha("text",0.09);
      context.stroke();
      context.beginPath();
    }
    for (let xValue = Math.ceil((centerX - width / (2 * scale)) / xStep) * xStep;
      xValue <= centerX + width / (2 * scale); xValue += xStep) {
      const x = originX + xValue * scale;
      const axis = Math.abs(xValue) < xStep / 1000;
      if (axis) {
        continue;
      }
      const alignedX = alignCanvasStrokeCenter(x, dpr, context.lineWidth);
      context.moveTo(alignedX, 0);
      context.lineTo(alignedX, height);
    }
    for (let yValue = Math.ceil((centerY - height / (2 * yScale)) / yStep) * yStep;
      yValue <= centerY + height / (2 * yScale); yValue += yStep) {
      const axis = Math.abs(yValue) < yStep / 1000;
      if (axis) {
        continue;
      }
      const y = originY - yValue * yScale;
      const alignedY = alignCanvasStrokeCenter(y, dpr, context.lineWidth);
      context.moveTo(0, alignedY);
      context.lineTo(width, alignedY);
    }
    context.strokeStyle = themeColorWithAlpha("text", 0.22);
    context.stroke();
    }
  }
  context.fillStyle = currentThemeColor("text");
  if (graphOptions.showXAxis && graphOptions.xAxisLabel) context.fillText(graphOptions.xAxisLabel, width - 70, Math.max(14, Math.min(height - 8, originY - 8)));
  if (graphOptions.showYAxis && graphOptions.yAxisLabel) context.fillText(graphOptions.yAxisLabel, Math.max(4, Math.min(width - 80, originX + 8)), 18);

  context.beginPath();
  const zeroX = originX;
  const zeroY = originY;
  if (graphOptions.showYAxis) {
    const alignedZeroX = alignCanvasStrokeCenter(zeroX, dpr, context.lineWidth);
    context.moveTo(alignedZeroX, 0);
    context.lineTo(alignedZeroX, height);
  }
  if (graphOptions.showXAxis) {
    const alignedZeroY = alignCanvasStrokeCenter(zeroY, dpr, context.lineWidth);
    context.moveTo(0, alignedZeroY);
    context.lineTo(width, alignedZeroY);
  }
  context.strokeStyle = themeColorWithAlpha("text", 0.72);
  context.stroke();

  if (graphOptions.showLabels && graphOptions.showXAxis) {
    for (let xValue = Math.ceil((centerX - width / (2 * scale)) / xStep) * xStep;
      xValue <= centerX + width / (2 * scale); xValue += xStep) {
      if (Math.abs(xValue) < xStep / 1000) {
        continue;
      }
      const x = originX + xValue * scale;
      context.fillStyle = currentThemeColor("text-strong");
      context.fillText(formatTick(xValue), x + 5, Math.min(Math.max(originY + 16, 16), height - 8));
    }
  }

  if (graphOptions.showLabels && graphOptions.showYAxis) {
    for (let yValue = Math.ceil((centerY - height / (2 * yScale)) / yStep) * yStep;
      yValue <= centerY + height / (2 * yScale); yValue += yStep) {
      const y = originY - yValue * yScale;
      if (Math.abs(yValue) >= yStep / 1000) {
        context.fillStyle = currentThemeColor("text-strong");
        context.fillText(formatTick(yValue), Math.min(Math.max(originX + 6, 6), width - 36), y - 5);
      }
    }
  }
}

function compileSpatialColor(expression: Expression): ((x: number, y: number) => string) | undefined {
  const hsv = expression.hsv;
  if (hsv) {
    const key = `${graphMode}:${getAngleMode()}:${userFunctionSignature()}:${JSON.stringify(pointValues)}:${hsv.hue}\u0000${hsv.saturation}\u0000${hsv.value}`;
    if (expression.compiledHsvKey !== key) {
      expression.compiledHsvKey = key;
      expression.compiledHsv = undefined;
      expression.colorError = undefined;
      try {
        expression.compiledHsv = [
          hsv.hue.trim()
            ? compileColorExpression(expandFunctions(hsv.hue), sliderValues, graphMode === "desmos")
            : undefined,
          hsv.saturation.trim()
            ? compileColorExpression(expandFunctions(hsv.saturation), sliderValues, graphMode === "desmos")
            : undefined,
          hsv.value.trim()
            ? compileColorExpression(expandFunctions(hsv.value), sliderValues, graphMode === "desmos")
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
  const geometrySegments = dashedSegments(geometry.segments, context.getLineDash());
  for (let index = 0; index < geometrySegments.length; index += 4) {
    const x1 = geometrySegments[index]!;
    const y1 = geometrySegments[index + 1]!;
    const x2 = geometrySegments[index + 2]!;
    const y2 = geometrySegments[index + 3]!;
    const x = worldXAt((x1 + x2) / 2, width);
    const y = worldYAt((y1 + y2) / 2, height);
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
  context.setLineDash([]);
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
  regionAt?: (x: number, y?: number) => string,
  dotted = false,
): CurveGeometry {
  const geometry: CurveGeometry = { id, color, segments: [], colorAt };
  const addSegment = (x1: number, y1: number, x2: number, y2: number) => {
    if (!colorAt) {
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
    }
    geometry.segments.push(x1, y1, x2, y2);
  };
  const step = Math.max(1 / renderDetailFactor, Math.min(
    graphSettings.implicitSampleSpacing, Math.min(scale, verticalScale()) * 0.15,
  ));
  const columns = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;
  const screenX = (column: number) => Math.min(column * step, width);
  const screenY = (row: number) => Math.min(row * step, height);
  const screenXs = Float64Array.from({ length: columns }, (_, column) => screenX(column));
  const screenYs = Float64Array.from({ length: rows }, (_, row) => screenY(row));
  const xCoordinates = Float64Array.from(screenXs, (px) => worldXAt(px, width));
  const yCoordinates = Float64Array.from(
    screenYs, (py) => worldYAt(py, height),
  );
  const values = new Float64Array(columns * rows);
  const regions = regionAt ? new Array<string | undefined>(columns * rows) : undefined;
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
          if (regions) regions[row * columns + column] = regionAt!(x, y);
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
      if (regions) {
        const region = regions[row * columns + column];
        if (region !== regions[row * columns + column + 1] ||
            region !== regions[(row + 1) * columns + column + 1] ||
            region !== regions[(row + 1) * columns + column]) continue;
      }
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
  if (dotted) {
    const visible = dashedSegments(connectContourSegments(geometry.segments),lineDash("dotted",lineWidth));
    context.save();
    context.setLineDash([]);
    if (colorAt) {
      strokeColoredSegments({...geometry,segments:visible},colorAt,width,height,lineWidth,opacity);
    } else {
      context.beginPath();
      for(let index=0;index<visible.length;index+=4){
        context.moveTo(visible[index]!,visible[index+1]!);
        context.lineTo(visible[index+2]!,visible[index+3]!);
      }
      context.globalAlpha=opacity;context.strokeStyle=color;context.lineWidth=lineWidth;
      context.stroke();
    }
    context.restore();
  } else if (colorAt) {
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
  const screenX = screenXAt(x, width);
  const screenY = screenYAt(y, height);
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
  evaluate: (parameter: number) => number,
  width: number,
  height: number,
  colorAt?: (x: number, y: number) => string,
  lineWidth = 2,
  opacity = 1,
  sideways = false,
  expression?: Expression,
  tangent?: () => { slope: number; offset: number },
  regionAt?: (parameter: number) => string,
): ExplicitCurveData {
  const source = expression ? expandFunctions(expression.text) : "";
  const cacheKey = expression ? `${graphMode}:${getPrecisionDigits()}:${getAngleMode()}:${source}:${collectionSignature(source)}:${
    graphVariableSignature(source)
  }:${centerX}:${centerY}:${scale}:${graphOptions.aspectRatio}:${width}:${height}:${
    graphSettings.explicitSampleSpacing
  }:${sideways}:${graphOptions.xScale}:${graphOptions.yScale}` : "";
  const cached = expression && renderDetailFactor === 1 && performanceProfile.cacheEnabled
    ? expressionCurveCaches.get(expression)
    : undefined;
  if (cached?.key === cacheKey) {
    const curve = cached.curve;
    curve.id = id;
    curve.color = color;
    curve.colorAt = colorAt;
    if (colorAt) {
      strokeColoredSegments(curve, colorAt, width, height, lineWidth, opacity);
    } else {
      context.save();
      context.globalAlpha = opacity;
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.stroke(cached.path);
      context.restore();
    }
    return curve;
  }
  const path = new Path2D();
  const samples: GraphSample[] = [];
  const geometry: ExplicitCurveData = { id, color, samples, segments: [], colorAt, sideways,evaluate };
  const yScale = verticalScale();
  const parameterLength = sideways ? height : width;
  const outputLength = sideways ? width : height;
  const coordinateAt = (screenParameter: number) => sideways
    ? worldYAt(screenParameter, height)
    : worldXAt(screenParameter, width);
  if (tangent && graphOptions.xScale !== "log" && graphOptions.yScale !== "log") {
    const { slope, offset } = tangent();
    if (slope !== 0) {
      if (!Number.isFinite(slope) || !Number.isFinite(offset)) {
        throw new Error("Tangent phase must have finite coefficients.");
      }
      const outputAt = (pixel: number) => sideways
        ? (pixel - width / 2) / scale + centerX
        : (height / 2 - pixel) / yScale + centerY;
      const pointAt = (pixel: number, branch: number) => {
        const output = outputAt(pixel);
        const parameter = (Math.atan(output) + branch * Math.PI - offset) / slope;
        return sideways
          ? { x: pixel, y: height / 2 - (parameter - centerY) * yScale }
          : { x: width / 2 + (parameter - centerX) * scale, y: pixel };
      };
      const period = Math.PI / Math.abs(slope) * (sideways ? yScale : scale);
      if (period <= Math.min(lineWidth, 0.5)) {
        // Every cross-section is covered by overlapping strokes; opacity is applied once per path.
        const alpha = tangentPixelCoverage(period, lineWidth, opacity);
        geometry.hoverPoint = (x, y) => {
          const pixel = sideways ? x : y;
          const parameter = coordinateAt(sideways ? y : x);
          const branch = Math.round((slope * parameter + offset - Math.atan(outputAt(pixel))) / Math.PI);
          if (!Number.isSafeInteger(branch)) return { x, y };
          return pointAt(pixel, branch);
        };
        context.save();
        try {
          if (!colorAt) {
            context.globalAlpha = alpha;
            context.fillStyle = color;
            context.fillRect(0, 0, width, height);
          } else {
            const dpr = context.getTransform().a;
            const raster = document.createElement("canvas");
            raster.width = Math.max(1, Math.round(width * dpr));
            raster.height = Math.max(1, Math.round(height * dpr));
            const rasterContext = raster.getContext("2d");
            if (!rasterContext) throw new Error("Could not create dense tangent coverage canvas.");
            const pixels = rasterContext.createImageData(raster.width, raster.height);
            for (let row = 0;row < raster.height;row += 1) {
              const worldY = (height / 2 - (row + 0.5) / dpr) / yScale + centerY;
              for (let column = 0;column < raster.width;column += 1) {
                const worldX = ((column + 0.5) / dpr - width / 2) / scale + centerX;
                const hex = colorAt(worldX, worldY);
                const value = Number.parseInt(hex.slice(1), 16);
                const index = (row * raster.width + column) * 4;
                pixels.data[index] = value >> 16;
                pixels.data[index + 1] = (value >> 8) & 255;
                pixels.data[index + 2] = value & 255;
                pixels.data[index + 3] = Math.round(alpha * 255);
              }
            }
            rasterContext.putImageData(pixels, 0, 0);
            context.drawImage(raster, 0, 0, width, height);
          }
        } finally {
          context.restore();
        }
        return geometry;
      }
      const range = tangentBranchRange(slope, offset, coordinateAt(0), coordinateAt(parameterLength));
      const appendInterval = (
        first: { x: number; y: number }, second: { x: number; y: number },
        from: number, to: number, branch: number, depth: number,
      ): void => {
        const midpoint = pointAt((from + to) / 2, branch);
        const error = sideways
          ? Math.abs(midpoint.y - (first.y + second.y) / 2)
          : Math.abs(midpoint.x - (first.x + second.x) / 2);
        if (depth < 16 && (error > 0.25 / renderDetailFactor || (depth < 2))) {
          appendInterval(first, midpoint, from, (from + to) / 2, branch, depth + 1);
          appendInterval(midpoint, second, (from + to) / 2, to, branch, depth + 1);
        } else {
          path.lineTo(second.x, second.y);
          geometry.segments.push(first.x, first.y, second.x, second.y);
        }
      };
      for (let branch = range.first; branch <= range.last; branch += 1) {
        const first = pointAt(0, branch);
        const second = pointAt(outputLength, branch);
        if (sideways
          ? Math.max(first.y, second.y) < 0 || Math.min(first.y, second.y) > height
          : Math.max(first.x, second.x) < 0 || Math.min(first.x, second.x) > width) continue;
        path.moveTo(first.x, first.y);
        // Split at output zero so the symmetric tangent midpoint cannot conceal curvature.
        const zeroPixel = sideways ? width / 2 - centerX * scale : height / 2 + centerY * yScale;
        if (zeroPixel > 0 && zeroPixel < outputLength) {
          const zero = pointAt(zeroPixel, branch);
          appendInterval(first, zero, 0, zeroPixel, branch, 0);
          appendInterval(zero, second, zeroPixel, outputLength, branch, 0);
        } else {
          appendInterval(first, second, 0, outputLength, branch, 0);
        }
      }
      let previousBranch: number | undefined;
      for (let pixel = 0; pixel <= parameterLength; pixel += graphSettings.explicitSampleSpacing) {
        const parameter = coordinateAt(pixel);
        const branch = Math.floor((slope * parameter + offset + Math.PI / 2) / Math.PI);
        const output = evaluate(parameter);
        const screenX = sideways ? width / 2 + (output - centerX) * scale : pixel;
        const screenY = sideways ? pixel : height / 2 - (output - centerY) * yScale;
        samples.push({
          x: sideways ? output : parameter,
          y: sideways ? parameter : output,
          screenX,
          screenY,
          connected: branch === previousBranch && Number.isFinite(screenX) && Number.isFinite(screenY),
        });
        previousBranch = branch;
      }
      context.save();
      if (colorAt) strokeColoredSegments(geometry, colorAt, width, height, lineWidth, opacity);
      else {
        context.globalAlpha = opacity;
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke(path);
      }
      context.restore();
      if (expression && renderDetailFactor === 1 && performanceProfile.cacheEnabled) {
        expressionCurveCaches.set(expression, { key: cacheKey, curve: geometry, path });
      }
      return geometry;
    }
  }
  context.save();
  context.globalAlpha = opacity;
  if (!colorAt) {
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
  }
  const sampleAt = (parameter: number, screenParameter: number): GraphSample => {
    try {
      const value = evaluate(parameter);
      const x = sideways ? value : parameter;
      const y = sideways ? parameter : value;
      const screenX = sideways ? screenXAt(value, width) : screenParameter;
      const screenY = sideways ? screenParameter : screenYAt(value, height);
      return {
        x,
        y,
        screenX,
        screenY,
        connected: false,
        region: regionAt?.(parameter),
      };
    } catch {
      return sideways
        ? { x: Number.NaN, y: parameter, screenX: Number.NaN, screenY: screenParameter, connected: false }
        : { x: parameter, y: Number.NaN, screenX: screenParameter, screenY: Number.NaN, connected: false };
    }
  };
  const refineInterval = (
    first: GraphSample,
    second: GraphSample,
    depth: number,
    output: GraphSample[],
  ): void => {
    if (depth >= 10 + Math.ceil(Math.log2(renderDetailFactor))) {
      output.push(second);
      return;
    }

    const firstOutput = sideways ? first.screenX : first.screenY;
    const secondOutput = sideways ? second.screenX : second.screenY;
    const firstValid = Number.isFinite(firstOutput) &&
      firstOutput >= -outputLength * 2 && firstOutput <= outputLength * 3;
    const secondValid = Number.isFinite(secondOutput) &&
      secondOutput >= -outputLength * 2 && secondOutput <= outputLength * 3;
    const screenDelta = Math.abs(secondOutput - firstOutput);
    const firstScreenParameter = sideways ? first.screenY : first.screenX;
    const secondScreenParameter = sideways ? second.screenY : second.screenX;
    const midpointScreenParameter = (firstScreenParameter + secondScreenParameter) / 2;
    const midpoint = sampleAt(coordinateAt(midpointScreenParameter), midpointScreenParameter);
    const midpointOutput = sideways ? midpoint.screenX : midpoint.screenY;
    const midpointValid = Number.isFinite(midpointOutput) &&
      midpointOutput >= -outputLength * 2 && midpointOutput <= outputLength * 3;
    if (![firstOutput, secondOutput, midpointOutput].some(Number.isFinite)) {
      output.push(second);
      return;
    }
    const linearMidpoint = (firstOutput + secondOutput) / 2;
    const curvature = Math.abs(midpointOutput - linearMidpoint);
    const refine = first.region !== second.region || first.region !== midpoint.region ||
      !firstValid || !secondValid || !midpointValid ||
      screenDelta > 24 || curvature > 0.5 / renderDetailFactor;
    if (first.region === second.region && first.region === midpoint.region &&
        isFlatOffscreenInterval(firstOutput, midpointOutput, secondOutput, outputLength, renderDetailFactor)) {
      output.push(second);
      return;
    }
    if (!refine) {
      output.push(second);
      return;
    }
    refineInterval(first, midpoint, depth + 1, output);
    refineInterval(midpoint, second, depth + 1, output);
  };
  let previousOutput: number | undefined;
  let drawing = false;
  let first = sampleAt(coordinateAt(0), 0);
  const firstOutput = sideways ? first.screenX : first.screenY;
  const firstIsValid = Number.isFinite(firstOutput) &&
    firstOutput >= -outputLength * 2 && firstOutput <= outputLength * 3;
  if (firstIsValid) {
    drawing = true;
    path.moveTo(first.screenX, first.screenY);
    samples.push(first);
    previousOutput = firstOutput;
  }
  const drawSample = (sample: GraphSample): void => {
    const output = sideways ? sample.x : sample.y;
    const outputPixel = sideways ? sample.screenX : sample.screenY;
    if (!Number.isFinite(output)) {
      drawing = false;
      previousOutput = undefined;
      samples.push(sample);
      return;
    }
    const valid = Number.isFinite(outputPixel) &&
      outputPixel >= -outputLength * 2 && outputPixel <= outputLength * 3;
    const jumpTooLarge = previousOutput !== undefined &&
      Math.abs(outputPixel - previousOutput) > outputLength;
    const previous = samples.at(-1);
    const sameRegion = previous?.region === sample.region;
    const connected = valid && drawing && previousOutput !== undefined && !jumpTooLarge && sameRegion;
    if (!valid || jumpTooLarge) {
      drawing = false;
      previousOutput = Number.isFinite(outputPixel) ? outputPixel : undefined;
      samples.push(sample);
      return;
    }
    if (!drawing || !sameRegion) {
      path.moveTo(sample.screenX, sample.screenY);
      drawing = true;
    } else {
      path.lineTo(sample.screenX, sample.screenY);
    }
    if (connected && samples.length > 0) {
      const previous = samples[samples.length - 1]!;
      geometry.segments.push(
        previous.screenX, previous.screenY, sample.screenX, sample.screenY,
      );
    }
    sample.connected = connected;
    samples.push(sample);
    previousOutput = outputPixel;
  };
  const refinedSamples: GraphSample[] = [];
  for (let screenParameter = graphSettings.explicitSampleSpacing;
    screenParameter <= parameterLength;
    screenParameter += graphSettings.explicitSampleSpacing) {
    const second = sampleAt(coordinateAt(screenParameter), screenParameter);
    refinedSamples.length = 0;
    refineInterval(first, second, 0, refinedSamples);
    for (const refinedSample of refinedSamples) {
      drawSample(refinedSample);
    }
    first = second;
  }
  if (colorAt) {
    strokeColoredSegments(geometry, colorAt, width, height, lineWidth, opacity);
  } else {
    context.stroke(path);
  }
  context.restore();
  if (expression && renderDetailFactor === 1 && performanceProfile.cacheEnabled) {
    expressionCurveCaches.set(expression, { key: cacheKey, curve: geometry, path });
  }
  return geometry;
}

function detectExplicitPoints(
  curve: ExplicitCurveData,
  evaluate: (x: number) => number,
  candidates: PointCandidate[],
  width: number,
  height: number,
  sideways = false,
): void {
  const { samples, id, color, colorAt } = curve;
  const axisIntercepts: PointCandidate[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    if (!current.connected) {
      continue;
    }
    const previousValue = sideways ? previous.x : previous.y;
    const currentValue = sideways ? current.x : current.y;
    if ((previousValue < 0 && currentValue > 0) || (previousValue > 0 && currentValue < 0) ||
        previousValue === 0 || currentValue === 0) {
      if (previousValue !== 0 || currentValue !== 0) {
        let root:number|undefined;
        try{root=bracketedRoot(evaluate,Math.min(sideways?previous.y:previous.x,sideways?current.y:current.x),
          Math.max(sideways?previous.y:previous.x,sideways?current.y:current.x));}
        catch(reason){if(!(reason instanceof Error))throw reason;continue;}
        if(root===undefined)continue;
        const x=sideways?0:root,y=sideways?root:0;
        addPointCandidate(
          axisIntercepts, x, y,
          sideways ? "y-intercept" : "x-intercept", [id],
          colorAt?.(x, y) ?? color,
          width, height,
        );
      }
    }
  }

  if (sideways
    ? Math.abs(centerY) <= height / (2 * verticalScale())
    : Math.abs(centerX) <= width / (2 * scale)) {
    try {
      const value = evaluate(0);
      const x = sideways ? value : 0;
      const y = sideways ? 0 : value;
      addPointCandidate(
        axisIntercepts, x, y, sideways ? "x-intercept" : "y-intercept",
        [id], colorAt?.(x, y) ?? color, width, height,
      );
    } catch {
      // The function may be undefined on the y-axis.
    }
  }

  appendLimitedIntercepts(axisIntercepts, candidates, width, height);
  if (sideways) return;

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
    let x:number,y:number;
    try{const extremum=bracketedExtremum(evaluate,Math.min(previous.x,next.x),Math.max(previous.x,next.x),firstSlope>0);
      x=extremum.x;y=extremum.y;}
    catch(reason){if(!(reason instanceof Error))throw reason;continue;}
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
    let x = a0.x + (a1.x - a0.x) * fraction;
    let y = a0.y + (a1.y - a0.y) * fraction;
    if(first.evaluate&&second.evaluate&&!first.sideways&&!second.sideways){
      try{
        const root=bracketedRoot((x)=>first.evaluate!(x)-second.evaluate!(x),Math.min(a0.x,a1.x),Math.max(a0.x,a1.x));
        if(root===undefined)continue;
        x=root;y=first.evaluate(x);
      }catch(reason){if(!(reason instanceof Error))throw reason;continue;}
    }
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
    if(axis==="x"?graphOptions.yScale==="log":graphOptions.xScale==="log")continue;
    const mode=axis==="x"?graphOptions.xScale:graphOptions.yScale;
    const steps = Math.max(1, Math.ceil(
      (max - min) * (axis === "x" ? scale : verticalScale()) / sampleSpacing,
    ));
    const valueAt = (value: number): number => axis === "x"
      ? implicitValue(evaluate, unprojectCoordinate(value,mode), 0)
      : implicitValue(evaluate, 0, unprojectCoordinate(value,mode));
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
      const root = unprojectCoordinate((low + high) / 2,mode);
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

function hoverCurvePriorities(): Map<string, number> {
  const priorities = new Map<string, number>();
  for (const [rank, item] of workspaceBlocks().flatMap((block) => block.items).entries()) {
    if (item.type === "expression") {
      priorities.set(`expression-${item.id}`, rank);
      priorities.set(`implicit-${item.id}`, rank);
    } else if (item.type === "table") {
      priorities.set(`table-regression-${item.id}`, rank);
    }
  }
  return priorities;
}

function addGraphPointAt(screenX: number, screenY: number): void {
  hoverSegmentIndex ??= new SegmentIndex(hoverCurves);
  const priorities = hoverCurvePriorities();
  const nearest = selectHoverPoint(
    hoverSegmentIndex.nearby(screenX, screenY, 10), screenX, screenY,
    (curve) => curve.id.startsWith("expression-")
      ? priorities.get(curve.id.split(":")[0]!) ?? Infinity : Infinity,
  );
  if (!nearest) {
    return;
  }

  const [expressionPart, memberPart] = nearest.curve.id.slice("expression-".length).split(":");
  const expressionId = Number(expressionPart);
  const expression = expressions.find((entry) => entry.id === expressionId);
  if (!expression) {
    return;
  }
  const compiled = getCompiled(expression);
  const graph = compiled?.kind === "collection" ? compiled.graphs[Number(memberPart)] : compiled;
  if (!graph || (graph.kind !== "explicit" && graph.kind !== "sideways" &&
      graph.kind !== "parametric")) {
    return;
  }

  const width = canvasWrap.clientWidth * GRAPH_BUFFER_SCALE;
  const height = canvasWrap.clientHeight * GRAPH_BUFFER_SCALE;
  const pointCandidate = graph.kind === "explicit" || graph.kind === "sideways"
    ? hoverCandidates
      .filter((candidate) =>
        candidate.graphIds.includes(nearest!.curve.id) &&
        Math.hypot(candidate.screenX - screenX, candidate.screenY - screenY) <= 10)
      .sort((left, right) =>
        Math.hypot(left.screenX - screenX, left.screenY - screenY) -
        Math.hypot(right.screenX - screenX, right.screenY - screenY))[0]
    : undefined;
  let x = pointCandidate?.x ?? worldXAt(nearest.x, width);
  let y: number;
  if (graph.kind === "explicit") {
    try {
      const result = graph.evaluate(x);
      y = typeof result === "number" ? result : result.value.toNumber();
    } catch {
      return;
    }
  } else if (graph.kind === "sideways") {
    y = pointCandidate?.y ?? worldYAt(nearest.y, height);
    try {
      const result = graph.evaluate(y);
      x = typeof result === "number" ? result : result.value.toNumber();
    } catch {
      return;
    }
  } else {
    y = worldYAt(nearest.y, height);
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  let table = tables.find((entry) => entry.sourceExpressionId === expression.id);
  const row = { id: nextRowId++, x: numericSource(x), y: numericSource(y) };
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

function* hoverSegmentsNear(x: number, y: number, buildIndex: boolean) {
  if (buildIndex) hoverSegmentIndex ??= new SegmentIndex(hoverCurves);
  if (hoverSegmentIndex) {
    yield* hoverSegmentIndex.nearby(x, y, 10);
    return;
  }
  for (const curve of hoverCurves) {
    if (curve.hoverPoint) yield { curve, offset: -1 };
    for (let offset = 0; offset < curve.segments.length; offset += 4) {
      yield { curve, offset };
    }
  }
}

function drawHoverOverlay(buildIndex = true): void {
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

  const priorities = hoverCurvePriorities();
  const nearest = selectHoverPoint(
    hoverSegmentsNear(hoverPosition.x, hoverPosition.y, buildIndex),
    hoverPosition.x, hoverPosition.y, (curve) => priorities.get(curve.id.split(":")[0]!) ?? Infinity,
  );

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
    pointContext.strokeStyle = currentThemeColor("text-strong");
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
  let color = currentThemeColor("text-strong");
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
  } else if (nearest) {
    pointX = nearest.x - bufferX;
    pointY = nearest.y - bufferY;
    label = `${nearest.curve.id.startsWith("implicit-") ? "implicit curve" : "curve"} · (${formatTick(
      worldXAt(nearest.x, graphWidth),
    )}, ${formatTick(
      worldYAt(nearest.y, graphHeight),
    )})`;
    color = nearest.curve.colorAt?.(
      worldXAt(nearest.x, graphWidth),
      worldYAt(nearest.y, graphHeight),
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
  pointContext.strokeStyle = currentThemeColor("text-strong");
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
  pointContext.fillStyle = themeColorWithAlpha("panel-bg", 0.96);
  pointContext.fillRect(boxX, boxY, boxWidth, 24);
  pointContext.strokeStyle = currentThemeColor("border");
  pointContext.strokeRect(boxX, boxY, boxWidth, 24);
  pointContext.fillStyle = currentThemeColor("text-strong");
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
  regionAt?: (parameter: number) => string,
  onSampleError?: (reason: unknown) => void,
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
      const region = regionAt?.(parameter);
      const screenX = screenXAt(x, width);
      const screenY = screenYAt(y, height);
      const valid = Number.isFinite(screenX) && Number.isFinite(screenY) &&
        screenX >= -width * 2 && screenX <= width * 3 &&
        screenY >= -height * 2 && screenY <= height * 3;
      const connected = Boolean(valid && previous && previous.region === region &&
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
      const sample = { x, y, screenX, screenY, connected, region };
      samples.push(sample);
      previous = sample;
    } catch (reason) {
      onSampleError?.(reason);
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
  regionAt?: (x: number, y?: number) => string,
): CurveGeometry {
  const cellSize = 5 / renderDetailFactor;
  context.save();
  context.globalAlpha = 0.18 * opacity;
  for (let screenY = 0; screenY < height; screenY += cellSize) {
    const y = worldYAt(screenY + cellSize / 2, height);
    for (let screenX = 0; screenX < width; screenX += cellSize) {
      const x = worldXAt(screenX + cellSize / 2, width);
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
  return drawImplicit(evaluate, width, height, id, color, colorAt, lineWidth, opacity, regionAt,
    inequalityLineStyle(relation) === "dotted");
}

function drawExpressionLabel(expression: Expression, width: number, height: number,svgLabels?:string[]): void {
  const error = workspaceList.querySelector<HTMLElement>(`[data-label-error-id="${expression.id}"]`);
  const fields = workspaceList.querySelectorAll<HTMLInputElement>(`[data-expression-id="${expression.id}"] [data-label-field]`);
  expression.labelError = undefined;
  if (error) error.textContent = "";
  for (const field of fields) field.setAttribute("aria-invalid", "false");
  if (!expression.label?.trim()) return;
  try {
    const compiled = getCompiled(expression);
    const graph = compiled?.kind === "collection" ? compiled.graphs[0] : compiled;
    if (!graph) return;
    let anchor: [number, number] = [0, 0];
    if (!expression.labelX?.trim() || !expression.labelY?.trim()) {
      if (graph.kind === "point") anchor = graph.evaluate();
      else if (graph.kind === "explicit" || graph.kind === "sideways") {
        const value = graph.evaluate(0);
        const coordinate = typeof value === "number" ? value : value.value.toNumber();
        anchor = graph.kind === "explicit" ? [0, coordinate] : [coordinate, 0];
      } else if (graph.kind === "parametric") anchor = graph.evaluate(graph.start);
      else if (graph.kind === "polygon") {
        const vertices = graph.evaluate();
        anchor = [vertices.reduce((total, point) => total + point[0], 0) / vertices.length,
          vertices.reduce((total, point) => total + point[1], 0) / vertices.length];
      }
    }
    const evaluate = (source: string): number => {
      const evaluateScalar = (item: string) => compileColorExpression(item, sliderValues)(anchor[0], anchor[1]);
      const collection = expandCollections(expandFunctions(source), evaluateScalar, collectionValues, graphOptions.statisticsMode);
      if (collection.list) throw new Error("Label formulas must produce scalar numbers, not lists.");
      return evaluateScalar(collection.items[0]!);
    };
    const x = expression.labelX?.trim() ? evaluate(expression.labelX) : anchor[0];
    const y = expression.labelY?.trim() ? evaluate(expression.labelY) : anchor[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Label coordinates must be finite.");
    const label = dynamicLabel(expression.label, evaluate);
    if(svgLabels){
      const sx=screenXAt(x,width)+10,sy=screenYAt(y,height)-10;
      if(Number.isFinite(sx)&&Number.isFinite(sy))
        svgLabels.push(`<text x="${sx}" y="${sy}" font-family="sans-serif" font-size="14" fill="${xml(expression.color)}" stroke="${xml(currentThemeColor("app-bg"))}" stroke-width="4" paint-order="stroke" opacity="${expression.opacity??1}">${xml(label)}</text>`);
      return;
    }
    context.save();
    try {
      context.globalAlpha = expression.opacity ?? 1;
      context.font = "14px Inter, ui-sans-serif, system-ui, sans-serif";
      context.lineJoin = "round";
      context.lineWidth = 4;
      context.strokeStyle = currentThemeColor("app-bg");
      context.fillStyle = expression.color;
      const sx = screenXAt(x, width) + 10;
      const sy = screenYAt(y, height) - 10;
      context.strokeText(label, sx, sy);
      context.fillText(label, sx, sy);
    } finally {
      context.restore();
    }
  } catch (reason) {
    expression.labelError = reason instanceof Error ? reason.message : "Could not draw label.";
  }
  if (error) error.textContent = expression.labelError ?? "";
  for (const field of fields) field.setAttribute("aria-invalid", String(Boolean(expression.labelError)));
}

function draw(): void {
  cancelRefinement();
  detailCanvas.hidden = true;
  detailCanvas.style.transform = "";
  detailCanvas.width = 1;
  detailCanvas.height = 1;
  delete detailCanvas.dataset.resolution;
  synchronizeVariableDefinitions();
  synchronizeTones();
  const bounds = canvasWrap.getBoundingClientRect();
  renderGraph(
    canvas, Math.max(1, bounds.width * GRAPH_BUFFER_SCALE),
    Math.max(1, bounds.height * GRAPH_BUFFER_SCALE), window.devicePixelRatio || 1,
  );
  scheduleRefinement();
}

function renderGraph(target: HTMLCanvasElement, width: number, height: number, dpr: number): void {
  const profileStart = performanceProfile.enabled ? performance.now() : 0;
  const canvasWidth = Math.max(1, Math.round(width * dpr));
  const canvasHeight = Math.max(1, Math.round(height * dpr));
  if (target.width !== canvasWidth || target.height !== canvasHeight) {
    target.width = canvasWidth;
    target.height = canvasHeight;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = currentThemeColor("app-bg");
  context.fillRect(0, 0, width, height);
  const candidates: PointCandidate[] = [];
  const explicitCurves: ExplicitCurveData[] = [];
  const implicitCurves: CurveGeometry[] = [];
  const nextDraggableGraphPoints: DraggableGraphPoint[] = [];
  const listPoints: Array<{
    x: number;
    y: number;
    color: string;
    graphId: string;
    opacity: number;
    expressionId: number;
  }> = [];
  const fixedVariables = new Set(expressions
    .map((entry) => getVariableDefinition(entry)?.target)
    .filter((name): name is string => Boolean(name)));
  const expressionById = new Map(expressions.map((expression) => [expression.id, expression]));
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const drawWorkspaceItem=(item: WorkspaceItem): void => {
    const endpointMarkers:Array<{x:number;y:number;closed:boolean;color:string;opacity:number;radius:number;graphId:string}>=[];
    if (item.type === "photo") {
      const photo = photos.find((entry) => entry.id === item.id);
      if (photo) drawPhoto(photo, width, height);
      return;
    }
    listPoints.length=0;
    nextDraggableGraphPoints.length=0;
    const entry = item.type === "expression" ? expressionById.get(item.id) : undefined;
    for (const expression of entry ? [entry] : []) {
      if(expression.hidden) continue;
      if(updateScalarResult(expression)) continue;
      const compiled=getCompiled(expression);
      if(!compiled) {
        continue;
      }
      const graphs = compiled.kind === "collection" ? compiled.graphs : [compiled];
      const evaluationErrors = new Set<string>();
      for (const [memberIndex, graph] of graphs.entries()) {
      expression.evaluationError = undefined;
      context.save();
      context.setLineDash(lineDash(expression.lineStyle, expression.lineWidth ?? 2));
      try {
      if (graph.kind === "collection") throw new Error("Nested graph collections are not supported.");
      const graphId=(graph.kind==="implicit"
        ? `implicit-${expression.id}`
        :`expression-${expression.id}`) + (compiled.kind === "collection" ? `:${memberIndex}` : "");
      const colorAt=compileSpatialColor(expression);
      const lineWidth=expression.lineWidth??2;
      const opacity=expression.opacity??1;
      if(graph.kind==="plane"){
        const step=Math.max(3,Math.ceil(Math.sqrt(width*height/16000)));
        let failures=0,firstError="";
        context.globalAlpha=opacity;
        for(let sy=0;sy<height;sy+=step)for(let sx=0;sx<width;sx+=step){
          try{
            const [h,s,v]=graph.evaluate(worldXAt(sx+step/2,width),worldYAt(sy+step/2,height));
            context.fillStyle=hsvToHex(h,s,v);context.fillRect(sx,sy,step,step);
          }catch(reason){failures++;firstError||=reason instanceof Error?reason.message:"Invalid plane sample.";}
        }
        if(failures)expression.evaluationError=`Plane undefined at ${failures} sampled cells: ${firstError}`;
        continue;
      }
      if(graph.kind==="vectorfield"){
        const spacing=Math.max(40,Math.ceil(Math.sqrt(width*height/1600)));
        let failed=0,firstError="";
        context.globalAlpha=opacity;context.lineWidth=lineWidth;context.setLineDash([]);
        for(let sy=spacing/2;sy<height;sy+=spacing)for(let sx=spacing/2;sx<width;sx+=spacing){
          const x=worldXAt(sx,width),y=worldYAt(sy,height);
          try{
            const [u,v]=graph.evaluate(x,y);
            const dx=scale*u/(graphOptions.xScale==="log"?x*Math.LN10:1);
            const dy=-verticalScale()*v/(graphOptions.yScale==="log"?y*Math.LN10:1);
            if(!Number.isFinite(dx)||!Number.isFinite(dy))throw new Error("Projected field direction is nonfinite.");
            const magnitude=Math.hypot(dx,dy),radius=spacing*0.3;
            context.strokeStyle=colorAt?.(x,y)??expression.color;
            context.fillStyle=context.strokeStyle;
            context.beginPath();
            if(magnitude===0){context.arc(sx,sy,Math.max(1.5,lineWidth),0,2*Math.PI);context.fill();continue;}
            const nx=dx/magnitude,ny=dy/magnitude;
            const tipX=sx+nx*radius,tipY=sy+ny*radius;
            context.moveTo(sx-nx*radius,sy-ny*radius);context.lineTo(tipX,tipY);
            if(graph.arrows){
              context.moveTo(tipX-6*nx+4*ny,tipY-6*ny-4*nx);context.lineTo(tipX,tipY);
              context.lineTo(tipX-6*nx-4*ny,tipY-6*ny+4*nx);
            }
            context.stroke();
          }catch(reason){failed++;firstError||=reason instanceof Error?reason.message:"Invalid field sample.";}
        }
        if(failed)expression.evaluationError=`Field undefined at ${failed} sampled points: ${firstError}`;
        continue;
      }
      if(graph.kind==="explicit"||graph.kind==="sideways"||graph.kind==="parametric"){
        const source=expandFunctions(expression.text);
        if(source.includes("{")){
          const parameterDomain=graph.kind==="sideways"?{min:worldYAt(height,height),max:worldYAt(0,height)}:
            {min:worldXAt(0,width),max:worldXAt(width,width)};
          for(const endpoint of detectRestrictionEndpoints(source,graph,{variables:sliderValues,sliderBounds:sliderOptions,parameterDomain})){
            endpointMarkers.push({...endpoint,color:colorAt?.(endpoint.x,endpoint.y)??expression.color,
              opacity,radius:Math.max(4,lineWidth+2),graphId});
          }
        }
      }
      if (graph.kind === "polygon") {
        try {
          const vertices = graph.evaluate();
          const directVertices=polygonVertexSources(expression.text);
          const path = new Path2D();
          const geometry: CurveGeometry = { id: graphId, color: expression.color, segments: [] };
          const logarithmic=graphOptions.xScale==="log"||graphOptions.yScale==="log";
          const screen = vertices.map(([x, y]) => [screenXAt(x, width), screenYAt(y, height)]);
          for (const [index, vertex] of screen.entries()) {
            if (!logarithmic){if (index === 0) path.moveTo(vertex[0]!, vertex[1]!);
            else path.lineTo(vertex[0]!, vertex[1]!);}
            const next = screen[(index + 1) % screen.length]!;
            if(!logarithmic)geometry.segments.push(vertex[0]!, vertex[1]!, next[0]!, next[1]!);
            const source=graph.vertexSources?.[index];
            if(source&&expression.draggable!==false){
              const point=compileGraphExpression(`(${source.join(",")})`,sliderValues);
              if(point.kind==="point"){
                const xVariables=point.xVariables.filter((name)=>!fixedVariables.has(name));
                const yVariables=point.yVariables.filter((name)=>!fixedVariables.has(name));
                const direct=Boolean(directVertices&&!point.xVariables.length&&!point.yVariables.length);
                if((direct||xVariables.length||yVariables.length)&&!xVariables.some((name)=>yVariables.includes(name))){
                  const [x,y]=vertices[index]!,color=colorAt?.(x,y)??expression.color;
                  nextDraggableGraphPoints.push({expressionId:expression.id,draggable:true,xVariables,yVariables,x,y,
                    screenX:vertex[0]!,screenY:vertex[1]!,color,opacity,directSource:direct?expression.text:undefined,vertexIndex:direct?index:undefined});
                  addPointCandidate(candidates,x,y,"draggable vertex",[graphId],color,width,height);
                }
                if(logarithmic){
                  const evaluate=(x:number,y:number)=>polygonSignedDistance(vertices,x,y);
                  implicitCurves.push(drawInequality(evaluate,"<=",graphId,expression.color,width,height,colorAt,lineWidth,opacity));
                  updateExpressionErrorDisplay(expression);continue;
                }
              }
            }
          }
          path.closePath();
          context.save();
          try {
            context.globalAlpha = opacity * 0.18;
            if (colorAt) {
              context.clip(path, "evenodd");
              const step = 4 / renderDetailFactor;
              const minX = Math.max(0, Math.min(...screen.map((point) => point[0]!)));
              const maxX = Math.min(width, Math.max(...screen.map((point) => point[0]!)));
              const minY = Math.max(0, Math.min(...screen.map((point) => point[1]!)));
              const maxY = Math.min(height, Math.max(...screen.map((point) => point[1]!)));
              for (let sy = minY; sy < maxY; sy += step) {
                for (let sx = minX; sx < maxX; sx += step) {
                  context.fillStyle = colorAt(worldXAt(sx + step / 2, width),
                    worldYAt(sy + step / 2, height));
                  context.fillRect(sx, sy, step, step);
                }
              }
            } else {
              context.fillStyle = expression.color;
              context.fill(path, "evenodd");
            }
          } finally {
            context.restore();
          }
          if (colorAt) strokeColoredSegments(geometry, colorAt, width, height, lineWidth, opacity);
          else {
            context.save();
            context.globalAlpha = opacity;
            context.strokeStyle = expression.color;
            context.lineWidth = lineWidth;
            context.stroke(path);
            context.restore();
          }
          implicitCurves.push(geometry);
          expression.evaluationError = undefined;
        } catch (reason) {
          expression.evaluationError = reason instanceof Error ? reason.message : "Could not render polygon.";
        }
        updateExpressionErrorDisplay(expression);
        continue;
      }
      if(graph.kind==="point") {
        try {
          const [x,y]=graph.evaluate();
          if(!Number.isFinite(x)||!Number.isFinite(y)) {
            throw new Error("Point coordinates must be finite numbers");
          }
          const pointColor=colorAt?.(x,y)??expression.color;
          const screenX=alignCanvasStrokeCenter(
            screenXAt(x,width),
            dpr,
            1,
          );
          const screenY=alignCanvasStrokeCenter(
            screenYAt(y,height),
            dpr,
            1,
          );
          const xVariables=graph.xVariables.filter((name) => !fixedVariables.has(name));
          const yVariables=graph.yVariables.filter((name) => !fixedVariables.has(name));
          const definition=getVariableDefinition(expression);
          const directPoint=pointSources(expression.text)?expression.text:
            definition&&pointSources(definition.source)?definition.source:undefined;
          nextDraggableGraphPoints.push({
            expressionId: expression.id,
            draggable: expression.draggable!==false&&
              !xVariables.some((name) => yVariables.includes(name)) &&
              (xVariables.length>0||yVariables.length>0||Boolean(directPoint&&!graph.xVariables.length&&!graph.yVariables.length)),
            xVariables,
            yVariables,
            x,
            y,
            screenX,
            screenY,
            color: pointColor,
            opacity,
            directSource:directPoint&&!graph.xVariables.length&&!graph.yVariables.length?directPoint:undefined,
          });
          addPointCandidate(
            candidates,x,y,xVariables.length || yVariables.length ? "draggable point" : "point",[graphId],pointColor,width,height,
          );
          expression.evaluationError=undefined;
        } catch(reason) {
          expression.evaluationError=reason instanceof UndefinedPointError ? undefined : reason instanceof Error
            ? reason.message
            :"Could not evaluate point";
        }
        updateExpressionErrorDisplay(expression);
        continue;
      }
      if(graph.kind==="sideways") {
        const evaluateSource=(y: number) => {
          const result=graph.evaluate(y);
          return typeof result==="number"? result:result.value.toNumber();
        };
        const evaluate = graphs.length === 1 ? cachedExplicitEvaluator(expression, evaluateSource) : evaluateSource;
        try {
          const curve=drawExplicitCurve(
            graphId,expression.color,evaluate,width,height,colorAt,lineWidth,opacity,true,graphs.length === 1 ? expression : undefined,graph.tangent,graph.region,
          );
          implicitCurves.push(curve);
          if (renderDetailFactor === 1) detectExplicitPoints(curve,evaluate,candidates,width,height,true);
          expression.evaluationError = undefined;
        } catch (reason) {
          expression.evaluationError = reason instanceof Error ? reason.message : "Could not render curve.";
        }
        updateExpressionErrorDisplay(expression);
        continue;
      }
      if(graph.kind==="implicit") {
        const curve=drawImplicit(
          graph.evaluate,width,height,graphId,expression.color,colorAt,lineWidth,opacity,graph.region,
        );
        implicitCurves.push(curve);
        if (renderDetailFactor === 1) detectImplicitAxisIntercepts(curve,graph.evaluate,candidates,width,height);
        continue;
      }
      if(graph.kind==="inequality") {
        const curve=drawInequality(
          graph.evaluate,graph.relation,graphId,expression.color,width,height,colorAt,
          lineWidth,opacity,graph.region,
        );
        implicitCurves.push(curve);
        continue;
      }
      if(graph.kind==="parametric") {
        const curve=drawParametricCurve(
          graphId,expression.color,graph.evaluate,graph.start,graph.end,width,height,
          colorAt,
          lineWidth,opacity,graph.region,/^\s*complexgrid\s*\(/i.test(expression.text)?
            reason=>{expression.evaluationError??=`Complex grid has undefined samples: ${reason instanceof Error?reason.message:"Could not evaluate sample."}`;}:undefined,
        );
        explicitCurves.push(curve);
        continue;
      }
      if(graph.kind==="list") {
        try {
          expression.evaluationError=undefined;
          const values=graph.evaluate();
          if(values.some((value) => value !== undefined && !Number.isFinite(value))) {
            throw new Error("List values must be finite numbers");
          }
          const expressionError=workspaceList.querySelector<HTMLParagraphElement>(
            `[data-expression-id="${expression.id}"] .expression-error`,
          );
          if(expressionError) expressionError.textContent="";
          workspaceList.querySelector<HTMLInputElement>(
            `[data-expression-id="${expression.id}"] input[type="text"]`,
          )?.removeAttribute("aria-invalid");
          values.forEach((y,index) => {
            if (y === undefined) return;
            const x=index+1;
            const screenX=screenXAt(x,width);
            const screenY=screenYAt(y,height);
            const pointColor=colorAt?.(x,y)??expression.color;
            listPoints.push({ x,y,color: pointColor,graphId,opacity,expressionId: expression.id });
            if(screenX>=0&&screenX<=width&&screenY>=0&&screenY<=height) {
              addPointCandidate(
                candidates,x,y,"list point",[graphId],pointColor,width,height,
              );
            }
          });
        } catch(reason) {
          expression.evaluationError=reason instanceof Error? reason.message:"Could not evaluate list";
          const error=workspaceList.querySelector<HTMLParagraphElement>(
            `[data-expression-id="${expression.id}"] .expression-error`,
          );
          if(error) error.textContent=expression.evaluationError;
          workspaceList.querySelector<HTMLInputElement>(
            `[data-expression-id="${expression.id}"] input[type="text"]`,
          )?.setAttribute("aria-invalid","true");
        }
        continue;
      }
      const evaluateSource=(x: number) => {
        const result=graph.evaluate(x);
        return typeof result==="number"? result:result.value.toNumber();
      };
      const evaluate = graphs.length === 1 ? cachedExplicitEvaluator(expression, evaluateSource) : evaluateSource;
      try {
        const curve=drawExplicitCurve(
          graphId,expression.color,evaluate,width,height,colorAt,lineWidth,opacity,false,graphs.length === 1 ? expression : undefined,graph.tangent,graph.region,
        );
        explicitCurves.push(curve);
        if (renderDetailFactor === 1) detectExplicitPoints(curve,evaluate,candidates,width,height);
        expression.evaluationError = undefined;
      } catch (reason) {
        expression.evaluationError = reason instanceof Error ? reason.message : "Could not render curve.";
      }
      updateExpressionErrorDisplay(expression);
      } finally {
        context.restore();
        if (expression.evaluationError) evaluationErrors.add(expression.evaluationError);
      }
      }
      expression.evaluationError = [...evaluationErrors].join("\n") || undefined;
      updateExpressionErrorDisplay(expression);
    }

    const table=item.type==="table"? tableById.get(item.id):undefined;
    const tableData=table? [{ table,values: tableValues(table) }]:[];
    for(const { table,values } of tableData) {
      for(const [x,y] of tablePlotPoints(values)) {
        const screenX=screenXAt(x,width);
        const screenY=screenYAt(y,height);
        if(screenX<0||screenX>width||screenY<0||screenY>height) {
          continue;
        }
        addPointCandidate(candidates,x,y,"table point",[`table-${table.id}`],
          table.color,width,height);
      }

      updateTableRegression(table);
      if(table.regression) {
        const evaluate=(x: number) => evaluateRegression(table.regression!,x);
        context.setLineDash([6,4]);
        const curve=drawExplicitCurve(
          `table-regression-${table.id}`,table.color,evaluate,width,height,
        );
        context.setLineDash([]);
        explicitCurves.push(curve);
        if (renderDetailFactor === 1) detectExplicitPoints(curve,evaluate,candidates,width,height);
      }
    }

    for(const point of listPoints) {
      const screenX=screenXAt(point.x,width);
      const screenY=screenYAt(point.y,height);
      if(screenX<-6||screenX>width+6||screenY<-6||screenY>height+6) continue;
      context.save();
      context.globalAlpha=point.opacity;
      const expression = expressionById.get(point.expressionId);
      drawStyledPoint(context, screenX, screenY, expression?.pointSize ?? 4, expression?.pointStyle ?? "filled",
        point.color, currentThemeColor("text-strong"), 1.5);
      context.restore();
    }
    for(const point of nextDraggableGraphPoints) {
      if(point.screenX<-8||point.screenX>width+8||
        point.screenY<-8||point.screenY>height+8) continue;
      context.save();
      context.globalAlpha=point.opacity;
      const expression = expressionById.get(point.expressionId);
      drawStyledPoint(context, point.screenX, point.screenY, expression?.pointSize ?? 6, expression?.pointStyle ?? "filled",
        point.color, currentThemeColor("text-strong"), 2);
      context.restore();
    }
    for(const { table,values } of tableData) {
      context.fillStyle=table.color;
      context.strokeStyle=currentThemeColor("text-strong");
      context.lineWidth=1.5;
      for(const [x,y] of tablePlotPoints(values)) {
        const screenX=screenXAt(x,width);
        const screenY=screenYAt(y,height);
        if(screenX<-6||screenX>width+6||screenY<-6||screenY>height+6) {
          continue;
        }
        context.beginPath();
        context.arc(screenX,screenY,4,0,Math.PI*2);
        context.fill();
        context.stroke();
      }
    }
    for(const endpoint of endpointMarkers){
      const sx=screenXAt(endpoint.x,width),sy=screenYAt(endpoint.y,height);
      if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<0||sx>width||sy<0||sy>height)continue;
      context.save();context.setLineDash([]);context.globalAlpha=endpoint.opacity;
      context.beginPath();context.arc(sx,sy,endpoint.radius,0,Math.PI*2);
      context.fillStyle=endpoint.closed?endpoint.color:currentThemeColor("app-bg");context.fill();
      context.strokeStyle=endpoint.color;context.lineWidth=2;context.stroke();context.restore();
      addPointCandidate(candidates,endpoint.x,endpoint.y,endpoint.closed?"closed endpoint":"open endpoint",[endpoint.graphId],endpoint.color,width,height);
    }
    if (entry && !entry.hidden) drawExpressionLabel(entry, width, height);
    allDraggableGraphPoints.push(...nextDraggableGraphPoints);
  };
  const allDraggableGraphPoints: DraggableGraphPoint[] = [];
  for (const item of workspaceBlocks().flatMap((block) => block.items).reverse()) {
    drawWorkspaceItem(item);
  }

  if (renderDetailFactor !== 1) return;
  for (let first = 0; first < explicitCurves.length; first += 1) {
    for (let second = first + 1; second < explicitCurves.length; second += 1) {
      if(!explicitCurves[first]!.evaluate||!explicitCurves[second]!.evaluate||explicitCurves[first]!.sideways||explicitCurves[second]!.sideways)continue;
      detectExplicitIntersections(
        explicitCurves[first]!, explicitCurves[second]!, candidates, width, height,
      );
    }
  }
  const curves=[...explicitCurves,...implicitCurves];
  for(let first=0;first<curves.length;first++){
    for(let second=first+1;second<curves.length;second++){
      const a=curves[first]!,b=curves[second]!;
      if(a.id.split(":")[0]===b.id.split(":")[0])continue;
      if(first<explicitCurves.length&&second<explicitCurves.length&&explicitCurves[first]!.evaluate&&explicitCurves[second]!.evaluate&&!a.sideways&&!b.sideways)continue;
      const crossings=segmentCrossings(a.segments,b.segments,width,height);
      if(crossings.limited)setProjectStatus("Intersection analysis reached its numerical work/marker limit; zoom in to inspect additional crossings.");
      for(const [sx,sy]of crossings.points){
        const x=worldXAt(sx,width),y=worldYAt(sy,height);
        addPointCandidate(candidates,x,y,"intersection",[a.id,b.id],a.colorAt?.(x,y)??a.color,width,height);
      }
    }
  }
  drawGrid();
  hoverCandidates = candidates;
  const nextHoverCurves = [...explicitCurves, ...implicitCurves];
  if (nextHoverCurves.length !== hoverCurves.length ||
      nextHoverCurves.some((curve, index) => curve !== hoverCurves[index])) {
    hoverSegmentIndex = undefined;
  }
  hoverCurves = nextHoverCurves;
  draggableGraphPoints = allDraggableGraphPoints.reverse();
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
  // Rebuilding the index here delays zoom redraws; pointer interactions build it on demand.
  drawHoverOverlay(false);
  scheduleProjectSave(!drag?.point);
  if (performanceProfile.enabled) {
    performanceProfile.drawCount += 1;
    performanceProfile.drawTimes.push(performance.now() - profileStart);
    if (performanceProfile.drawTimes.length > 300) {
      performanceProfile.drawTimes.shift();
    }
  }
  canvas.style.transform = "";
  renderedView = { centerX, centerY, scale };
  if (zoomRedrawTimer !== undefined) {
    window.clearTimeout(zoomRedrawTimer);
    zoomRedrawTimer = undefined;
  }
}

function previewZoom(factor: number, anchorX: number, anchorY: number): void {
  cancelRefinement();
  if (drawFrame !== undefined) {
    window.cancelAnimationFrame(drawFrame);
    drawFrame = undefined;
  }
  const bounds = canvasWrap.getBoundingClientRect();
  const graphWidth = bounds.width * GRAPH_BUFFER_SCALE;
  const graphHeight = bounds.height * GRAPH_BUFFER_SCALE;
  const previousScale = scale;
  const graphX = (anchorX - graphWidth / 2) / previousScale + centerX;
  const graphY = (graphHeight / 2 - anchorY) / verticalScale() + centerY;
  scale = Math.min(100_000, Math.max(0.001, scale * factor));
  centerX = graphX - (anchorX - graphWidth / 2) / scale;
  centerY = graphY - (graphHeight / 2 - anchorY) / verticalScale();

  updateGraphPreviewTransform();
  drawGrid();
  pointContext.clearRect(0, 0, bounds.width, bounds.height);

  if (zoomRedrawTimer !== undefined) window.clearTimeout(zoomRedrawTimer);
  zoomRedrawTimer = window.setTimeout(() => {
    zoomRedrawTimer = undefined;
    draw();
  }, ZOOM_REDRAW_DELAY_MS);
}

function updateGraphPreviewTransform(): void {
  const bounds = canvasWrap.getBoundingClientRect();
  const graphWidth = bounds.width * GRAPH_BUFFER_SCALE;
  const graphHeight = bounds.height * GRAPH_BUFFER_SCALE;
  const visualScale = scale / renderedView.scale;
  const translateX = graphWidth / 2 * (1 - visualScale) +
    (renderedView.centerX - centerX) * scale;
  const translateY = graphHeight / 2 * (1 - visualScale) +
    (centerY - renderedView.centerY) * verticalScale();
  canvas.style.transformOrigin = "0 0";
  canvas.style.transform =
    `matrix(${visualScale}, 0, 0, ${visualScale}, ${translateX}, ${translateY})`;
  if (detailCanvas.dataset.resolution) {
    if (visualScale < 1) {
      detailCanvas.hidden = true;
    } else {
      detailCanvas.hidden = false;
      detailCanvas.style.transformOrigin = "0 0";
      detailCanvas.style.transform =
        `matrix(${visualScale}, 0, 0, ${visualScale}, ${
          translateX + bounds.width * GRAPH_BUFFER_VIEWPORTS * (visualScale - 1)
        }, ${translateY + bounds.height * GRAPH_BUFFER_VIEWPORTS * (visualScale - 1)})`;
    }
  }
}

function scheduleDraw(): void {
  cancelRefinement();
  if (drawFrame !== undefined) return;
  drawFrame = window.requestAnimationFrame(() => {
    drawFrame = undefined;
    draw();
    if (clearDragTransformAfterDraw) {
      canvas.style.transform = "";
      clearDragTransformAfterDraw = false;
    }
  });
}

function isGraphConstructor(source:string):boolean{
  return new RegExp(`^\\s*(?:polygon|histogram|dotplot|boxplot|list|parametric|polar|derivative|integral|vectorfield|slopefield|ode|${[...ADVANCED_GRAPH_NAMES,...ANALYSIS_GRAPH_NAMES].join("|")})\\s*\\(`,"i").test(source);
}

function updateScalarResult(expression: Expression): boolean {
  const resultElement = workspaceList.querySelector<HTMLOutputElement>(
    `[data-expression-result-id="${expression.id}"]`,
  );
  const errorElement = workspaceList.querySelector<HTMLElement>(
    `[data-expression-error-id="${expression.id}"]`,
  );
  const input = errorElement?.parentElement?.querySelector<HTMLInputElement>(
    `input[aria-label^="Expression "]`,
  );
  const updateError = () => {
    if (errorElement) {
      errorElement.textContent = expression.compileError ?? expression.evaluationError ?? "";
    }
    if (input) {
      input.setAttribute("aria-invalid", String(Boolean(expression.compileError || expression.evaluationError)));
    }
  };
  const source = expression.text.trim();
  if(new RegExp(`^(?:${[...RESULT_COMMAND_NAMES,...ANALYSIS_RESULT_NAMES].join("|")})\\s*\\(`,"i").test(source)){
    expression.compileError=undefined;
    try{
      const key=JSON.stringify([source,userFunctionSignature(),sliderValues,collectionSignature(source)]);
      let result=expression.commandResult?.key===key?expression.commandResult.value:undefined;
      if(result===undefined){
        result=resultCommand(/^(?:unitcheck|convert)\s*\(/i.test(source)?source:expandFunctions(source),sliderValues,collectionValues);
        if(result===undefined)throw new Error("Unsupported result command.");
        expression.commandResult={key,value:result};
      }
      expression.evaluationError=undefined;
      if(resultElement){resultElement.textContent=`${/^(?:simplify|differentiate|factor)\s*\(/i.test(source)?"Exact form":/^(?:unitcheck|convert)\s*\(/i.test(source)?"Units (numerical)":/^(?:pointangle)\s*\(/i.test(source)?"Angle (approximate)":ANALYSIS_RESULT_NAMES.some(name=>new RegExp(`^${name}\\s*\\(`,"i").test(source))?"Numerical analysis (approximate)":"Numerical matrix result"}: ${result}`;resultElement.hidden=false;}
    }catch(reason){
      expression.evaluationError=reason instanceof Error?reason.message:"Could not evaluate result command.";
      if(resultElement)resultElement.hidden=true;
    }
    updateError();return true;
  }
  if(isGraphConstructor(source)&&new RegExp(`^(?:vectorfield|slopefield|ode|${[...ADVANCED_GRAPH_NAMES,...ANALYSIS_GRAPH_NAMES].join("|")})\\s*\\(`,"i").test(source)){
    const graph=getCompiled(expression);
    if(resultElement){
      resultElement.hidden=!graph;
      resultElement.textContent=graph?.kind==="collection"&&graph.summary?graph.summary:
        /^(?:ode|trajectory)\s*\(/i.test(source)?"Numerical solution (approximate)":
        /^slopefield\s*\(/i.test(source)?"Sampled slope directions":
        /^vectorfield\s*\(/i.test(source)?"Normalized vector directions":
        /^transform\s*\(/i.test(source)?"Linear transformation":
        /^complexgrid\s*\(/i.test(source)?"Transformed input grid (numerically sampled)":
        /^(?:segment|circle)\s*\(/i.test(source)?"Geometry construction":
        /^heatmap\s*\(/i.test(source)?"Real heatmap: low = blue, high = red (clamped)":
        /^contours\s*\(/i.test(source)?"Sampled real level curves":
        /^(?:confidenceband|predictionband)\s*\(/i.test(source)?"Pointwise linear-regression band; independent normal, constant-variance errors assumed":
        /^errorbars\s*\(/i.test(source)?"User-supplied symmetric error bars":
        ANALYSIS_GRAPH_NAMES.some(name=>new RegExp(`^${name}\\s*\\(`,"i").test(source))?"Numerical analysis plot (approximate)":"Sampled complex plane / bounded escape-time image";
    }
    updateError();return false;
  }
  if(isTone(source)){
    expression.compileError=undefined;
    try{
      const {frequency,gain}=evaluateTone(source,sliderValues,expandFunctions);
      expression.evaluationError=undefined;
      if(resultElement){resultElement.textContent=`${frequency} Hz · gain ${gain} · ${enabledTones.has(expression.id)?"playing":"muted"}`;resultElement.hidden=false;}
    }catch(reason){
      expression.evaluationError=reason instanceof Error?reason.message:"Invalid tone.";
      if(resultElement)resultElement.hidden=true;
    }
    updateError();return true;
  }
  if (isActionExpression(source)) {
    if (resultElement) resultElement.hidden = true;
    return true;
  }
  const definedInference=inferenceDefinition(source);
  const namedInference=expressions.some((expression)=>inferenceDefinition(expression.text)?.target===source.toLowerCase());
  if (definedInference||namedInference||/^(ztest|ttest|zproptest|chisqtest|chisqgof)\s*\(/i.test(source)) {
    try {
      const expanded = expandFunctions(definedInference?.source??source, String(expression.id));
      const call = inferenceCall(expanded);
      if (call && !call.property) {
        const result = readInference(call,
          (item) => compileExpression(item, sliderValues)(0).value.toNumber(), collectionValues, graphOptions.statisticsMode);
        expression.evaluationError = undefined;
        expression.scalarText = undefined;
        expression.scalarEvaluator = undefined;
        if (resultElement) {
          resultElement.textContent = `${definedInference?`${definedInference.target}: `:""}${inferenceSummary(result)}`;
          resultElement.title = "Numerical inference; null distribution and p-value tails shown on graph. Check sampling assumptions.";
          resultElement.hidden = false;
        }
        updateError();
        return Boolean(definedInference);
      }
    } catch (reason) {
      expression.evaluationError = reason instanceof Error ? reason.message : "Could not calculate inference.";
      if (resultElement) resultElement.hidden = true;
      updateError();
      return false;
    }
  }
  const definedDistribution = distributionDefinition(source);
  let expandedDistribution: string;
  try {
    expandedDistribution = expandDistributionDefinitions(source, expressions.flatMap((expression) => {
      const definition = distributionDefinition(expression.text);
      return definition ? [definition] : [];
    }));
  } catch (reason) {
    expression.evaluationError = reason instanceof Error ? reason.message : "Could not expand distribution.";
    if (resultElement) resultElement.hidden = true;
    updateError();
    return false;
  }
  const directDistribution = distributionCall(expandedDistribution);
  if (definedDistribution || (directDistribution && !expandedDistribution.slice(directDistribution.end).trim())) {
    expression.scalarText = undefined;
    expression.scalarEvaluator = undefined;
    try {
      const body = definedDistribution?.source ?? source;
      const expanded = definedDistribution ? expandFunctions(body) : expandFunctions(expandedDistribution);
      readDistribution(expanded,
        (item) => compileExpression(item, sliderValues)(0).value.toNumber(), collectionValues, graphOptions.statisticsMode);
      expression.evaluationError = undefined;
      if (resultElement) {
        resultElement.textContent = definedDistribution ? `${definedDistribution.target}: probability distribution` : "Probability distribution (numerical approximation)";
        resultElement.hidden = false;
      }
    } catch (reason) {
      expression.evaluationError = reason instanceof Error ? reason.message : "Could not evaluate distribution.";
      if (resultElement) resultElement.hidden = true;
    }
    updateError();
    return Boolean(definedDistribution);
  }
  if (/^stats\s*\(/i.test(source)) {
    expression.scalarText = undefined;
    expression.scalarEvaluator = undefined;
    try {
      const summary = statisticsSummary(expandFunctions(source),
        (item) => compileExpression(item, sliderValues)(0).value.toNumber(), collectionValues, graphOptions.statisticsMode);
      expression.evaluationError = undefined;
      if (resultElement) {
        resultElement.textContent = summary;
        resultElement.title = "Numerical descriptive statistics; boxplot shown on graph.";
        resultElement.hidden = false;
      }
    } catch (reason) {
      expression.evaluationError = reason instanceof Error ? reason.message : "Could not calculate statistics.";
      if (resultElement) resultElement.hidden = true;
    }
    updateError();
    return false;
  }
  if (source.includes("~")) {
    expression.scalarText = undefined;
    expression.scalarEvaluator = undefined;
    if (resultElement) {
      resultElement.textContent = expression.regressionSummary ?? "";
      resultElement.title = expression.regressionSummary ? "Least-squares fit (numerical approximation)" : "";
      resultElement.hidden = !expression.regressionSummary;
    }
    return false;
  }
  const scalarKey = `${source}\u0000${userFunctionSignature()}\u0000${collectionSignature(source)}`;
  if(graphOptions.complexMode&&!isGraphConstructor(source)&&!graphRelation(source)&&!pointSources(source)&&
    !freeIdentifiers(source).some((name)=>["x","y","t"].includes(name))){
    try{
      const expanded=expandFunctions(source);
      const collection=expandCollections(expanded,(item)=>{
        const value=compileComplexExpression(item,sliderValues,complexValues)(0);
        if(value.im!==0)throw new Error("This list operation requires real inputs.");
        return value.re;
      },collectionValues,graphOptions.statisticsMode);
      if(!collection.list&&!pointSources(collection.items[0]!)){
        const value=compileComplexExpression(collection.items[0]!,sliderValues,complexValues)(0);
        if(resultElement){resultElement.textContent=`≈ ${formatComplex(value)}`;resultElement.hidden=false;}
        expression.compileError=undefined;expression.evaluationError=undefined;updateError();
        return value.im===0;
      }
    }catch(reason){
      expression.evaluationError=reason instanceof Error?reason.message:"Could not evaluate complex expression.";
      if(resultElement)resultElement.hidden=true;
      updateError();return true;
    }
  }
  const tokens = freeIdentifiers(source.replace(/([a-z](?:_[a-z0-9]+)?)\.[xy]\b/gi, "$1"));
  if (!source || graphRelation(source) ||
      /^(?:list|derivative|integral|parametric|polar|vectorfield|slopefield|ode)\s*\(/i.test(source) ||
      tokens.some((name) => ["x", "y", "t"].includes(name.toLowerCase()))) {
    expression.scalarText = scalarKey;
    expression.scalarEvaluator = undefined;
    if (resultElement) resultElement.hidden = true;
    return false;
  }
  if (expression.scalarText !== scalarKey || !expression.scalarEvaluator) {
    expression.scalarText = scalarKey;
    expression.scalarEvaluator = undefined;
    let expandedSource: string | undefined;
    try {
      expandedSource = expandFunctions(source, String(expression.id));
      let approximate = INFERENCE_NAMES.some((name) => new RegExp(`\\b${name}\\s*\\(`, "i").test(source));
      if (hasCollections(expandedSource, collectionValues)) {
        const collection = expandCollections(expandedSource,
          (item) => compileExpression(item, sliderValues)(0).value.toNumber(), collectionValues, graphOptions.statisticsMode);
        if (collection.list) {
          if (resultElement) resultElement.hidden = true;
          return false;
        }
        expandedSource = collection.items[0]!;
        approximate ||= collection.approximate ?? false;
      }
      const evaluate = compileExpression(expandedSource, sliderValues);
      expression.scalarEvaluator = () => {
        const value = evaluate(0);
        return approximate ? { ...value, exact: false } : value;
      };
    } catch {
      try {
        const graph = compileGraphExpression(expandedSource ?? expandFunctions(source), sliderValues, graphOptions.statisticsMode);
        if (graph.kind !== "explicit") return false;
        expression.scalarEvaluator = () => graph.evaluate(0);
      } catch {
        return false;
      }
    }
  }
  try {
    const result = expression.scalarEvaluator();
    let output: string;
    let approximate = false;
    if (typeof result === "number") {
      if (!Number.isFinite(result)) throw new Error("Result must be finite");
      output = Number(result.toPrecision(15)).toString();
      approximate = true;
    } else {
      output = result.value.toSignificantDigits(15).toString();
      approximate = !result.exact || result.value.toString() !== output;
    }
    if (resultElement) {
      resultElement.textContent = `${approximate ? "≈ " : "= "}${output}`;
      resultElement.title = approximate ? "Numerical approximation" : "Exact result";
      resultElement.hidden = false;
    }
    expression.compileError = undefined;
    expression.evaluationError = undefined;
    updateError();
    return true;
  } catch (reason) {
    expression.evaluationError = reason instanceof Error ? reason.message : "Could not evaluate result";
    if (resultElement) resultElement.hidden = true;
    updateError();
    return true;
  }
}

function collectionSignature(source: string): string {
  const distributionDefinitions = expressions.flatMap((expression) => {
    const definition = distributionDefinition(expression.text);
    return definition ? [definition] : [];
  });
  const inferenceDefinitions=expressions.flatMap((expression)=>{
    const definition=inferenceDefinition(expression.text);return definition?[definition]:[];
  });
  const structuredNames = [...DISTRIBUTION_NAMES, ...INFERENCE_NAMES, ...RANDOM_NAMES,
    ...distributionDefinitions.map((definition) => definition.target),...inferenceDefinitions.map((definition)=>definition.target)];
  return isGraphConstructor(source) ||
    (source.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? []).some((token) => structuredNames.includes(token.toLowerCase())) ||
    hasCollections(source, collectionValues) ||
    getUserFunctionDefinitions().some(({ definition }) => hasCollections(definition.body, collectionValues))
    ? JSON.stringify([collectionValues, pointValues, complexValues, sliderValues, tableColumnErrors, graphOptions.statisticsMode, graphOptions.angleMode, graphOptions.complexMode, getRandomSeed(), distributionDefinitions,inferenceDefinitions]) :
      JSON.stringify([pointValues, complexValues, tableColumnErrors, graphOptions.statisticsMode, graphOptions.angleMode, graphOptions.complexMode]);
}

function getCompiled(expression: Expression): CompiledGraph | undefined {
  const functionStates = getUserFunctionDefinitions();
  const functionSignature = userFunctionSignature(functionStates);
  const collectionsKey = collectionSignature(expression.text);
  if (expression.parsedText !== expression.text ||
      expression.parsedFunctionSignature !== functionSignature ||
      expression.parsedCollectionSignature !== collectionsKey ||
      expression.compiledMode !== graphMode) {
    expression.parsedText = expression.text;
    expression.parsedFunctionSignature = functionSignature;
    expression.parsedCollectionSignature = collectionsKey;
    expression.compiledMode = graphMode;
    expression.compiled = undefined;
    expression.compileError = undefined;
    expression.evaluationError = undefined;
    const functionDefinition = functionStates.find(({ expression: owner }) => owner === expression);
    if (distributionDefinition(expression.text)) return undefined;
    if(inferenceDefinition(expression.text))return undefined;
    if (isActionExpression(expression.text)) return undefined;
    if (isTone(expression.text)) return undefined;
    if(new RegExp(`^\\s*(?:${[...RESULT_COMMAND_NAMES,...ANALYSIS_RESULT_NAMES].join("|")})\\s*\\(`,"i").test(expression.text))return undefined;
    if (functionDefinition) {
      expression.compileError = functionDefinition.error;
      if (!expression.compileError) {
        try {
          const expandedSource = expandFunctions(functionDefinition.baseCase?functionDefinition.baseCase.body:
            `${functionDefinition.definition.name}(${functionParameters(functionDefinition.definition).map((_,index) =>
              numericSource(functionDefinition.definition.baseCases?.[0]?.arguments[index]??0)).join(",")})`,
          );
          if(graphOptions.complexMode&&!hasCollections(expandedSource,collectionValues)&&!graphRelation(expandedSource)){
            compileComplexExpression(expandedSource,sliderValues,complexValues);
          }else compileCollectionGraph(expandedSource, sliderValues, collectionValues, false, graphOptions.statisticsMode) ??
              compileGraphExpression(expandedSource, sliderValues, graphOptions.statisticsMode);
        } catch (reason) {
          expression.compileError = reason instanceof Error ? reason.message : "Invalid function";
        }
      }
      updateExpressionErrorDisplay(expression);
      return undefined;
    }
    if (expression.text.includes("~")) {
      expression.compileError = expression.regressionError;
      if (!expression.compileError && expression.regressionGraph) {
        try {
          const source = `y=${expression.regressionGraph}`;
          expression.compiled = graphMode === "desmos"
            ? compileFastGraphExpression(source, sliderValues, graphOptions.statisticsMode)
            : compileGraphExpression(source, sliderValues, graphOptions.statisticsMode);
        } catch (reason) {
          expression.compileError = reason instanceof Error ? reason.message : "Could not graph regression.";
        }
      }
      updateExpressionErrorDisplay(expression);
      return expression.compiled;
    }
    const definition = getVariableDefinition(expression);
    if (definition) {
      expression.compileError = definition.error;
      if(!definition.error&&complexValues[definition.target]?.im){
        const value=complexValues[definition.target]!;
        expression.compiled={kind:"point",xVariables:[],yVariables:[],evaluate:()=>[value.re,value.im]};
      }
      if (!definition.error && Object.hasOwn(pointValues, definition.target)) {
        try {
          expression.compiled = compileGraphExpression(expandFunctions(definition.target), sliderValues);
        } catch (reason) {
          expression.compileError = reason instanceof Error ? reason.message : "Invalid named point.";
        }
      }
      updateExpressionErrorDisplay(expression);
      return expression.compiled;
    }
    try {
      let source = expandFunctions(expression.text, String(expression.id));
      if(graphOptions.complexMode&&!isGraphConstructor(source)&&hasCollections(source,collectionValues)){
        const collection=expandCollections(source,(text)=>{
          const value=compileComplexExpression(text,sliderValues,complexValues)(0);
          if(value.im!==0)throw new Error("This list operation requires real inputs.");
          return value.re;
        },collectionValues,graphOptions.statisticsMode);
        if(collection.list){
          const items=collection.items.map((item)=>{
            if(freeIdentifiers(item).some((name)=>["x","y","t"].includes(name)))return item;
            const point=pointSources(item);
            if(point)return`(${point.map((coordinate)=>{
              const value=compileComplexExpression(coordinate,sliderValues,complexValues)(0);
              if(value.im!==0)throw new Error("Point coordinates must be real.");
              return numericSource(value.re);
            }).join(",")})`;
            const value=compileComplexExpression(item,sliderValues,complexValues)(0);
            return value.im===0?numericSource(value.re):`(${numericSource(value.re)},${numericSource(value.im)})`;
          });
          if(items.some((item,index)=>item!==collection.items[index]))source=`[${items.join(",")}]`;
        }else source=collection.items[0]!;
      }
      const complexPoint=graphOptions.complexMode?pointSources(source):undefined;
      if(complexPoint&&(/\b(real|imag|conj|arg)\s*\(/i.test(source)||freeIdentifiers(source).some((name)=>name==="i"||complexValues[name]?.im))){
        const coordinates=complexPoint.map((coordinate)=>compileComplexExpression(coordinate,sliderValues,complexValues));
        expression.compiled={kind:"point",xVariables:[],yVariables:[],evaluate:()=>{
          const a=coordinates[0]!(0),b=coordinates[1]!(0);
          if(a.im!==0||b.im!==0)throw new Error("Point coordinates must be real; use real(z) or imag(z).");
          return[a.re,b.re];
        }};
        return expression.compiled;
      }
      if(graphOptions.complexMode&&!isGraphConstructor(source)&&!inferenceCall(source)&&!distributionCall(source)&&!graphRelation(source)&&!hasCollections(source,collectionValues)&&!pointSources(source)&&
        !freeIdentifiers(source).some((name)=>["x","y","t"].includes(name))){
        const value=compileComplexExpression(source,sliderValues,complexValues)(0);
        if(value.im!==0){expression.compiled={kind:"point",xVariables:[],yVariables:[],evaluate:()=>[value.re,value.im]};return expression.compiled;}
        return undefined;
      }
      const complexSource=source.replace(/^\s*y\s*=\s*/i,"");
      const identifiers=freeIdentifiers(complexSource);
      if(graphOptions.complexMode&&(!graphRelation(source)||/^\s*y\s*=/i.test(source))&&!hasCollections(source,collectionValues)&&!pointSources(source)&&
        identifiers.includes("x")&&!identifiers.includes("y")&&(identifiers.some((name)=>name==="i"||complexValues[name]?.im)||/\b(real|imag|conj|arg)\s*\(/i.test(source))){
        const evaluate=compileComplexExpression(complexSource,sliderValues,complexValues);
        const componentOnly=complexExpressionIsReal(complexSource,sliderValues,complexValues);
        expression.compiled=componentOnly?{kind:"explicit",evaluate:(x)=>{
          const value=evaluate(x);if(value.im!==0)throw new Error("Expected a real component.");return value.re;
        }}:{kind:"parametric",start:-10,end:10,evaluate:(x)=>{const value=evaluate(x);return[value.re,value.im];}};
        return expression.compiled;
      }
      expression.compiled = compileCollectionGraph(source, sliderValues, collectionValues, graphMode === "desmos", graphOptions.statisticsMode) ?? (graphMode === "desmos"
        ? compileFastGraphExpression(source, sliderValues, graphOptions.statisticsMode)
        : compileGraphExpression(source, sliderValues, graphOptions.statisticsMode));
    } catch (reason) {
      expression.compileError = reason instanceof Error ? reason.message : "Invalid expression";
    }
    updateExpressionErrorDisplay(expression);
  }
  return expression.compiled;
}

function updateExpressionErrorDisplay(expression: Expression): void {
  const error = workspaceList.querySelector<HTMLElement>(
    `[data-expression-error-id="${expression.id}"]`,
  );
  if (error) {
    error.textContent = expression.compileError ?? expression.evaluationError ?? "";
    error.parentElement?.querySelector<HTMLInputElement>(
      `input[aria-label^="Expression "]`,
    )?.setAttribute(
      "aria-invalid",
      String(Boolean(expression.compileError || expression.evaluationError)),
    );
  }
}

type FunctionState = {
  expression: Expression;
  definition: UserFunctionDefinition;
  baseCase?: {arguments:number[];body:string};
  error?: string;
};

let functionAnalysis: {
  inputs: Array<{ expression: Expression; text: string }>;
  states: FunctionState[];
  signature: string;
} | undefined;
let expansionSignature = "";
let expandedSources = new BoundedCache<string, string>(1024);
let sliderAnalysis: { key: string; names: string[] } | undefined;

function getUserFunctionDefinitions(): FunctionState[] {
  if (functionAnalysis && functionAnalysis.inputs.length === expressions.length &&
      functionAnalysis.inputs.every(({ expression, text }, index) =>
        expression === expressions[index] && text === expression.text)) {
    return functionAnalysis.states;
  }
  const found: FunctionState[] = [];
  for (const expression of expressions) {
    const match = /^\s*([a-z](?:_[a-z0-9]+)?)\s*\(([^)]*)\)\s*=\s*(.*)\s*$/i.exec(expression.text);
    if (!match) continue;
    const name = match[1]!.toLowerCase();
    const parameter = match[2]!.trim().toLowerCase();
    const definition: UserFunctionDefinition = {
      name,
      parameter,
      parameters: parameter.split(",").map((name) => name.trim()),
      body: match[3]!.trim(),
    };
    const state: (typeof found)[number] = { expression, definition };
    const baseArguments=parameter.split(",").map(value=>value.trim());
    if(baseArguments.every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))){
      state.baseCase={arguments:baseArguments.map(Number),body:definition.body};
      if(!state.baseCase.arguments.every(Number.isFinite)||!definition.body)state.error="Base cases need finite numeric inputs and a value.";
      found.push(state);continue;
    }
    try {
      functionParameters(definition);
    } catch (reason) {
      state.error = reason instanceof Error ? reason.message : "Invalid function parameters.";
    }
    if (!state.error && !definition.body) {
      state.error = "Enter a function body after the equals sign.";
    } else if (!state.error && [
      "x", "y", "t", "pi", "e", "sqrt", "sin", "cos", "tan", "asin", "acos",
      "atan", "ln", "log", "exp", "abs", "floor", "ceil", "parametric", "polar",
      "derivative", "integral", "list", "sum", "product", "min", "max", "mean",
      "median", "variance", "stdev", "factorial",
      "for", "r", "theta", "prod", "int", "derivativeat", ...BUILTIN_NAMES, ...COLLECTION_FUNCTIONS, ...STATISTICAL_PLOTS,
      ...DISTRIBUTION_NAMES, ...PROBABILITY_KERNELS, "pdf", "cdf", "inversecdf",
      ...INFERENCE_NAMES, "test", "conf", "estimate", "stderr", "dof", "score", "pleft", "pright", "lower", "upper",
      ...RANDOM_NAMES,
      ...COMPLEX_FUNCTIONS,"i","tone","vectorfield","slopefield","ode",...ADVANCED_GRAPH_NAMES,...RESULT_COMMAND_NAMES,...ANALYSIS_GRAPH_NAMES,...ANALYSIS_RESULT_NAMES,
      ...expressions.flatMap((expression) => {
        const definition = distributionDefinition(expression.text);
        return definition ? [definition.target] : [];
      }),
      ...expressions.flatMap((expression)=>{const definition=inferenceDefinition(expression.text);return definition?[definition.target]:[];}),
    ].includes(name)) {
      state.error = `"${name}" is reserved and cannot be defined as a function.`;
    }
    found.push(state);
  }
  const counts = new Map<string, number>();
  for (const { definition,baseCase } of found) {
    if(baseCase)continue;
    counts.set(definition.name, (counts.get(definition.name) ?? 0) + 1);
  }
  for (const state of found) {
    if (!state.baseCase&&counts.get(state.definition.name)! > 1) {
      state.error = `Function "${state.definition.name}" is defined more than once.`;
    }
  }
  for(const base of found.filter(state=>state.baseCase)){
    const general=found.filter(state=>!state.baseCase&&state.definition.name===base.definition.name);
    if(general.length!==1){base.error=`Base case "${base.definition.name}" needs exactly one general function definition.`;continue;}
    const owner=general[0]!,tuple=base.baseCase!;
    if(owner.error){base.error=owner.error;continue;}
    if(tuple.arguments.length!==functionParameters(owner.definition).length){
      base.error="Base case argument count must match the general function.";owner.error=base.error;continue;
    }
    const duplicate=found.filter(state=>state.baseCase&&state.definition.name===base.definition.name&&
      JSON.stringify(state.baseCase.arguments)===JSON.stringify(tuple.arguments));
    if(duplicate.length>1){base.error="This numeric base case is defined more than once.";owner.error=base.error;continue;}
    if(base.error){owner.error=base.error;continue;}
    (owner.definition.baseCases??=[]).push(tuple);
  }
  functionAnalysis = {
    inputs: expressions.map((expression) => ({ expression, text: expression.text })),
    states: found,
    signature: JSON.stringify(found.map(({ definition, error }) => ({ ...definition, error }))),
  };
  return found;
}

function userFunctionSignature(
  states = getUserFunctionDefinitions(),
): string {
  return functionAnalysis?.states === states
    ? functionAnalysis.signature
    : JSON.stringify(states.map(({ definition, error }) => ({ ...definition, error })));
}
function graphVariableSignature(source:string):string{
  const definitions=getUserFunctionDefinitions().filter(state=>!state.baseCase).map(({definition})=>
    [definition.body,...(definition.baseCases??[]).map(base=>base.body)].join(" "));
  return referencedVariableSignature([source,...definitions].join(" "),sliderValues);
}

function regressionSlopeInference(target:string):{estimate:number;stderr:number;dof:number}{
  const owner=expressions.find((expression)=>expression.regressionCache?.result.parameters[target]!==undefined);
  const result=owner?.regressionCache?.result;
  if(!owner||!result?.graphSource||Object.keys(result.parameters).length!==2)throw new Error("Slope inference requires a fitted linear regression with slope and intercept.");
  const sides=regressionSides(expandFunctions(owner.text));
  if(!sides)throw new Error("Missing regression model.");
  const lists=[...new Set((sides.right.match(/[a-z]+(?:_[a-z0-9]+)?/gi)??[]).map((name)=>name.toLowerCase()).filter((name)=>Object.hasOwn(collectionValues,name)))];
  if(lists.length!==1)throw new Error("Slope inference requires one independent data list.");
  const scope={...sliderValues,...result.parameters};
  const f=compileExpression(result.graphSource,scope);
  const original=scope[target]!;
  const intercept=f(0).value.toNumber(),slope=f(1).value.toNumber()-intercept;
  for(const x of [-2,0,1,2]){
    const y=f(x).value.toNumber();
    if(Math.abs(y-(intercept+slope*x))>1e-8*Math.max(1,Math.abs(y)))throw new Error("Slope inference is available only for linear models.");
    scope[target]=original+1;
    const changed=f(x).value.toNumber();scope[target]=original;
    if(Math.abs(changed-y-x)>1e-8*Math.max(1,Math.abs(y)))throw new Error(`"${target}" is not the linear model's slope coefficient.`);
  }
  const evaluate=(text:string)=>compileExpression(text,sliderValues)(0).value.toNumber();
  const observed=expandCollections(sides.left,evaluate,collectionValues,graphOptions.statisticsMode);
  const x=collectionValues[lists[0]!]!.map(evaluate),y=observed.items.map(evaluate);
  return regressionSlopeSummary(x,y);
}

function expandFunctions(source: string, scope = source, rewriteStructured = true): string {
  const states = getUserFunctionDefinitions();
  const signature = userFunctionSignature(states);
  if (expansionSignature !== signature) {
    expansionSignature = signature;
    expandedSources = new BoundedCache(1024);
  }
  const cached = expandedSources.get(source);
  let expanded = cached;
  if (expanded === undefined) {
    const invalidDefinition = states.find(({ definition, error }) =>
      error && new RegExp(`\\b${definition.name}\\s*\\(`, "i").test(source));
    if (invalidDefinition) throw new Error(invalidDefinition.error);
    expanded = expandUserFunctions(
      source,
      states.filter(({ error,baseCase }) => !error&&!baseCase).map(({ definition }) => definition),
    );
    expandedSources.set(source, expanded);
  }
  const namedPoints=/^\s*(?:domaincolor|complexgrid)\s*\(/i.test(expanded)?
    Object.fromEntries(Object.entries(pointValues).filter(([name])=>name!=="z")):pointValues;
  expanded = expandNamedPoints(expanded, namedPoints);
  const inferenceDefinitions=expressions.flatMap((expression)=>{
    const definition=inferenceDefinition(expression.text);return definition?[definition]:[];
  });
  for(const definition of inferenceDefinitions){
    if(!(expanded.match(/[a-z]+(?:_[a-z0-9]+)?/gi)??[]).some((name)=>name.toLowerCase()===definition.target))continue;
    if(expressions.some((expression)=>getVariableDefinition(expression)?.target===definition.target||
      distributionDefinition(expression.text)?.target===definition.target)||
      tables.some((table)=>tableColumns(table).some((column)=>column.target===definition.target)))throw new Error(`"${definition.target}" is already defined by another object.`);
  }
  expanded=expandInferenceDefinitions(expanded,inferenceDefinitions);
  if(rewriteStructured){
    expanded=expanded.replace(/\bttest\s*\(\s*([a-z](?:_[a-z0-9]+)?)\s*\)/gi,(original,name:string)=>{
      const target=name.toLowerCase();
      if(!expressions.some((expression)=>expression.regressionCache?.result.parameters[target]!==undefined))return original;
      const summary=regressionSlopeInference(target);
      const n=summary.dof+1;
      return `ttest(${numericSource(summary.estimate)},${numericSource(summary.stderr*Math.sqrt(n))},${n})`;
    });
  }
  const distributions = expressions.flatMap((expression) => {
    const definition = distributionDefinition(expression.text);
    return definition ? [definition] : [];
  });
  for (const definition of distributions) {
    if (!(expanded.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? []).some((name) => name.toLowerCase() === definition.target)) continue;
    if (expressions.some((expression) => getVariableDefinition(expression)?.target === definition.target) ||
      tables.some((table) => tableColumns(table).some((column) => column.target === definition.target))) {
      throw new Error(`"${definition.target}" is already defined as a scalar, list, point, or table column.`);
    }
  }
  expanded = expandDistributionDefinitions(expanded, distributions);
  const invalidColumn = (expanded.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? [])
    .map((name) => name.toLowerCase()).find((name) => Object.hasOwn(tableColumnErrors, name));
  if (invalidColumn) throw new Error(tableColumnErrors[invalidColumn]);
  if (!rewriteStructured) return expanded;
  const distribution = distributionCall(expanded);
  if (distribution && !expanded.slice(distribution.end).trim()) return expanded;
  expanded = rewriteRandom(expanded,
    (item) => compileExpression(item, sliderValues)(0).value.toNumber(), collectionValues, graphOptions.statisticsMode, scope);
  expanded = rewriteInferenceProperties(expanded, (call) =>
    `(${numericSource(inferenceProperty(readInference(call, (item) => compileExpression(item, sliderValues)(0).value.toNumber(),
      collectionValues, graphOptions.statisticsMode), call.property!))})`);
  return rewriteDistributions(expanded,
    (item) => compileExpression(item, sliderValues)(0).value.toNumber(), collectionValues, graphOptions.statisticsMode, scope);
}

function getVariableDefinition(
  expression: Expression,
): NonNullable<Expression["definition"]> | undefined {
  if (expression.definitionText !== expression.text) {
    expression.definitionText = expression.text;
    expression.definition = null;
  }
  if (expression.definition) return expression.definition;
  if (expression.text.includes("~")) return undefined;
  if (actionDefinition(expression.text) || /(?:->|→)/.test(expression.text)) return undefined;
  if (distributionDefinition(expression.text)) return undefined;
  if(inferenceDefinition(expression.text))return undefined;
  const match = /^\s*([a-z](?:_[a-z0-9]+)?)\s*=\s*(.+)\s*$/i.exec(expression.text);
  if (!match) return undefined;
  const target = match[1]!.toLowerCase();
  if (["e", "x", "y", "t", "r"].includes(target)) return undefined;
  expression.definition = { target, source: match[2]! };
  return expression.definition;
}

function variableDefinitionSignature(): string {
  return JSON.stringify([
    expressions.map(({ text, hsv, label, labelX, labelY, clickAction }) => [text, hsv, label, labelX, labelY, clickAction]),
    tables.map(({ id, rows, xColumn, yColumn, xFormula, yFormula, extraColumns }) =>
      [id, rows, xColumn, yColumn, xFormula, yFormula, extraColumns]),
    tickers.map(({ action }) => action),
    photos.map((photo) => PHOTO_FIELDS.map(([key]) => photo[key])),
    sliderValues,
    graphOptions.statisticsMode, graphOptions.angleMode, graphOptions.complexMode, getRandomSeed(),
  ]);
}

let variableDefinitionCache: {
  key: string;
  expressions: Expression[];
  tables: DataTable[];
  result: { definitions: NonNullable<Expression["definition"]>[]; sliders: string[] };
} | undefined;

function synchronizeVariableDefinitions(updateTableDisplay = true): {
  definitions: NonNullable<Expression["definition"]>[];
  sliders: string[];
} {
  const key = variableDefinitionSignature();
  if (variableDefinitionCache?.key === key &&
      variableDefinitionCache.expressions === expressions && variableDefinitionCache.tables === tables) {
    return variableDefinitionCache.result;
  }
  const functionStates = getUserFunctionDefinitions();
  const reserved = new Set([
    "x", "y", "t", "dt", "and", "or", "pi", "e", "sqrt", "sin", "cos", "tan", "asin", "acos",
    "atan", "ln", "log", "exp", "abs", "floor", "ceil", "parametric", "polar",
    "derivative", "integral", "list", "sum", "product", "min", "max", "mean",
    "median", "variance", "stdev", "factorial",
    "for", "r", "theta", "prod", "int", "derivativeat", ...BUILTIN_NAMES, ...COLLECTION_FUNCTIONS, ...STATISTICAL_PLOTS,
    ...DISTRIBUTION_NAMES, ...PROBABILITY_KERNELS, "pdf", "cdf", "inversecdf",
    ...INFERENCE_NAMES, "test", "conf", "estimate", "stderr", "dof", "score", "pleft", "pright", "lower", "upper",
    ...RANDOM_NAMES,
    ...COMPLEX_FUNCTIONS,"tone","vectorfield","slopefield","ode",...ADVANCED_GRAPH_NAMES,...RESULT_COMMAND_NAMES,...ANALYSIS_GRAPH_NAMES,...ANALYSIS_RESULT_NAMES,...(graphOptions.complexMode?["i"]:[]),
    ...expressions.flatMap((expression)=>{const definition=inferenceDefinition(expression.text);return definition?[definition.target]:[];}),
    ...expressions.flatMap((expression) => {
      const definition = distributionDefinition(expression.text);
      return definition ? [definition.target] : [];
    }),
    ...expressions.flatMap((expression) => {
      const definition = actionDefinition(expression.text);
      return definition ? [definition.target] : [];
    }),
    ...functionStates.map(({ definition }) => definition.name),
  ]);
  const definitions = expressions
    .map((expression) => getVariableDefinition(expression))
    .filter((definition): definition is NonNullable<Expression["definition"]> => Boolean(definition));
  const expressionDefinitions = [...definitions];
  const columns = new Map<NonNullable<Expression["definition"]>, TableColumn>();
  for (const table of tables) {
    for (const column of tableColumns(table)) {
      const definition: NonNullable<Expression["definition"]> = { target: column.target, source: "" };
      columns.set(definition, column);
      definitions.push(definition);
    }
  }
  for (const name of Object.keys(tableColumnErrors)) {
    if (Number.isNaN(sliderValues[name])) delete sliderValues[name];
  }
  tableColumnErrors = {};
  const definitionNames = new Set(definitions.map(({ target }) => target));
  type RegressionRecord = {
    expression: Expression;
    sides?: RegressionSides;
    parameters: string[];
    residualName?: string;
    members: NonNullable<Expression["definition"]>[];
    error?: string;
    done?: boolean;
  };
  const regressionRecords: RegressionRecord[] = [];
  const regressionMembers = new Map<NonNullable<Expression["definition"]>, RegressionRecord>();
  for (const expression of expressions) {
    if (!expression.text.includes("~")) continue;
    const record: RegressionRecord = { expression, parameters: [], members: [] };
    regressionRecords.push(record);
    try {
      record.sides = regressionSides(expandFunctions(expression.text));
      record.parameters = regressionParameters(record.sides!, new Set([...reserved, ...definitionNames]));
    } catch (reason) {
      record.error = reason instanceof Error ? reason.message : "Invalid regression.";
      continue;
    }
    const residualName = `e_${regressionRecords.length}`;
    if (!definitionNames.has(residualName)) record.residualName = residualName;
    for (const name of [...record.parameters, ...(record.residualName ? [record.residualName] : [])]) {
      const definition: NonNullable<Expression["definition"]> = { target: name, source: "" };
      record.members.push(definition);
      regressionMembers.set(definition, record);
      definitions.push(definition);
    }
  }
  for (const { target } of regressionMembers.keys()) definitionNames.add(target);
  collectionValues = {};
  pointValues = {};
  complexValues={};
  const counts = new Map<string, number>();
  for (const { target } of definitions) counts.set(target, (counts.get(target) ?? 0) + 1);
  for (const definition of definitions) {
    definition.value = undefined;
    definition.display = undefined;
    definition.error = counts.get(definition.target)! > 1
      ? `"${definition.target}" is defined more than once.`
      : expressions.some((expression) => distributionDefinition(expression.text)?.target === definition.target)
        ? `"${definition.target}" is already defined as a probability distribution.`
      : expressions.some((expression)=>inferenceDefinition(expression.text)?.target===definition.target)
        ? `"${definition.target}" is already defined as an inference object.`
      : functionStates.some(({ definition: fn }) => fn.name === definition.target)
        ? `"${definition.target}" is already defined as a function.`
        : undefined;
    if (columns.has(definition) && !definition.error) {
      try {
        validateTableColumnName(definition.target);
      } catch (reason) {
        definition.error = reason instanceof Error ? reason.message : "Invalid column name.";
      }
    }
  }

  const functionByExpression = new Map(
    functionStates.map((state) => [state.expression, state]),
  );
  const sources = expressions.flatMap((expression) => {
    const functionState = functionByExpression.get(expression);
    const functionDefinition=functionState?.definition;
    const expressionSource = functionState?.baseCase?functionState.baseCase.body:functionDefinition
      ? [functionDefinition.body,...(functionDefinition.baseCases??[]).map(base=>base.body)].join(" ").replace(/[a-z]+(?:_[a-z0-9]+)?/gi, (name) =>
        (functionDefinition.parameters ?? [functionDefinition.parameter]).includes(name.toLowerCase()) ? "" : name)
      : expression.text;
    return [
      expressionSource,
      expression.hsv?.hue ?? "",
      expression.hsv?.saturation ?? "",
      expression.hsv?.value ?? "",
      ...[...expression.label?.matchAll(/\$\{([^{}]+)\}/g) ?? []].map((match) => match[1]!),
      expression.labelX ?? "",
      expression.labelY ?? "",
      expression.clickAction ?? "",
    ];
  }).concat(tickers.map((ticker) => ticker.action),
    photos.flatMap((photo) => PHOTO_FIELDS.map(([key]) => photo[key])),
    [...columns.values()].flatMap((column) => column.sources));
  const sliderAnalysisKey = JSON.stringify([sources, [...definitionNames], [...reserved]]);
  if (sliderAnalysis?.key !== sliderAnalysisKey) {
    sliderAnalysis = {
      key: sliderAnalysisKey,
      names: [...new Set(sources.flatMap((source) => {
        const boundNames = new Set([...source.matchAll(/\b([a-z](?:_[a-z0-9]+)?)\s*=\s*\[/gi)].map((match) => match[1]!.toLowerCase()));
        return freeIdentifiers(source)
          .filter((name) => !boundNames.has(name.toLowerCase()));
      }).map((name) => name.toLowerCase()).filter((name) =>
        /^[a-z](?:_[a-z0-9]+)?$/.test(name) && !reserved.has(name) &&
        !definitionNames.has(name)))].sort(),
    };
  }
  const sliders = sliderAnalysis.names;
  for (const name of sliders) {
    sliderValues[name] ??= 1;
    sliderOptions[name] ??= { min: -10, max: 10, speed: 1 };
  }
  const byName = new Map(definitions.map((definition) => [definition.target, definition]));
  const state = new Map<string, "resolving" | "resolved" | "failed">();
  const availableNames = [...new Set([...sliders, ...definitionNames])];
  const resolveRegression = (record: RegressionRecord): void => {
    if (record.done) return;
    record.done = true;
    const fail = (message: string) => {
      record.error = message;
      for (const member of record.members) {
        member.error = message;
        state.set(member.target, "failed");
      }
    };
    const preexisting = record.members.find((member) => member.error);
    if (preexisting) {
      fail(preexisting.error!);
      return;
    }
    for (const member of record.members) state.set(member.target, "resolving");
    const sides = record.sides!;
    const memberNames = new Set(record.members.map(({ target }) => target));
    const references = [...new Set(freeIdentifiers(`${sides.left}+${sides.right}`)
      .map((name) => name.toLowerCase()).filter((name) => !memberNames.has(name)))];
    for (const name of references) {
      const dependency = byName.get(name);
      if (!dependency) continue;
      evaluateDefinition(dependency);
      if (dependency.error) {
        fail(dependency.error.startsWith("Circular definition")
          ? dependency.error : `Cannot fit regression because ${dependency.error}`);
        return;
      }
    }
    try {
      const key = JSON.stringify([sides, record.parameters,
        references.map((name) => [name, collectionValues[name], sliderValues[name]]),
        graphOptions.statisticsMode, graphOptions.angleMode]);
      let result = record.expression.regressionCache?.key === key ? record.expression.regressionCache.result : undefined;
      if (!result) {
        result = fitCustomRegression(sides, record.parameters, sliderValues, collectionValues, graphOptions.statisticsMode);
        record.expression.regressionCache = { key, result };
      }
      for (const member of record.members) {
        if (member.target === record.residualName) {
          collectionValues[member.target] = result.residuals.map((value) => `(${numericSource(value)})`);
          delete sliderValues[member.target];
          member.display = `[${result.residuals.map((value) => Number(value.toPrecision(10))).join(", ")}]`;
        } else {
          const value = result.parameters[member.target]!;
          member.value = value;
          member.display = `≈ ${Number(value.toPrecision(10))}`;
          sliderValues[member.target] = value;
        }
        state.set(member.target, "resolved");
      }
    } catch (reason) {
      fail(reason instanceof Error ? reason.message : "Could not fit regression.");
    }
  };
  const evaluateDefinition = (definition: NonNullable<Expression["definition"]>): void => {
    const currentState = state.get(definition.target);
    if (currentState === "resolved" || currentState === "failed") return;
    if (currentState === "resolving") {
      definition.error = `Circular definition involving "${definition.target}".`;
      state.set(definition.target, "failed");
      return;
    }
    if (definition.error) {
      state.set(definition.target, "failed");
      return;
    }
    const regressionRecord = regressionMembers.get(definition);
    if (regressionRecord) {
      resolveRegression(regressionRecord);
      return;
    }
    state.set(definition.target, "resolving");
    let expanded: string;
    try {
      expanded = columns.has(definition)
        ? columns.get(definition)!.sources.map((source, row) => expandFunctions(source, `${definition.target}:${row}`, false)).join("\n")
        : expandFunctions(definition.source, definition.target, false);
    } catch (reason) {
      definition.error = reason instanceof Error ? reason.message : "Could not expand definition.";
      state.set(definition.target, "failed");
      return;
    }
    const boundVariables = new Set([...expanded.matchAll(/\b([a-z](?:_[a-z0-9]+)?)\s*=\s*\[/gi)].map((match) => match[1]!.toLowerCase()));
    const referenceSource = expanded.replace(/([a-z](?:_[a-z0-9]+)?)\.[xy]\b/gi, "$1");
    const references = freeIdentifiers(referenceSource)
      .map((name) => name.toLowerCase());
    if (references.some((name) => ["x", "y", "t"].includes(name) && !boundVariables.has(name))) {
      definition.error = "Variable definitions must not depend on x, y, or t.";
      state.set(definition.target, "failed");
      return;
    }
    const unknown = references.find((name) => !reserved.has(name) && !boundVariables.has(name) && !availableNames.includes(name));
    if (unknown) {
      definition.error = `Unknown variable "${unknown}" in definition of "${definition.target}".`;
      state.set(definition.target, "failed");
      return;
    }
    for (const name of references) {
      const dependency = boundVariables.has(name) ? undefined : byName.get(name);
      if (dependency) {
        evaluateDefinition(dependency);
        if (dependency.error) {
          definition.error = dependency.error.startsWith("Circular definition")
            ? dependency.error
            : `Cannot evaluate "${definition.target}" because ${dependency.error}`;
          state.set(definition.target, "failed");
          return;
        }
      }
    }
    try {
      const column = columns.get(definition);
      if (column) {
        const rowColumns = tableColumns(column.table).filter((entry) =>
          entry.axis !== column.axis)
          .map((entry) => ({ target: entry.target, rows: new Map(entry.rows.map((row, index) => [row, index])) }));
        const values = evaluateTableColumn(column, (source, rowIndex) => {
          let rowSource = expandFunctions(source);
          for (const entry of rowColumns) {
            const index = entry.rows.get(column.rows[rowIndex]!);
            const value = index === undefined ? undefined : collectionValues[entry.target]?.[index];
            if (value !== undefined) rowSource = tableRowSource(rowSource, entry.target, value);
          }
          const expandedCell = expandCollections(rowSource,
            (item) => compileExpression(item, sliderValues)(0).value.toNumber(), collectionValues, graphOptions.statisticsMode);
          if (expandedCell.items.length !== 1) throw new Error("Each cell must produce one scalar number.");
          const graph = compileGraphExpression(expandedCell.items[0]!, sliderValues, graphOptions.statisticsMode);
          if (graph.kind !== "explicit") throw new Error("Each cell must produce one scalar number.");
          const result = graph.evaluate(0);
          return typeof result === "number" ? result : result.value.toNumber();
        });
        collectionValues[definition.target] = values;
        delete sliderValues[definition.target];
        state.set(definition.target, "resolved");
        return;
      }
      expanded = expandFunctions(definition.source, definition.target);
      const collection = expandCollections(expanded,
        (item) => compileExpression(item, sliderValues)(0).value.toNumber(), collectionValues, graphOptions.statisticsMode);
      const point = !collection.list ? pointSources(collection.items[0]!) : undefined;
      if (point) {
        const values = point.map((coordinate) =>{
          if(!graphOptions.complexMode)return compileExpression(coordinate, sliderValues)(0).value.toNumber();
          const value=compileComplexExpression(coordinate,sliderValues,complexValues)(0);
          if(value.im!==0)throw new Error("Point coordinates must be real; use real(z) or imag(z).");
          return value.re;
        });
        if (!values.every(Number.isFinite)) throw new Error("Point definitions require finite scalar coordinates.");
        pointValues[definition.target] = graphOptions.complexMode?[numericSource(values[0]!),numericSource(values[1]!)]:point;
        delete sliderValues[definition.target];
        definition.display = `(${values.join(", ")})`;
        state.set(definition.target, "resolved");
        return;
      }
      if (collection.list) {
        const display = collection.items.map((item) => {
          if(graphOptions.complexMode&&!pointSources(item))return formatComplex(compileComplexExpression(item,sliderValues,complexValues)(0));
          const graph = compileGraphExpression(item, sliderValues, graphOptions.statisticsMode);
          if (graph.kind === "point") {
            const point = graph.evaluate();
            if (!point.every(Number.isFinite)) throw new Error("List points require finite coordinates.");
            return `(${point.join(", ")})`;
          }
          if (graph.kind !== "explicit") throw new Error("List definitions require scalar numbers or points.");
          const result = graph.evaluate(0);
          const value = typeof result === "number" ? result : result.value.toNumber();
          if (!Number.isFinite(value)) throw new Error("List values must be finite.");
          return String(value);
        });
        collectionValues[definition.target] = collection.items;
        delete sliderValues[definition.target];
        definition.display = `[${display.join(", ")}]`;
        state.set(definition.target, "resolved");
        return;
      }
      expanded = collection.items[0]!;
      if(graphOptions.complexMode){
        const value=compileComplexExpression(expanded,sliderValues,complexValues)(0);
        complexValues[definition.target]=value;
        definition.display=`≈ ${formatComplex(value)}`;
        if(value.im===0){definition.value=value.re;sliderValues[definition.target]=value.re;}
        else delete sliderValues[definition.target];
        state.set(definition.target,"resolved");return;
      }
      const evaluatorKey = `${expanded}\u0000${availableNames.join(",")}\u0000${graphOptions.statisticsMode}`;
      if (definition.evaluatorKey !== evaluatorKey || !definition.evaluator) {
        definition.evaluatorKey = evaluatorKey;
        const graph = compileGraphExpression(expanded, sliderValues, graphOptions.statisticsMode);
        if (graph.kind !== "explicit") throw new Error("Definitions require scalar numbers, lists, or points.");
        definition.evaluator = graph.evaluate;
      }
      const result = definition.evaluator(0);
      const value = typeof result === "number" ? result : result.value.toNumber();
      if (!Number.isFinite(value)) throw new Error("Definition must produce a finite number.");
      definition.value = value;
      definition.display = typeof result === "number" ? `≈ ${Number(value.toPrecision(15))}` : result.value.toString();
      sliderValues[definition.target] = value;
      state.set(definition.target, "resolved");
    } catch (reason) {
      definition.error = reason instanceof Error ? reason.message : "Could not evaluate definition.";
      state.set(definition.target, "failed");
    }
  };
  for (const definition of definitions) evaluateDefinition(definition);
  for (const record of regressionRecords) {
    if (!record.error && !record.members.length) record.error = "Regressions need at least one unknown parameter.";
    const result = record.error ? undefined : record.expression.regressionCache?.result;
    const parameters = result ? record.parameters.map((name) =>
      `${name} = ${Number(result.parameters[name]!.toPrecision(6))}`).join(", ") : "";
    const summary = result
      ? `≈ ${parameters} · R² ${Number(result.rSquared.toPrecision(6))}${record.residualName ? ` · residuals ${record.residualName}` : ""}${result.converged ? "" : " · did not fully converge"}`
      : undefined;
    const graph = result?.graphSource;
    const expression = record.expression;
    if (expression.regressionError !== record.error || expression.regressionSummary !== summary ||
        expression.regressionGraph !== graph) {
      expression.regressionError = record.error;
      expression.regressionSummary = summary;
      expression.regressionGraph = graph;
      expression.parsedText = undefined;
    }
  }
  for (const definition of definitions) {
    if (definition.error) {
      if (columns.has(definition)) {
        if (/^[a-z](?:_[a-z0-9]+)?$/.test(definition.target) && !reserved.has(definition.target)) {
          tableColumnErrors[definition.target] = definition.error;
          sliderValues[definition.target] = Number.NaN;
        }
      } else {
        sliderValues[definition.target] = Number.NaN;
      }
    }
  }

  for (const table of tables) {
    const entries = [...columns].filter(([, column]) => column.table === table);
    const columnErrors = entries.map(([definition]) => definition.error);
    const error = [...new Set(columnErrors.filter(Boolean))].join("\n") || undefined;
    const primaryError = columnErrors.slice(0, 2).filter(Boolean).join("\n") || undefined;
    const read = (index: number) => columnErrors[index] ? []
      : (collectionValues[entries[index]![1].target] ?? []).map((item) => Number(item.slice(1, -1)));
    const x = primaryError ? [] : read(0);
    const y = primaryError ? [] : read(1);
    const baseRows = entries[0]![1].rows;
    const extra = entries.slice(2).map(([, column], index) => {
      const numbers = read(index + 2);
      const byRow = new Map(column.rows.map((row, position) => [row, numbers[position]]));
      return baseRows.map((row) => byRow.get(row));
    });
    const values: TableValues = { x, y, extra, columnErrors, primaryError, error };
    const previous = tableValuesCache.get(table);
    if (JSON.stringify(previous) !== JSON.stringify(values)) {
      table.regressionKey = undefined;
      tableRevisions.set(table, nextTableRevision++);
    }
    tableValuesCache.set(table, values);
    if (updateTableDisplay) updateTableFormulaDisplay(table);
  }

  for (const expression of expressions) {
    const definition = getVariableDefinition(expression);
    if (!definition) continue;
    expression.compileError = definition.error;
    if (!Object.hasOwn(pointValues, definition.target)) expression.compiled = undefined;
    const error = workspaceList.querySelector<HTMLElement>(
      `[data-expression-error-id="${expression.id}"]`,
    );
    if (error) {
      error.textContent = definition.error ?? "";
      const input = error.parentElement?.querySelector<HTMLInputElement>(
        `input[aria-label^="Expression "]`,
      );
      if (input) input.setAttribute("aria-invalid", String(Boolean(definition.error)));
    }
  }
  for (const element of sliderList.querySelectorAll<HTMLElement>("[data-slider-definition]")) {
    const definition = byName.get(element.dataset.sliderDefinition ?? "");
    if (definition) {
      element.textContent = definition.error
        ? `${definition.target} = invalid`
        : `${definition.target} = ${definition.display}`;
      element.title = definition.error ?? "";
      if (definition.error) {
        element.setAttribute("aria-label", `${definition.target} definition error: ${definition.error}`);
      } else {
        element.removeAttribute("aria-label");
      }
    }
  }
  const result = { definitions: expressionDefinitions, sliders };
  variableDefinitionCache = { key: variableDefinitionSignature(), expressions, tables, result };
  return result;
}

function cachedExplicitEvaluator(
  expression: Expression,
  evaluate: (x: number) => number,
): (x: number) => number {
  // Native fast-mode samples cost less than cache maintenance on dense changing views.
  if (graphMode === "desmos") {
    if (!performanceProfile.enabled) return evaluate;
    return (x) => {
      performanceProfile.evaluationCount += 1;
      performanceProfile.cacheBypasses += 1;
      return evaluate(x);
    };
  }
  const source = expandFunctions(expression.text);
  const sliderSignature = graphVariableSignature(source);
  const key = `${graphMode}:${graphSettings.precisionDigits}:${getAngleMode()}\u0000${source}\u0000${sliderSignature}\u0000${collectionSignature(source)}`;
  let cache = explicitEvaluationCaches.get(expression);
  if (!cache || cache.key !== key) {
    cache = { key, values: new BoundedCache(MAX_EXPRESSION_SAMPLE_CACHE_SIZE) };
    explicitEvaluationCaches.set(expression, cache);
  }
  const values = cache.values;
  return (x: number) => {
    if (!performanceProfile.cacheEnabled) {
      if (performanceProfile.enabled) {
        performanceProfile.cacheMisses += 1;
        performanceProfile.evaluationCount += 1;
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
      values.set(x, { value });
      return value;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not evaluate expression";
      values.set(x, { error: message });
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
  return synchronizeVariableDefinitions().sliders;
}

function renderSliders(): void {
  sliderList.replaceChildren();
  const { definitions, sliders: names } = synchronizeVariableDefinitions();
  for (const name of sliderAnimations.keys()) {
    if (!names.includes(name)) stopSliderAnimation(name);
  }
  if (names.length === 0 && definitions.length === 0) {
    sliderList.hidden = true;
    return;
  }
  sliderList.hidden = false;
  const heading = document.createElement("h2");
  heading.textContent = "Sliders";
  const help = document.createElement("p");
  help.className = "slider-help";
  help.textContent = names.length > 0
    ? "Choose bounce, repeat, play once, or continuous playback. Continuous playback ignores bounds."
    : "These parameter values are defined by expressions.";
  sliderList.append(heading, help);
  for (const definition of definitions) {
    const fixedValue = document.createElement("div");
    fixedValue.className = "slider-definition";
    fixedValue.dataset.sliderDefinition = definition.target;
    fixedValue.textContent = definition.error
      ? `${definition.target} = invalid`
      : `${definition.target} = ${definition.display}`;
    if (definition.error) {
      fixedValue.title = definition.error;
      fixedValue.setAttribute("aria-label", `${definition.target} definition error: ${definition.error}`);
    }
    sliderList.append(fixedValue);
  }
  for (const name of names) {
    sliderValues[name] ??= 1;
    sliderOptions[name] ??= { min: -10, max: 10, speed: 1 };
    const options = sliderOptions[name]!;
    if (options.mode !== "continuous" && (sliderValues[name]! < options.min || sliderValues[name]! > options.max)) {
      sliderValues[name] = Math.min(options.max, Math.max(options.min, sliderValues[name]!));
    }
    const row = document.createElement("label");
    row.className = "slider-row";
    const title = document.createElement("span");
    title.className = "slider-name";
    title.title = name;
    const titleText = document.createElement("span");
    titleText.className = "slider-name-text";
    titleText.textContent = name;
    title.append(titleText);
    const range = document.createElement("input");
    range.type = "range";
    range.min = String(options.min);
    range.max = String(options.max);
    range.step = "any";
    range.value = String(sliderValues[name]);
    range.setAttribute("aria-label", `Slider ${name}`);
    const number = document.createElement("input");
    number.type = "number";
    if (options.mode !== "continuous") { number.min = String(options.min); number.max = String(options.max); }
    number.step = "any";
    number.value = String(sliderValues[name]);
    number.setAttribute("aria-label", `Slider ${name} value`);
    const update = (value: string) => {
      const parsed = Number(value);
      if (!value.trim()||!Number.isFinite(parsed)) {number.setAttribute("aria-invalid","true");setProjectStatus("Slider value must be finite.");return;}
      number.removeAttribute("aria-invalid");
      sliderValues[name] = options.mode === "continuous" ? parsed : Math.min(options.max, Math.max(options.min, parsed));
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
    const isPlaying = sliderAnimations.has(name);
    play.textContent = isPlaying ? "Pause" : "Play";
    play.setAttribute("aria-label", `${isPlaying ? "Pause" : "Play"} slider ${name}`);
    play.setAttribute("aria-pressed", String(isPlaying));
    play.addEventListener("click", () => {
      if (sliderAnimations.has(name)) {
        stopSliderAnimation(name);
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
        setProjectStatus("Slider bounds must increase within +/-1000000; speed must be greater than 0 and at most 100.");
        return;
      }
      minInput.removeAttribute("aria-invalid");
      maxInput.removeAttribute("aria-invalid");
      speedInput.removeAttribute("aria-invalid");
      options.min = min;
      options.max = max;
      options.speed = speed;
      if(options.mode!=="continuous")sliderValues[name] = Math.min(max, Math.max(min, sliderValues[name]!));
      range.min = String(min);
      range.max = String(max);
      range.value = String(sliderValues[name]);
      if(options.mode!=="continuous"){number.min = String(min);number.max = String(max);}
      number.value = String(sliderValues[name]);
      scheduleDraw();
      scheduleProjectSave();
    };
    minInput.addEventListener("change", updateOptions);
    maxInput.addEventListener("change", updateOptions);
    speedInput.addEventListener("change", updateOptions);
    row.append(title, play, range, number);
    sliderList.append(row);
    const nameOverflow = titleText.scrollWidth - title.clientWidth;
    if (nameOverflow > 0) {
      title.style.setProperty("--slider-name-shift", `${-nameOverflow}px`);
      title.classList.add("slider-name-overflow");
    }
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
    const modeRow = document.createElement("label");
    modeRow.className = "slider-mode-row";
    modeRow.textContent = "Playback ";
    const mode = document.createElement("select");
    mode.setAttribute("aria-label", `Slider ${name} playback mode`);
    for (const [value, label] of [["bounce","Back and forth"],["repeat","Repeat forward"],["once","Play once"],["continuous","Continuous forward"]] as const) {
      const option = document.createElement("option"); option.value = value; option.textContent = label; mode.append(option);
    }
    mode.value = options.mode ?? "bounce";
    mode.addEventListener("change", () => {
      stopSliderAnimation(name); options.mode = mode.value as PlaybackMode;
      renderSliders(); refreshDropdowns(); scheduleProjectSave();
    });
    modeRow.append(mode); sliderList.append(modeRow);
  }
  refreshDropdowns();
}

function stopSliderAnimation(name?: string): void {
  const wasAnimating = sliderAnimations.size > 0;
  if (name !== undefined) {
    sliderAnimations.delete(name);
  } else {
    sliderAnimations.clear();
  }
  if (sliderAnimations.size === 0 && sliderAnimationTimer !== undefined) {
    window.clearInterval(sliderAnimationTimer);
    sliderAnimationTimer = undefined;
  }
  if (wasAnimating && sliderAnimations.size === 0 && runningTickers.size === 0) {
    captureProjectHistory();
    if (!saveProjectLocally()) scheduleProjectSave(false);
    scheduleRefinement();
  }
}

function startSliderAnimation(name: string): void {
  const options = sliderOptions[name];
  if (!options) return;
  cancelRefinement();
  if (sliderAnimations.size === 0) flushPendingHistory();
  if ((options.mode === "once" || options.mode === "repeat") && sliderValues[name]! >= options.max) sliderValues[name] = options.min;
  sliderAnimations.set(name, { direction: 1, lastTime: performance.now() });
  if (sliderAnimationTimer !== undefined) return;
  sliderAnimationTimer = window.setInterval(() => {
    const now = performance.now();
    let updated = false;
    for (const [sliderName, animation] of sliderAnimations) {
      const activeOptions = sliderOptions[sliderName];
      if (!activeOptions) {
        sliderAnimations.delete(sliderName);
        continue;
      }
      const elapsedSeconds = Math.min(0.25, Math.max(0, now - animation.lastTime) / 1000);
      animation.lastTime = now;
      let next: ReturnType<typeof advanceSlider>;
      try { next = advanceSlider(sliderValues[sliderName]!, animation.direction, elapsedSeconds, activeOptions); }
      catch (reason) { stopSliderAnimation(sliderName); setProjectStatus(reason instanceof Error ? reason.message : "Slider playback failed."); renderSliders(); continue; }
      const value = next.value;
      animation.direction = next.direction;
      sliderValues[sliderName] = value;
      const number = sliderList.querySelector<HTMLInputElement>(
        `[aria-label="Slider ${sliderName} value"]`,
      );
      const range = sliderList.querySelector<HTMLInputElement>(
        `[aria-label="Slider ${sliderName}"]`,
      );
      if (number) number.value = String(Number(value.toPrecision(8)));
      if (range) range.value = String(value);
      if (next.complete) { stopSliderAnimation(sliderName); renderSliders(); }
      updated = true;
    }
    if (updated) draw();
    if (sliderAnimations.size === 0) {
      stopSliderAnimation();
      renderSliders();
    }
  }, 30);
}

function stopTicker(id: number, save = true): void {
  const runtime = runningTickers.get(id);
  if (!runtime) return;
  window.clearInterval(runtime.timer);
  runningTickers.delete(id);
  if (runningTickers.size === 0) {
    if (save) {
      captureProjectHistory();
      scheduleProjectSave();
    }
    scheduleRefinement();
  }
}

function stopAllTickers(save = true): void {
  for (const id of [...runningTickers.keys()]) stopTicker(id, save);
}

function isActionExpression(source: string): boolean {
  return /(?:->|→)/.test(source) || expressions.some((expression) =>
    actionDefinition(expression.text)?.target === source.trim().toLowerCase());
}

function prepareActionUpdates(source: string, dt = 0): ActionUpdate[] {
  synchronizeVariableDefinitions(false);
  const definitions = expressions.flatMap((expression) => {
    const definition = actionDefinition(expression.text);
    return definition ? [definition] : [];
  });
  const body = actionDefinition(source)?.source ?? source;
  const expanded = expandActions(body, definitions);
  const columns = new Set(tables.flatMap((table) => tableColumns(table).map((column) => column.target)));
  const available = new Set([
    ...Object.keys(sliderValues).filter((name) => Number.isFinite(sliderValues[name]) && !columns.has(name)),
    ...Object.keys(collectionValues).filter((name) => !columns.has(name)),
    ...Object.keys(pointValues),
  ]);
  const values = { ...sliderValues, dt };
  const lists = { ...collectionValues };
  const updates = evaluateActions(expanded,
    (text) => compileExpression(text, values)(0).value.toNumber(), available, lists, graphOptions.statisticsMode,
    (source)=>expandFunctions(source));
  for (const update of updates) {
    const definition = expressions.find((expression) => getVariableDefinition(expression)?.target === update.target);
    if ((update.list||update.points) && !definition) throw new Error("Point/list actions require a named expression definition.");
    const text = actionUpdateSource(update);
    if (definition && text.length > 512) throw new Error(`Updated definition "${update.target}" exceeds the 512-character workspace expression limit.`);
  }
  return updates;
}

function applyActionUpdates(updates: ActionUpdate[], recordHistory = true): void {
  if (recordHistory) flushPendingHistory();
  for (const update of updates) {
    const expression = expressions.find((expression) => getVariableDefinition(expression)?.target === update.target);
    if (expression) {
      expression.text = actionUpdateSource(update);
      const input = workspaceList.querySelector<HTMLElement>(`[data-expression-error-id="${expression.id}"]`)?.parentElement?.querySelector<HTMLInputElement>('input[aria-label^="Expression "]');
      if (input) input.value = expression.text;
    } else sliderValues[update.target] = update.values[0]!;
  }
  variableDefinitionCache = undefined;
  renderSliders();
  scheduleDraw();
  if (recordHistory) scheduleProjectSave();
}

function startTicker(ticker: Ticker): void {
  if (runningTickers.has(ticker.id)) return;
  cancelRefinement();
  for (const name of sliderNames()) sliderValues[name] ??= 1;
  renderSliders();
  let action: () => void;
  try {
    if (/(?:->|→)/.test(ticker.action) || isActionExpression(ticker.action)) {
      prepareActionUpdates(ticker.action, ticker.intervalMs);
      action = () => applyActionUpdates(prepareActionUpdates(ticker.action, ticker.intervalMs), false);
    } else {
      const legacy = compileTickerAction(expandFunctions(ticker.action), sliderValues);
      if (expressions.some((expression) => getVariableDefinition(expression)?.target === legacy.target)) {
        throw new Error(`"${legacy.target}" is defined by an expression; use "${legacy.target} -> ..." to update it.`);
      }
      action = () => {
        sliderValues[legacy.target] = legacy.evaluate();
        updateSliderInputValues(legacy.target);
      };
    }
  } catch (reason) {
    ticker.error = reason instanceof Error ? reason.message : "Could not start ticker.";
    renderTickers();
    return;
  }
  if (ticker.runMode === "count" &&
      (!Number.isInteger(ticker.tickCount) || ticker.tickCount < 1 || ticker.tickCount > 1_000_000)) {
    ticker.error = "Tick count must be between 1 and 1,000,000.";
    renderTickers();
    return;
  }
  if (runningTickers.size === 0 && sliderAnimations.size === 0) flushPendingHistory();
  ticker.error = undefined;
  const runtime: RunningTicker = {
    timer: 0,
    remainingTicks: ticker.runMode === "count" ? ticker.tickCount : undefined,
  };
  runtime.timer = window.setInterval(() => {
    try {
      action();
      scheduleDraw();
      if (runtime.remainingTicks !== undefined) {
        runtime.remainingTicks -= 1;
        if (runtime.remainingTicks <= 0) {
          stopTicker(ticker.id);
          renderTickers();
        }
      }
    } catch (reason) {
      ticker.error = reason instanceof Error ? reason.message : "Ticker action failed.";
      stopTicker(ticker.id);
      renderTickers();
    }
  }, ticker.intervalMs);
  runningTickers.set(ticker.id, runtime);
  renderTickers();
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
    ...tickers.map(({ id, folderId }) =>
      ({ type: "ticker" as const, id, folderId })),
    ...photos.map(({ id, folderId }) =>
      ({ type: "photo" as const, id, folderId })),
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
    } else if (item.type === "ticker") {
      const ticker = tickers.find((entry) => entry.id === item.id);
      if (ticker) ticker.folderId = item.folderId;
    } else if (item.type === "photo") {
      const photo = photos.find((entry) => entry.id === item.id);
      if (photo) photo.folderId = item.folderId;
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
  for (const staging of [expressionList, tableList, textList, tickerList, photoList]) {
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
        tickers = tickers.map((ticker) =>
          ticker.folderId === folder.id ? { ...ticker, folderId: undefined } : ticker);
        for (const photo of photos) {
          if (photo.folderId === folder.id) photo.folderId = undefined;
        }
        folders = folders.filter((entry) => entry.id !== folder.id);
        renderTextBlocks();
        renderTickers();
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
  refreshDropdowns();
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
    scheduleDraw();
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
  } else if (source.type === "text") {
    const textBlock = textBlocks.find((entry) => entry.id === source.id);
    if (textBlock) textBlock.folderId = validFolderId;
  } else if (source.type === "photo") {
    const photo = photos.find((entry) => entry.id === source.id);
    if (photo) photo.folderId = validFolderId;
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
  scheduleDraw();
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
    const isPointExpression = getCompiled(expression)?.kind === "point";
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
    for (const [title, selected, options, update] of [
      ["Line style", expression.lineStyle ?? "solid", ["solid", "dashed", "dotted"], (value: string) => {
        if (value === "solid" || value === "dashed" || value === "dotted") expression.lineStyle = value;
        else throw new Error("Invalid line style.");
      }],
      ["Point style", expression.pointStyle ?? "filled", ["filled", "open", "cross"], (value: string) => {
        if (value === "filled" || value === "open" || value === "cross") expression.pointStyle = value;
        else throw new Error("Invalid point style.");
      }],
    ] as const) {
      const label = document.createElement("label");
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Expression ${index + 1} ${title}`);
      for (const value of options) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value[0]!.toUpperCase() + value.slice(1);
        select.append(option);
      }
      select.value = selected;
      select.addEventListener("change", () => { update(select.value); scheduleDraw(); scheduleProjectSave(); });
      label.append(document.createTextNode(title), select);
      appearanceControls.append(label);
    }
    const pointSizeControl = document.createElement("label");
    const pointSize = document.createElement("input");
    pointSize.type = "range";
    pointSize.min = "2"; pointSize.max = "12"; pointSize.step = "0.5";
    pointSize.value = String(expression.pointSize ?? (/^\s*\[/.test(expression.text) ? 4 : 6));
    pointSize.setAttribute("aria-label", `Expression ${index + 1} point radius`);
    const pointSizeValue = document.createElement("output");
    pointSizeValue.textContent = `${pointSize.value}px`;
    pointSize.addEventListener("input", () => {
      expression.pointSize = Number(pointSize.value);
      pointSizeValue.textContent = `${pointSize.value}px`;
      scheduleDraw(); scheduleProjectSave();
    });
    pointSizeControl.className = "appearance-range-control";
    pointSizeControl.append(document.createTextNode("Point radius"), pointSize, pointSizeValue);
    appearanceControls.append(pointSizeControl);
    const clickActionControl = document.createElement("label");
    const clickAction = document.createElement("input");
    clickAction.type = "text";
    clickAction.maxLength = 512;
    clickAction.value = expression.clickAction ?? "";
    clickAction.placeholder = "Optional: a -> a+1";
    clickAction.setAttribute("aria-label", `Expression ${index + 1} click action`);
    clickAction.addEventListener("input", () => {
      expression.clickAction = clickAction.value.trim() || undefined;
      renderSliders(); scheduleProjectSave();
    });
    clickActionControl.append(document.createTextNode("Click action"), clickAction);
    appearanceControls.append(clickActionControl);
    const input = document.createElement("input");
    input.type = "text";
    input.value = expression.text;
    input.maxLength = 512;
    input.dataset.functionAutocomplete = "";
    input.dataset.mathKeypad = "";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", `Expression ${index + 1}`);
    const error = document.createElement("p");
    error.className = "expression-error";
    error.dataset.expressionErrorId = String(expression.id);
    const result = document.createElement("output");
    result.className = "expression-result";
    result.dataset.expressionResultId = String(expression.id);
    result.setAttribute("aria-label", `Expression ${index + 1} result`);
    result.setAttribute("aria-live", "polite");
    result.hidden = true;
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
      if(isTone(expression.text)||enabledTones.has(expression.id)||pendingTones.has(expression.id))void playExpressionTone(expression);
      scheduleDraw();
      return;
    });
    let statisticalControls: HTMLDivElement | undefined;
    let updatingStatisticalOption = false;
    const renderStatisticalControls = (): void => {
      if (updatingStatisticalOption) return;
      statisticalControls?.remove();
      statisticalControls = undefined;
      const plot = statisticalPlotCall(expression.text);
      if (!plot || plot.name === "stats") return;
      const controls = document.createElement("div");
      statisticalControls = controls;
      controls.className = "statistical-plot-controls";
      const updateOption = (index: number, value: string): void => {
        const current = statisticalPlotCall(input.value);
        if (!current) return;
        const args = [...current.args];
        while (args.length <= index) args.push(args.length === 1 ? "1" : current.name === "boxplot" && args.length === 2 ? "1" : "0");
        args[index] = value;
        const updated = `${current.name}(${args.join(", ")})`;
        if (updated.length > input.maxLength) {
          setProjectStatus(`Expression is too long; use at most ${input.maxLength} characters.`);
          return;
        }
        input.value = updated;
        updatingStatisticalOption = true;
        try {
          input.dispatchEvent(new Event("input", { bubbles: true }));
        } finally {
          updatingStatisticalOption = false;
        }
      };
      const field = (labelText: string, argument: number, defaultValue: string): void => {
        const label = document.createElement("label");
        const field = document.createElement("input");
        field.type = "text";
        field.maxLength = 128;
        field.value = plot.args[argument] ?? defaultValue;
        field.setAttribute("aria-label", `Expression ${index + 1} ${labelText}`);
        field.addEventListener("change", () => updateOption(argument, field.value));
        label.append(document.createTextNode(labelText), field);
        controls.append(label);
      };
      const select = (labelText: string, argument: number, choices: string[]): void => {
        const label = document.createElement("label");
        const field = document.createElement("select");
        field.setAttribute("aria-label", `Expression ${index + 1} ${labelText}`);
        choices.forEach((text, value) => {
          const option = document.createElement("option");
          option.value = String(value);
          option.textContent = text;
          field.append(option);
        });
        const value = plot.args[argument]?.trim() ?? "0";
        if (!choices.some((_, index) => String(index) === value)) {
          const custom = document.createElement("option");
          custom.value = value;
          custom.textContent = `From expression: ${value}`;
          field.append(custom);
        }
        field.value = value;
        field.addEventListener("change", () => updateOption(argument, field.value));
        label.append(document.createTextNode(labelText), field);
        controls.append(label);
      };
      if (plot.name === "boxplot") {
        field("Vertical offset", 1, "1");
        field("Box height", 2, "1");
        select("Outliers", 3, ["Include in whiskers", "Separate outlier points"]);
      } else {
        field("Bin width", 1, "1");
        if (plot.name === "histogram") {
          select("Bar height", 2, ["Count", "Relative", "Density"]);
          select("Bin alignment", 3, ["Centered", "Left"]);
        } else select("Dot positions", 2, ["Exact", "Binned"]);
      }
      appearanceControls.append(controls);
      if (controls.isConnected) refreshDropdowns();
    };
    renderStatisticalControls();
    input.addEventListener("input", renderStatisticalControls);
    let inferenceControls: HTMLDivElement | undefined;
    let updatingInferenceOption = false;
    const renderInferenceControls = (): void => {
      if (updatingInferenceOption) return;
      inferenceControls?.remove();
      inferenceControls = undefined;
      let call: ReturnType<typeof inferenceCall>;
      try { call = inferenceCall(expression.text); }
      catch (reason) {
        error.textContent = reason instanceof Error ? reason.message : "Invalid inference options.";
        input.setAttribute("aria-invalid", "true");
        return;
      }
      if (!call || call.property) return;
      const controls = document.createElement("div");
      controls.className = "statistical-plot-controls";
      inferenceControls = controls;
      const nullInput = document.createElement("input");
      nullInput.type = "text";
      nullInput.value = call.nullSource ?? (call.name === "zproptest" && call.args.length === 2 ? "0.5" : "0");
      nullInput.maxLength = 128;
      const confidence = document.createElement("input");
      confidence.type = "text";
      confidence.value = call.levelSource ?? "0.95";
      confidence.maxLength = 128;
      const tails = document.createElement("select");
      for (const [value, text] of [["0", "Two-sided"], ["-1", "Left tail"], ["1", "Right tail"]]) {
        const option = document.createElement("option");
        option.value = value!;
        option.textContent = text!;
        tails.append(option);
      }
      const tailValue = call.tailsSource ?? (call.name.startsWith("chisq") ? "1" : "0");
      if (!["-1", "0", "1"].includes(tailValue)) {
        const custom = document.createElement("option");
        custom.value = tailValue;
        custom.textContent = `From expression: ${tailValue}`;
        tails.append(custom);
      }
      tails.value = tailValue;
      for (const [text, field] of [["Null hypothesis", nullInput], ["Alternative hypothesis", tails], ["Confidence level", confidence]] as const) {
        const label = document.createElement("label");
        field.setAttribute("aria-label", `Expression ${index + 1} ${text}`);
        label.append(document.createTextNode(text), field);
        controls.append(label);
      }
      nullInput.disabled = call.name.startsWith("chisq");
      tails.disabled = call.name.startsWith("chisq");
      confidence.disabled = call.name.startsWith("chisq");
      const update = (): void => {
        const current = inferenceCall(input.value);
        if (!current) return;
        const value = `${current.name}(${current.args.join(", ")}).test(${nullInput.value}, ${tails.value}, ${confidence.value})`;
        if (value.length > input.maxLength) {
          setProjectStatus(`Expression is too long; use at most ${input.maxLength} characters.`);
          return;
        }
        input.value = value;
        updatingInferenceOption = true;
        try { input.dispatchEvent(new Event("input", { bubbles: true })); }
        finally { updatingInferenceOption = false; }
      };
      for (const field of [nullInput, tails, confidence]) field.addEventListener("change", update);
      appearanceControls.append(controls);
      if (controls.isConnected) refreshDropdowns();
    };
    renderInferenceControls();
    input.addEventListener("input", renderInferenceControls);
    let probabilityControls: HTMLDivElement | undefined;
    const renderProbabilityControls = (): void => {
      probabilityControls?.remove();
      probabilityControls = undefined;
      const definition = distributionDefinition(expression.text);
      const call = distributionCall(definition?.source ?? expression.text);
      if (!call || (!definition && expression.text.slice(call.end).trim())) return;
      const body = definition?.target ?? expression.text;
      const controls = document.createElement("div");
      controls.className = "statistical-plot-controls";
      probabilityControls = controls;
      const field = (text: string, value: string) => {
        const label = document.createElement("label");
        const field = document.createElement("input");
        field.type = "text";
        field.maxLength = 128;
        field.value = value;
        field.setAttribute("aria-label", `Expression ${index + 1} ${text}`);
        label.append(document.createTextNode(text), field);
        controls.append(label);
        return field;
      };
      const lower = field("Probability lower bound", "-1");
      const upper = field("Probability upper bound", "1");
      const shade = document.createElement("button");
      shade.type = "button";
      shade.textContent = "Shade and calculate probability";
      shade.addEventListener("click", () => {
        try {
          const expanded = expandFunctions(body);
          const distribution = readDistribution(expanded,
            (text) => compileExpression(text, sliderValues)(0).value.toNumber(), collectionValues, graphOptions.statisticsMode);
          const lo = compileExpression(expandFunctions(lower.value), sliderValues)(0).value.toNumber();
          const hi = compileExpression(expandFunctions(upper.value), sliderValues)(0).value.toNumber();
          if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) throw new Error("Probability bounds must be finite and lower <= upper.");
          compileExpression(expandFunctions(`${body}.cdf(${lower.value},${upper.value})`), sliderValues)(0);
          if (distribution.discrete) {
            addExpression(`${body}.pdf(x){${lower.value}<=x<=${upper.value}}`);
          } else addExpression(`y<=${body}.pdf(x){y>=0}{${lower.value}<=x<=${upper.value}}`);
          addExpression(`${body}.cdf(${lower.value},${upper.value})`);
          setProjectStatus(distribution.discrete ? "Discrete interval masses plotted and probability calculated." : "Probability interval shaded and calculated.");
        } catch (reason) {
          setProjectStatus(reason instanceof Error ? reason.message : "Could not calculate the probability interval.");
        }
      });
      controls.append(shade);
      const count = field("Sample size", "10");
      const sample = document.createElement("button");
      sample.type = "button";
      sample.textContent = "Add random sample";
      sample.addEventListener("click", () => {
        try {
          const source = `${body}.random(${count.value})`;
          expandCollections(expandFunctions(source), (text) => compileExpression(text, sliderValues)(0).value.toNumber(),
            collectionValues, graphOptions.statisticsMode);
          addExpression(source);
        } catch (reason) {
          setProjectStatus(reason instanceof Error ? reason.message : "Could not sample the distribution.");
        }
      });
      controls.append(sample);
      appearanceControls.append(controls);
    };
    renderProbabilityControls();
    input.addEventListener("input", renderProbabilityControls);
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.className = "visibility-button";
    visibility.textContent = expression.hidden ? "○" : "●";
    visibility.setAttribute("aria-label", `${expression.hidden ? "Show" : "Hide"} expression ${index + 1}`);
    visibility.addEventListener("click", () => {
      expression.hidden = !expression.hidden;
      if(!expression.hidden&&isTone(expression.text))void playExpressionTone(expression);
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
    appearanceDetails.append(appearanceControls);
    if (isPointExpression) {
      const draggableControl = document.createElement("label");
      draggableControl.className = "draggable-point-control";
      const draggableInput = document.createElement("input");
      draggableInput.type = "checkbox";
      draggableInput.checked = expression.draggable !== false;
      draggableInput.setAttribute("aria-label", `Enable dragging expression ${index + 1} point`);
      draggableInput.addEventListener("change", () => {
        expression.draggable = draggableInput.checked;
        scheduleDraw();
        scheduleProjectSave();
      });
      draggableControl.append(draggableInput, document.createTextNode("Allow dragging point"));
      appearanceDetails.append(draggableControl);
    }
    appearanceDetails.append(hsvControls);
    const labelControls = document.createElement("div");
    labelControls.className = "appearance-hsv-control";
    const labelHelp = document.createElement("small");
    labelHelp.textContent = "Persistent graph label. Use ${a} for live values. Optional X/Y formulas position the label; x and y refer to its default anchor.";
    const labelError = document.createElement("p");
    labelError.className = "color-formula-error";
    labelError.dataset.labelErrorId = String(expression.id);
    for (const [key, title] of [["label", "Label"], ["labelX", "Label X"], ["labelY", "Label Y"]] as const) {
      const control = document.createElement("label");
      const field = document.createElement("input");
      field.type = "text";
      field.maxLength = 512;
      field.dataset.labelField = key;
      field.value = expression[key] ?? "";
      field.setAttribute("aria-label", `Expression ${index + 1} ${title}`);
      field.addEventListener("input", () => {
        expression[key] = field.value || undefined;
        expression.labelError = undefined;
        labelError.textContent = "";
        renderSliders();
        scheduleDraw();
        scheduleProjectSave();
      });
      control.append(document.createTextNode(title), field);
      labelControls.append(control);
    }
    labelControls.append(labelHelp, labelError);
    appearanceDetails.append(labelControls);
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "expression-action";
    actionButton.textContent = "Run action";
    actionButton.setAttribute("aria-label", `Run expression ${index + 1} action`);
    const updateClickActionButton = () => {
      actionButton.hidden = !isActionExpression(expression.text) && !expression.clickAction;
      actionButton.textContent = isActionExpression(expression.text) ? "Run action" : "Run click action";
    };
    updateClickActionButton();
    input.addEventListener("input", updateClickActionButton);
    clickAction.addEventListener("input", updateClickActionButton);
    actionButton.addEventListener("click", () => {
      try {
        applyActionUpdates(prepareActionUpdates(isActionExpression(expression.text) ? expression.text : expression.clickAction ?? ""));
        expression.evaluationError = undefined;
        updateExpressionErrorDisplay(expression);
        setProjectStatus("Action applied; all assignments used the previous state.");
      } catch (reason) {
        expression.evaluationError = reason instanceof Error ? reason.message : "Could not run action.";
        updateExpressionErrorDisplay(expression);
        setProjectStatus(expression.evaluationError);
      }
    });
    row.append(marker, input, visibility, remove, error, result, actionButton, appearanceDetails);
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

function* tablePlotPoints(values: TableValues): Generator<[number, number]> {
  for (const column of [values.y, ...values.extra]) {
    for (let index = 0; index < values.x.length; index += 1) {
      const y = column[index];
      if (y !== undefined) yield [values.x[index]!, y];
    }
  }
}

function tableValues(table: DataTable): TableValues {
  const cached = tableValuesCache.get(table);
  if (cached) return cached;
  synchronizeVariableDefinitions();
  return tableValuesCache.get(table)!;
}

function invalidateTableData(table: DataTable): void {
  variableDefinitionCache = undefined;
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
  if (values.primaryError) {
    table.regressionError = values.primaryError;
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
    } else if (table.regressionKind === "logistic") {
      table.regression = { kind: "logistic", fit: fitLogistic(values.x, values.y) };
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
  const { x, y, primaryError } = tableValues(table);
  if (primaryError || y.length === 0) return "Statistics appear when the table has valid data.";
  const sorted = [...y].sort((left, right) => left - right);
  const mean = y.reduce((sum, value) => sum + value, 0) / y.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
    : sorted[Math.floor(sorted.length / 2)]!;
  const denominator = y.length - (graphOptions.statisticsMode === "sample" ? 1 : 0);
  const standardDeviation = denominator > 0 ? formatTick(Math.sqrt(
    y.reduce((sum, value) => sum + (value - mean) ** 2, 0) / denominator,
  )) : "undefined (n < 2)";
  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  return `n ${y.length} · x̄ ${formatTick(meanX)} · ȳ ${formatTick(mean)} · median ${formatTick(median)} · ${graphOptions.statisticsMode} SD ${standardDeviation} · range ${formatTick(sorted[0]!)}–${formatTick(sorted[sorted.length - 1]!)}`;
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
    case "logistic": {
      const { a, b, c } = regression.fit.parameters;
      return c! / (1 + a! * Math.exp(-b! * x));
    }
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
    case "logistic": {
      const { a, b, c } = regression.fit.parameters;
      return `${formatRegressionNumber(c!, digits)}/(1 + ${formatRegressionNumber(a!, digits)}exp(${
        formatRegressionNumber(-b!, digits)}x))`;
    }
  }
}

function updateRegressionSummary(summary: HTMLParagraphElement, table: DataTable, tableIndex: number): void {
  const key = JSON.stringify([table.regression ? table.regressionSummary : "", tableIndex]);
  if (summary.dataset.regressionKey === key) return;
  summary.dataset.regressionKey = key;
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

const tableContainers = new WeakMap<DataTable, HTMLElement>();

function setTableCell(table: DataTable, row: number, axis: TableAxis, value: string): void {
  const dataRow = table.rows[row]!;
  if (typeof axis === "number") {
    dataRow.extra ??= [];
    while (dataRow.extra.length <= axis) dataRow.extra.push("");
    dataRow.extra[axis] = value;
  } else dataRow[axis] = value;
}

function focusTableCell(table: DataTable, row: number, column: number, selection?: [number, number]): void {
  const field = tableContainers.get(table)?.querySelector<HTMLInputElement>(
    `[data-table-row="${row}"][data-table-axis="${tableAxisAt(column)}"]`,
  );
  field?.focus();
  if (selection) field?.setSelectionRange(...selection);
  else field?.select();
}

function renderTables(): void {
  synchronizeVariableDefinitions(false);
  tableList.replaceChildren();
  for (const [tableIndex, table] of tables.entries()) {
    updateTableRegression(table);
    const wrapper = createWorkspaceItem(`table:${table.id}`, `Table ${tableIndex + 1}`);
    const container = document.createElement("section");
    container.className = "data-table";
    container.dataset.tableId = String(table.id);
    tableContainers.set(table, container);
    const heading = document.createElement("div");
    heading.className = "data-table-heading";
    const sourceExpression = table.sourceExpressionId === undefined
      ? undefined
      : expressions.findIndex((entry) => entry.id === table.sourceExpressionId);
    const defaultTitle = sourceExpression === undefined
      ? `Table ${tableIndex + 1}`
      : sourceExpression < 0
        ? `Table ${tableIndex + 1} · source removed`
        : `Table ${tableIndex + 1} · Expression ${sourceExpression + 1}`;
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "table-collapse";
    collapse.textContent = table.collapsed ? "▸" : "▾";
    collapse.setAttribute("aria-label", `${table.collapsed ? "Expand" : "Collapse"} ${table.name || defaultTitle}`);
    collapse.setAttribute("aria-expanded", String(!table.collapsed));
    const name = document.createElement("input");
    name.type = "text";
    name.className = "workspace-item-name";
    name.value = table.name ?? "";
    name.placeholder = defaultTitle;
    name.maxLength = 40;
    name.setAttribute("aria-label", `Table ${tableIndex + 1} name`);
    name.style.color = table.color;
    name.addEventListener("input", () => {
      table.name = name.value;
      collapse.setAttribute(
        "aria-label",
        `${table.collapsed ? "Expand" : "Collapse"} ${table.name || defaultTitle}`,
      );
      scheduleProjectSave();
    });
    name.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation();
    });
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
    collapse.addEventListener("click", () => {
      table.collapsed = !table.collapsed;
      renderTables();
      scheduleProjectSave();
    });
    heading.append(collapse, name, removeTable);

    const content = document.createElement("div");
    content.className = "data-table-content";
    content.hidden = Boolean(table.collapsed);
    const grid = document.createElement("div");
    grid.className = "table-grid";
    const axes: TableAxis[] = ["x", "y", ...(table.extraColumns ?? []).map((_, index) => index)];
    grid.style.setProperty("--table-columns", String(axes.length));
    const axisLabel = (axis: TableAxis) => typeof axis === "number" ? `column ${axis + 3}` : axis;
    const columns = document.createElement("div");
    columns.className = "table-columns";
    for (const axis of axes) {
      const columnControl = document.createElement("div");
      columnControl.className = "table-column-control";
      for (const kind of ["name", "formula"] as const) {
        const label = document.createElement("label");
        const field = document.createElement("input");
        field.type = "text";
        field.maxLength = kind === "name" ? 40 : 512;
        field.value = kind === "name" ? tableColumnName(table, axis) : tableColumnFormula(table, axis);
        field.placeholder = kind === "formula" ? "Optional formula" : tableColumnName(table, axis);
        const title = typeof axis === "number" ? `${axisLabel(axis)} ${kind}` : `${axis} column ${kind}`;
        field.setAttribute("aria-label", `Table ${tableIndex + 1} ${title}`);
        if(kind==="formula")field.dataset.mathKeypad="";
        field.addEventListener("input", () => {
          if (typeof axis === "number") table.extraColumns![axis]![kind] = field.value || undefined;
          else if (kind === "name") table[axis === "x" ? "xColumn" : "yColumn"] = field.value || undefined;
          else table[axis === "x" ? "xFormula" : "yFormula"] = field.value || undefined;
          invalidateTableData(table);
          renderSliders();
          scheduleDraw();
          scheduleProjectSave();
        });
        label.append(document.createTextNode(kind === "name" ? "Name" : "Formula"), field);
        columnControl.append(label);
      }
      if (typeof axis === "number") {
        const removeColumn = document.createElement("button");
        removeColumn.type = "button";
        removeColumn.className = "remove-table-column";
        removeColumn.textContent = "Remove column";
        removeColumn.setAttribute("aria-label", `Remove table ${tableIndex + 1} column ${axis + 3}`);
        removeColumn.addEventListener("click", () => {
          table.extraColumns!.splice(axis, 1);
          for (const row of table.rows) row.extra?.splice(axis, 1);
          invalidateTableData(table);
          renderTables();
          draw();
        });
        columnControl.append(removeColumn);
      }
      columns.append(columnControl);
    }
    columns.append(document.createElement("span"));

    const rowList = document.createElement("div");
    for (const [rowIndex, dataRow] of table.rows.entries()) {
      const row = document.createElement("div");
      row.className = "table-data-row";
      for (const axis of axes) {
        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 128;
        input.dataset.tableAxis = String(axis);
        input.dataset.tableRow = String(rowIndex);
        input.dataset.mathKeypad = "";
        input.value = tableCell(table, rowIndex, axis);
        input.setAttribute("aria-label", `Table ${tableIndex + 1} ${axisLabel(axis)} value ${rowIndex + 1}`);
        input.addEventListener("input", (event) => {
          if (!tableColumnFormula(table, axis)) {
            setTableCell(table, rowIndex, axis, input.value);
          }
          invalidateTableData(table);
          if (!(event instanceof InputEvent && event.isComposing) && rowIndex === table.rows.length - 1 &&
              input.value.trim() && table.rows.length < MAX_TABLE_ROWS) {
            const selection: [number, number] = [input.selectionStart ?? 0, input.selectionEnd ?? 0];
            table.rows.push({ id: nextRowId++, x: "", y: "" });
            renderTables();
            focusTableCell(table, rowIndex, axes.indexOf(axis), selection);
          }
          renderSliders();
          const values = tableValues(table);
          updateTableRegression(table);
          error.textContent = table.regressionError ?? values.error ?? "";
          updateRegressionSummary(summary, table, tableIndex);
          stats.textContent = tableStatistics(table);
          scheduleDraw();
          scheduleProjectSave();
        });
        input.addEventListener("keydown", (event) => {
          if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
              !["Tab", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
          if (event.shiftKey && event.key !== "Tab" && event.key !== "Enter") return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            if (input.selectionStart !== input.selectionEnd ||
                (event.key === "ArrowLeft" ? input.selectionStart !== 0 : input.selectionEnd !== input.value.length)) return;
          }
          const editable = axes.flatMap((candidate, index) => tableColumnFormula(table, candidate) ? [] : [index]);
          const target = nextTableCell(rowIndex, axes.indexOf(axis), table.rows.length, editable, event.key, event.shiftKey);
          if (!target) return;
          if (target.row === table.rows.length && table.rows.length >= MAX_TABLE_ROWS) {
            if (event.key === "Tab") return;
            event.preventDefault();
            setProjectStatus(`Tables are limited to ${MAX_TABLE_ROWS} rows.`);
            return;
          }
          event.preventDefault();
          if (target.row === table.rows.length) {
            table.rows.push({ id: nextRowId++, x: "", y: "" });
            invalidateTableData(table);
            renderTables();
            scheduleDraw();
          }
          focusTableCell(table, target.row, target.column);
        });
        input.addEventListener("paste", (event) => {
          const text = event.clipboardData?.getData("text/plain");
          if (text === undefined || !/[\t\r\n]/.test(text)) return;
          event.preventDefault();
          let cells: string[][];
          let size: { rows: number; columns: number };
          const startColumn = axes.indexOf(axis);
          try {
            cells = spreadsheetCells(text)!;
            size = validateSpreadsheetPaste(table, cells, rowIndex, startColumn);
          } catch (reason) {
            setProjectStatus(reason instanceof Error ? reason.message : "Could not paste spreadsheet cells.");
            return;
          }
          captureProjectHistory();
          table.extraColumns ??= [];
          let columnId = Math.max(0, ...table.extraColumns.map((column) => column.id)) + 1;
          while (table.extraColumns.length + 2 < size.columns) table.extraColumns.push({ id: columnId++ });
          while (table.rows.length < size.rows) table.rows.push({ id: nextRowId++, x: "", y: "" });
          for (const [offset, values] of cells.entries()) {
            for (const [column, value] of values.entries()) {
              setTableCell(table, rowIndex + offset, tableAxisAt(startColumn + column), value);
            }
          }
          const last = table.rows.at(-1);
          if (last && (last.x.trim() || last.y.trim() || last.extra?.some((value) => value.trim())) &&
              table.rows.length < MAX_TABLE_ROWS) table.rows.push({ id: nextRowId++, x: "", y: "" });
          invalidateTableData(table);
          renderTables();
          renderSliders();
          draw();
          captureProjectHistory();
          scheduleProjectSave();
          focusTableCell(table, rowIndex, startColumn);
          setProjectStatus(`Pasted ${cells.length} row${cells.length === 1 ? "" : "s"} into the table.`);
        });
        const cell = document.createElement("div");
        cell.className = "table-cell";
        const result = document.createElement("output");
        result.dataset.tableResultAxis = String(axis);
        result.dataset.tableRow = String(rowIndex);
        result.setAttribute("aria-label", `Table ${tableIndex + 1} ${axisLabel(axis)} result ${rowIndex + 1}`);
        cell.append(input, result);
        row.append(cell);
      }
      const removeRow = document.createElement("button");
      removeRow.type = "button";
      removeRow.className = "row-remove";
      removeRow.textContent = "×";
      removeRow.setAttribute("aria-label", `Remove table ${tableIndex + 1} row ${rowIndex + 1}`);
      removeRow.addEventListener("click", () => {
        table.rows = table.rows.filter((entry) => entry.id !== dataRow.id);
        invalidateTableData(table);
        renderTables();
        draw();
      });
      row.append(removeRow);
      rowList.append(row);
    }
    grid.append(columns, rowList);

    const actions = document.createElement("div");
    actions.className = "table-actions";
    const addRow = document.createElement("button");
    addRow.type = "button";
    addRow.textContent = "Add row";
    addRow.disabled = table.rows.length >= MAX_TABLE_ROWS;
    addRow.addEventListener("click", () => {
      table.rows.push({ id: nextRowId++, x: "", y: "" });
      invalidateTableData(table);
      renderTables();
      draw();
      workspaceList.querySelector<HTMLInputElement>(
        `[aria-label="Table ${tableIndex + 1} x value ${table.rows.length}"]`,
      )?.focus();
    });
    const addColumn = document.createElement("button");
    addColumn.type = "button";
    addColumn.textContent = "Add column";
    addColumn.setAttribute("aria-label", `Add column to Table ${tableIndex + 1}`);
    addColumn.addEventListener("click", () => {
      table.extraColumns ??= [];
      const id = Math.max(0, ...table.extraColumns.map((column) => column.id)) + 1;
      table.extraColumns.push({ id });
      invalidateTableData(table);
      renderTables();
      draw();
      workspaceList.querySelector<HTMLInputElement>(
        `[aria-label="Table ${tableIndex + 1} column ${table.extraColumns.length + 2} name"]`,
      )?.focus();
    });
    actions.append(addRow, addColumn);
    const exportCSV=document.createElement("button");
    exportCSV.type="button";exportCSV.textContent="Export CSV";
    exportCSV.setAttribute("aria-label",`Export Table ${tableIndex+1} as CSV`);
    exportCSV.addEventListener("click",()=>{
      try{
        synchronizeVariableDefinitions();
        const columns=tableColumns(table);
        const active=table.rows.flatMap((row,index)=>row.x.trim()||row.y.trim()||row.extra?.some(c=>c.trim())?[index]:[]);
        const rows=active.map(index=>columns.map(column=>{
          const formula=tableColumnFormula(table,column.axis);
          const source=formula||tableCell(table,index,column.axis);
          if(!source.trim())return "";
          const rowColumn=column.rows.indexOf(index);
          if(tableColumnErrors[column.target])throw new Error(tableColumnErrors[column.target]);
          const value=collectionValues[column.target]?.[rowColumn];
          if(rowColumn<0||value===undefined)throw new Error(`Missing value at row ${index+1}.`);
          return String(compileExpression(value,sliderValues)(0).value.toNumber());
        }));
        downloadBlob(new Blob([encodeCSV([columns.map(c=>c.target),...rows])],{type:"text/csv;charset=utf-8"}),`better-desmos-table-${table.id}.csv`);
        setProjectStatus("CSV exported with evaluated numeric values (not formulas).");
      }catch(reason){setProjectStatus(reason instanceof Error?`CSV export failed: ${reason.message}`:"CSV export failed.");}
    });
    actions.append(exportCSV);

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
      ["logistic", "Logistic"],
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
    error.textContent = table.regressionError ?? tableValues(table).error ?? "";
    const summary = document.createElement("p");
    summary.className = "table-summary";
    updateRegressionSummary(summary, table, tableIndex);
    const stats = document.createElement("p");
    stats.className = "table-stats";
    stats.textContent = tableStatistics(table);
    const help = document.createElement("p");
    help.className = "table-keyboard-help";
    help.textContent = "Tab: next cell · Enter: next row · Paste cells from a spreadsheet";
    content.append(grid, actions, help, summary, stats, error);
    container.append(heading, content);
    wrapper.append(container);
    tableList.append(wrapper);
  }
  renderWorkspaceItems();
  for (const table of tables) updateTableFormulaDisplay(table);
  scheduleProjectSave();
}

function updateTableFormulaDisplay(table: DataTable): void {
  const container = tableContainers.get(table);
  const values = tableValuesCache.get(table);
  if (!container || !values) return;
  const activeRows = new Map(tableColumns(table)[0]!.rows.map((row, index) => [row, index]));
  for (const [columnIndex, column] of tableColumns(table).entries()) {
    const axis = column.axis;
    const formula = tableColumnFormula(table, axis);
    const results = new Map([...container.querySelectorAll<HTMLOutputElement>(`[data-table-result-axis="${axis}"]`)]
      .map((result) => [Number(result.dataset.tableRow), result]));
    for (const field of container.querySelectorAll<HTMLInputElement>(`[data-table-axis="${axis}"]`)) {
      const row = Number(field.dataset.tableRow);
      const index = activeRows.get(row);
      const value = index === undefined ? undefined : (typeof axis === "number" ? values.extra[axis]?.[index] : values[axis][index]);
      field.readOnly = Boolean(formula);
      if (formula) field.value = value === undefined ? "" : Number(value.toPrecision(15)).toString();
      else field.value = tableCell(table, row, axis);
      field.setAttribute("aria-invalid", String(index !== undefined && Boolean(values.columnErrors[columnIndex])));
      field.title = formula ? `Numerical result from ${formula}` : value === undefined ? "" : `Result: ${value}`;
      const result = results.get(row);
      if (result) {
        result.hidden = Boolean(formula) || value === undefined || Number(tableCell(table, row, axis)) === value;
        result.textContent = value === undefined ? "" : `≈ ${Number(value.toPrecision(15))}`;
      }
    }
  }
  updateTableRegression(table);
  const error = container.querySelector<HTMLElement>(".table-error");
  if (error) error.textContent = table.regressionError ?? values.error ?? "";
  const stats = container.querySelector<HTMLElement>(".table-stats");
  if (stats) stats.textContent = tableStatistics(table);
  const summary = container.querySelector<HTMLParagraphElement>(".table-summary");
  if (summary) updateRegressionSummary(summary, table, tables.indexOf(table));
}

function releasePhotoImage(photo: Photo): void {
  const image = photoImages.get(photo);
  if (image?.bitmap) {
    photoPixels -= image.bitmap.width * image.bitmap.height;
    image.bitmap.close();
    for (const [entry, state] of photoImages) {
      if (state.retryOnRelease) photoImages.delete(entry);
    }
  }
  photoImages.delete(photo);
}

async function decodePhoto(source: string): Promise<ImageBitmap> {
  const image = new Image();
  image.src = source;
  await image.decode();
  if (image.naturalWidth * image.naturalHeight > MAX_PHOTO_PIXELS) {
    throw new Error("Photos must contain at most 16 million pixels.");
  }
  return createImageBitmap(image);
}

function updatePhotoError(photo: Photo, image: PhotoImage): void {
  const error = workspaceList.querySelector<HTMLElement>(`[data-photo-error-id="${photo.id}"]`);
  const message = [image.error, image.transformError].filter(Boolean).join(" ");
  if (error && error.textContent !== message) error.textContent = message;
  for (const [key, label] of PHOTO_FIELDS) {
    workspaceList.querySelector<HTMLInputElement>(
      `[data-workspace-key="photo:${photo.id}"] [data-photo-field="${key}"]`,
    )?.setAttribute("aria-invalid", String(Boolean(image.transformError?.startsWith(`${label}:`))));
  }
}

function ensurePhotoImage(photo: Photo): PhotoImage {
  const existing = photoImages.get(photo);
  if (existing) return existing;
  const image: PhotoImage = { loading: true };
  photoImages.set(photo, image);
  void decodePhoto(photo.source).then((bitmap) => {
    if (photoImages.get(photo) !== image) {
      bitmap.close();
      return;
    }
    if (photoPixels + bitmap.width * bitmap.height > MAX_TOTAL_PHOTO_PIXELS) {
      bitmap.close();
      image.retryOnRelease = true;
      throw new Error("Loaded photos must total at most 32 million pixels. Remove a photo to free space.");
    }
    image.bitmap = bitmap;
    photoPixels += bitmap.width * bitmap.height;
    image.loading = false;
    updatePhotoError(photo, image);
    scheduleDraw();
  }).catch((reason: unknown) => {
    if (photoImages.get(photo) !== image) return;
    image.loading = false;
    image.error = `Could not load photo: ${reason instanceof Error ? reason.message : "Invalid image data."}`;
    updatePhotoError(photo, image);
    setProjectStatus(image.error);
    scheduleDraw();
  });
  return image;
}

function drawPhoto(photo: Photo, width: number, height: number): void {
  const image = ensurePhotoImage(photo);
  try {
    const transform = evaluatePhotoTransform(photo, sliderValues, expandFunctions);
    image.transformError = undefined;
    if (!photo.hidden && image.bitmap && transform.width !== 0 && transform.height !== 0) {
      context.save();
      try {
        context.globalAlpha = photo.opacity;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        if(graphOptions.xScale==="log"||graphOptions.yScale==="log"){
          const step=Math.max(2,Math.sqrt(width*height/200_000));
          for(let py=0;py<height;py+=step)for(let px=0;px<width;px+=step){
            const [lx,ly]=photoLocalPoint(transform,worldXAt(px+step/2,width),worldYAt(py+step/2,height));
            const u=lx/transform.width+0.5,v=0.5-ly/transform.height;
            if(u>=0&&u<1&&v>=0&&v<1)context.drawImage(image.bitmap,
              Math.min(image.bitmap.width-1,Math.floor(u*image.bitmap.width)),
              Math.min(image.bitmap.height-1,Math.floor(v*image.bitmap.height)),1,1,px,py,step,step);
          }
        }else{
          context.transform(...photoMatrix(transform, centerX, centerY, scale, verticalScale(), width, height));
          context.drawImage(image.bitmap, -0.5, -0.5, 1, 1);
        }
      } finally {
        context.restore();
      }
    }
  } catch (reason) {
    image.transformError = reason instanceof Error ? reason.message : "Could not position photo.";
  }
  updatePhotoError(photo, image);
}

function renderPhotos(): void {
  photoList.replaceChildren();
  for (const [index, photo] of photos.entries()) {
    const label = `Photo ${index + 1}`;
    const wrapper = createWorkspaceItem(`photo:${photo.id}`, label);
    const panel = document.createElement("section");
    panel.className = "photo-panel";
    const heading = document.createElement("div");
    heading.className = "photo-heading";
    const name = document.createElement("input");
    name.className = "workspace-item-name";
    name.value = photo.name;
    name.maxLength = 100;
    name.setAttribute("aria-label", `${label} name`);
    name.addEventListener("input", () => {
      photo.name = name.value;
      scheduleProjectSave();
    });
    const visibility = document.createElement("button");
    visibility.type = "button";
    visibility.textContent = photo.hidden ? "Show" : "Hide";
    visibility.setAttribute("aria-label", `${photo.hidden ? "Show" : "Hide"} photo ${index + 1}`);
    visibility.setAttribute("aria-pressed", String(!photo.hidden));
    visibility.addEventListener("click", () => {
      photo.hidden = !photo.hidden;
      renderPhotos();
      renderWorkspaceItems();
      scheduleDraw();
      scheduleProjectSave();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove photo ${index + 1}`);
    remove.addEventListener("click", () => {
      releasePhotoImage(photo);
      photos = photos.filter((entry) => entry !== photo);
      workspaceOrder = workspaceOrder.filter((item) => item.type !== "photo" || item.id !== photo.id);
      renderPhotos();
      renderWorkspaceItems();
      renderSliders();
      scheduleDraw();
      scheduleProjectSave();
    });
    heading.append(name, visibility, remove);
    const content = document.createElement("div");
    content.className = "photo-content";
    for (const [key, fieldLabel] of PHOTO_FIELDS) {
      const field = document.createElement("label");
      field.className = "photo-field";
      const input = document.createElement("input");
      input.type = "text";
      input.value = photo[key];
      input.maxLength = 512;
      input.dataset.photoField = key;
      input.setAttribute("aria-label", `${label} ${fieldLabel}`);
      input.addEventListener("input", () => {
        photo[key] = input.value;
        renderSliders();
        scheduleDraw();
        scheduleProjectSave();
      });
      field.append(document.createTextNode(fieldLabel), input);
      content.append(field);
    }
    const unitLabel = document.createElement("label");
    unitLabel.className = "photo-field";
    const unit = document.createElement("select");
    unit.setAttribute("aria-label", `${label} rotation units`);
    for (const value of ["radians", "degrees"] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value === "radians" ? "Radians" : "Degrees";
      unit.append(option);
    }
    unit.value = photo.rotationUnit;
    unit.addEventListener("change", () => {
      photo.rotationUnit = unit.value === "degrees" ? "degrees" : "radians";
      scheduleDraw();
      scheduleProjectSave();
    });
    unitLabel.append(document.createTextNode("Rotation units"), unit);
    const opacityLabel = document.createElement("label");
    opacityLabel.className = "photo-field";
    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = "0";
    opacity.max = "100";
    opacity.value = String(photo.opacity * 100);
    opacity.setAttribute("aria-label", `${label} opacity`);
    opacity.addEventListener("input", () => {
      photo.opacity = Number(opacity.value) / 100;
      scheduleDraw();
      scheduleProjectSave();
    });
    opacityLabel.append(document.createTextNode("Opacity"), opacity);
    const error = document.createElement("p");
    error.className = "photo-error";
    error.dataset.photoErrorId = String(photo.id);
    error.setAttribute("role", "status");
    const image = ensurePhotoImage(photo);
    error.textContent = [image.error, image.transformError].filter(Boolean).join(" ");
    content.append(unitLabel, opacityLabel, error);
    const help=document.createElement("p");
    help.className="photo-drag-help";
    help.textContent="Alt+drag moves; Shift+Alt+drag scales; Ctrl/Command+Alt+drag rotates. Undo restores formulas.";
    content.append(help);
    panel.append(heading, content);
    wrapper.append(panel);
    photoList.append(wrapper);
  }
  renderWorkspaceItems();
}

const photoFileInput = document.querySelector<HTMLInputElement>("#photo-file")!;
photoFileInput.addEventListener("change", async () => {
  const file = photoFileInput.files?.[0];
  photoFileInput.value = "";
  if (!file) return;
  const revision = photoUploadRevision;
  let bitmap: ImageBitmap | undefined;
  try {
    if (!PHOTO_TYPES.includes(file.type)) throw new Error("Choose a PNG, JPEG, WebP, or GIF photo.");
    if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo files must be 2 MB or smaller.");
    setProjectStatus("Loading photo...");
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Could not read photo."));
      reader.onload = () => typeof reader.result === "string"
        ? resolve(reader.result) : reject(new Error("Could not read photo data."));
      reader.readAsDataURL(file);
    });
    bitmap = await decodePhoto(source);
    if (revision !== photoUploadRevision) {
      bitmap.close();
      return;
    }
    const photo: Photo = {
      id: nextPhotoId, name: file.name.slice(0, 100), source,
      centerX: "0", centerY: "0", rotation: "0", rotationUnit: "radians",
      width: "1", height: "1",
      initialWidth: 10, initialHeight: 10 * bitmap.height / bitmap.width,
      opacity: 1, hidden: false,
    };
    parsePhotos([...photos, photo]);
    const project = currentProjectState();
    project.photos = [...photos, photo];
    project.workspaceOrder.push({ type: "photo", id: photo.id });
    if (new Blob([JSON.stringify(project, null, 2)]).size > 5_000_000) {
      throw new Error("This photo would exceed the 5 MB project limit. Use a smaller photo.");
    }
    if (photoPixels + bitmap.width * bitmap.height > MAX_TOTAL_PHOTO_PIXELS) {
      throw new Error("Loaded photos must total at most 32 million pixels. Remove a photo to free space.");
    }
    photos.push(photo);
    workspaceOrder.push({ type: "photo", id: photo.id });
    nextPhotoId += 1;
    photoPixels += bitmap.width * bitmap.height;
    photoImages.set(photo, { bitmap, loading: false });
    bitmap = undefined;
    renderPhotos();
    renderSliders();
    scheduleDraw();
    scheduleProjectSave();
    workspaceList.querySelector<HTMLInputElement>(
      `[data-workspace-key="photo:${photo.id}"] [data-photo-field="centerX"]`,
    )?.focus();
    setProjectStatus(`Added ${file.name}`);
  } catch (reason) {
    bitmap?.close();
    setProjectStatus(`Could not add photo: ${reason instanceof Error ? reason.message : "Invalid image file."}`);
  }
});

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

function renderTickers(): void {
  tickerList.replaceChildren();
  for (const [index, ticker] of tickers.entries()) {
    const wrapper = createWorkspaceItem(`ticker:${ticker.id}`, `Ticker ${index + 1}`);
    const panel = document.createElement("section");
    panel.className = "ticker-panel";
    const heading = document.createElement("div");
    heading.className = "ticker-heading";
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "table-collapse";
    collapse.textContent = ticker.collapsed ? "▸" : "▾";
    collapse.setAttribute("aria-label", `${ticker.collapsed ? "Expand" : "Collapse"} ${ticker.name || `Ticker ${index + 1}`}`);
    collapse.setAttribute("aria-expanded", String(!ticker.collapsed));
    const name = document.createElement("input");
    name.type = "text";
    name.className = "workspace-item-name";
    name.value = ticker.name ?? "";
    name.placeholder = `Ticker ${index + 1}`;
    name.maxLength = 40;
    name.setAttribute("aria-label", `Ticker ${index + 1} name`);
    name.addEventListener("input", () => {
      ticker.name = name.value;
      collapse.setAttribute(
        "aria-label",
        `${ticker.collapsed ? "Expand" : "Collapse"} ${ticker.name || `Ticker ${index + 1}`}`,
      );
      scheduleProjectSave();
    });
    name.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ticker ${index + 1}`);
    remove.addEventListener("click", () => {
      stopTicker(ticker.id);
      tickers = tickers.filter((entry) => entry.id !== ticker.id);
      workspaceOrder = workspaceOrder.filter((item) =>
        item.type !== "ticker" || item.id !== ticker.id);
      renderTickers();
      renderExpressions();
      scheduleProjectSave();
    });
    collapse.addEventListener("click", () => {
      ticker.collapsed = !ticker.collapsed;
      renderTickers();
      scheduleProjectSave();
    });
    heading.append(collapse, name, remove);
    const content = document.createElement("div");
    content.className = "ticker-content";
    content.hidden = Boolean(ticker.collapsed);

    const action = document.createElement("input");
    action.type = "text";
    action.maxLength = 512;
    action.value = ticker.action;
    action.placeholder = "a = a + 1";
    action.setAttribute("aria-label", `Ticker ${index + 1} assignment`);
    action.addEventListener("input", () => {
      stopTicker(ticker.id);
      ticker.action = action.value;
      ticker.error = undefined;
      error.textContent = "";
      for (const name of sliderNames()) sliderValues[name] ??= 1;
      renderSliders();
      scheduleProjectSave();
    });

    const interval = document.createElement("input");
    interval.type = "text";
    interval.inputMode = "numeric";
    interval.autocomplete = "off";
    interval.value = String(ticker.intervalMs);
    interval.setAttribute("aria-label", `Ticker ${index + 1} interval milliseconds`);
    interval.addEventListener("change", () => {
      const value = Number(interval.value);
      if (!Number.isInteger(value) || value < 10 || value > 60_000) {
        interval.setAttribute("aria-invalid", "true");
        ticker.error = "Interval must be between 10 and 60,000 milliseconds.";
        error.textContent = ticker.error;
        return;
      }
      interval.removeAttribute("aria-invalid");
      stopTicker(ticker.id);
      ticker.intervalMs = value;
      ticker.error = undefined;
      error.textContent = "";
      scheduleProjectSave();
    });

    const runMode = document.createElement("select");
    runMode.setAttribute("aria-label", `Ticker ${index + 1} run mode`);
    for (const [value, label] of [["repeat", "Repeat until paused"], ["count", "Run a set number of times"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      runMode.append(option);
    }
    runMode.value = ticker.runMode;
    runMode.addEventListener("change", () => {
      stopTicker(ticker.id);
      ticker.runMode = runMode.value === "count" ? "count" : "repeat";
      ticker.error = undefined;
      renderTickers();
      scheduleProjectSave();
    });

    const intervalLabel = document.createElement("label");
    intervalLabel.className = "ticker-field";
    intervalLabel.append(document.createTextNode("Interval (ms)"), interval);
    const countLabel = document.createElement("label");
    countLabel.className = "ticker-field";
    countLabel.append(document.createTextNode("Number of ticks"));
    const tickCount = document.createElement("input");
    tickCount.type = "number";
    tickCount.min = "1";
    tickCount.max = "1000000";
    tickCount.step = "1";
    tickCount.value = String(ticker.tickCount);
    tickCount.setAttribute("aria-label", `Ticker ${index + 1} number of ticks`);
    tickCount.hidden = ticker.runMode !== "count";
    tickCount.addEventListener("change", () => {
      const value = Number(tickCount.value);
      if (!Number.isInteger(value) || value < 1 || value > 1_000_000) {
        tickCount.setAttribute("aria-invalid", "true");
        ticker.error = "Tick count must be between 1 and 1,000,000.";
        error.textContent = ticker.error;
        return;
      }
      tickCount.removeAttribute("aria-invalid");
      stopTicker(ticker.id);
      ticker.tickCount = value;
      ticker.error = undefined;
      error.textContent = "";
      scheduleProjectSave();
    });
    countLabel.append(tickCount);

    const play = document.createElement("button");
    play.type = "button";
    const isRunning = runningTickers.has(ticker.id);
    play.textContent = isRunning ? "Pause" : "Start";
    play.setAttribute("aria-label", `${isRunning ? "Pause" : "Start"} ticker ${index + 1}`);
    play.setAttribute("aria-pressed", String(isRunning));
    play.addEventListener("click", () => {
      if (runningTickers.has(ticker.id)) {
        stopTicker(ticker.id);
        renderTickers();
      } else {
        startTicker(ticker);
      }
    });
    const error = document.createElement("p");
    error.className = "ticker-error";
    error.setAttribute("role", "status");
    error.textContent = ticker.error ?? "";

    content.append(action, intervalLabel, runMode, countLabel, play, error);
    panel.append(heading, content);
    wrapper.append(panel);
    tickerList.append(wrapper);
  }
  renderWorkspaceItems();
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
    value === "sine" || value === "tangent" || value === "logistic";
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
    name: "",
    collapsed: false,
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

function addTicker(): void {
  const ticker: Ticker = {
    id: nextTickerId++,
    action: "a = a + 1",
    name: "",
    collapsed: false,
    intervalMs: 1000,
    runMode: "repeat",
    tickCount: 10,
  };
  tickers.push(ticker);
  workspaceOrder.push({ type: "ticker", id: ticker.id });
  sliderValues.a ??= 1;
  renderSliders();
  renderTickers();
  scheduleProjectSave();
  workspaceList.querySelector<HTMLInputElement>(
    `.workspace-item[data-workspace-key="ticker:${ticker.id}"] input[aria-label^="Ticker"]`,
  )?.focus();
}

function currentProjectState(): ProjectState {
  return {
    version: 1,
    expressions: expressions.map((
      { id, text, color, lineWidth, lineStyle, pointStyle, pointSize, clickAction, opacity, folderId, hidden, draggable, hsv, label, labelX, labelY },
    ) => ({ id, text, color, lineWidth, lineStyle, pointStyle, pointSize, clickAction, opacity, folderId, hidden, draggable, hsv, label, labelX, labelY })),
    tables: tables.map(({ id, rows, name, collapsed, sourceExpressionId, regressionDegree, regressionKind, color, folderId, xColumn, yColumn, xFormula, yFormula, extraColumns }) =>
      ({ id, rows, name, collapsed, sourceExpressionId, regressionDegree, regressionKind, color, folderId, xColumn, yColumn, xFormula, yFormula, extraColumns })),
    texts: textBlocks.map(({ id, text, folderId }) => ({ id, text, folderId })),
    tickers: tickers.map(({ id, action, name, collapsed, intervalMs, runMode, tickCount, folderId }) =>
      ({ id, action, name, collapsed, intervalMs, runMode, tickCount, folderId })),
    photos: photos.map((photo) => ({ ...photo })),
    workspaceOrder: [...workspaceOrder],
    folders: folders.map(({ id, name, collapsed }) => ({ id, name, collapsed })),
    sliders: Object.fromEntries(Object.entries(sliderValues).filter(([, value]) => Number.isFinite(value))),
    sliderOptions: { ...sliderOptions },
    centerX,
    centerY,
    scale,
    graphOptions: { ...graphOptions },
  };
}

const MAX_HISTORY_STEPS = 20;
const undoHistory: string[] = [JSON.stringify(currentProjectState())];
const redoHistory: string[] = [];

function updateHistoryButtons(): void {
  const undoButton = document.querySelector<HTMLButtonElement>("#undo-project");
  const redoButton = document.querySelector<HTMLButtonElement>("#redo-project");
  if (undoButton) undoButton.disabled = undoHistory.length <= 1;
  if (redoButton) redoButton.disabled = redoHistory.length === 0;
}

function captureProjectHistory(): void {
  const snapshot = JSON.stringify(currentProjectState());
  if (undoHistory.at(-1) === snapshot) return;
  undoHistory.push(snapshot);
  if (undoHistory.length > MAX_HISTORY_STEPS + 1) undoHistory.shift();
  redoHistory.length = 0;
  updateHistoryButtons();
}

function flushPendingHistory(): void {
  if (saveTimer === undefined) return;
  window.clearTimeout(saveTimer);
  saveTimer = undefined;
  const shouldRecordHistory = saveTimerRecordsHistory;
  saveTimerRecordsHistory = false;
  if (shouldRecordHistory) captureProjectHistory();
}

function undoProjectChange(): void {
  stopAllTickers();
  stopSliderAnimation();
  flushPendingHistory();
  if (undoHistory.length <= 1) return;
  redoHistory.push(undoHistory.pop()!);
  if (redoHistory.length > MAX_HISTORY_STEPS) redoHistory.shift();
  applyProjectState(parseProjectState(undoHistory.at(-1)!), false);
  updateHistoryButtons();
}

function redoProjectChange(): void {
  stopAllTickers();
  stopSliderAnimation();
  flushPendingHistory();
  const next = redoHistory.pop();
  if (!next) return;
  undoHistory.push(next);
  if (undoHistory.length > MAX_HISTORY_STEPS + 1) undoHistory.shift();
  applyProjectState(parseProjectState(next), false);
  updateHistoryButtons();
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
let saveTimerRecordsHistory = false;
function scheduleProjectSave(recordHistory = true): void {
  if (sliderAnimations.size > 0 || runningTickers.size > 0) return;
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimerRecordsHistory = recordHistory;
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    const shouldRecordHistory = saveTimerRecordsHistory;
    saveTimerRecordsHistory = false;
    if (shouldRecordHistory) captureProjectHistory();
    if (!automaticSavingEnabled || sliderAnimations.size > 0 || runningTickers.size > 0) return;
    if (saveProjectLocally()) setProjectStatus("Saved on this device");
  }, 400);
}

function applyProjectState(project: ProjectState, recordHistory = true): void {
  muteTones();
  tonesMutedByUser=false;
  photoUploadRevision += 1;
  for (const photo of photoImages.keys()) releasePhotoImage(photo);
  photos = (project.photos ?? []).map((photo) => ({ ...photo }));
  stopAllTickers(false);
  stopSliderAnimation();
  expressions = project.expressions.map((expression) => ({ ...expression }));
  textBlocks = (project.texts ?? []).map((textBlock) => ({ ...textBlock }));
  tickers = (project.tickers ?? []).map((ticker) => ({ ...ticker }));
  workspaceOrder = project.workspaceOrder.map((item) => ({ ...item }));
  tables = project.tables.map((table) => ({
    id: table.id,
    rows: table.rows.map((row) => ({ ...row, extra: row.extra ? [...row.extra] : undefined })),
    extraColumns: table.extraColumns?.map((column) => ({ ...column })),
    name: table.name,
    collapsed: table.collapsed,
    sourceExpressionId: table.sourceExpressionId,
    regressionDegree: table.regressionDegree,
    regressionKind: table.regressionKind,
    color: table.color,
    folderId: table.folderId,
    xColumn: table.xColumn,
    yColumn: table.yColumn,
    xFormula: table.xFormula,
    yFormula: table.yFormula,
  }));
  folders = project.folders.map((folder) => ({ ...folder }));
  for (const key of Object.keys(sliderValues)) delete sliderValues[key];
  Object.assign(sliderValues, project.sliders);
  for (const key of Object.keys(sliderOptions)) delete sliderOptions[key];
  Object.assign(sliderOptions, project.sliderOptions ?? {});
  centerX = project.centerX;
  centerY = project.centerY;
  scale = project.scale;
  graphOptions.xScale=project.graphOptions?.xScale??"linear";
  graphOptions.yScale=project.graphOptions?.yScale??"linear";
  Object.assign(graphOptions, project.graphOptions ?? {
    showGrid: true,
    showXAxis: true,
    showYAxis: true,
    showLabels: true,
    aspectRatio: 1,
    statisticsMode: "population",
    angleMode: "radians",
  });
  graphOptions.angleMode = project.graphOptions?.angleMode ?? "radians";
  setAngleMode(graphOptions.angleMode);
  graphOptions.randomSeed = project.graphOptions?.randomSeed ?? 1;
  setRandomSeed(graphOptions.randomSeed);
  graphOptions.gridMode = project.graphOptions?.gridMode ?? "cartesian";
  graphOptions.minorGrid = project.graphOptions?.minorGrid ?? false;
  graphOptions.xStep = project.graphOptions?.xStep;
  graphOptions.yStep = project.graphOptions?.yStep;
  graphOptions.xAxisLabel = project.graphOptions?.xAxisLabel;
  graphOptions.yAxisLabel = project.graphOptions?.yAxisLabel;
  graphOptions.complexMode = project.graphOptions?.complexMode ?? false;
  updateGraphOptionControls();
  nextId = expressions.reduce((next, expression) => Math.max(next, expression.id + 1), 1);
  nextTableId = tables.reduce((next, table) => Math.max(next, table.id + 1), 1);
  nextRowId = tables.reduce(
    (next, table) => table.rows.reduce((rowNext, row) => Math.max(rowNext, row.id + 1), next),
    1,
  );
  nextFolderId = folders.reduce((next, folder) => Math.max(next, folder.id + 1), 1);
  nextTextId = textBlocks.reduce((next, textBlock) => Math.max(next, textBlock.id + 1), 1);
  nextTickerId = tickers.reduce((next, ticker) => Math.max(next, ticker.id + 1), 1);
  nextPhotoId = photos.reduce((next, photo) => Math.max(next, photo.id + 1), 1);
  renderPhotos();
  renderTextBlocks();
  renderExpressions();
  renderTables();
  renderTickers();
  draw();
  scheduleProjectSave(recordHistory);
}

function encodeProjectShareLink(): string {
  const bytes = new TextEncoder().encode(JSON.stringify(currentProjectState()));
  if (Math.ceil(bytes.length / 3) * 4 > 50_000) {
    throw new Error("This project is too large for a shareable link. Export it as JSON instead.");
  }
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
document.querySelector("#undo-project")!.addEventListener("click", undoProjectChange);
document.querySelector("#redo-project")!.addEventListener("click", redoProjectChange);
updateHistoryButtons();
document.querySelector("#save-project")!.addEventListener("click", () => {
  autoSaveOption.checked = automaticSavingEnabled;
  saveDialog.showModal();
});
document.querySelector("#cancel-save")!.addEventListener("click", () => saveDialog.close());
document.querySelector<HTMLFormElement>("#save-dialog-form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  flushPendingHistory();
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
function downloadBlob(blob:Blob,name:string):void{
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=name;link.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const dependenciesDialog=document.querySelector<HTMLDialogElement>("#dependencies-dialog")!;
const examplesDialog=document.querySelector<HTMLDialogElement>("#examples-dialog")!;
document.querySelector("#close-dependencies")!.addEventListener("click",()=>dependenciesDialog.close());
document.querySelector("#close-examples")!.addEventListener("click",()=>examplesDialog.close());
document.querySelector("#open-dependencies")!.addEventListener("click",()=>{
  const list=document.querySelector<HTMLElement>("#dependency-list")!,error=document.querySelector<HTMLElement>("#dependencies-error")!;
  list.replaceChildren();error.textContent="";
  try{
    synchronizeVariableDefinitions();
    const functions=getUserFunctionDefinitions(),nodes:DependencyNode[]=[];
    const references=(source:string,local:string[]=[])=>{
      const called=[...source.matchAll(/\b([a-z](?:_[a-z0-9]+)?)\s*\(/gi)].map(m=>m[1]!.toLowerCase())
        .filter(name=>functions.some(f=>f.definition.name===name));
      return [...new Set([...freeIdentifiers(source),...called])].filter(name=>!["x","y","t","theta","i",...local].includes(name));
    };
    for(const [index,expression] of expressions.entries()){
      if(!expression.text.trim())continue;
      const fn=functions.find(f=>f.expression===expression),variable=getVariableDefinition(expression);
      const distribution=distributionDefinition(expression.text),inference=inferenceDefinition(expression.text);
      const definition=fn?.definition.name??variable?.target??distribution?.target??inference?.target;
      const source=fn?.definition.body??variable?.source??expression.text.slice(definition?expression.text.indexOf("=")+1:0);
      nodes.push({id:`expression:${expression.id}`,label:`Expression ${index+1}${definition?` · ${definition}`:""}`,
        defines:definition,references:references(source,fn?.definition.parameters)});
    }
    for(const [index,table] of tables.entries())for(const column of tableColumns(table))
      nodes.push({id:`table:${table.id}:${column.target}`,label:`Table ${index+1} · ${column.target}`,defines:column.target,
        references:[...new Set([...new Set(column.sources)].flatMap(source=>references(source)))]});
    for(const report of inspectDependencies(nodes,Object.keys(sliderValues))){
      const card=document.createElement("section"),title=document.createElement("h3");
      title.textContent=report.node.label;card.append(title);
      for(const text of [`Direct: ${report.direct.join(", ")||"none"}`,`Indirect: ${report.indirect.join(", ")||"none"}`,
        ...report.cycles.map(c=>`Recursive/circular path: ${c.join(" → ")}`),
        ...(report.unresolved.length?[`Unresolved: ${report.unresolved.join(", ")}`]:[])]){
        const p=document.createElement("p");p.textContent=text;card.append(p);
      }
      list.append(card);
    }
    if(!nodes.length)list.textContent="No expressions or table columns yet.";
  }catch(reason){error.textContent=reason instanceof Error?reason.message:"Could not inspect dependencies.";}
  dependenciesDialog.showModal();
});
document.querySelector("#open-examples")!.addEventListener("click",()=>{
  document.querySelector("#examples-error")!.textContent="";
  examplesDialog.showModal();
});
for(const example of EXAMPLES){
  const card=document.createElement("section"),title=document.createElement("h3"),description=document.createElement("p"),button=document.createElement("button");
  title.textContent=example.title;description.textContent=example.description;
  button.type="button";button.textContent="Append example";button.setAttribute("aria-label",`Append ${example.title} example`);
  button.addEventListener("click",()=>{
    try{
      if(expressions.length+example.expressions.length>200||workspaceOrder.length+example.expressions.length>1000)
        throw new Error("Appending this example would exceed the project limit (200 expressions / 1000 workspace items). Remove some rows first.");
      for(const text of example.expressions){
        const expression:Expression={id:nextId++,text,color:colors[(nextId-2)%colors.length]!};
        expressions.push(expression);workspaceOrder.push({type:"expression",id:expression.id});
      }
      renderExpressions();draw();scheduleProjectSave();examplesDialog.close();
      setProjectStatus(`Appended ${example.title}; existing expressions, tables, and viewport preserved.`);
    }catch(reason){document.querySelector("#examples-error")!.textContent=reason instanceof Error?reason.message:"Could not append example.";}
  });
  card.append(title,description,button);document.querySelector("#example-list")!.append(card);
}
const csvDialog=document.querySelector<HTMLDialogElement>("#csv-import-dialog")!;
const csvFile=document.querySelector<HTMLInputElement>("#csv-file")!;
document.querySelector("#import-csv")!.addEventListener("click",()=>csvDialog.showModal());
document.querySelector("#close-csv-import")!.addEventListener("click",()=>csvDialog.close());
csvFile.addEventListener("change",async()=>{
  const file=csvFile.files?.[0];if(!file)return;
  const error=document.querySelector<HTMLElement>("#csv-import-error")!;
  error.textContent="";
  try{
    if(file.size>2_000_000)throw new Error("CSV files must be at most 2 MB.");
    const parsed=parseCSV(await file.text());
    const hasHeader=document.querySelector<HTMLInputElement>("#csv-has-header")!.checked;
    const headers=hasHeader?parsed.shift()!.map(s=>s.trim().toLowerCase()):undefined;
    if(!parsed.length||parsed.length>MAX_TABLE_ROWS||parsed.length*parsed[0]!.length>20000)
      throw new Error("CSV requires 1–5000 data rows, at most 20000 cells.");
    if(headers){
      for(const header of headers)validateTableColumnName(header);
      if(new Set(headers).size!==headers.length)throw new Error("CSV column names must be distinct.");
      const taken=new Set([...Object.keys(sliderValues),...Object.keys(collectionValues),
        ...getUserFunctionDefinitions().map(s=>s.definition.name),...expressions.flatMap(e=>getVariableDefinition(e)?.target??[])]);
      const collision=headers.find(h=>taken.has(h));
      if(collision)throw new Error(`Column "${collision}" already exists. Rename the CSV header or import without headers.`);
    }
    const values=parsed.map(row=>row.map(csvNumericCell));
    const table:DataTable={id:nextTableId++,name:file.name.replace(/\.csv$/i,""),collapsed:false,
      color:colors[(tables.length+2)%colors.length]!,xColumn:headers?.[0],yColumn:headers?.[1],
      extraColumns:values[0]!.slice(2).map((_,i)=>({id:i+1,name:headers?.[i+2]})),
      rows:values.map(row=>({id:nextRowId++,x:row[0]!,y:row[1]!,extra:row.slice(2)}))};
    tables.push(table);workspaceOrder.push({type:"table",id:table.id});
    invalidateTableData(table);renderTables();draw();scheduleProjectSave();
    csvDialog.close();setProjectStatus(`Imported ${values.length} CSV rows as a new table.`);
  }catch(reason){error.textContent=reason instanceof Error?reason.message:"CSV import failed.";}
  finally{csvFile.value="";}
});

document.querySelector("#export-svg")!.addEventListener("click",()=>{
  try{
    synchronizeVariableDefinitions();
    const {width,height}=canvasWrap.getBoundingClientRect();
    const view:SVGView={width,height,sx:x=>screenXAt(x,width),sy:y=>screenYAt(y,height),
      wx:p=>worldXAt(p,width),wy:p=>worldYAt(p,height),color:hsvToHex};
    const body:string[]=[];let gaps=0;
    for(const item of workspaceBlocks().flatMap(block=>block.items).reverse()){
      if(item.type==="photo"){
        const photo=photos.find(p=>p.id===item.id&&!p.hidden);
        if(photo){
          if(graphOptions.xScale==="log"||graphOptions.yScale==="log")throw new Error("SVG photos on logarithmic axes are unsupported; use PNG.");
          const transform=evaluatePhotoTransform(photo,sliderValues,expandFunctions);
          const matrix=photoMatrix(transform,centerX,centerY,scale,verticalScale(),width,height);
          body.push(`<image href="${xml(photo.source)}" x="-0.5" y="-0.5" width="1" height="1" preserveAspectRatio="none" transform="matrix(${matrix.join(" ")})" opacity="${photo.opacity}"/>`);
        }
      }
      if(item.type==="expression"){
        const expression=expressions.find(e=>e.id===item.id)!;
        if(expression.hidden||!expression.text.trim()||updateScalarResult(expression))continue;
        const graph=getCompiled(expression);
        if(expression.compileError)throw new Error(expression.compileError);
        if(!graph)continue;
        const result=graphSVG(graph,view,{...expression,colorAt:compileSpatialColor(expression)});
        body.push(result.markup);gaps+=result.gaps;
        drawExpressionLabel(expression,width,height,body);
        if(expression.labelError)throw new Error(expression.labelError);
        if(graph.kind==="explicit"||graph.kind==="sideways"||graph.kind==="parametric"){
          const source=expandFunctions(expression.text);
          if(source.includes("{")){
            const parameterDomain=graph.kind==="sideways"?{min:view.wy(height),max:view.wy(0)}:{min:view.wx(0),max:view.wx(width)};
            for(const endpoint of detectRestrictionEndpoints(source,graph,{variables:sliderValues,sliderBounds:sliderOptions,parameterDomain})){
              const x=view.sx(endpoint.x),y=view.sy(endpoint.y);
              if(!Number.isFinite(x)||!Number.isFinite(y))continue;
              body.push(`<circle cx="${x}" cy="${y}" r="${Math.max(4,(expression.lineWidth??2)+2)}" fill="${xml(endpoint.closed?expression.color:currentThemeColor("app-bg"))}" stroke="${xml(expression.color)}" opacity="${expression.opacity??1}" stroke-width="2"/>`);
            }
          }
        }
      }else if(item.type==="table"){
        const table=tables.find(t=>t.id===item.id)!;
        const values=tableValues(table);
        if(values.error)throw new Error(values.error);
        for(const [x,y] of tablePlotPoints(values))body.push(graphSVG({kind:"point",xVariables:[],yVariables:[],evaluate:()=>[x,y]},view,{color:table.color}).markup);
        updateTableRegression(table);
        if(table.regression)body.push(graphSVG({kind:"explicit",evaluate:x=>evaluateRegression(table.regression!,x)},view,{color:table.color,lineStyle:"dashed"}).markup);
      }
    }
    const gridColor=xml(currentThemeColor("text")),textColor=xml(currentThemeColor("text-strong"));
    const ox=Math.max(0,Math.min(width,view.sx(graphOptions.xScale==="log"?1:0)));
    const oy=Math.max(0,Math.min(height,view.sy(graphOptions.yScale==="log"?1:0)));
    const polar=graphOptions.showGrid&&graphOptions.gridMode==="polar"&&graphOptions.xScale!=="log"&&graphOptions.yScale!=="log";
    if(polar){
      const px=view.sx(0),py=view.sy(0),ys=verticalScale();
      const radius=Math.max(...[0,width].flatMap(x=>[0,height].map(y=>Math.hypot((x-px)/scale,(y-py)/ys))));
      const requested=graphOptions.xStep??tickStep(Math.min(scale,ys));
      const step=Math.max(requested,radius/1000);
      for(const [spacing,alpha,rays] of [[graphOptions.minorGrid?step/5:step,0.1,graphOptions.minorGrid?24:12],[step,0.22,12]]){
        for(let r=spacing!;r<=radius;r+=spacing!)body.push(`<ellipse cx="${px}" cy="${py}" rx="${r*scale}" ry="${r*ys}" fill="none" stroke="${gridColor}" stroke-opacity="${alpha}"/>`);
        for(let i=0;i<rays!;i++){const angle=i/rays!*2*Math.PI;body.push(`<path d="M${px} ${py}L${px+radius*Math.cos(angle)*scale} ${py-radius*Math.sin(angle)*ys}" fill="none" stroke="${gridColor}" stroke-opacity="${alpha}"/>`);}
      }
    }
    for(const horizontal of [true,false]){
      const log=(horizontal?graphOptions.xScale:graphOptions.yScale)==="log";
      const low=horizontal?view.wx(0):view.wy(height),high=horizontal?view.wx(width):view.wy(0);
      const requested=(horizontal?graphOptions.xStep:graphOptions.yStep);
      const step=log?1:requested!==undefined&&(high-low)/requested<=1000?requested:tickStep(horizontal?scale:verticalScale());
      const minor=graphOptions.minorGrid?step/5:step;
      const ticks=log?logarithmicTicks(low,high):Array.from({length:Math.min(5000,Math.ceil((high-low)/minor)+1)},(_,i)=>({value:(Math.ceil(low/minor)+i)*minor,major:!graphOptions.minorGrid||(Math.ceil(low/minor)+i)%5===0}));
      for(const tick of ticks){
        const p=horizontal?view.sx(tick.value):view.sy(tick.value);
        if(!Number.isFinite(p)||p<0||p>(horizontal?width:height))continue;
        if(graphOptions.showGrid&&!polar)body.push(`<path d="${horizontal?`M${p} 0V${height}`:`M0 ${p}H${width}`}" stroke="${gridColor}" stroke-opacity="${tick.major?0.22:0.09}" fill="none"/>`);
        if(tick.major&&graphOptions.showLabels&&(horizontal?graphOptions.showXAxis:graphOptions.showYAxis))
          body.push(`<text x="${horizontal?p+4:Math.min(width-60,ox+6)}" y="${horizontal?Math.min(height-8,oy+16):p-5}" fill="${textColor}" font-family="sans-serif" font-size="12">${xml(formatTick(tick.value))}</text>`);
      }
    }
    if(graphOptions.showXAxis)body.push(`<path d="M0 ${oy}H${width}" stroke="${gridColor}" stroke-opacity="0.72"/>`);
    if(graphOptions.showYAxis)body.push(`<path d="M${ox} 0V${height}" stroke="${gridColor}" stroke-opacity="0.72"/>`);
    if(graphOptions.showXAxis&&graphOptions.xAxisLabel)body.push(`<text x="${width-70}" y="${Math.max(14,oy-8)}" fill="${textColor}">${xml(graphOptions.xAxisLabel)}</text>`);
    if(graphOptions.showYAxis&&graphOptions.yAxisLabel)body.push(`<text x="${Math.min(width-80,ox+8)}" y="18" fill="${textColor}">${xml(graphOptions.yAxisLabel)}</text>`);
    downloadBlob(new Blob([svgDocument(view,currentThemeColor("app-bg"),body.join(""))],{type:"image/svg+xml"}),"better-desmos-graph.svg");
    setProjectStatus(`SVG exported with editable sampled paths${gaps?`; ${gaps} undefined/offscreen samples omitted`:""}.`);
  }catch(reason){setProjectStatus(reason instanceof Error?`SVG export failed: ${reason.message}`:"SVG export failed.");}
});

const imageExportDialog = document.querySelector<HTMLDialogElement>("#image-export-dialog")!;
const imageExportButton = document.querySelector<HTMLButtonElement>("#download-image")!;
document.querySelector("#export-image")!.addEventListener("click", () => imageExportDialog.showModal());
document.querySelector("#cancel-image-export")!.addEventListener("click", () => imageExportDialog.close());
document.querySelector("#image-export-form")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (imageExportButton.disabled) return;
  imageExportButton.disabled = true;
  let target: HTMLCanvasElement | undefined;
  let grid: HTMLCanvasElement | undefined;
  try {
    const bounds = canvasWrap.getBoundingClientRect();
    const resolution = Number(document.querySelector<HTMLSelectElement>("#image-export-resolution")!.value);
    const size = imageExportSize(bounds.width, bounds.height, resolution);
    synchronizeVariableDefinitions();
    for (const photo of photos.filter((entry) => !entry.hidden)) {
      const image = ensurePhotoImage(photo);
      if (image.loading) throw new Error("Photos are still loading. Try exporting again when they appear.");
      if (image.error) throw new Error(image.error);
      evaluatePhotoTransform(photo, sliderValues, expandFunctions);
    }
    target = document.createElement("canvas");
    const targetContext = target.getContext("2d");
    if (!targetContext) throw new Error("Could not create the PNG canvas.");
    const previousContext = context;
    const previousFactor = renderDetailFactor;
    const explicitSpacing = graphSettings.explicitSampleSpacing;
    const implicitSpacing = graphSettings.implicitSampleSpacing;
    const profilingEnabled = performanceProfile.enabled;
    const detailFactor = Math.max(1.5, resolution);
    cancelRefinement();
    try {
      context = targetContext;
      renderDetailFactor = detailFactor;
      performanceProfile.enabled = false;
      graphSettings.explicitSampleSpacing = explicitSpacing / detailFactor;
      graphSettings.implicitSampleSpacing = implicitSpacing / detailFactor;
      renderGraph(target, bounds.width, bounds.height, resolution);
    } finally {
      context = previousContext;
      renderDetailFactor = previousFactor;
      graphSettings.explicitSampleSpacing = explicitSpacing;
      graphSettings.implicitSampleSpacing = implicitSpacing;
      performanceProfile.enabled = profilingEnabled;
      scheduleRefinement();
    }
    grid = document.createElement("canvas");
    drawGrid(grid, bounds.width, bounds.height, resolution);
    targetContext.setTransform(1, 0, 0, 1, 0, 0);
    targetContext.drawImage(grid, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      target!.toBlob((result) => result ? resolve(result) : reject(new Error("Browser could not encode this PNG.")), "image/png");
    });
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = objectUrl;
    download.download = "better-desmos-graph.png";
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    imageExportDialog.close();
    setProjectStatus(`Graph exported as PNG (${size.width} × ${size.height})`);
  } catch (reason) {
    setProjectStatus(reason instanceof Error ? `PNG export failed: ${reason.message}` : "PNG export failed.");
  } finally {
    if (target) { target.width = 1; target.height = 1; }
    if (grid) { grid.width = 1; grid.height = 1; }
    imageExportButton.disabled = false;
  }
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
  } else if (workspaceAdd.value === "ticker") {
    addTicker();
  } else if (workspaceAdd.value === "photo") {
    document.querySelector<HTMLInputElement>("#photo-file")!.click();
  } else if (workspaceAdd.value === "folder") {
    createFolder();
  }
  workspaceAdd.value = "";
});
document.querySelector("#zoom-in")!.addEventListener("click", () => {
  const bounds = canvasWrap.getBoundingClientRect();
  previewZoom(1.25, bounds.width * GRAPH_BUFFER_SCALE / 2, bounds.height * GRAPH_BUFFER_SCALE / 2);
});
document.querySelector("#zoom-out")!.addEventListener("click", () => {
  const bounds = canvasWrap.getBoundingClientRect();
  previewZoom(1 / 1.25, bounds.width * GRAPH_BUFFER_SCALE / 2, bounds.height * GRAPH_BUFFER_SCALE / 2);
});
document.querySelector("#reset-view")!.addEventListener("click", () => {
  centerX = 0;
  centerY = 0;
  scale = 48;
  draw();
});
document.querySelector("#rerandomize")!.addEventListener("click", () => {
  const seed = new Uint32Array(1);
  crypto.getRandomValues(seed);
  graphOptions.randomSeed = seed[0]!;
  setRandomSeed(graphOptions.randomSeed);
  variableDefinitionCache = undefined;
  renderSliders();
  scheduleDraw();
  setProjectStatus("Random samples rerandomized.");
});
const settingsDialog = document.querySelector<HTMLDialogElement>("#settings-dialog")!;
const audioDialog=document.querySelector<HTMLDialogElement>("#audio-trace-dialog")!;
const audioPlayer=new AudioTracePlayer();
const audioSelection=document.querySelector<HTMLSelectElement>("#audio-trace-expression")!;
const audioMode=document.querySelector<HTMLSelectElement>("#audio-trace-mode")!;
const audioBranch=document.querySelector<HTMLSelectElement>("#audio-trace-branch")!;
const audioLimits=document.querySelector<HTMLParagraphElement>("#audio-trace-limits")!;
const audioPosition=document.querySelector<HTMLInputElement>("#audio-trace-position")!;
const audioOutput=document.querySelector<HTMLOutputElement>("#audio-trace-result")!;
let audioGraphs:CompiledGraph[]=[];
let audioPoints:Array<TracePoint|undefined>=[];
let audioPaths:Array<Array<TracePoint|undefined>>=[];
let audioBounds:[number,number,number,number]=[-10,10,-10,10];
let audioGeneration=0;
const showAudioPoint=(index:number,point:TracePoint|undefined):void=>{
  audioPosition.value=String(Math.min(audioPoints.length-1,index));
  audioOutput.textContent=index>=audioPoints.length?"Trace complete.":point?
    `x ≈ ${Number(point.x.toPrecision(8))}, y ≈ ${Number(point.y.toPrecision(8))}${point.region?` (shaded-region chord, ${point.voices!.length} tones)`:""}`:"Undefined or unshaded sample (silent).";
};
function selectAudioBranch():void{
  audioGeneration++;audioPlayer.stop();
  audioPoints=audioPaths[Number(audioBranch.value)]??[];
  audioPosition.max=String(Math.max(0,audioPoints.length-1));audioPosition.value="0";
  const gaps=audioPoints.filter((point)=>!point).length;
  audioOutput.textContent=audioPoints.length?
    `${audioPoints.length} trace samples${gaps?`; ${gaps} silent samples`:""}. Press Play or use Arrow keys.`:
    "No sampled boundary is visible in this viewport. Try Shaded region or adjust the viewport.";
}
function prepareAudioTrace():void{
  audioGeneration++;
  audioPlayer.stop();
  audioPoints=[];audioPaths=[];audioBranch.replaceChildren();audioLimits.textContent="";
  const graph=audioGraphs[Number(audioSelection.value)];
  if(!graph)throw new Error("Select an available curve.");
  audioMode.closest("label")!.hidden=graph.kind!=="inequality"&&graph.kind!=="polygon";
  let sampleError="";
  const sample=<T,>(evaluate:()=>T,fallback:T):T=>{
    try{return evaluate();}catch(reason){
      if(!(reason instanceof Error))throw reason;
      sampleError ||= reason.message;return fallback;
    }
  };
  const bounds=canvasWrap.getBoundingClientRect();
  const projectedBounds:[number,number,number,number]=[centerX-bounds.width/(2*scale),centerX+bounds.width/(2*scale),
    centerY-bounds.height/(2*verticalScale()),centerY+bounds.height/(2*verticalScale())];
  audioBounds=[worldXAt(0,bounds.width),worldXAt(bounds.width,bounds.width),
    worldYAt(bounds.height,bounds.height),worldYAt(0,bounds.height)];
  const actualPoint=(point:TracePoint|undefined):TracePoint|undefined=>point?{
    ...point,x:unprojectCoordinate(point.x,graphOptions.xScale),y:unprojectCoordinate(point.y,graphOptions.yScale),
    voices:point.voices?.map(y=>unprojectCoordinate(y,graphOptions.yScale)),
  }:undefined;
  if(graph.kind==="parametric"){
    audioPoints=Array.from({length:201},(_,index)=>{
      return sample(()=>{const [x,y]=graph.evaluate(graph.start+(graph.end-graph.start)*index/200);return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:undefined;},undefined);
    });
  }else if(graph.kind==="explicit"||graph.kind==="sideways"){
    const evaluate=(x:number):number=>{
      return sample(()=>{const result=graph.evaluate(x);return typeof result==="number"?result:result.value.toNumber();},NaN);
    };
    audioPoints=graph.kind==="explicit"?tracePoints(x=>projectCoordinate(evaluate(unprojectCoordinate(x,graphOptions.xScale)),graphOptions.yScale),projectedBounds[0],projectedBounds[1]).map(actualPoint):
      tracePoints(y=>projectCoordinate(evaluate(unprojectCoordinate(y,graphOptions.yScale)),graphOptions.xScale),projectedBounds[2],projectedBounds[3]).map((point)=>actualPoint(point?{x:point.y,y:point.x}:undefined));
  }else if(graph.kind==="point"){
    const [x,y]=graph.evaluate();audioPoints=[{x,y}];
  }else if(graph.kind==="list"){
    audioPoints=graph.evaluate().map((y,index)=>y===undefined?undefined:{x:index+1,y});
  }else if(graph.kind==="implicit"||graph.kind==="inequality"||graph.kind==="polygon"){
    const vertices=graph.kind==="polygon"?graph.evaluate():undefined;
    const evaluate=(px:number,py:number):number=>sample(()=>{
      const x=unprojectCoordinate(px,graphOptions.xScale),y=unprojectCoordinate(py,graphOptions.yScale);
      if(graph.kind==="polygon")return polygonSignedDistance(vertices!,x,y);
      const result=graph.evaluate(x,y);return typeof result==="number"?result:result.toNumber();
    },NaN);
    if(graph.kind!=="implicit"&&audioMode.value==="region"){
      audioPoints=traceRegion(evaluate,graph.kind==="polygon"?"<=":graph.relation,projectedBounds).map(actualPoint);
      audioLimits.textContent="Shaded regions use up to five simultaneous sawtooth tones per column, sampled on a 201 × 128 grid. Silent columns have no sampled shading; narrow regions can be missed.";
    }else{
      const contour=traceContour(evaluate,projectedBounds);
      audioPaths=contour.paths.map((path)=>tracePolyline(path).map(actualPoint));
      audioLimits.textContent=`Numerical boundary trace: 96 × 96 cells, refined crossings, 201 points per branch. Narrow features, isolated points, and tangent roots may be missed.${contour.gaps?` ${contour.gaps} nonfinite samples or unresolved crossings.`:""}${contour.limited?" Only the first 128 branches are available.":""}`;
    }
  }else throw new Error("This graph type cannot be audio traced.");
  if(!audioPaths.length&&audioPoints.length)audioPaths=[audioPoints];
  if(sampleError)audioLimits.textContent+=` Sample error: ${sampleError}`;
  for(const [index]of audioPaths.entries()){
    const option=document.createElement("option");option.value=String(index);option.textContent=`Branch ${index+1} of ${audioPaths.length}`;audioBranch.append(option);
  }
  audioBranch.closest("label")!.hidden=audioPaths.length<2;
  refreshDropdowns();selectAudioBranch();
}
document.querySelector("#open-audio-trace")!.addEventListener("click",()=>{
  try{
    audioGraphs=[];audioSelection.replaceChildren();
    synchronizeVariableDefinitions();
    for(const [index,expression]of expressions.entries()){
      if(expression.hidden)continue;
      const graph=getCompiled(expression);
      const members=graph?.kind==="collection"?graph.graphs:graph?[graph]:[];
      for(const member of members){
        if(!["explicit","sideways","parametric","point","list","implicit","inequality","polygon"].includes(member.kind))continue;
        const option=document.createElement("option");option.value=String(audioGraphs.length);
        option.textContent=`Expression ${index+1}: ${expression.text.slice(0,60)}${members.length>1?` (${member.kind})`:""}`;
        audioGraphs.push(member);audioSelection.append(option);
      }
    }
    prepareAudioTrace();refreshDropdowns();audioDialog.showModal();
  }catch(reason){setProjectStatus(reason instanceof Error?reason.message:"Could not open audio trace.");}
});
audioSelection.addEventListener("change",()=>{
  try{prepareAudioTrace();}catch(reason){audioOutput.textContent=reason instanceof Error?reason.message:"Could not trace curve.";}
});
audioMode.addEventListener("change",()=>{
  try{prepareAudioTrace();}catch(reason){audioOutput.textContent=reason instanceof Error?reason.message:"Could not trace region.";}
});
audioBranch.addEventListener("change",selectAudioBranch);
const playPoint=async(index:number):Promise<void>=>{
  try{
    if(!audioPoints.length)throw new Error("There are no sampled points to play.");
    const generation=++audioGeneration;
    audioPlayer.stop();await audioPlayer.start();
    if(!audioDialog.open||generation!==audioGeneration)return;
    index=Math.max(0,Math.min(audioPoints.length-1,index));
    const point=audioPoints[index];showAudioPoint(index,point);
    if(point)audioPlayer.tone(point,...audioBounds);
  }catch(reason){audioOutput.textContent=reason instanceof Error?reason.message:"Could not play trace point.";}
};
document.querySelector("#play-audio-trace")!.addEventListener("click",async()=>{
  const generation=++audioGeneration;
  try{if(!audioPoints.length)throw new Error("There are no sampled points to play.");audioPlayer.stop();await audioPlayer.start();if(audioDialog.open&&generation===audioGeneration)audioPlayer.sequence(audioPoints,audioBounds,showAudioPoint,
    (error)=>{audioOutput.textContent=error.message;});}
  catch(reason){audioOutput.textContent=reason instanceof Error?reason.message:"Could not play audio trace.";}
});
document.querySelector("#stop-audio-trace")!.addEventListener("click",()=>{audioGeneration++;audioPlayer.stop();audioOutput.textContent="Trace stopped.";});
document.querySelector("#previous-audio-point")!.addEventListener("click",()=>void playPoint(Number(audioPosition.value)-1));
document.querySelector("#next-audio-point")!.addEventListener("click",()=>void playPoint(Number(audioPosition.value)+1));
audioPosition.addEventListener("input",()=>void playPoint(Number(audioPosition.value)));
audioDialog.addEventListener("keydown",(event)=>{
  if(event.target instanceof Element&&(event.target.closest(".setting-control")||event.target.closest(".dropdown-menu")))return;
  const keys=["ArrowLeft","ArrowRight","Home","End"];
  if(!keys.includes(event.key)||event.target===audioPosition)return;
  event.preventDefault();
  void playPoint(event.key==="Home"?0:event.key==="End"?audioPoints.length-1:Number(audioPosition.value)+(event.key==="ArrowLeft"?-1:1));
});
document.querySelector("#close-audio-trace")!.addEventListener("click",()=>audioDialog.close());
audioDialog.addEventListener("close",()=>{audioGeneration++;audioPlayer.stop();});
const muteAllButton=document.querySelector<HTMLButtonElement>("#mute-all-tones")!;
muteAllButton.addEventListener("click",()=>{
  if(enabledTones.size||pendingTones.size){tonesMutedByUser=true;muteTones();draw();}
  else {
    tonesMutedByUser=false;
    for(const expression of expressions.filter(expression=>!expression.hidden&&isTone(expression.text)))void playExpressionTone(expression);
  }
});
window.addEventListener("pagehide",()=>{void audioPlayer.close();muteTones();void tonePlayer.close();});
document.addEventListener("visibilitychange",()=>{if(document.hidden)muteTones();else draw();});

const keypadDialog=document.querySelector<HTMLDialogElement>("#math-keypad-dialog")!;
const keypadSelection=document.querySelector<HTMLSelectElement>("#math-keypad-expression")!;
const keypadInput=document.querySelector<HTMLInputElement>("#math-keypad-input")!;
const keypadError=document.querySelector<HTMLParagraphElement>("#math-keypad-error")!;
const autoKeypadSetting=document.querySelector<HTMLInputElement>("#auto-keypad-setting")!;
const AUTO_KEYPAD_STORAGE_KEY="better-desmos-auto-keypad";
try {
  const saved=localStorage.getItem(AUTO_KEYPAD_STORAGE_KEY);
  if(saved!==null&&saved!=="true"&&saved!=="false")throw new Error("Saved math keypad preference is invalid.");
  autoKeypadSetting.checked=saved==="true";
} catch(reason) {
  setProjectStatus(reason instanceof Error?`Could not load math keypad preference: ${reason.message}`:"Could not load math keypad preference.");
}
autoKeypadSetting.addEventListener("change",()=>{
  try {localStorage.setItem(AUTO_KEYPAD_STORAGE_KEY,String(autoKeypadSetting.checked));}
  catch(reason){setProjectStatus(reason instanceof Error?`Could not save math keypad preference: ${reason.message}`:"Could not save math keypad preference.");}
});
let keypadExpression:Expression|undefined;
let keypadField:HTMLInputElement|undefined;
let keypadTableCell:{workspaceKey:string;row:string;axis:string}|undefined;
let focusedExpressionId:number|undefined;
workspaceList.addEventListener("focusin",(event)=>{
  if(!(event.target instanceof HTMLInputElement))return;
  const row=event.target.closest<HTMLElement>("[data-expression-id]");
  if(row)focusedExpressionId=Number(row.dataset.expressionId);
});
function applyKeypadInput():void{
  keypadError.textContent="";
  if(keypadField){
    if(!keypadField.isConnected&&keypadTableCell){
      const wrapper=[...workspaceList.querySelectorAll<HTMLElement>("[data-workspace-key]")]
        .find(item=>item.dataset.workspaceKey===keypadTableCell!.workspaceKey);
      keypadField=[...wrapper?.querySelectorAll<HTMLInputElement>("input[data-table-row][data-table-axis]")??[]]
        .find(input=>input.dataset.tableRow===keypadTableCell!.row&&input.dataset.tableAxis===keypadTableCell!.axis);
    }
    if(!keypadField){keypadError.textContent="The original math field is no longer available.";return;}
    if(!keypadField.isConnected){keypadError.textContent="The original math field is no longer available.";return;}
    if(keypadInput.value.length>keypadField.maxLength){keypadError.textContent=`This field is limited to ${keypadField.maxLength} characters.`;return;}
    keypadField.value=keypadInput.value;
    keypadField.dispatchEvent(new Event("input",{bubbles:true}));
    return;
  }
  if(!keypadExpression)return;
  keypadExpression.text=keypadInput.value;keypadExpression.evaluationError=undefined;
  renderSliders();
  if(isTone(keypadExpression.text)||enabledTones.has(keypadExpression.id)||pendingTones.has(keypadExpression.id))void playExpressionTone(keypadExpression);
  scheduleDraw();scheduleProjectSave();
}
keypadInput.addEventListener("input",applyKeypadInput);
function openMathKeypad(field?:HTMLInputElement):void{
  if(keypadDialog.open)return;
  keypadField=undefined;
  keypadTableCell=undefined;
  const row=field?.closest<HTMLElement>("[data-expression-id]");
  if(field&&!row){
    keypadField=field;
    const workspaceKey=field.closest<HTMLElement>("[data-workspace-key]")?.dataset.workspaceKey;
    if(workspaceKey&&field.dataset.tableRow!==undefined&&field.dataset.tableAxis!==undefined)
      keypadTableCell={workspaceKey,row:field.dataset.tableRow,axis:field.dataset.tableAxis};
  }
  if(row)focusedExpressionId=Number(row.dataset.expressionId);
  if(!keypadField&&!expressions.length)addExpression();
  keypadSelection.replaceChildren();
  for(const [index,expression]of expressions.entries()){
    const option=document.createElement("option");option.value=String(expression.id);option.textContent=`Expression ${index+1}`;keypadSelection.append(option);
  }
  keypadExpression=keypadField?undefined:expressions.find((expression)=>expression.id===focusedExpressionId)??expressions[0];
  keypadSelection.closest("label")!.hidden=Boolean(keypadField);
  keypadSelection.value=keypadExpression?String(keypadExpression.id):"";
  keypadInput.value=keypadField?.value??keypadExpression!.text;
  keypadInput.maxLength=keypadField?.maxLength??512;
  keypadError.textContent="";refreshDropdowns();keypadDialog.showModal();keypadInput.focus();keypadDialog.scrollTop=0;
}
workspaceList.addEventListener("click",event=>{
  if(autoKeypadSetting.checked&&event.target instanceof HTMLInputElement&&event.target.matches("[data-math-keypad]")&&!event.target.disabled&&!event.target.readOnly)
    openMathKeypad(event.target);
});
keypadSelection.addEventListener("change",()=>{
  keypadField=undefined;
  keypadExpression=expressions.find((expression)=>expression.id===Number(keypadSelection.value));
  keypadInput.value=keypadExpression?.text??"";keypadError.textContent="";keypadInput.focus();
});
const keypadKeys=document.querySelector("#math-keypad-keys")!;
for(const [label,text]of [
  ["7","7"],["8","8"],["9","9"],["+","+"],["sin()","sin()"],["cos()","cos()"],
  ["4","4"],["5","5"],["6","6"],["-","-"],["tan()","tan()"],["sqrt()","sqrt()"],
  ["1","1"],["2","2"],["3","3"],["*","*"],["ln()","ln()"],["log()","log()"],
  ["0","0"],[".","."],["pi","pi"],["/","/"],["x","x"],["y","y"],
  ["(","("],[")",")"],["^","^()"],["abs()","abs()"],["[","["],["]","]"],
  ["int","int_{0}^{1} x dx"],["sum","sum_{n=1}^{10} n"],["prod","prod_{n=1}^{10} n"],["theta","theta"],["i","i"],["=","="],
  ["<","<"],["<=","<="],[">",">"],[">=",">="],
  ["Left","left"],["Right","right"],["Backspace","backspace"],["Clear","clear"],[",",","],["{}","{}"],
]as const){
  const button=document.createElement("button");button.type="button";button.textContent=label;
  button.setAttribute("aria-label",`Insert ${label}`);
  button.addEventListener("pointerdown",(event)=>event.preventDefault());
  button.addEventListener("click",()=>{
    const start=keypadInput.selectionStart??keypadInput.value.length,end=keypadInput.selectionEnd??start;
    if(text==="left"||text==="right"){const caret=Math.max(0,Math.min(keypadInput.value.length,start+(text==="left"?-1:1)));keypadInput.setSelectionRange(caret,caret);}
    else if(text==="clear"){keypadInput.value="";applyKeypadInput();}
    else{
      const from=text==="backspace"&&start===end?Math.max(0,start-1):start;
      const insertion=text==="backspace"?"":text;
      if(keypadInput.value.length-(end-from)+insertion.length>keypadInput.maxLength){keypadError.textContent=`This field is limited to ${keypadInput.maxLength} characters.`;return;}
      keypadInput.setRangeText(insertion,from,end,"end");
      const inner=insertion.indexOf("()");
      if(inner>=0)keypadInput.setSelectionRange(from+inner+1,from+inner+1);
      applyKeypadInput();
    }
    keypadInput.focus();
  });keypadKeys.append(button);
}
document.querySelector("#close-math-keypad")!.addEventListener("click",()=>keypadDialog.close());
keypadDialog.addEventListener("close",()=>{
  renderExpressions();scheduleDraw();
});
document.querySelector("#open-settings")!.addEventListener("click", () => {
  updateGraphOptionControls();
  settingsDialog.showModal();
});
document.querySelector("#close-settings")!.addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") settingsDialog.close();
});

const functionReferenceSearch = document.querySelector<HTMLInputElement>("#function-reference-search")!;
const functionReferenceList = document.querySelector<HTMLDivElement>("#function-reference-list")!;
function renderFunctionReference(): void {
  const categories = filterFunctionReference(functionReferenceSearch.value);
  functionReferenceList.replaceChildren();
  if (!categories.length) {
    const empty = document.createElement("p");
    empty.className = "function-reference-empty";
    empty.textContent = "No functions match your search.";
    functionReferenceList.append(empty);
    return;
  }
  for (const category of categories) {
    const heading = document.createElement("h3");
    heading.textContent = category.title;
    const list = document.createElement("dl");
    for (const entry of category.entries) {
      const term = document.createElement("dt");
      const code = document.createElement("code");
      code.textContent = entry.syntax;
      term.append(code);
      const detail = document.createElement("dd");
      detail.textContent = entry.aliases?.length ? `${entry.description} Also: ${entry.aliases.join(", ")}.` : entry.description;
      list.append(term, detail);
    }
    functionReferenceList.append(heading, list);
  }
}
functionReferenceSearch.addEventListener("input", renderFunctionReference);
renderFunctionReference();

const colorSchemeSelect = document.querySelector<HTMLSelectElement>("#color-scheme-setting")!;
const customThemeForm = document.querySelector<HTMLFormElement>("#custom-theme-form")!;
const customThemeName = document.querySelector<HTMLInputElement>("#custom-theme-name")!;
let editingColorSchemeId: string | undefined;

function getCustomThemeColors(): ThemeColors {
  const colorsToRead = { ...selectedColorScheme().colors };
  for (const [key, , id] of themeColorFields) {
    colorsToRead[key] = document.querySelector<HTMLInputElement>(`#${id}`)!.value;
  }
  return colorsToRead;
}

function fillCustomThemeForm(scheme: ColorScheme): void {
  customThemeName.value = scheme.name;
  for (const [key, , id] of themeColorFields) {
    document.querySelector<HTMLInputElement>(`#${id}`)!.value = scheme.colors[key];
  }
}

function persistColorSchemes(): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(colorSchemeSettings));
  } catch (reason) {
    setProjectStatus(reason instanceof Error
      ? `Could not save color schemes: ${reason.message}`
      : "Could not save color schemes.");
  }
}

function updateColorSchemeControls(): void {
  colorSchemeSelect.replaceChildren();
  const presets = document.createElement("optgroup");
  presets.label = "Built-in schemes";
  for (const scheme of builtInColorSchemes) {
    const option = new Option(scheme.name, scheme.id);
    presets.append(option);
  }
  colorSchemeSelect.append(presets);
  if (colorSchemeSettings.custom.length > 0) {
    const custom = document.createElement("optgroup");
    custom.label = "Your schemes";
    for (const scheme of colorSchemeSettings.custom) {
      custom.append(new Option(scheme.name, scheme.id));
    }
    colorSchemeSelect.append(custom);
  }
  colorSchemeSelect.value = colorSchemeSettings.selectedId;
  const isCustom = colorSchemeSettings.custom.some(
    (scheme) => scheme.id === colorSchemeSettings.selectedId,
  );
  document.querySelector<HTMLButtonElement>("#delete-color-scheme")!.hidden = !isCustom;
  document.querySelector<HTMLButtonElement>("#new-color-scheme")!.textContent =
    isCustom ? "Edit selected custom scheme" : "Create custom scheme";
  refreshDropdowns();
}

updateColorSchemeControls();
colorSchemeSelect.addEventListener("change", () => {
  colorSchemeSettings.selectedId = colorSchemeSelect.value;
  applyColorScheme(selectedColorScheme().colors);
  draw();
  updateColorSchemeControls();
  persistColorSchemes();
});
document.querySelector("#new-color-scheme")!.addEventListener("click", () => {
  const current = selectedColorScheme();
  editingColorSchemeId = colorSchemeSettings.custom.some((scheme) => scheme.id === current.id)
    ? current.id
    : undefined;
  fillCustomThemeForm(editingColorSchemeId ? current : {
    id: "",
    name: "My color scheme",
    colors: current.colors,
  });
  customThemeForm.hidden = false;
  customThemeName.focus();
});
document.querySelector("#cancel-color-scheme")!.addEventListener("click", () => {
  customThemeForm.hidden = true;
  editingColorSchemeId = undefined;
  applyColorScheme(selectedColorScheme().colors);
  draw();
});
for (const [, , id] of themeColorFields) {
  document.querySelector<HTMLInputElement>(`#${id}`)!.addEventListener("input", () => {
    applyColorScheme(getCustomThemeColors());
    draw();
  });
}
customThemeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = customThemeName.value.trim();
  if (!name) {
    customThemeName.setCustomValidity("Enter a name for this color scheme.");
    customThemeName.reportValidity();
    return;
  }
  customThemeName.setCustomValidity("");
  const colorsToSave = getCustomThemeColors();
  let id = editingColorSchemeId ?? `custom-${Date.now()}`;
  while (!editingColorSchemeId &&
      [...builtInColorSchemes, ...colorSchemeSettings.custom].some((scheme) => scheme.id === id)) {
    id = `custom-${Number(id.slice("custom-".length)) + 1}`;
  }
  const scheme = { id, name, colors: colorsToSave };
  const index = colorSchemeSettings.custom.findIndex((custom) => custom.id === id);
  if (index >= 0) colorSchemeSettings.custom[index] = scheme;
  else if (colorSchemeSettings.custom.length < 30) colorSchemeSettings.custom.push(scheme);
  else {
    setProjectStatus("You can save up to 30 custom color schemes.");
    return;
  }
  colorSchemeSettings.selectedId = scheme.id;
  editingColorSchemeId = undefined;
  customThemeForm.hidden = true;
  applyColorScheme(scheme.colors);
  draw();
  updateColorSchemeControls();
  persistColorSchemes();
});
document.querySelector("#delete-color-scheme")!.addEventListener("click", () => {
  const selected = selectedColorScheme();
  if (!colorSchemeSettings.custom.some((scheme) => scheme.id === selected.id) ||
      !window.confirm(`Delete the "${selected.name}" color scheme?`)) return;
  colorSchemeSettings.custom = colorSchemeSettings.custom.filter((scheme) => scheme.id !== selected.id);
  colorSchemeSettings.selectedId = "dark";
  customThemeForm.hidden = true;
  applyColorScheme(selectedColorScheme().colors);
  draw();
  updateColorSchemeControls();
  persistColorSchemes();
});

function updateGraphOptionControls(): void {
  document.querySelector<HTMLInputElement>("#show-grid-setting")!.checked = graphOptions.showGrid;
  document.querySelector<HTMLInputElement>("#show-x-axis-setting")!.checked = graphOptions.showXAxis;
  document.querySelector<HTMLInputElement>("#show-y-axis-setting")!.checked = graphOptions.showYAxis;
  document.querySelector<HTMLInputElement>("#show-labels-setting")!.checked = graphOptions.showLabels;
  const ratio = document.querySelector<HTMLSelectElement>("#aspect-ratio-setting")!;
  ratio.querySelector('option[data-custom-ratio]')?.remove();
  if (![0.5,1,2].includes(graphOptions.aspectRatio)) {
    const option = document.createElement("option");
    option.value = String(graphOptions.aspectRatio);
    option.textContent = `Custom (${Number(graphOptions.aspectRatio.toPrecision(5))})`;
    option.dataset.customRatio = "";
    ratio.append(option);
  }
  ratio.value = String(graphOptions.aspectRatio);
  document.querySelector<HTMLSelectElement>("#grid-mode-setting")!.value = graphOptions.gridMode ?? "cartesian";
  document.querySelector<HTMLInputElement>("#minor-grid-setting")!.checked = graphOptions.minorGrid ?? false;
  document.querySelector<HTMLInputElement>("#complex-mode-setting")!.checked = graphOptions.complexMode ?? false;
  document.querySelector<HTMLSelectElement>("#x-scale-setting")!.value = graphOptions.xScale ?? "linear";
  document.querySelector<HTMLSelectElement>("#y-scale-setting")!.value = graphOptions.yScale ?? "linear";
  document.querySelector<HTMLInputElement>("#x-step-setting")!.value = graphOptions.xStep?.toString() ?? "";
  document.querySelector<HTMLInputElement>("#y-step-setting")!.value = graphOptions.yStep?.toString() ?? "";
  document.querySelector<HTMLInputElement>("#x-axis-label-setting")!.value = graphOptions.xAxisLabel ?? "";
  document.querySelector<HTMLInputElement>("#y-axis-label-setting")!.value = graphOptions.yAxisLabel ?? "";
  const bounds = canvasWrap.getBoundingClientRect();
  for (const [id,value] of [
    ["x-min",worldXAt(0,bounds.width)], ["x-max",worldXAt(bounds.width,bounds.width)],
    ["y-min",worldYAt(bounds.height,bounds.height)], ["y-max",worldYAt(0,bounds.height)],
  ] as const) document.querySelector<HTMLInputElement>(`#${id}-setting`)!.value = String(value);
  document.querySelector<HTMLSelectElement>("#angle-mode-setting")!.value = graphOptions.angleMode;
  document.querySelector<HTMLSelectElement>("#statistics-mode-setting")!.value = graphOptions.statisticsMode;
  refreshDropdowns();
}
updateGraphOptionControls();
for(const axis of ["x","y"] as const){
  document.querySelector<HTMLSelectElement>(`#${axis}-scale-setting`)!.addEventListener("change",event=>{
    const mode=(event.currentTarget as HTMLSelectElement).value;
    if(mode!=="linear"&&mode!=="log")throw new Error("Invalid axis scale.");
    graphOptions[axis==="x"?"xScale":"yScale"]=mode;
    if(axis==="x")centerX=0;else centerY=0;
    updateGraphOptionControls();draw();
  });
}
document.querySelector<HTMLInputElement>("#complex-mode-setting")!.addEventListener("change",(event)=>{
  graphOptions.complexMode=(event.currentTarget as HTMLInputElement).checked;
  variableDefinitionCache=undefined;renderSliders();draw();
});

const graphOptionInputs: Array<[keyof Pick<GraphOptions, "showGrid" | "showXAxis" | "showYAxis" | "showLabels" | "minorGrid">, string]> = [
  ["showGrid", "#show-grid-setting"],
  ["showXAxis", "#show-x-axis-setting"],
  ["showYAxis", "#show-y-axis-setting"],
  ["showLabels", "#show-labels-setting"],
  ["minorGrid", "#minor-grid-setting"],
];
for (const [option, selector] of graphOptionInputs) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  input.addEventListener("change", () => {
    graphOptions[option] = input.checked;
    draw();
  });
}
document.querySelector<HTMLSelectElement>("#grid-mode-setting")!.addEventListener("change", (event) => {
  const value = (event.currentTarget as HTMLSelectElement).value;
  if (value !== "cartesian" && value !== "polar") throw new Error("Invalid grid coordinate mode.");
  graphOptions.gridMode = value;
  draw();
});
for (const [key, selector] of [["xStep","#x-step-setting"],["yStep","#y-step-setting"]] as const) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  input.addEventListener("change", () => {
    try {
      graphOptions[key] = axisStep(input.value);
      input.removeAttribute("aria-invalid");
      draw();
    } catch (reason) {
      input.setAttribute("aria-invalid","true");
      const message = reason instanceof Error ? reason.message : "Invalid axis step.";
      document.querySelector("#grid-step-warning")!.textContent = message;
      setProjectStatus(message);
    }
  });
}
for (const [key, selector] of [["xAxisLabel","#x-axis-label-setting"],["yAxisLabel","#y-axis-label-setting"]] as const) {
  const input = document.querySelector<HTMLInputElement>(selector)!;
  input.addEventListener("input", () => { graphOptions[key] = input.value; draw(); });
}
document.querySelector("#apply-view-bounds")!.addEventListener("click", () => {
  try {
    const bounds = canvasWrap.getBoundingClientRect();
    const fields = ["x-min","x-max","y-min","y-max"].map((id) => document.querySelector<HTMLInputElement>(`#${id}-setting`)!);
    if (fields.some((input) => !input.value.trim())) throw new Error("Enter all four viewport bounds.");
    const fitted = fitViewportBounds(bounds.width,bounds.height,
      projectCoordinate(Number(fields[0]!.value),graphOptions.xScale),projectCoordinate(Number(fields[1]!.value),graphOptions.xScale),
      projectCoordinate(Number(fields[2]!.value),graphOptions.yScale),projectCoordinate(Number(fields[3]!.value),graphOptions.yScale));
    centerX = fitted.centerX; centerY = fitted.centerY; scale = fitted.scale;
    graphOptions.aspectRatio = fitted.aspectRatio;
    updateGraphOptionControls(); draw();
    setProjectStatus("Viewport fitted to the exact requested bounds.");
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Could not apply viewport bounds.";
    document.querySelector("#grid-step-warning")!.textContent = message;
    setProjectStatus(message);
  }
});
const aspectRatioInput = document.querySelector<HTMLSelectElement>("#aspect-ratio-setting")!;
document.querySelector<HTMLSelectElement>("#statistics-mode-setting")!.addEventListener("change", (event) => {
  const mode = (event.currentTarget as HTMLSelectElement).value;
  if (mode !== "sample" && mode !== "population") throw new Error("Unsupported statistics convention.");
  graphOptions.statisticsMode = mode;
  renderSliders();
  renderTables();
  draw();
});
aspectRatioInput.value = String(graphOptions.aspectRatio);
aspectRatioInput.addEventListener("change", () => {
  const aspectRatio = Number(aspectRatioInput.value);
  if (!Number.isFinite(aspectRatio) || aspectRatio < 0.001 || aspectRatio > 1000) {
    throw new Error("Unsupported axis scale ratio.");
  }
  graphOptions.aspectRatio = aspectRatio;
  draw();
});

document.querySelector<HTMLSelectElement>("#angle-mode-setting")!.addEventListener("change", (event) => {
  const mode = (event.currentTarget as HTMLSelectElement).value as AngleMode;
  setAngleMode(mode);
  graphOptions.angleMode = mode;
  variableDefinitionCache = undefined;
  renderSliders();
  renderTables();
  renderExpressions();
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

function findDraggablePoint(screenX: number, screenY: number): DraggableGraphPoint | undefined {
  let nearest: DraggableGraphPoint | undefined;
  let nearestDistance = 13;
  for (const point of draggableGraphPoints) {
    if (!point.draggable) continue;
    const distance = Math.hypot(point.screenX - screenX, point.screenY - screenY);
    if (distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function updateSliderInputValues(name: string): void {
  const value = String(sliderValues[name]);
  for (const input of sliderList.querySelectorAll<HTMLInputElement>("input")) {
    if (input.getAttribute("aria-label") === `Slider ${name}` ||
        input.getAttribute("aria-label") === `Slider ${name} value`) {
      input.value = value;
    }
  }
}

function moveDraggablePoint(
  point: DraggableGraphPoint,
  clientX: number,
  clientY: number,
  bounds: DOMRect,
  startSliderValues: Record<string, number>,
  pointerOffsetX: number,
  pointerOffsetY: number,
): void {
  const graphX = clientX - bounds.left + bounds.width * GRAPH_BUFFER_VIEWPORTS;
  const graphY = clientY - bounds.top + bounds.height * GRAPH_BUFFER_VIEWPORTS;
  const requestedX = worldXAt(graphX,bounds.width*GRAPH_BUFFER_SCALE)-pointerOffsetX;
  const requestedY = worldYAt(graphY,bounds.height*GRAPH_BUFFER_SCALE)-pointerOffsetY;
  if(point.directSource!==undefined){
    const expression=expressions.find((expression)=>expression.id===point.expressionId);
    if(!expression)throw new Error("The dragged expression no longer exists.");
    const definition=getVariableDefinition(expression);
    const prefix=definition&&pointSources(definition.source)?`${definition.target}=`:"";
    const text=point.vertexIndex===undefined?`${prefix}(${numericSource(Number(requestedX.toPrecision(12)))},${numericSource(Number(requestedY.toPrecision(12)))})`:
      replacePolygonVertex(point.directSource,point.vertexIndex,requestedX,requestedY);
    if(text.length>512){setProjectStatus("Dragged coordinates would exceed the 512-character expression limit.");return;}
    expression.text=text;
    const input=workspaceList.querySelector<HTMLInputElement>(`[data-expression-id="${expression.id}"] input`);
    if(input)input.value=text;
    return;
  }
  const updateCoordinateSliders = (names: string[], delta: number): void => {
    for (const name of names) {
      const options = sliderOptions[name]!;
      sliderValues[name] = Math.min(
        options.max,
        Math.max(options.min, startSliderValues[name]! + delta),
      );
      updateSliderInputValues(name);
    }
  };
  updateCoordinateSliders(point.xVariables, requestedX - point.x);
  updateCoordinateSliders(point.yVariables, requestedY - point.y);
}

canvas.addEventListener("pointerdown", (event) => {
  cancelRefinement();
  const bounds = canvasWrap.getBoundingClientRect();
  const screenX = event.clientX - bounds.left + bounds.width * GRAPH_BUFFER_VIEWPORTS;
  const screenY = event.clientY - bounds.top + bounds.height * GRAPH_BUFFER_VIEWPORTS;
  const point = event.altKey ? undefined : findDraggablePoint(screenX, screenY);
  const pointerGraphX = worldXAt(screenX,bounds.width*GRAPH_BUFFER_SCALE);
  const pointerGraphY = worldYAt(screenY,bounds.height*GRAPH_BUFFER_SCALE);
  let photoDrag: NonNullable<typeof drag>["photo"];
  if(event.altKey){
    for(const item of workspaceBlocks().flatMap((block)=>block.items).filter((item)=>item.type==="photo")
      .flatMap((item)=>photos.filter((photo)=>photo.id===item.id))){
      if(item.hidden)continue;
      try{
        const transform=evaluatePhotoTransform(item,sliderValues,expandFunctions);
        const [x,y]=photoLocalPoint(transform,pointerGraphX,pointerGraphY);
        if(Math.abs(x)<=Math.abs(transform.width)/2&&Math.abs(y)<=Math.abs(transform.height)/2){
          photoDrag={item,transform,start:[pointerGraphX,pointerGraphY],mode:event.shiftKey?"scale":event.ctrlKey||event.metaKey?"rotate":"move",
            original:{centerX:item.centerX,centerY:item.centerY,width:item.width,height:item.height,rotation:item.rotation}};
          flushPendingHistory();
          break;
        }
      }catch(reason){setProjectStatus(reason instanceof Error?reason.message:"Could not manipulate photo.");}
    }
  }
  if (point) {
    flushPendingHistory();
    for (const name of new Set([...point.xVariables, ...point.yVariables])) {
      stopSliderAnimation(name);
    }
  }
  drag = {
    x: event.clientX,
    y: event.clientY,
    centerX,
    centerY,
    moved: false,
    photo: photoDrag,
    point,
    startSliderValues: point
      ? Object.fromEntries([...new Set([...point.xVariables, ...point.yVariables])]
        .map((name) => [name, sliderValues[name]!]))
      : undefined,
    pointerOffsetX: point ? pointerGraphX - point.x : undefined,
    pointerOffsetY: point ? pointerGraphY - point.y : undefined,
  };
  canvas.setPointerCapture(event.pointerId);
  canvas.style.cursor = point || photoDrag ? "grabbing" : "crosshair";
  hoverPosition = {
    x: screenX,
    y: screenY,
  };
  drawHoverOverlay();
});
canvas.addEventListener("pointermove", (event) => {
  const bounds = canvasWrap.getBoundingClientRect();
  if (drag) {
    if(drag.photo){
      if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<=2)return;
      const state=drag.photo;
      const end:[number,number]=[worldXAt(event.clientX-bounds.left,bounds.width),
        worldYAt(event.clientY-bounds.top,bounds.height)];
      try{
        const transform=photoDragTransform(state.transform,state.mode,state.start,end);
        if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>2)drag.moved=true;
        state.item.centerX=numericSource(transform.centerX);state.item.centerY=numericSource(transform.centerY);
        state.item.width=numericSource(transform.width/state.item.initialWidth);
        state.item.height=numericSource(transform.height/state.item.initialHeight);
        state.item.rotation=numericSource(state.item.rotationUnit==="degrees"?transform.rotation*180/Math.PI:transform.rotation);
        for(const [key]of PHOTO_FIELDS){
          const input=photoList.querySelector<HTMLInputElement>(`[data-workspace-key="photo:${state.item.id}"] input[data-photo-field="${key}"]`);
          if(input)input.value=state.item[key];
        }
        scheduleDraw();
      }catch(reason){setProjectStatus(reason instanceof Error?reason.message:"Could not manipulate photo.");}
      return;
    }
    if (drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) {
      drag.moved = true;
      if (drag.point) {
        moveDraggablePoint(
          drag.point,
          event.clientX,
          event.clientY,
          bounds,
          drag.startSliderValues ?? {},
          drag.pointerOffsetX ?? 0,
          drag.pointerOffsetY ?? 0,
        );
        scheduleDraw();
        return;
      }
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      centerX = drag.centerX - deltaX / scale;
      centerY = drag.centerY + deltaY / verticalScale();
      updateGraphPreviewTransform();
      drawGrid();
      pointContext.clearRect(0, 0, bounds.width, bounds.height);
    }
  } else {
    const screenX = event.clientX - bounds.left + bounds.width * GRAPH_BUFFER_VIEWPORTS;
    const screenY = event.clientY - bounds.top + bounds.height * GRAPH_BUFFER_VIEWPORTS;
    canvas.style.cursor = findDraggablePoint(screenX, screenY) ? "grab" : "crosshair";
    hoverPosition = {
      x: screenX,
      y: screenY,
    };
    drawHoverOverlay();
  }
});
canvas.addEventListener("pointerup", (event) => {
  const bounds = canvasWrap.getBoundingClientRect();
  const finishedDrag = drag;
  if (finishedDrag && !finishedDrag.moved && !finishedDrag.photo) {
    const screenX = event.clientX - bounds.left + bounds.width * GRAPH_BUFFER_VIEWPORTS;
    const screenY = event.clientY - bounds.top + bounds.height * GRAPH_BUFFER_VIEWPORTS;
    hoverPosition = { x: screenX, y: screenY };
    const priority = hoverCurvePriorities();
    const nearest = selectHoverPoint(hoverSegmentsNear(screenX, screenY, true), screenX, screenY,
      (curve) => priority.get(curve.id.split(":")[0]!) ?? Infinity);
    const ids = hoverCandidates.filter((point) => Math.hypot(point.screenX - screenX, point.screenY - screenY) <= 10)
      .flatMap((point) => point.graphIds);
    if (nearest) ids.push(nearest.curve.id);
    const expression = ids.map((id) => /^(?:expression|implicit)-(\d+)/.exec(id))
      .map((match) => match && expressions.find((expression) => expression.id === Number(match[1])))
      .find((expression) => expression?.clickAction);
    if (expression?.clickAction) {
      try { applyActionUpdates(prepareActionUpdates(expression.clickAction)); }
      catch (reason) { setProjectStatus(reason instanceof Error ? reason.message : "Could not run graph click action."); }
    } else if (!finishedDrag.point) addGraphPointAt(screenX, screenY);
  }
  const moved = finishedDrag?.moved ?? false;
  drag = undefined;
  canvas.style.cursor = "crosshair";
  if(finishedDrag?.photo){
    renderPhotos();
    scheduleDraw();
    if(moved){
      scheduleProjectSave();
      setProjectStatus("Photo transform updated. Undo restores the original formulas.");
    }
  }else if (finishedDrag?.point && moved) {
    hoverPosition = undefined;
    scheduleDraw();
    scheduleProjectSave();
  } else if (moved) {
    hoverPosition = undefined;
    clearDragTransformAfterDraw = true;
    scheduleDraw();
  } else {
    canvas.style.transform = "";
    detailCanvas.style.transform = "";
    drawHoverOverlay();
    scheduleRefinement();
  }
});
canvas.addEventListener("pointercancel", () => {
  if(drag?.photo){Object.assign(drag.photo.item,drag.photo.original);renderPhotos();}
  if (drag?.point && drag.moved) {
    if(drag.point.directSource!==undefined){
      const expression=expressions.find((expression)=>expression.id===drag!.point!.expressionId);
      if(expression){expression.text=drag.point.directSource;renderExpressions();}
    }
    for (const [name, value] of Object.entries(drag.startSliderValues ?? {})) {
      sliderValues[name] = value;
      updateSliderInputValues(name);
    }
    scheduleDraw();
    scheduleProjectSave();
  } else if (drag?.moved) {
    centerX = drag.centerX;
    centerY = drag.centerY;
    scheduleDraw();
  }
  drag = undefined;
  clearDragTransformAfterDraw = false;
  canvas.style.transform = "";
  detailCanvas.style.transform = "";
  canvas.style.cursor = "crosshair";
  drawGrid();
  drawHoverOverlay();
  scheduleRefinement();
});
canvas.addEventListener("pointerleave", () => {
  if (!drag) {
    hoverPosition = undefined;
    canvas.style.cursor = "crosshair";
    drawHoverOverlay();
  }
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const bounds = canvasWrap.getBoundingClientRect();
  const mouseX = event.clientX - bounds.left + bounds.width * GRAPH_BUFFER_VIEWPORTS;
  const mouseY = event.clientY - bounds.top + bounds.height * GRAPH_BUFFER_VIEWPORTS;
  previewZoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, mouseX, mouseY);
}, { passive: false });

window.addEventListener("resize", draw);
installWorkspaceResize(
  document.querySelector<HTMLElement>(".workspace")!,
  document.querySelector<HTMLElement>("#workspace-divider")!, scheduleDraw, setProjectStatus,
);
installFunctionAutocomplete(workspaceList, setProjectStatus);
desmosModeInput.checked = true;
desmosModeInput.dispatchEvent(new Event("change"));
setProjectStatus(projectStatus);
renderPhotos();
renderTextBlocks();
renderExpressions();
renderTables();
renderTickers();
draw();

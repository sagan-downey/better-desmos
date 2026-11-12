import { compileExpression, compileGraphExpression, type GraphExpression } from "./math";

export interface RestrictionEndpoint {
  x: number;
  y: number;
  closed: boolean;
}

export interface RestrictionEndpointOptions {
  variables?: Record<string, number>;
  sliderBounds?: Record<string, { min: number; max: number }>;
  parameterDomain?: { min: number; max: number };
}

type Comparison = { left: string; operator: string; right: string };
type Point = { x: number; y: number };
type ScalarEvaluator = (parameter: number, point: Point) => number;

const MAX_SOURCE_COMPARISONS = 32;
const MAX_SOURCE_LENGTH = 10_000;
const MAX_CONDITION_NESTING = 64;
const MAX_DOMAIN_SPAN = 1_000_000;
const MAX_COORDINATE = 1_000_000_000_000;
const SCAN_INTERVALS = 96;
const MAX_CANDIDATES = 256;
const BISECTION_ITERATIONS = 52;
const LIMIT_SAMPLES = 36;

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) &&
    Math.abs(point.x) <= MAX_COORDINATE && Math.abs(point.y) <= MAX_COORDINATE;
}

function graphPoint(graph: GraphExpression, parameter: number): Point | undefined {
  try {
    if (graph.kind === "explicit") {
      const result = graph.evaluate(parameter);
      return { x: parameter, y: typeof result === "number" ? result : result.value.toNumber() };
    }
    if (graph.kind === "sideways") {
      const result = graph.evaluate(parameter);
      return { x: typeof result === "number" ? result : result.value.toNumber(), y: parameter };
    }
    if (graph.kind === "parametric") {
      if (parameter < graph.start || parameter > graph.end) return undefined;
      const [x, y] = graph.evaluate(parameter);
      return { x, y };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function stripOuterParentheses(source: string): string {
  let value = source.trim();
  while (value.startsWith("(") && value.endsWith(")")) {
    let depth = 0;
    let wrapsAll = true;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === "(") depth += 1;
      if (value[index] === ")") depth -= 1;
      if (depth === 0 && index < value.length - 1) {
        wrapsAll = false;
        break;
      }
    }
    if (!wrapsAll) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

function topLevelSplits(source: string, delimiter: "," | ":" | "and" | "or"): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === "(" || character === "{") depth += 1;
    else if (character === ")" || character === "}") depth -= 1;
    if (depth !== 0) continue;
    if (delimiter === "," || delimiter === ":") {
      if (character === delimiter) {
        parts.push(source.slice(start, index).trim());
        start = index + 1;
      }
      continue;
    }
    if (source.slice(index, index + delimiter.length).toLowerCase() === delimiter &&
        !/[a-z0-9_]/i.test(source[index - 1] ?? "") &&
        !/[a-z0-9_]/i.test(source[index + delimiter.length] ?? "")) {
      parts.push(source.slice(start, index).trim());
      start = index + delimiter.length;
      index += delimiter.length - 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function comparisonTokens(source: string): Comparison[] {
  const normalized = stripOuterParentheses(source);
  for (const logical of ["and", "or"] as const) {
    const parts = topLevelSplits(normalized, logical);
    if (parts.length > 1) return parts.flatMap(comparisonTokens);
  }
  const positions: Array<{ index: number; operator: string }> = [];
  let depth = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (character === "(" || character === "{") depth += 1;
    else if (character === ")" || character === "}") depth -= 1;
    if (depth !== 0) continue;
    const match = /^(<=|>=|!=|≠|≤|≥|[<>=])/.exec(normalized.slice(index));
    if (!match) continue;
    positions.push({
      index,
      operator: match[0] === "≤" ? "<=" : match[0] === "≥" ? ">=" :
        match[0] === "≠" ? "!=" : match[0],
    });
    index += match[0].length - 1;
  }
  if (positions.length === 0) return [];
  const comparisons: Comparison[] = [];
  for (let index = 0; index < positions.length; index += 1) {
    const start = index === 0 ? 0 : positions[index - 1]!.index + positions[index - 1]!.operator.length;
    const position = positions[index]!;
    const end = index + 1 < positions.length ? positions[index + 1]!.index : normalized.length;
    const left = normalized.slice(start, position.index).trim();
    const right = normalized.slice(position.index + position.operator.length, end).trim();
    if (left && right) comparisons.push({ left, operator: position.operator, right });
  }
  return comparisons;
}

function conditionSources(source: string): string[] {
  const conditions: string[] = [];
  const visit = (text: string, nesting = 0): void => {
    if (nesting >= MAX_CONDITION_NESTING) return;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== "{") continue;
      const start = index + 1;
      let depth = 1;
      let cursor = start;
      while (cursor < text.length && depth > 0) {
        if (text[cursor] === "{") depth += 1;
        else if (text[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      if (depth !== 0) break;
      const content = text.slice(start, cursor - 1);
      for (const part of topLevelSplits(content, ",")) {
        const branches = topLevelSplits(part, ":");
        const condition = branches.length > 1 ? branches[0]! : part;
        if (comparisonTokens(condition).length > 0) conditions.push(condition);
      }
      visit(content, nesting + 1);
      index = cursor - 1;
    }
  };
  visit(source);
  return conditions;
}

function directParameterValue(
  comparison: Comparison,
  parameterName: "x" | "y" | "t",
  variables: Record<string, number>,
): number | undefined {
  const left = stripOuterParentheses(comparison.left);
  const right = stripOuterParentheses(comparison.right);
  const candidate = left.toLowerCase() === parameterName ? right :
    right.toLowerCase() === parameterName ? left : undefined;
  if (!candidate) return undefined;
  try {
    if (/\b(?:x|y|t)\b/i.test(candidate)) return undefined;
    const value = compileExpression(candidate, variables, true)(0, 0).value.toNumber();
    return Number.isFinite(value) && Math.abs(value) <= MAX_DOMAIN_SPAN ? value : undefined;
  } catch {
    return undefined;
  }
}

function usableDomain(domain: { min: number; max: number } | undefined): { min: number; max: number } {
  if (!domain || !Number.isFinite(domain.min) || !Number.isFinite(domain.max) ||
      domain.min >= domain.max || Math.abs(domain.min) > MAX_DOMAIN_SPAN ||
      Math.abs(domain.max) > MAX_DOMAIN_SPAN || domain.max - domain.min > MAX_DOMAIN_SPAN) {
    return { min: -10, max: 10 };
  }
  return domain;
}

function pointAtParameter(
  graph: GraphExpression,
  parameter: number,
  variables: Record<string, number>,
): Point | undefined {
  if (graph.kind !== "parametric") return graphPoint(graph, parameter);
  if (parameter < graph.start || parameter > graph.end) return undefined;
  variables.t = parameter;
  return graphPoint(graph, parameter);
}

function boundaryEvaluator(
  comparison: Comparison,
  variables: Record<string, number>,
  parameterName: "x" | "y" | "t",
): ScalarEvaluator | undefined {
  try {
    const left = compileExpression(comparison.left, variables, true);
    const right = compileExpression(comparison.right, variables, true);
    return (parameter, point) => {
      if (parameterName === "t") variables.t = parameter;
      const leftValue = left(point.x, point.y).value.toNumber();
      const rightValue = right(point.x, point.y).value.toNumber();
      const difference = leftValue - rightValue;
      return Number.isFinite(difference) && Math.abs(difference) <= MAX_COORDINATE
        ? difference
        : Number.NaN;
    };
  } catch {
    return undefined;
  }
}

function addRootCandidates(
  comparison: Comparison,
  evaluator: ScalarEvaluator | undefined,
  graph: GraphExpression,
  domain: { min: number; max: number },
  parameterName: "x" | "y" | "t",
  variables: Record<string, number>,
  candidates: number[],
): void {
  const direct = directParameterValue(comparison, parameterName, variables);
  if (direct !== undefined) {
    candidates.push(direct);
    return;
  }
  if (!evaluator) return;

  const sampled: Array<{ parameter: number; value: number }> = [];
  let zeroCount = 0;
  for (let index = 0; index <= SCAN_INTERVALS; index += 1) {
    const parameter = domain.min + (domain.max - domain.min) * index / SCAN_INTERVALS;
    const point = pointAtParameter(graph, parameter, variables);
    if (!point || !isFinitePoint(point)) {
      sampled.push({ parameter, value: Number.NaN });
      continue;
    }
    const value = evaluator(parameter, point);
    if (Number.isFinite(value) && Math.abs(value) <= 1e-12) zeroCount += 1;
    sampled.push({ parameter, value });
  }
  if (zeroCount > 2) return;

  for (let index = 0; index < sampled.length - 1 && candidates.length < MAX_CANDIDATES; index += 1) {
    const first = sampled[index]!;
    const second = sampled[index + 1]!;
    if (Number.isFinite(first.value) && Math.abs(first.value) <= 1e-12) candidates.push(first.parameter);
    if (!Number.isFinite(first.value) || !Number.isFinite(second.value) ||
        first.value === 0 || second.value === 0 ||
        (first.value < 0) === (second.value < 0)) continue;
    let low = first.parameter;
    let high = second.parameter;
    let lowValue = first.value;
    for (let iteration = 0; iteration < BISECTION_ITERATIONS; iteration += 1) {
      const middle = (low + high) / 2;
      const point = pointAtParameter(graph, middle, variables);
      if (!point || !isFinitePoint(point)) break;
      const middleValue = evaluator(middle, point);
      if (!Number.isFinite(middleValue)) break;
      if (middleValue === 0) {
        low = middle;
        high = middle;
        break;
      }
      if ((middleValue < 0) === (lowValue < 0)) {
        low = middle;
        lowValue = middleValue;
      } else {
        high = middle;
      }
    }
    candidates.push((low + high) / 2);
  }
  const last = sampled[sampled.length - 1]!;
  if (Number.isFinite(last.value) && Math.abs(last.value) <= 1e-12) candidates.push(last.parameter);
}

function oneSidedLimit(
  graph: GraphExpression,
  parameter: number,
  direction: -1 | 1,
  span: number,
): Point | undefined {
  let distance = Math.min(Math.max(1e-3, Math.abs(parameter) * 1e-3), span * 0.01);
  if (!Number.isFinite(distance) || distance <= 0) return undefined;
  const points: Point[] = [];
  for (let sample = 0; sample < LIMIT_SAMPLES; sample += 1) {
    const point = graphPoint(graph, parameter + direction * distance);
    if (point && isFinitePoint(point)) points.push(point);
    else break;
    distance *= 0.5;
  }
  if (points.length < 4) return undefined;
  const last = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  const beforePrevious = points[points.length - 3]!;
  const scale = 1 + Math.max(Math.abs(last.x), Math.abs(last.y));
  const tolerance = 1e-6 * scale;
  if (Math.hypot(last.x - previous.x, last.y - previous.y) > tolerance ||
      Math.hypot(previous.x - beforePrevious.x, previous.y - beforePrevious.y) > tolerance) {
    return undefined;
  }
  return last;
}

function stripPostfixRestrictions(source: string): string {
  let base = source.trim();
  while (base.endsWith("}")) {
    let depth = 0;
    let opening = -1;
    for (let index = base.length - 1; index >= 0; index -= 1) {
      if (base[index] === "}") depth += 1;
      else if (base[index] === "{") {
        depth -= 1;
        if (depth === 0) {
          opening = index;
          break;
        }
      }
    }
    if (opening < 0) break;
    const prefix = base.slice(0, opening).trimEnd();
    if (!prefix || /[+\-*/^_(:,=<>]$/.test(prefix)) break;
    base = prefix;
  }
  return base;
}

function endpointLimitPoint(graph: GraphExpression, point: Point, parameter: number): Point {
  if (graph.kind === "explicit") return { x: parameter, y: point.y };
  if (graph.kind === "sideways") return { x: point.x, y: parameter };
  return point;
}

function endpointAt(
  graph: GraphExpression,
  parameter: number,
  domain: { min: number; max: number },
): RestrictionEndpoint[] {
  if (!Number.isFinite(parameter) || Math.abs(parameter) > MAX_DOMAIN_SPAN) return [];
  const span = Math.max(1e-3, Math.min(MAX_DOMAIN_SPAN, domain.max - domain.min));
  const step = Math.max(1e-7, Math.min(1e-3 * span, 1e-5 * Math.max(1, Math.abs(parameter))));
  const before = graphPoint(graph, parameter - step);
  const after = graphPoint(graph, parameter + step);
  const exact = graphPoint(graph, parameter);
  const beforeValid = !!before && isFinitePoint(before);
  const afterValid = !!after && isFinitePoint(after);
  const exactValid = !!exact && isFinitePoint(exact);

  if (beforeValid && afterValid && exactValid) return [];
  if (!beforeValid && !afterValid && !exactValid) return [];

  if (beforeValid && afterValid && !exactValid) {
    const left = oneSidedLimit(graph, parameter, -1, span);
    const right = oneSidedLimit(graph, parameter, 1, span);
    if (!left || !right) return [];
    const leftEndpoint = endpointLimitPoint(graph, left, parameter);
    const rightEndpoint = endpointLimitPoint(graph, right, parameter);
    if (Math.hypot(leftEndpoint.x - rightEndpoint.x, leftEndpoint.y - rightEndpoint.y) <=
        1e-5 * (1 + Math.hypot(leftEndpoint.x, leftEndpoint.y))) {
      return [{ ...leftEndpoint, closed: false }];
    }
    return [{ ...leftEndpoint, closed: false }, { ...rightEndpoint, closed: false }];
  }

  const direction: -1 | 1 | undefined = beforeValid ? -1 : afterValid ? 1 : undefined;
  if (!direction && exactValid) return [{ ...exact!, closed: true }];
  if (!direction) return [];
  if (exactValid) return [{ ...exact!, closed: true }];
  const limit = oneSidedLimit(graph, parameter, direction, span);
  return limit ? [{ ...endpointLimitPoint(graph, limit, parameter), closed: false }] : [];
}

function makeVariableScope(
  variables: Record<string, number>,
  sliderBounds: RestrictionEndpointOptions["sliderBounds"],
): Record<string, number> {
  const scope = { ...variables };
  for (const [name, bounds] of Object.entries(sliderBounds ?? {})) {
    if (!Number.isFinite(bounds.min) || !Number.isFinite(bounds.max) ||
        bounds.min >= bounds.max || Math.abs(bounds.min) > MAX_DOMAIN_SPAN ||
        Math.abs(bounds.max) > MAX_DOMAIN_SPAN) continue;
    if (!Number.isFinite(scope[name])) scope[name] = (bounds.min + bounds.max) / 2;
  }
  return scope;
}

export function detectRestrictionEndpoints(
  source: string,
  graph: GraphExpression,
  options: RestrictionEndpointOptions = {},
): RestrictionEndpoint[] {
  if (graph.kind !== "explicit" && graph.kind !== "sideways" && graph.kind !== "parametric") return [];

  const variables = makeVariableScope(options.variables ?? {}, options.sliderBounds);
  const parameterName = graph.kind === "parametric" ? "t" :
    graph.kind === "sideways" ? "y" : "x";
  if (graph.kind === "parametric" && !Number.isFinite(variables.t)) variables.t = graph.start;
  const defaultDomain = graph.kind === "parametric"
    ? { min: graph.start, max: graph.end }
    : options.parameterDomain ?? { min: -10, max: 10 };
  const domain = usableDomain(defaultDomain);
  let scanGraph: GraphExpression = graph;
  try {
    const baseSource = stripPostfixRestrictions(source);
    if (baseSource !== source.trim()) scanGraph = compileGraphExpression(baseSource, variables);
  } catch {
    scanGraph = graph;
  }
  const candidates: number[] = [];
  const comparisons = conditionSources(source.slice(0, MAX_SOURCE_LENGTH)).flatMap(comparisonTokens)
    .slice(0, MAX_SOURCE_COMPARISONS);

  for (const comparison of comparisons) {
    addRootCandidates(
      comparison,
      boundaryEvaluator(comparison, variables, parameterName),
      scanGraph,
      domain,
      parameterName,
      variables,
      candidates,
    );
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  if (graph.kind === "parametric") candidates.push(graph.start, graph.end);
  const distinct = candidates
    .filter((value) => Number.isFinite(value) && Math.abs(value) <= MAX_DOMAIN_SPAN)
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 ||
      Math.abs(value - values[index - 1]!) > 1e-7 * Math.max(1, Math.abs(value)));
  const endpoints: RestrictionEndpoint[] = [];
  for (const parameter of distinct.slice(0, MAX_CANDIDATES)) {
    endpoints.push(...endpointAt(graph, parameter, domain));
  }
  return endpoints.filter((endpoint) => Number.isFinite(endpoint.x) &&
    Number.isFinite(endpoint.y) && Math.abs(endpoint.x) <= MAX_COORDINATE &&
    Math.abs(endpoint.y) <= MAX_COORDINATE)
    .filter((endpoint, index, values) => values.findIndex((other) =>
      other.closed === endpoint.closed &&
      Math.hypot(other.x - endpoint.x, other.y - endpoint.y) <=
        1e-7 * (1 + Math.hypot(endpoint.x, endpoint.y))) === index);
}

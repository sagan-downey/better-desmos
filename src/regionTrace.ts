import type { TracePoint } from "./audioTrace";

export type TraceBounds = [number, number, number, number];
export interface ContourTrace { paths: TracePoint[][]; gaps: number; limited: boolean }

function validateBounds(bounds: TraceBounds): void {
  if (!bounds.every(Number.isFinite) || bounds[0] >= bounds[1] || bounds[2] >= bounds[3]) {
    throw new Error("Trace bounds must be finite and increasing.");
  }
}

export function traceContour(evaluate: (x: number, y: number) => number, bounds: TraceBounds, cells = 96): ContourTrace {
  validateBounds(bounds);
  if (!Number.isInteger(cells) || cells < 8 || cells > 160) throw new Error("Contour trace resolution must be 8–160 cells.");
  const [xmin, xmax, ymin, ymax] = bounds, dx = (xmax - xmin) / cells, dy = (ymax - ymin) / cells;
  let gaps = 0;
  const value = (x: number, y: number): number => {
    const result = evaluate(x, y);
    if (!Number.isFinite(result)) gaps++;
    return result;
  };
  const grid = Array.from({ length: cells + 1 }, (_, row) =>
    Array.from({ length: cells + 1 }, (_, column) => value(xmin + column * dx, ymin + row * dy)));
  const points = new Map<string, TracePoint>();
  const neighbors = new Map<string, string[]>();
  const edge = (column: number, row: number, horizontal: boolean): string | undefined => {
    const key = `${horizontal ? "h" : "v"}:${column}:${row}`;
    if (points.has(key)) return key;
    const a = grid[row]![column]!, b = grid[row + (horizontal ? 0 : 1)]![column + (horizontal ? 1 : 0)]!;
    if (!Number.isFinite(a) || !Number.isFinite(b) || (a < 0) === (b < 0)) return undefined;
    const x = xmin + column * dx, y = ymin + row * dy;
    const evaluateEdge = (t: number) => value(x + (horizontal ? t * dx : 0), y + (horizontal ? 0 : t * dy));
    const scale = Math.max(Math.abs(a), Math.abs(b));
    let left = 0, right = 1, lowerValue = a;
    let root = a === 0 ? 0 : b === 0 ? 1 : undefined;
    for (let iteration = 0; root === undefined && iteration < 48; iteration++) {
      const middle = left / 2 + right / 2, result = evaluateEdge(middle);
      if (!Number.isFinite(result)) { gaps++; return undefined; }
      if (result === 0) root = middle;
      else if ((result < 0) === (lowerValue < 0)) { left = middle; lowerValue = result; }
      else right = middle;
    }
    root ??= left / 2 + right / 2;
    // Test the final bracket, not an earlier low residual near a pole; allow fast-engine rounding.
    const residual = a === 0 || b === 0 ? 0 : evaluateEdge(root);
    if (!Number.isFinite(residual) || Math.abs(residual) / scale > 1e-6) {
      gaps++; return undefined;
    }
    points.set(key, { x: x + (horizontal ? root * dx : 0), y: y + (horizontal ? 0 : root * dy) });
    return key;
  };
  const connect = (a: string, b: string): void => {
    const left = neighbors.get(a) ?? [], right = neighbors.get(b) ?? [];
    left.push(b); right.push(a); neighbors.set(a, left); neighbors.set(b, right);
  };
  for (let row = 0; row < cells; row++) for (let column = 0; column < cells; column++) {
    const edges = [edge(column, row, true), edge(column + 1, row, false), edge(column, row + 1, true), edge(column, row, false)];
    const active = edges.filter((key): key is string => key !== undefined);
    if (active.length === 2) connect(active[0]!, active[1]!);
    else if (active.length === 4) {
      const middle = value(xmin + (column + 0.5) * dx, ymin + (row + 0.5) * dy);
      if (!Number.isFinite(middle)) continue;
      const same = (middle < 0) === (grid[row]![column]! < 0);
      connect(active[0]!, active[same ? 1 : 3]!);
      connect(active[2]!, active[same ? 3 : 1]!);
    }
  }
  const used = new Set<string>(), paths: TracePoint[][] = [];
  const starts = [...neighbors.keys()].sort((a, b) => neighbors.get(a)!.length - neighbors.get(b)!.length);
  for (const start of starts) {
    if (used.has(start)) continue;
    const path: TracePoint[] = [];
    let current: string | undefined = start, previous: string | undefined;
    while (current && !used.has(current)) {
      used.add(current); path.push(points.get(current)!);
      const next: string | undefined = neighbors.get(current)?.find((key) => key !== previous && !used.has(key));
      previous = current; current = next;
    }
    if (path.length > 1) {
      if (neighbors.get(previous!)?.includes(start)) path.push(path[0]!);
      paths.push(path);
    }
  }
  return { paths: paths.slice(0, 128), gaps, limited: paths.length > 128 };
}

export function tracePolyline(vertices: TracePoint[], count = 201): TracePoint[] {
  if (!vertices.length) throw new Error("No visible points are available to trace.");
  if (!Number.isInteger(count) || count < 2 || count > 2048) throw new Error("Invalid trace sample count.");
  if (vertices.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error("Trace coordinates must be finite.");
  const lengths = [0];
  for (let index = 1; index < vertices.length; index++) lengths.push(lengths[index - 1]! + Math.hypot(vertices[index]!.x - vertices[index - 1]!.x, vertices[index]!.y - vertices[index - 1]!.y));
  const total = lengths[lengths.length - 1]!;
  if (!Number.isFinite(total)) throw new Error("Trace length exceeds the supported range.");
  if (total === 0) return [vertices[0]!];
  let segment = 1;
  return Array.from({ length: count }, (_, index) => {
    const distance = total * index / (count - 1);
    while (segment < lengths.length - 1 && lengths[segment]! < distance) segment++;
    const a = vertices[segment - 1]!, b = vertices[segment]!, length = lengths[segment]! - lengths[segment - 1]!;
    const t = length ? (distance - lengths[segment - 1]!) / length : 0;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  });
}

export function traceRegion(
  evaluate: (x: number, y: number) => number, relation: "<" | "<=" | ">" | ">=", bounds: TraceBounds, count = 201,
): Array<TracePoint | undefined> {
  validateBounds(bounds);
  if (!Number.isInteger(count) || count < 2 || count > 2048) throw new Error("Invalid region sample count.");
  const [xmin, xmax, ymin, ymax] = bounds, slices = 128;
  return Array.from({ length: count }, (_, index) => {
    const x = xmin + (xmax - xmin) * index / (count - 1), voices: number[] = [];
    for (let row = 0; row < slices; row++) {
      const y = ymin + (ymax - ymin) * (row + 0.5) / slices;
      const value = evaluate(x, y);
      if (!Number.isFinite(value)) continue;
      const inside = relation === "<" ? value < 0 : relation === "<=" ? value <= 0 : relation === ">" ? value > 0 : value >= 0;
      if (inside) voices.push(y);
    }
    if (!voices.length) return undefined;
    const noteCount = Math.min(5, voices.length);
    const notes = Array.from({ length: noteCount }, (_, index) =>
      voices[Math.round(index * (voices.length - 1) / Math.max(1, noteCount - 1))]!);
    return { x, y: voices[Math.floor(voices.length / 2)]!, voices: notes, region: true };
  });
}

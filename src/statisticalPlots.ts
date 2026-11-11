import { expandCollections, splitCollectionParts, type StatisticsMode } from "./collections";
import { fiveNumberSummary } from "./statistics";

export const STATISTICAL_PLOTS = ["histogram", "dotplot", "boxplot", "stats"] as const;
export type StatisticalPlotShape =
  | { kind: "point"; point: [number, number] }
  | { kind: "line"; start: [number, number]; end: [number, number] }
  | { kind: "polygon"; vertices: [number, number][] };

export function statisticalPlotCall(source: string): { name: typeof STATISTICAL_PLOTS[number]; args: string[] } | undefined {
  const match = /^\s*(histogram|dotplot|boxplot|stats)\s*\(([\s\S]*)\)\s*$/i.exec(source);
  if (!match) return undefined;
  const name = match[1]!.toLowerCase();
  if (name !== "histogram" && name !== "dotplot" && name !== "boxplot" && name !== "stats") return undefined;
  return { name, args: splitCollectionParts(match[2]!) };
}

export function statisticalPlotShapes(
  source: string, evaluate: (text: string) => number, lists: Record<string, string[]>, statisticsMode: StatisticsMode,
): StatisticalPlotShape[] | undefined {
  const call = statisticalPlotCall(source);
  if (!call) return undefined;
  const { args } = call;
  const name = call.name === "stats" ? "boxplot" : call.name;
  const maxArgs = call.name === "stats" ? 1 : name === "dotplot" ? 3 : 4;
  if (!args.length || args.length > maxArgs || args.some((arg) => !arg)) {
    throw new Error(`${name} requires a list and at most ${maxArgs - 1} options.`);
  }
  const expansion = expandCollections(args[0]!, evaluate, lists, statisticsMode);
  if (!expansion.list || !expansion.items.length) throw new Error(`${name} requires a nonempty numeric list.`);
  const values = expansion.items.map(evaluate);
  if (values.some((value) => !Number.isFinite(value))) throw new Error(`${name} requires finite numbers.`);
  const scalar = (index: number, defaultValue: number): number => {
    if (args[index] === undefined) return defaultValue;
    const value = expandCollections(args[index]!, evaluate, lists, statisticsMode);
    if (value.list || value.items.length !== 1) throw new Error(`${name} options must be scalars.`);
    const number = evaluate(value.items[0]!);
    if (!Number.isFinite(number)) throw new Error(`${name} options must be finite.`);
    return number;
  };
  const option = (index: number, max: number): number => {
    const value = scalar(index, 0);
    if (!Number.isInteger(value) || value < 0 || value > max) throw new Error(`${name} option ${index + 1} must be an integer from 0 to ${max}.`);
    return value;
  };
  let shapes: StatisticalPlotShape[];
  if (name === "boxplot") {
    const offset = scalar(1, 1), height = scalar(2, 1), exclude = option(3, 1);
    if (height <= 0) throw new Error("Boxplot height must be positive.");
    const [, q1, median, q3] = fiveNumberSummary(values);
    const spread = q3 - q1;
    const lowerFence = q1 - 1.5 * spread, upperFence = q3 + 1.5 * spread;
    if (exclude && ![spread, lowerFence, upperFence].every(Number.isFinite)) {
      throw new Error("Boxplot outlier fences exceed the supported numeric range.");
    }
    const inliers = exclude ? values.filter((value) => value >= lowerFence && value <= upperFence) : values;
    const low = Math.min(...inliers), high = Math.max(...inliers);
    const bottom = offset - height / 2, top = offset + height / 2;
    const line = (start: [number, number], end: [number, number]): StatisticalPlotShape => ({ kind: "line", start, end });
    shapes = [
      { kind: "polygon", vertices: [[q1, bottom], [q3, bottom], [q3, top], [q1, top]] },
      line([median, bottom], [median, top]),
      line([low, offset], [q1, offset]), line([q3, offset], [high, offset]),
      line([low, bottom], [low, top]), line([high, bottom], [high, top]),
    ];
    if (exclude) shapes.push(...values.filter((value) => value < lowerFence || value > upperFence)
      .map((value): StatisticalPlotShape => ({ kind: "point", point: [value, offset] })));
  } else {
    const width = scalar(1, 1);
    if (width <= 0) throw new Error("Bin width must be positive.");
    const mode = option(2, name === "histogram" ? 2 : 1);
    const alignment = name === "histogram" ? option(3, 1) : 0;
    const bins = new Map<number, { count: number; values: number[] }>();
    for (const value of values) {
      const index = Math.floor(value / width + (alignment ? 0 : 0.5));
      if (!Number.isSafeInteger(index)) throw new Error("Bin width is too small for the data magnitude.");
      const bin = bins.get(index) ?? { count: 0, values: [] };
      bin.count += 1;
      bin.values.push(value);
      bins.set(index, bin);
    }
    shapes = [];
    for (const [index, bin] of [...bins].sort(([a], [b]) => a - b)) {
      const center = (index + (alignment ? 0.5 : 0)) * width;
      if (name === "histogram") {
        const height = mode === 0 ? bin.count : mode === 1 ? bin.count / values.length : bin.count / values.length / width;
        shapes.push({ kind: "polygon", vertices: [[center - width / 2, 0], [center + width / 2, 0],
          [center + width / 2, height], [center - width / 2, height]] });
      } else {
        for (const [position, value] of bin.values.sort((a, b) => a - b).entries()) {
          shapes.push({ kind: "point", point: [mode ? center : value, position + 1] });
        }
      }
    }
  }
  for (const shape of shapes) {
    const points = shape.kind === "point" ? [shape.point] : shape.kind === "line" ? [shape.start, shape.end] : shape.vertices;
    if (points.some((point) => point.some((value) => !Number.isFinite(value)))) {
      throw new Error(`${name} geometry exceeds the supported numeric range.`);
    }
  }
  return shapes;
}

export function statisticsSummary(
  source: string, evaluate: (text: string) => number, lists: Record<string, string[]>, statisticsMode: StatisticsMode,
): string {
  const call = statisticalPlotCall(source);
  if (call?.name !== "stats" || call.args.length !== 1) throw new Error("Use stats(L) with one numeric list.");
  const expanded = expandCollections(call.args[0]!, evaluate, lists, statisticsMode);
  if (!expanded.list) throw new Error("stats requires a numeric list.");
  const values = expanded.items.map(evaluate);
  const summary = fiveNumberSummary(values);
  const reduction = (name: string): number =>
    evaluate(expandCollections(`${name}(${call.args[0]})`, evaluate, lists, "sample").items[0]!);
  const display = (value: number): string => Number(value.toPrecision(10)).toString();
  return `n = ${values.length} · mean ≈ ${display(reduction("mean"))} · median ≈ ${display(summary[2])} · ` +
    `sample SD ${values.length === 1 ? "undefined (needs 2 values)" : `≈ ${display(reduction("stdev"))}`} · ` +
    `population SD ≈ ${display(reduction("stdevp"))} · ` +
    `min, Q1, median, Q3, max ≈ (${summary.map(display).join(", ")})`;
}

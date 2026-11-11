export const DESCRIPTIVE_FUNCTIONS = ["quantile", "quartile", "mad", "cov", "covp", "corr", "spearman"] as const;

function nonempty(values: number[]): void {
  if (!values.length) throw new Error("Statistics require a nonempty list.");
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Statistics require finite numbers.");
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Statistic exceeds the supported numeric range.");
  return value;
}

function interpolate(left: number, right: number, fraction: number): number {
  return finite(left * (1 - fraction) + right * fraction);
}

function medianSorted(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : interpolate(sorted[middle - 1]!, sorted[middle]!, 0.5);
}

export function quantile(values: number[], probability: number): number {
  nonempty(values);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error("Quantile probability must be between 0 and 1.");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  return interpolate(sorted[lower]!, sorted[Math.ceil(index)]!, index - lower);
}

export function fiveNumberSummary(values: number[]): [number, number, number, number, number] {
  nonempty(values);
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, middle);
  const upper = sorted.slice(middle + sorted.length % 2);
  return [
    sorted[0]!, lower.length ? medianSorted(lower) : sorted[0]!,
    medianSorted(sorted), upper.length ? medianSorted(upper) : sorted[0]!, sorted.at(-1)!,
  ];
}

export function quartile(values: number[], index: number): number {
  if (!Number.isFinite(index) || index < 0 || index > 4) throw new Error("Quartile index must be between 0 and 4.");
  const summary = fiveNumberSummary(values);
  const lower = Math.floor(index);
  return interpolate(summary[lower]!, summary[Math.ceil(index)]!, index - lower);
}

export function meanAbsoluteDeviation(values: number[]): number {
  nonempty(values);
  const scale = Math.max(...values.map(Math.abs));
  if (!scale) return 0;
  let mean = 0;
  for (const [index, value] of values.entries()) mean += (value / scale - mean) / (index + 1);
  let deviation = 0;
  for (const [index, value] of values.entries()) {
    deviation += (Math.abs(value / scale - mean) - deviation) / (index + 1);
  }
  return finite(deviation * scale);
}

function ranks(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array<number>(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end]!.value === sorted[start]!.value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) result[sorted[index]!.index] = rank;
    start = end;
  }
  return result;
}

export function pairedStatistic(name: "cov" | "covp" | "corr" | "spearman", left: number[], right: number[]): number {
  nonempty(left);
  nonempty(right);
  const count = Math.min(left.length, right.length);
  if (count < 2 && name !== "covp") throw new Error(`${name} requires at least two paired values.`);
  const a = name === "spearman" ? ranks(left.slice(0, count)) : left.slice(0, count);
  const b = name === "spearman" ? ranks(right.slice(0, count)) : right.slice(0, count);
  const scaleA = Math.max(...a.map(Math.abs)) || 1;
  const scaleB = Math.max(...b.map(Math.abs)) || 1;
  let meanA = 0, meanB = 0, squareA = 0, squareB = 0, cross = 0;
  for (let index = 0; index < count; index += 1) {
    const x = a[index]! / scaleA, y = b[index]! / scaleB;
    const dx = x - meanA, dy = y - meanB;
    meanA += dx / (index + 1);
    meanB += dy / (index + 1);
    squareA += dx * (x - meanA);
    squareB += dy * (y - meanB);
    cross += dx * (y - meanB);
  }
  if (name === "cov" || name === "covp") return finite((cross / (count - (name === "cov" ? 1 : 0)) * scaleA) * scaleB);
  if (squareA <= 0 || squareB <= 0) throw new Error("Correlation is undefined for a constant list.");
  return finite(Math.max(-1, Math.min(1, cross / Math.sqrt(squareA) / Math.sqrt(squareB))));
}

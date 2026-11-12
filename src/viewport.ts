export function fitViewportBounds(
  width: number, height: number, xMin: number, xMax: number, yMin: number, yMax: number,
): { centerX: number; centerY: number; scale: number; aspectRatio: number } {
  if (![width, height, xMin, xMax, yMin, yMax].every(Number.isFinite) || width <= 0 || height <= 0 ||
    xMin >= xMax || yMin >= yMax) throw new Error("Viewport bounds must be finite and increasing on both axes.");
  const scale = width / (xMax - xMin), yScale = height / (yMax - yMin);
  const aspectRatio = scale / yScale;
  const centerX = xMin / 2 + xMax / 2, centerY = yMin / 2 + yMax / 2;
  if (![centerX, centerY, scale, aspectRatio].every(Number.isFinite) || scale < 0.001 || scale > 100000 ||
    aspectRatio < 0.001 || aspectRatio > 1000) throw new Error("Requested bounds exceed the supported zoom or aspect-ratio range.");
  return { centerX, centerY, scale, aspectRatio };
}

export function axisStep(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const step = Number(value);
  if (!Number.isFinite(step) || step <= 0) throw new Error("Axis steps must be positive finite numbers, or blank for automatic.");
  return step;
}
export type AxisScale = "linear" | "log";
export function projectCoordinate(value: number, mode: AxisScale = "linear"): number {
  return mode === "log" ? value > 0 ? Math.log10(value) : NaN : value;
}
export function unprojectCoordinate(value: number, mode: AxisScale = "linear"): number {
  return mode === "log" ? 10 ** value : value;
}
export function logarithmicTicks(lower: number, upper: number): Array<{value:number; major:boolean}> {
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower >= upper) throw new Error("Invalid logarithmic tick interval.");
  const stride = Math.max(1, Math.ceil((upper - lower) / 100));
  const ticks: Array<{value:number;major:boolean}> = [];
  for (let exponent = Math.max(-323, Math.floor(lower / stride) * stride); exponent <= Math.min(308, Math.ceil(upper)); exponent += stride) {
    for (const multiplier of stride === 1 ? [1,2,3,4,5,6,7,8,9] : [1]) {
      const position = exponent + Math.log10(multiplier);
      if (position >= lower && position <= upper) ticks.push({value: 10 ** exponent * multiplier, major:multiplier===1});
    }
  }
  return ticks;
}

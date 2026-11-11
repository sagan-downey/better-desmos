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
